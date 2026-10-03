import { STIM_FIRE } from '../config';
import type { UpgradeId } from '../data/progression';
import type { Sim } from './Sim';
import type { PlayerId } from './types';

/** Une seconde de partie (temps de jeu : la pause du choix d'upgrade ne compte pas). */
export interface RunSample {
  /** Temps de jeu (s) en fin de fenêtre. */
  t: number;
  level: number;
  /** Soldats vivants de la squad suivie, aliens vivants et leurs PV cumulés. */
  soldiers: number;
  aliens: number;
  aliveHp: number;
  /** Sur la seconde : PV d'aliens réellement retirés (sans overkill), PV de soldats perdus, PV d'aliens apparus, kills, soldats morts. */
  dealt: number;
  taken: number;
  spawned: number;
  kills: number;
  lost: number;
  /** Sur la seconde : recrues apparues, ramassées, expirées (jamais ramassées) dont celles « noyées » (≥ 5 aliens à 120 px). */
  recDropped: number;
  recPicked: number;
  recExpired: number;
  recSwamped: number;
  /** DPS théorique de la squad : cadence × dégâts de chaque soldat vivant, upgrades et stimpack compris. */
  theoDps: number;
  /** Taille max (octets) d'un snapshot réseau encodé pendant la seconde (0 : aucune mesure). */
  snapBytes: number;
  /** Octets par catégorie (en-tête, squads, aliens, projectiles, globes…) du plus gros snapshot de la seconde. */
  snapSizes?: Record<string, number>;
}

/** Apparition d'un boss (pour vérifier l'ordre réel : mini-boss puis boss final). */
export interface BossSpawn {
  t: number;
  alien: string;
  kind: string;
}

export interface RunLog {
  version: 1;
  mode: string;
  victory: boolean;
  duration: number;
  level: number;
  picked: Partial<Record<UpgradeId, number>>;
  bosses: BossSpawn[];
  samples: RunSample[];
}

type Metrics = Sim['metrics'];

/**
 * Enregistre une partie seconde par seconde (dev) pour calibrer la courbe de pression du Gestionnaire de vagues et le débit réseau.
 * Pur : ne fait que lire la Sim et ses compteurs (`Sim.metrics`). `npm run sim:calibrate` lit les JSON produits.
 */
export class RunRecorder {
  readonly samples: RunSample[] = [];
  private next = 1;
  private last: Metrics;
  readonly bosses: BossSpawn[] = [];
  private snapMax = 0;
  private snapSizes: Record<string, number> | undefined;

  constructor(private readonly sim: Sim) {
    this.last = { ...sim.metrics };
  }

  /** Taille d'un snapshot encodé et sa ventilation (fournies par l'affichage, qui sait encoder). */
  noteSnapshot(bytes: number, sizes?: Record<string, number>): void {
    if (bytes <= this.snapMax) return;
    this.snapMax = bytes;
    this.snapSizes = sizes && { ...sizes };
  }

  /** Un boss vient d'apparaître (événement `boss`). */
  noteBoss(alien: string, kind: string): void {
    this.bosses.push({ t: Math.round(this.sim.waves.time), alien, kind });
  }

  /** À appeler à chaque image : ajoute un échantillon par seconde de temps de jeu franchie. */
  update(owner: PlayerId): void {
    const t = this.sim.waves.time;
    if (t < this.next - 1) {
      // temps remis à zéro (relance) : on repart de zéro
      this.samples.length = 0;
      this.next = 1;
      this.last = { ...this.sim.metrics };
    }
    if (t < this.next) return;
    const { sim } = this;
    const m = sim.metrics;
    const squad = sim.squadOf(owner);
    let aliveHp = 0;
    let aliens = 0;
    for (const a of sim.aliens) {
      if (!a.alive) continue;
      aliens++;
      aliveHp += a.hp + a.shield;
    }
    let theoDps = 0;
    let soldiers = 0;
    if (squad) {
      const mul = squad.stats.get('damage') * squad.stats.get('fireRate') * (squad.buffs.stim > 0 ? STIM_FIRE : 1);
      for (const s of squad.soldiers) {
        if (!s.alive) continue;
        soldiers++;
        const w = s.def.weapon;
        theoDps += ((w.damage * (w.pellets ?? 1)) / w.cooldown) * mul;
      }
    }
    this.samples.push({
      t: Math.round(t * 10) / 10,
      level: squad?.level ?? 1,
      soldiers,
      aliens,
      aliveHp: Math.round(aliveHp),
      dealt: Math.round(m.dealt - this.last.dealt),
      taken: Math.round(m.taken - this.last.taken),
      spawned: Math.round(m.spawnedHp - this.last.spawnedHp),
      kills: m.kills - this.last.kills,
      lost: m.soldiersLost - this.last.soldiersLost,
      recDropped: m.recDropped - this.last.recDropped,
      recPicked: m.recPicked - this.last.recPicked,
      recExpired: m.recExpired - this.last.recExpired,
      recSwamped: m.recSwamped - this.last.recSwamped,
      theoDps: Math.round(theoDps),
      snapBytes: this.snapMax,
      ...(this.snapSizes ? { snapSizes: this.snapSizes } : {}),
    });
    this.last = { ...m };
    this.snapMax = 0;
    this.snapSizes = undefined;
    this.next = Math.floor(t) + 1;
  }

  finish(owner: PlayerId, mode: string, victory: boolean): RunLog {
    const squad = this.sim.squadOf(owner);
    return { version: 1, mode, victory, duration: Math.round(this.sim.waves.time), level: squad?.level ?? 1, picked: { ...(squad?.picked ?? {}) }, bosses: this.bosses, samples: this.samples };
  }
}
