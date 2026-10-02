import { FixedStep } from '@xiao/engine/sim';
import { START_SQUADS } from '../data/classes';
import type { ModeDef } from '../data/modes';
import { BotBrain } from '../sim/bots';
import { Sim } from '../sim/Sim';
import type { PlayerId, PlayerInput, SimEvent } from '../sim/types';

/** Fréquence de la simulation (ticks/s). En réseau : fréquence des inputs/snapshots. */
export const TICK_RATE = 30;

/**
 * Une Session fait avancer une partie et fournit à l'affichage un `Sim` à lire.
 * L'affichage (GameScene / WorldView) ne sait pas d'où vient l'état :
 *
 *  - LocalSession   : solo / bots — la simulation tourne ici.            (✔ implémenté)
 *  - HostSession    : hôte (P2P) — simule + diffuse snapshots/events.     (✔ HostSession.ts)
 *  - ClientSession  : reçoit snapshots, reflète la partie de l'hôte.        (✔ ClientSession.ts)
 *  - serveur Node   : même Sim + même boucle, sans Phaser (sim/ est pur).  (à venir)
 *
 * Le réseau lui-même est caché derrière `Transport` (Netlib, WebSocket, mémoire…).
 */
export interface Session {
  readonly sim: Sim;
  readonly localPlayer: PlayerId;
  /** Fraction entre deux ticks, pour interpoler l'affichage. */
  readonly alpha: number;
  setLocalInput(mx: number, my: number): void;
  /** Avance le temps ; les événements produits sont passés à `onEvent`. */
  advance(deltaMs: number, onEvent: (e: SimEvent) => void): void;
  /** Revive de la squad locale (après pub récompensée). */
  reviveLocal(): void;
  /** La squad locale choisit l'upgrade `index` parmi ses propositions (en ligne : envoyé à l'hôte). */
  chooseUpgrade(index: number): void;
  /**
   * Partie en ligne : pas de pause (l'hôte fait tourner tout le monde), pas de revive par pub,
   * et un joueur anéanti réapparaît tout seul (l'hôte s'en charge).
   */
  readonly online: boolean;
  /** Code de la salle à partager (null hors ligne). */
  readonly roomCode: string | null;
  /** 'lost' : la connexion à l'hôte / à la salle est coupée. */
  readonly connection: 'connected' | 'lost';
  /** Client en ligne : l'hôte n'envoie plus rien depuis un moment alors que la connexion tient (onglet de l'hôte en arrière-plan, gel, réseau coupé). Toujours faux ailleurs. */
  readonly hostStalled: boolean;
  /** Libère les ressources réseau. */
  close(): void;
}

export interface LocalSessionOptions {
  mode: ModeDef;
  seed: number;
  bots: number;
}

export class LocalSession implements Session {
  readonly sim: Sim;
  readonly localPlayer: PlayerId = 'p1';
  readonly online = false;
  readonly roomCode = null;
  readonly connection = 'connected';
  readonly hostStalled = false;
  private readonly loop = new FixedStep(TICK_RATE);
  private readonly inputs = new Map<PlayerId, PlayerInput>();
  private readonly local: PlayerInput = { mx: 0, my: 0 };
  private readonly bots: BotBrain[] = [];

  constructor(opts: LocalSessionOptions) {
    const players: PlayerId[] = [this.localPlayer];
    for (let i = 0; i < opts.bots; i++) players.push(`bot${i + 1}`);
    this.sim = new Sim({ mode: opts.mode, seed: opts.seed, players, xp: true });
    this.sim.spawnSquads(() => this.sim.rng.pick(START_SQUADS));
    this.inputs.set(this.localPlayer, this.local);
    players.slice(1).forEach((id, i) => this.bots.push(new BotBrain(id, opts.seed + 101 * (i + 1))));
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
      for (const b of this.bots) this.inputs.set(b.owner, b.think(this.sim, dt));
      this.sim.step(dt, this.inputs);
      // les bots choisissent leurs upgrades au hasard ; le joueur local choisit dans l'overlay de niveau (GameScene)
      for (const b of this.bots) {
        const offer = this.sim.squadOf(b.owner)?.offer;
        if (offer) this.sim.chooseUpgrade(b.owner, Math.floor(this.sim.rng.next() * offer.length));
      }
      this.sim.events.drain(onEvent);
    });
  }

  chooseUpgrade(index: number): void {
    this.sim.chooseUpgrade(this.localPlayer, index);
  }

  reviveLocal(): void {
    this.sim.respawnSquad(this.localPlayer, this.sim.rng.pick(START_SQUADS));
  }

  close(): void {}
}
