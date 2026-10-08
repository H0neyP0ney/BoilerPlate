import { DIFFICULTY } from '../config';
import { ALIENS } from './aliens';
import { entryTimes, scaledCount, type TimelineEntry, type WaveConfig, type WaveScript } from './waves';

/**
 * Courbe de pression des vagues (Gestionnaire de vagues) : ESTIMATION des PV d'aliens vivants au fil du run, en tenant compte
 * des morts. Un seul « tas » de PV : chaque envoi y ajoute les PV de la vague, la squad en retire `dps(t)` par seconde.
 * Pas une simulation du jeu (ni portée, ni déplacements, ni soin des aliens, ni alien « invité » du WaveRunner) : sert à
 * comparer des scripts entre eux. Pur (données), partagé éditeur / tests.
 */
export interface WaveModel {
  /** DPS de départ de la squad (4 gunners : 4 × 10 dégâts / 0,32 s ≈ 125). */
  dpsStart: number;
  /** Hausse du DPS par minute (upgrades, recrues) : 1,5 = +150 % de `dpsStart` par minute. */
  growthPerMin: number;
  /** Part du DPS réellement utile (portée, déplacements, overkill). */
  efficiency: number;
  /** Poids des PV d'un boss dans la pression (0 → 1) : un gros boss seul est facile à gérer (on le kite, il ne submerge pas la squad). */
  bossWeight: number;
}

export const DEFAULT_WAVE_MODEL: WaveModel = { dpsStart: 125, growthPerMin: 1.5, efficiency: 0.5, bossWeight: 0.25 };

export interface Pressure {
  /** Pas de temps (s) entre deux points. */
  dt: number;
  /** PV d'aliens vivants à chaque pas. */
  hp: number[];
  /** Retard de la squad : secondes qu'il faudrait pour tout nettoyer au DPS du moment. */
  backlog: number[];
  /** DPS effectif de la squad à chaque pas. */
  dps: number[];
}

/** PV totaux d'une configuration, comme le jeu les fait apparaître (nombre × `alienCountMul`, PV × `alienHpMul` / `bossHpMul`). */
export function configHp(config: WaveConfig, bossWeight = 1, mul = 1): number {
  let total = 0;
  for (const g of config.groups) {
    const def = ALIENS[g.type];
    if (!def || g.count <= 0) continue;
    // un boss n'apparaît qu'une fois (pas de ×alienCountMul, voir Sim.ts), les autres sont multipliés
    const count = def.boss ? g.count : Math.round(scaledCount(g.count, false, mul) * DIFFICULTY.alienCountMul); // effectif de l'envoi (`mul`), comme le WaveRunner
    total += count * def.hp * (def.boss ? DIFFICULTY.bossHpMul * bossWeight : DIFFICULTY.alienHpMul) * (1 + (def.shield?.pct ?? 0)); // bouclier en plus des PV
  }
  return total;
}

/** PV envoyés par un niveau : configuration forcée (boss) ou moyenne de ses configurations (tirage au hasard). */
export function levelHp(script: WaveScript, level: number, config?: number, bossWeight = 1, mul = 1): number {
  const configs = script.levels?.[level] ?? [];
  if (configs.length === 0) return 0;
  const forced = config !== undefined ? configs[config - 1] : undefined;
  if (forced) return configHp(forced, bossWeight, mul);
  return configs.reduce((sum, c) => sum + configHp(c, bossWeight, mul), 0) / configs.length;
}

/** DPS effectif de la squad à l'instant `t` (s). */
export function squadDps(model: WaveModel, t: number): number {
  return model.dpsStart * (1 + model.growthPerMin * (t / 60)) * model.efficiency;
}

export function simulatePressure(script: WaveScript, model: WaveModel = script.model ?? DEFAULT_WAVE_MODEL, end = 600, dt = 0.5): Pressure {
  const steps = Math.floor(end / dt) + 1;
  const incoming = new Float64Array(steps);
  for (const e of script.timeline) {
    for (const t of entryTimes(e)) {
      const i = Math.round(t / dt);
      if (i < steps) incoming[i] += levelHp(script, e.level, e.config, model.bossWeight ?? 1, e.mul ?? 1);
    }
  }
  const out: Pressure = { dt, hp: [], backlog: [], dps: [] };
  let pool = 0;
  for (let i = 0; i < steps; i++) {
    const t = i * dt;
    const dps = squadDps(model, t);
    pool += incoming[i];
    out.hp.push(pool);
    out.dps.push(dps);
    out.backlog.push(dps > 0 ? pool / dps : 0);
    pool = Math.max(0, pool - dps * dt);
  }
  return out;
}

// ---------- Courbe cible et génération de timeline ----------

/** Point de la courbe de pression cible (éditeur) : instant (s) et PV d'aliens vivants voulus. */
export interface TargetPoint {
  t: number;
  hp: number;
}

/** Valeur de la cible à l'instant `t` (interpolation linéaire, constante avant le premier / après le dernier point). */
export function targetAt(points: readonly TargetPoint[], t: number): number {
  if (points.length === 0) return 0;
  if (t <= points[0].t) return points[0].hp;
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (t > b.t) continue;
    const a = points[i - 1];
    return b.t > a.t ? a.hp + ((b.hp - a.hp) * (t - a.t)) / (b.t - a.t) : b.hp;
  }
  return points[points.length - 1].hp;
}

/** Instant (s) où chaque niveau 1-8 est envoyé pour la première fois dans le script (hors boss) : la progression à respecter. */
export function levelUnlocks(script: WaveScript): number[] {
  const unlock: number[] = [];
  for (let level = 1; level <= 8; level++) {
    let at = Infinity;
    for (const e of script.timeline) if (e.config === undefined && e.level >= level) at = Math.min(at, e.at);
    unlock[level] = level === 1 ? Math.min(at, 0) : at;
  }
  return unlock;
}

export interface GenerateResult {
  timeline: TimelineEntry[];
  /** Écart moyen et max (PV) entre la courbe obtenue et la cible, et écart moyen rapporté au pic de la cible. */
  meanError: number;
  maxError: number;
  relError: number;
}

/** Espacement minimal (s) entre deux envois d'un même niveau. */
const MIN_GAP = 2;
/** Délai max (s) sans aucun envoi : au-delà, on envoie le plus petit niveau autorisé (jamais de longue minute vide, même pendant un boss). */
const MAX_IDLE = 8;

/**
 * Recompose la TIMELINE (pas les configurations) pour que la pression estimée suive `target` sur [0, end] :
 *  - ancres gardées telles quelles : boss (`config` forcée) et entrées qui démarrent à `end` ou après ;
 *  - progression respectée : un niveau n'est envoyé qu'après sa première apparition dans le script d'origine
 *    (`levelUnlocks`), et il est envoyé à cet instant-là (introduction du nouvel ennemi) ; plancher = plafond − 2 ;
 *  - pas à pas, on envoie le niveau autorisé le plus gros qui comble l'écart entre la cible et la pression prévue.
 */
export function generateTimeline(script: WaveScript, model: WaveModel, target: readonly TargetPoint[], end = 600, dt = 0.5): GenerateResult {
  const steps = Math.floor(end / dt) + 1;
  const bw = model.bossWeight ?? 1;
  const anchors = script.timeline.filter((e) => e.config !== undefined || e.at >= end);
  const anchorIn = new Float64Array(steps);
  for (const e of anchors) {
    const hp = levelHp(script, e.level, e.config, bw);
    for (const t of entryTimes(e)) {
      const i = Math.round(t / dt);
      if (i < steps) anchorIn[i] += hp;
    }
  }
  const unlock = levelUnlocks(script);
  const hpOf: number[] = [];
  for (let level = 1; level <= 8; level++) hpOf[level] = levelHp(script, level, undefined, bw);
  const lastSent: number[] = new Array(9).fill(-Infinity);
  const introduced: boolean[] = new Array(9).fill(false);
  const sends: { t: number; level: number }[] = [];

  let pool = 0;
  for (let i = 0; i < steps; i++) {
    const t = i * dt;
    pool += anchorIn[i];
    let ceil = 1;
    for (let level = 8; level >= 1; level--) {
      if (unlock[level] <= t + 1e-6 && hpOf[level] > 0) {
        ceil = level;
        break;
      }
    }
    const floor = Math.max(1, ceil - 2);
    const send = (level: number): void => {
      sends.push({ t, level });
      lastSent[level] = t;
      introduced[level] = true;
      pool += hpOf[level];
    };
    // introduction d'un niveau tout juste débloqué : le nouvel ennemi arrive à son heure, comme dans le script d'origine
    if (!introduced[ceil] && hpOf[ceil] > 0) send(ceil);
    // filet de sécurité : un petit envoi si rien n'est parti depuis MAX_IDLE s
    if (t - Math.max(...lastSent) >= MAX_IDLE - 1e-6) {
      let small = floor;
      for (let level = floor; level <= ceil; level++) if (hpOf[level] > 0 && (hpOf[small] <= 0 || hpOf[level] < hpOf[small])) small = level;
      if (hpOf[small] > 0) send(small);
    }
    let need = targetAt(target, t) - pool;
    for (let guard = 0; guard < 8; guard++) {
      const allowed: number[] = [];
      for (let level = floor; level <= ceil; level++) if (hpOf[level] > 0 && t - lastSent[level] >= MIN_GAP - 1e-6) allowed.push(level);
      if (allowed.length === 0) break;
      const smallest = Math.min(...allowed.map((l) => hpOf[l]));
      if (need < smallest * 0.5) break;
      let pick = -1;
      for (const level of allowed) if (hpOf[level] <= need * 1.2 && (pick < 0 || hpOf[level] > hpOf[pick])) pick = level;
      if (pick < 0) pick = allowed.reduce((a, b) => (hpOf[b] < hpOf[a] ? b : a));
      send(pick);
      need -= hpOf[pick];
    }
    pool = Math.max(0, pool - squadDps(model, t) * dt);
  }

  const timeline = [...anchors.map((e) => ({ ...e })), ...compress(sends)];
  timeline.sort((a, b) => a.at - b.at || a.level - b.level);
  const result = simulatePressure({ ...script, timeline }, model, end, dt);
  let sum = 0;
  let max = 0;
  let peak = 1;
  for (let i = 0; i < result.hp.length; i++) {
    const goal = targetAt(target, i * dt);
    const err = Math.abs(result.hp[i] - goal);
    sum += err;
    max = Math.max(max, err);
    peak = Math.max(peak, goal);
  }
  const meanError = sum / result.hp.length;
  return { timeline, meanError, maxError: max, relError: meanError / peak };
}

/** Regroupe les envois d'un même niveau à intervalle constant (3 au moins) en une entrée `every` / `until`. */
function compress(sends: { t: number; level: number }[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (let level = 1; level <= 8; level++) {
    const times = sends.filter((s) => s.level === level).map((s) => s.t);
    let i = 0;
    while (i < times.length) {
      let j = i;
      const gap = i + 1 < times.length ? times[i + 1] - times[i] : 0;
      while (j + 1 < times.length && Math.abs(times[j + 1] - times[j] - gap) < 1e-6) j++;
      if (j - i >= 2) {
        out.push({ at: times[i], level, every: gap, until: times[j] });
        i = j + 1;
      } else {
        out.push({ at: times[i], level });
        i++;
      }
    }
  }
  return out;
}
