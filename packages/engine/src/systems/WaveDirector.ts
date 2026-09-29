/**
 * Vagues scriptées, pilotées par des données.
 *
 *   { at: 90, type: 'crab', count: 1 }                         // one-shot à 90 s
 *   { from: 0, to: 60, every: 1.5, type: 'slime', count: 2 }   // flux régulier
 *
 * Le jeu fournit `spawn(type, count)` et éventuellement `canSpawn()` (plafond d'ennemis).
 */
export type WaveEvent<T extends string> =
  | { at: number; type: T; count: number; label?: string }
  | { from: number; to: number; every: number; type: T; count: number; label?: string };

interface Runtime<T extends string> {
  ev: WaveEvent<T>;
  next: number;
  done: boolean;
}

export class WaveDirector<T extends string> {
  private runtime: Runtime<T>[] = [];
  private _time = 0;

  constructor(
    private readonly events: readonly WaveEvent<T>[],
    private readonly spawn: (type: T, count: number, ev: WaveEvent<T>) => void,
    private readonly canSpawn: () => boolean = () => true,
  ) {
    this.reset();
  }

  /** Secondes écoulées depuis le début du run. */
  get time(): number {
    return this._time;
  }

  reset(): void {
    this._time = 0;
    this.runtime = this.events.map((ev) => ({ ev, next: 'at' in ev ? ev.at : ev.from, done: false }));
  }

  update(dt: number): void {
    this._time += dt;
    for (const r of this.runtime) {
      if (r.done || this._time < r.next) continue;
      const ev = r.ev;
      if ('at' in ev) {
        this.spawn(ev.type, ev.count, ev);
        r.done = true;
        continue;
      }
      if (this._time > ev.to) {
        r.done = true;
        continue;
      }
      if (this.canSpawn()) this.spawn(ev.type, ev.count, ev);
      r.next += ev.every;
    }
  }
}
