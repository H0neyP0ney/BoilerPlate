import type { Rng } from '@xiao/engine/sim';
import type { AlienId } from '../data/aliens';
import type { WaveConfig, WaveScript } from '../data/waves';

/**
 * Exécute un `WaveScript` : fait avancer l'horloge du run et, à chaque instant de la timeline, envoie un niveau de vague —
 * une de ses configurations, tirée au hasard avec le rng seedé de la simulation.
 *
 * Deux horloges : `time` (durée de la partie, affichée au joueur) et `cursor` (position dans la timeline des vagues). Elles avancent
 * ensemble : rien ne suspend la timeline pour l'instant (ni un boss vivant, ni le nombre d'aliens), mais le curseur reste séparé pour pouvoir le faire.
 */
export class WaveRunner {
  private next: number[] = [];
  private _time = 0;
  private _cursor = 0;
  constructor(
    private readonly script: WaveScript,
    private readonly spawn: (type: AlienId, count: number) => void,
    private readonly rng: Rng,
  ) {
    this.reset();
  }

  /** Secondes écoulées depuis le début du run. */
  get time(): number {
    return this._time;
  }

  /** Position (s) dans la timeline des vagues : celle qui compte pour le prochain boss. */
  get cursor(): number {
    return this._cursor;
  }

  /** Recale les horloges sans déclencher de vague (client réseau qui reflète l'hôte). */
  setTime(seconds: number, cursor = seconds): void {
    this._time = seconds;
    this._cursor = cursor;
  }

  reset(): void {
    this._time = 0;
    this._cursor = 0;
    this.next = (this.script.timeline ?? []).map((e) => e.at);
  }

  update(dt: number): void {
    this._time += dt;
    this._cursor += dt;
    const timeline = this.script.timeline ?? [];
    for (let i = 0; i < timeline.length; i++) {
      const e = timeline[i];
      while (this.next[i] <= this._cursor) {
        this.trigger(e.level, e.config);
        const every = e.every ?? 0;
        const following = this.next[i] + every;
        this.next[i] = every >= 0.5 && e.until !== undefined && following <= e.until + 1e-6 ? following : Infinity;
      }
    }
  }

  /** Envoie un niveau de vague maintenant (timeline, ou bouton du panneau Triche) : une configuration au hasard. */
  trigger(level: number, configIndex?: number): WaveConfig | null {
    const configs = this.script.levels?.[level] ?? [];
    if (configs.length === 0) return null;
    const forced = configIndex !== undefined ? configs[configIndex - 1] : undefined;
    const config = forced ?? configs[Math.floor(this.rng.next() * configs.length)];
    const groups = config.groups.map((g) => ({ ...g }));
    if (!forced && level < 9) {
      // Mélange : un groupe « invité » tiré d'une configuration d'un niveau voisin (plus doux ou plus dur), en petit nombre.
      const pool = [level - 1, level + 1].flatMap((l) => (l >= 1 && l < 9 ? (this.script.levels?.[l] ?? []).flatMap((c) => c.groups) : []));
      if (pool.length > 0) {
        const guest = pool[Math.floor(this.rng.next() * pool.length)];
        const n = Math.max(1, Math.round(guest.count * 0.4));
        const same = groups.find((g) => g.type === guest.type);
        if (same) same.count += n;
        else groups.push({ type: guest.type, count: n });
      }
    }
    for (const g of groups) if (g.count > 0) this.spawn(g.type, Math.round(g.count));
    return { ...config, groups };
  }
}
