import type { Rng } from '@xiao/engine/sim';
import { ALIENS, type AlienId } from '../data/aliens';
import { BOSS_REPLAY, entryTimes, pressureAt, WAVE_CAP, type WaveConfig, type WaveScript } from '../data/waves';

/** Ce que le gestionnaire de vagues a besoin de savoir de la simulation (absent : la timeline avance toujours). */
export interface WaveRunnerHooks {
  /** Un boss est vivant. */
  bossAlive(): boolean;
  /** Nombre d'aliens vivants. */
  aliveCount(): number;
}

/**
 * Exécute un `WaveScript` : fait avancer l'horloge du run et, à chaque instant de la timeline, envoie un niveau de vague —
 * une de ses configurations, tirée au hasard avec le rng seedé de la simulation.
 *
 * Deux horloges : `time` (durée de la partie, affichée au joueur) et `cursor` (position dans la timeline des vagues). Le curseur est
 * FIGÉ (le gestionnaire de vagues est « en pause ») dans deux cas :
 *  - **combat de boss** : tant qu'un boss est vivant, la timeline ne bouge plus ; à la place on renvoie en boucle les `BOSS_REPLAY.count`
 *    derniers envois qui ont précédé l'arrivée du boss (`replaying` est vrai pendant ces envois : la simulation n'y fait tomber aucun
 *    globe d'XP, pour qu'on ne puisse pas farmer en laissant le boss en vie) ;
 *  - **trop d'aliens** : au-dessus de `WAVE_CAP.pauseAbove` aliens vivants plus rien n'est envoyé, jusqu'à retomber à `WAVE_CAP.resumeAt`.
 */
export class WaveRunner {
  private next: number[] = [];
  private _time = 0;
  private _cursor = 0;
  /** Pause « trop d'aliens » en cours (hystérésis : de `pauseAbove` à `resumeAt`). */
  private capped = false;
  /** Vrai pendant un envoi rejoué (combat de boss) : ces aliens ne laissent pas de globes d'XP. */
  private _replaying = false;
  /** Instant (timeline) de la dernière apparition de boss. */
  private bossAt: number | null = null;
  private fighting = false;
  private replay: { offset: number; level: number }[] = [];
  private replayLen = 0;
  private replayT = 0;
  private replayIdx = 0;

  constructor(
    private readonly script: WaveScript,
    private readonly spawn: (type: AlienId, count: number) => void,
    private readonly rng: Rng,
    private readonly hooks?: WaveRunnerHooks,
  ) {
    this.reset();
  }

  /** Secondes écoulées depuis le début du run. */
  get time(): number {
    return this._time;
  }

  /** Position (s) dans la timeline des vagues : celle qui compte pour le prochain boss. Figée pendant un combat de boss ou une pause « trop d'aliens ». */
  get cursor(): number {
    return this._cursor;
  }

  /** Un envoi rejoué pendant un combat de boss est en cours (ses aliens ne donnent pas d'XP). */
  get replaying(): boolean {
    return this._replaying;
  }

  /** Les envois de la timeline sont suspendus (combat de boss, ou trop d'aliens). */
  get suspended(): boolean {
    return this.capped || this.fighting;
  }

  /** Recale les horloges sans déclencher de vague (client réseau qui reflète l'hôte). */
  setTime(seconds: number, cursor = seconds): void {
    this._time = seconds;
    this._cursor = cursor;
  }

  reset(): void {
    this._time = 0;
    this._cursor = 0;
    this.capped = false;
    this.endBossFight();
    this.bossAt = null;
    this.next = (this.script.timeline ?? []).map((e) => e.at);
  }

  update(dt: number): void {
    this._time += dt;
    const hooks = this.hooks;
    if (hooks) {
      const n = hooks.aliveCount();
      if (this.capped ? n <= WAVE_CAP.resumeAt : n > WAVE_CAP.pauseAbove) this.capped = !this.capped;
    }
    if (this.capped) return; // trop d'aliens : plus rien n'est envoyé (ni timeline, ni rejeu)
    if (hooks?.bossAlive()) {
      this.updateBossFight(dt);
      return;
    }
    this.endBossFight();
    this._cursor += dt;
    const timeline = this.script.timeline ?? [];
    for (let i = 0; i < timeline.length; i++) {
      const e = timeline[i];
      while (this.next[i] <= this._cursor) {
        if (e.config !== undefined) this.bossAt = e.at; // entrée à configuration forcée = apparition d'un boss
        this.trigger(e.level, e.config);
        const every = e.every ?? 0;
        const following = this.next[i] + every;
        this.next[i] = every >= 0.5 && e.until !== undefined && following <= e.until + 1e-6 ? following : Infinity;
      }
    }
  }

  /** Combat de boss : la timeline est figée ; on rejoue en boucle les derniers envois d'avant le boss (écarts plafonnés, `BOSS_REPLAY`). */
  private updateBossFight(dt: number): void {
    if (!this.fighting) {
      this.fighting = true;
      this.buildReplay(this.bossAt ?? this._cursor);
      this.replayT = 0;
      this.replayIdx = 0;
    }
    if (this.replay.length === 0) return;
    this.replayT += dt;
    while (this.replayIdx < this.replay.length && this.replayT >= this.replay[this.replayIdx].offset) {
      const r = this.replay[this.replayIdx++];
      this._replaying = true;
      this.trigger(r.level); // une configuration au hasard du niveau
      this._replaying = false;
    }
    if (this.replayIdx >= this.replay.length && this.replayT >= this.replayLen) {
      this.replayT = 0; // un tour de plus
      this.replayIdx = 0;
    }
  }

  private endBossFight(): void {
    this.fighting = false;
    this._replaying = false;
    this.replay = [];
  }

  /** Les `BOSS_REPLAY.count` derniers envois (hors boss) avant l'instant `at`, avec leurs écarts plafonnés. */
  private buildReplay(at: number): void {
    const sends: { t: number; level: number }[] = [];
    for (const e of this.script.timeline ?? []) {
      if (e.config !== undefined) continue; // jamais un boss
      for (const t of entryTimes(e)) if (t < at - 1e-6) sends.push({ t, level: e.level });
    }
    sends.sort((a, b) => a.t - b.t);
    const last = sends.slice(-BOSS_REPLAY.count);
    let offset = 0;
    this.replay = last.map((s, i) => {
      if (i > 0) offset += Math.min(BOSS_REPLAY.maxGap, s.t - last[i - 1].t);
      return { offset, level: s.level };
    });
    this.replayLen = offset + BOSS_REPLAY.wrapGap;
  }

  /** Envoie un niveau de vague maintenant (timeline, ou bouton du panneau Triche) : une configuration au hasard. */
  trigger(level: number, configIndex?: number): WaveConfig | null {
    const all = this.script.levels?.[level] ?? [];
    if (all.length === 0) return null;
    const forced = configIndex !== undefined ? all[configIndex - 1] : undefined;
    const configs = all;
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
    for (const g of groups) {
      const cap = ALIENS[g.type].maxPerWave; // ex. 2 slimes de glace au plus, même avec les invités d'un niveau voisin
      if (cap !== undefined) g.count = Math.min(g.count, cap);
    }
    const mul = pressureAt(this._cursor); // ex. −20 % entre le Rhinocéros et le Scarab (data/waves.ts : WAVE_PRESSURE)
    for (const g of groups) {
      const n = ALIENS[g.type].boss || mul === 1 ? Math.round(g.count) : Math.max(1, Math.round(g.count * mul));
      if (g.count > 0) this.spawn(g.type, n);
    }
    return { ...config, groups };
  }
}
