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
 *  - HostSession    : hôte P2P Netlib — simule + diffuse snapshots/events. (à venir)
 *  - ClientSession  : reçoit snapshots, interpole, prédit l'ancre locale.  (à venir)
 *  - serveur Node   : même Sim + même boucle, sans Phaser (sim/ est pur).  (à venir)
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
}

export interface LocalSessionOptions {
  mode: ModeDef;
  seed: number;
  bots: number;
}

export class LocalSession implements Session {
  readonly sim: Sim;
  readonly localPlayer: PlayerId = 'p1';
  private readonly loop = new FixedStep(TICK_RATE);
  private readonly inputs = new Map<PlayerId, PlayerInput>();
  private readonly local: PlayerInput = { mx: 0, my: 0 };
  private readonly bots: BotBrain[] = [];

  constructor(opts: LocalSessionOptions) {
    const players: PlayerId[] = [this.localPlayer];
    for (let i = 0; i < opts.bots; i++) players.push(`bot${i + 1}`);
    this.sim = new Sim({ mode: opts.mode, seed: opts.seed, players });
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
      this.sim.events.drain(onEvent);
    });
  }

  reviveLocal(): void {
    this.sim.respawnSquad(this.localPlayer, this.sim.rng.pick(START_SQUADS));
  }
}
