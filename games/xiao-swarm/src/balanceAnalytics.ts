import { poki } from '@xiao/engine';
import { BALANCE, DIFFICULTY_LABEL, sizeBucket } from './data/analytics';
import type { DifficultyLevel } from './data/difficultyLevels';

type Bag = Record<string, number>;
/** Une seconde de jeu : compteurs cumulés de `Sim.tally` (copiés) et taille de la squad locale. */
interface Sample {
  deaths: Bag;
  taken: Bag;
  size: number;
}
/** Ce que le suivi lit de la Sim (solo : `tally` ne compte que la squad du joueur). */
interface BalanceSource {
  readonly time: number;
  readonly difficulty: DifficultyLevel;
  readonly tally: { readonly deathsBy: Bag; readonly takenBy: Bag };
}

/**
 * Analytics d'équilibrage (docs/ANALYTICS.md § Équilibrage), solo seulement : d'où viennent les pertes de la squad.
 * Un échantillon par seconde de jeu dans un anneau ; la source d'une fenêtre = plus gros écart de `tally.deathsBy` (soldats tués), sinon de `tally.takenBy` (PV perdus),
 * avec les mêmes clés `alien:capacité` (`Sim.blame`) que les parties enregistrées en dev. À appeler depuis la vue seulement, jamais depuis `sim/`.
 */
export class BalanceTracker {
  private ring: Sample[] = [];
  private lastSecond = -1;
  private crashes = 0;
  private lastCrashMinute = -1;

  /** Nouvelle partie ou revive : la mesure repart de zéro. */
  reset(): void {
    this.ring = [];
    this.lastSecond = -1;
    this.crashes = 0;
    this.lastCrashMinute = -1;
  }

  /** À chaque image de jeu : échantillonne une fois par seconde et détecte un effondrement de la squad (`crash`). */
  update(sim: BalanceSource, squadSize: number): void {
    const second = Math.floor(sim.time);
    if (second === this.lastSecond) return;
    this.lastSecond = second;
    this.ring.push({ deaths: { ...sim.tally.deathsBy }, taken: { ...sim.tally.takenBy }, size: squadSize });
    if (this.ring.length > BALANCE.ringSize) this.ring.shift();
    const now = this.ring[this.ring.length - 1];
    const from = this.ring[this.ring.length - 1 - BALANCE.crashWindow];
    const minute = Math.floor(sim.time / 60);
    if (!from || from.size < BALANCE.crashMinSize || now.size > from.size * (1 - BALANCE.crashLoss)) return;
    if (this.crashes >= BALANCE.crashMax || minute === this.lastCrashMinute) return;
    this.crashes++;
    this.lastCrashMinute = minute;
    poki.measure(`crash-${DIFFICULTY_LABEL[sim.difficulty]}`, topSource(from, now), `m${minute}`);
  }

  /** Mort de la squad : source des 15 dernières secondes, taille de la squad juste avant et niveau. */
  death(sim: BalanceSource, level: number): void {
    const diff = DIFFICULTY_LABEL[sim.difficulty];
    const minute = Math.floor(sim.time / 60);
    const now: Sample = { deaths: sim.tally.deathsBy, taken: sim.tally.takenBy, size: 0 };
    const from = this.ring[Math.max(0, this.ring.length - BALANCE.deathWindow)] ?? now;
    poki.measure(`death-cause-${diff}`, topSource(from, now), `m${minute}`);
    const before = this.ring[Math.max(0, this.ring.length - BALANCE.sizeBeforeDeath)];
    poki.measure(`death-squad-${diff}`, `m${minute}`, `size-${sizeBucket(before?.size ?? 0)}-lv${level}`);
  }

  /** Palier de temps (`TIME_MILESTONES`) : taille et niveau de la squad, référence pour lire `death-squad`. */
  milestone(sim: BalanceSource, seconds: number, squadSize: number, level: number): void {
    poki.measure(`squad-${DIFFICULTY_LABEL[sim.difficulty]}`, `${seconds}s`, `size-${sizeBucket(squadSize)}-lv${level}`);
  }
}

/** Source qui a tué le plus de soldats entre `from` et `to`, sinon celle qui a retiré le plus de PV ; `other` si rien. Chiffres retirés (Poki : 2 au plus par événement). */
function topSource(from: Sample, to: Sample): string {
  const best = topDelta(from.deaths, to.deaths) ?? topDelta(from.taken, to.taken) ?? 'other';
  return best.replace(/[0-9]/g, '') || 'other';
}

function topDelta(from: Bag, to: Bag): string | null {
  let best: string | null = null;
  let max = 0;
  for (const key in to) {
    const d = to[key] - (from[key] ?? 0);
    if (d > max) {
      max = d;
      best = key;
    }
  }
  return best;
}
