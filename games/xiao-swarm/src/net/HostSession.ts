import { FixedStep } from '@xiao/engine/sim';
import { START_SQUADS } from '../data/classes';
import type { ModeDef } from '../data/modes';
import { Sim } from '../sim/Sim';
import { NO_INPUT, type PlayerId, type PlayerInput, type SimEvent } from '../sim/types';
import {
  encodeSnapshot,
  parseMessage,
  PROTOCOL_VERSION,
  SNAPSHOT_EVERY,
  takeSnapshot,
  type ClientMessage,
  type HostMessage,
} from './Protocol';
import { TICK_RATE, type Session } from './Session';
import type { Payload, Transport } from './Transport';

/** Joueurs max (hôte inclus) : au-delà, le P2P sature la connexion montante de l'hôte. */
export const MAX_PLAYERS = 4;
/** Sans input depuis si longtemps (s), la squad d'un client s'arrête. */
const INPUT_TIMEOUT = 1.5;
/** Délai (s) entre l'anéantissement d'une squad et sa réapparition. */
const RESPAWN_DELAY = 2.5;
/** Coop : temps (s) d'affichage de l'écran de fin (victoire / défaite) avant de relancer la partie. */
const END_DELAY = 8;

export interface HostSessionOptions {
  mode: ModeDef;
  seed: number;
  transport: Transport;
  roomCode: string;
}

interface RemotePlayer {
  input: PlayerInput;
  lastInputTick: number;
}

/**
 * L'hôte fait tourner LA simulation (autoritaire) : il applique ses propres inputs
 * et ceux des clients, puis diffuse l'état (snapshots) et les événements.
 * Les clients ne simulent rien : ils affichent ce que l'hôte leur envoie.
 *
 * Un client qui arrive en cours de partie reçoit une squad neuve, placée loin des autres.
 */
export class HostSession implements Session {
  readonly sim: Sim;
  readonly localPlayer: PlayerId;
  readonly online = true;
  readonly roomCode: string;
  connection: 'connected' | 'lost' = 'connected';
  private readonly transport: Transport;
  private readonly loop = new FixedStep(TICK_RATE);
  private readonly inputs = new Map<PlayerId, PlayerInput>();
  private readonly local: PlayerInput = { mx: 0, my: 0 };
  private readonly remotes = new Map<PlayerId, RemotePlayer>();
  private outbound: SimEvent[] = [];
  /** Tick d'anéantissement des squads en attente de réapparition. */
  private readonly deadSince = new Map<PlayerId, number>();
  /** Coop : ticks restants avant la relance de la partie (> 0 = écran de fin, simulation figée). */
  private endTicks = 0;
  private frame = 0;

  constructor(opts: HostSessionOptions) {
    this.transport = opts.transport;
    this.roomCode = opts.roomCode;
    this.localPlayer = opts.transport.localId;
    this.sim = new Sim({ mode: opts.mode, seed: opts.seed, players: [this.localPlayer], xp: true });
    this.sim.spawnSquads(() => this.sim.rng.pick(START_SQUADS));
    this.inputs.set(this.localPlayer, this.local);

    this.transport.onMessage = this.onMessage;
    this.transport.onPeerDisconnected = this.onPeerLeft;
    this.transport.onClosed = () => (this.connection = 'lost');
  }

  get alpha(): number {
    return this.loop.alpha;
  }

  setLocalInput(mx: number, my: number): void {
    this.local.mx = mx;
    this.local.my = my;
  }

  advance(deltaMs: number, onEvent: (e: SimEvent) => void): void {
    this.loop.advance(deltaMs, (dt) => {
      for (const [id, r] of this.remotes) {
        const stale = this.sim.tick - r.lastInputTick > INPUT_TIMEOUT * TICK_RATE;
        this.inputs.set(id, stale ? NO_INPUT : r.input);
      }
      this.frame++;
      if (this.endTicks > 0) {
        // écran de fin : le monde est figé jusqu'à la relance
        if (--this.endTicks === 0) this.sim.restart();
      } else {
        this.sim.step(dt, this.inputs);
        if (this.sim.mode.id === 'coop') this.checkCoopEnd();
        else this.respawnDead();
      }
      const share = this.remotes.size > 0;
      this.sim.events.drain((e) => {
        onEvent(e);
        if (share) this.outbound.push(e);
      });
      if (share && this.frame % SNAPSHOT_EVERY === 0) this.broadcast();
    });
  }

  /** Pas de revive par pub en ligne : la réapparition est automatique. */
  reviveLocal(): void {}

  chooseUpgrade(index: number): void {
    this.sim.chooseUpgrade(this.localPlayer, index);
  }

  /** Coop : fin de partie quand toutes les squads sont mortes (défaite) ou que le boss final est tombé (victoire). */
  private checkCoopEnd(): void {
    const sim = this.sim;
    if (sim.squads.length === 0) return;
    const victory = sim.finalBossDead;
    if (!victory && sim.aliveSquads.length > 0) return;
    sim.events.push({ t: 'gameEnd', victory, delay: END_DELAY });
    this.endTicks = END_DELAY * TICK_RATE;
  }

  close(): void {
    this.transport.close();
  }

  /** Une squad anéantie (la nôtre comme celle d'un client) revient après un court délai, à l'aléatoire. */
  private respawnDead(): void {
    for (const sq of this.sim.squads) {
      if (sq.alive) {
        this.deadSince.delete(sq.owner);
        continue;
      }
      const since = this.deadSince.get(sq.owner) ?? this.sim.tick;
      this.deadSince.set(sq.owner, since);
      if (this.sim.tick - since < RESPAWN_DELAY * TICK_RATE) continue;
      this.deadSince.delete(sq.owner);
      this.sim.spawnLate(sq.owner, this.sim.rng.pick(START_SQUADS));
    }
  }

  // ---------- Réseau ----------

  private broadcast(): void {
    this.transport.broadcast('unreliable', encodeSnapshot(takeSnapshot(this.sim)));
    if (this.outbound.length > 0) {
      const msg: HostMessage = { t: 'events', list: this.outbound };
      this.transport.broadcast('unreliable', JSON.stringify(msg));
      this.outbound = [];
    }
  }

  private send(peer: PlayerId, msg: HostMessage): void {
    this.transport.send(peer, 'reliable', JSON.stringify(msg));
  }

  private readonly onMessage = (peer: string, data: Payload): void => {
    if (typeof data !== 'string') return;
    const msg = parseMessage<ClientMessage>(data);
    if (!msg) return;
    switch (msg.t) {
      case 'hello':
        return this.onHello(peer, msg.v);
      case 'upgrade':
        if (this.remotes.has(peer) && typeof msg.index === 'number') this.sim.chooseUpgrade(peer, Math.floor(msg.index));
        return;
      case 'input': {
        const r = this.remotes.get(peer);
        if (!r) return;
        r.input = { mx: finite(msg.mx), my: finite(msg.my) };
        r.lastInputTick = this.sim.tick;
        return;
      }
    }
  };

  private onHello(peer: PlayerId, version: number): void {
    if (version !== PROTOCOL_VERSION) return this.send(peer, { t: 'refused', reason: 'version' });
    if (!this.remotes.has(peer) && this.remotes.size + 1 >= MAX_PLAYERS) return this.send(peer, { t: 'refused', reason: 'full' });
    if (!this.remotes.has(peer)) {
      this.remotes.set(peer, { input: { mx: 0, my: 0 }, lastInputTick: this.sim.tick });
      this.sim.spawnLate(peer, this.sim.rng.pick(START_SQUADS));
    }
    this.send(peer, { t: 'welcome', v: PROTOCOL_VERSION, mode: this.sim.mode.id, seed: this.sim.config.seed, you: peer, host: this.localPlayer });
  }

  private readonly onPeerLeft = (peer: string): void => {
    if (!this.remotes.delete(peer)) return;
    this.inputs.delete(peer);
    this.deadSince.delete(peer);
    this.sim.removePlayer(peer);
  };
}

function finite(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
}
