import { ALIENS, type AlienId } from './data/aliens';
import { DEFAULT_WAVE_SCRIPT, WAVE_LEVELS, WAVE_SCRIPT, type WaveConfig, type WaveScript } from './data/waves';
import { DEFAULT_WAVE_MODEL, type TargetPoint, type WaveModel } from './data/waveModel';
import { saveToCode } from './dev/devSave';

/**
 * Script de vagues édité dans le Gestionnaire de vagues (dev uniquement) : mémorisé dans le navigateur et réappliqué au
 * démarrage (BootScene) pour le jouer tel quel. Une fois satisfait, « Copier le code » donne le bloc à coller dans
 * `DEFAULT_WAVE_SCRIPT` (data/waves.ts), seule source livrée.
 */
const STORAGE_KEY = 'xiao-debug-waves';
/** Version des ids d'aliens du script mémorisé (3 : slime_basic / slime_bombardier, voir loadWaveOverrides). */
const MIGRATION_KEY = 'xiao-debug-waves-ids';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Reconstruit un script valide à partir de données quelconques (réglages mémorisés possiblement abîmés). */
function sanitize(raw: unknown): WaveScript | null {
  const r = raw as Partial<WaveScript> | null;
  if (!r || typeof r !== 'object' || !r.levels || !Array.isArray(r.timeline)) return null;
  const levels: WaveScript['levels'] = {};
  for (const n of WAVE_LEVELS) {
    const list = Array.isArray(r.levels[n]) ? r.levels[n] : [];
    levels[n] = list.map((c): WaveConfig => ({
      name: typeof c?.name === 'string' && c.name ? c.name : undefined,
      groups: (Array.isArray(c?.groups) ? c.groups : [])
        .filter((g) => g && typeof g.type === 'string' && g.type in ALIENS)
        .map((g) => ({ type: g.type as AlienId, count: Math.max(0, Math.round(num(g.count, 1))) })),
    }));
  }
  const timeline = r.timeline
    .filter((e) => e && Number.isFinite(e.at) && e.level >= 1 && e.level <= 9)
    .map((e) => ({
      at: Math.max(0, e.at),
      level: Math.round(e.level),
      ...(Number.isFinite(e.config) && (e.config as number) >= 1 ? { config: Math.round(e.config as number) } : {}),
      ...(num(e.every, 0) > 0 ? { every: e.every } : {}),
      ...(num(e.every, 0) > 0 && Number.isFinite(e.until) ? { until: e.until } : {}),
    }));
  const m = r.model as Partial<WaveModel> | undefined;
  const model: WaveModel = {
    dpsStart: Math.max(1, num(m?.dpsStart, DEFAULT_WAVE_MODEL.dpsStart)),
    growthPerMin: Math.max(0, num(m?.growthPerMin, DEFAULT_WAVE_MODEL.growthPerMin)),
    efficiency: Math.min(1, Math.max(0.05, num(m?.efficiency, DEFAULT_WAVE_MODEL.efficiency))),
    bossWeight: Math.min(1, Math.max(0, num(m?.bossWeight, DEFAULT_WAVE_MODEL.bossWeight))),
  };
  const target = (Array.isArray(r.target) ? r.target : [])
    .filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.hp))
    .map((p): TargetPoint => ({ t: Math.max(0, p.t), hp: Math.max(0, p.hp) }))
    .sort((a, b) => a.t - b.t);
  return { levels, timeline, model, ...(target.length >= 2 ? { target } : {}) };
}

function assign(script: WaveScript): void {
  WAVE_SCRIPT.levels = script.levels;
  WAVE_SCRIPT.timeline = script.timeline;
  WAVE_SCRIPT.model = script.model ? { ...script.model } : { ...DEFAULT_WAVE_MODEL };
  WAVE_SCRIPT.target = script.target ? clone(script.target) : undefined;
}

/** À appeler au démarrage, avant de créer la simulation : réapplique le script mémorisé. */
export function loadWaveOverrides(): void {
  if (!import.meta.env.DEV) return;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as WaveScript | null;
    // Migration (slimes renommés deux fois) vers 'slime_basic' (slime de base) et 'slime_bombardier' (gros qui lance de la gelée) :
    // v1 : 'slime' = base, 'slime_blue' = gros ; v2 : 'slime_blue' = base, 'slime_green' = gros.
    const version = localStorage.getItem(MIGRATION_KEY);
    if (raw?.levels && version !== '3' && version !== '4' && version !== '5') {
      const rename: Record<string, string> =
        version === '2' ? { slime_blue: 'slime_basic', slime_green: 'slime_bombardier' } : { slime: 'slime_basic', slime_blue: 'slime_bombardier' };
      for (const configs of Object.values(raw.levels)) for (const c of configs ?? []) for (const g of c.groups ?? []) g.type = (rename[g.type] ?? g.type) as AlienId;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    }
    // v4 : ids renommés (slime_basic → slime, slime_pink → gling, slime_bombardier → flower)
    if (raw?.levels && version !== '4' && version !== '5') {
      const rename: Record<string, string> = { slime_basic: 'slime', slime_pink: 'gling', slime_bombardier: 'flower' };
      for (const configs of Object.values(raw.levels)) for (const c of configs ?? []) for (const g of c.groups ?? []) g.type = (rename[g.type] ?? g.type) as AlienId;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    }
    // v5 : ids de boss renommés (rhino_boss → boss_rhino, crab_king → boss_slime, crab → boss_crab)
    if (raw?.levels && version !== '5') {
      const rename: Record<string, string> = { rhino_boss: 'boss_rhino', crab_king: 'boss_slime', crab: 'boss_crab' };
      for (const configs of Object.values(raw.levels)) for (const c of configs ?? []) for (const g of c.groups ?? []) g.type = (rename[g.type] ?? g.type) as AlienId;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    }
    localStorage.setItem(MIGRATION_KEY, '5');
    // flower → shoot (idempotent)
    if (raw?.levels) for (const configs of Object.values(raw.levels)) for (const c of configs ?? []) for (const g of c.groups ?? []) { if ((g.type as string) === 'flower') g.type = 'shoot'; else if ((g.type as string) === 'frog') g.type = 'toad'; else if ((g.type as string) === 'thrower') g.type = 'wall'; else if ((g.type as string) === 'boss_slime') g.type = 'boss_scarab'; }
    const saved = sanitize(raw);
    if (saved) assign(saved);
  } catch {
    // script illisible : valeurs par défaut
  }
}

/** À appeler après chaque modification du script (mémorise dans le navigateur). */
export function saveWaves(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(WAVE_SCRIPT));
  } catch {
    // stockage indisponible : le script ne survit simplement pas au rechargement
  }
}

/** Revient au script livré (data/waves.ts). */
export function resetWaves(): void {
  assign(clone(DEFAULT_WAVE_SCRIPT));
  saveWaves();
}

/** Save : écrit le script courant dans `DEFAULT_WAVE_SCRIPT` (data/waves.ts) ; Reset ramène ensuite à cette sauvegarde. */
export async function saveWavesToCode(): Promise<string> {
  const msg = await saveToCode('waves', { code: waveSnippet() });
  if (msg.startsWith('✔')) {
    DEFAULT_WAVE_SCRIPT.levels = clone(WAVE_SCRIPT.levels);
    DEFAULT_WAVE_SCRIPT.timeline = clone(WAVE_SCRIPT.timeline);
    DEFAULT_WAVE_SCRIPT.model = { ...(WAVE_SCRIPT.model ?? DEFAULT_WAVE_MODEL) };
    DEFAULT_WAVE_SCRIPT.target = WAVE_SCRIPT.target ? clone(WAVE_SCRIPT.target) : undefined;
  }
  return msg;
}

const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Code à coller dans `DEFAULT_WAVE_SCRIPT` (data/waves.ts). */
export function waveSnippet(): string {
  const lines: string[] = ['export const DEFAULT_WAVE_SCRIPT: WaveScript = {', '  levels: {'];
  for (const n of WAVE_LEVELS) {
    const configs = WAVE_SCRIPT.levels[n] ?? [];
    lines.push(`    ${n}: [`);
    for (const c of configs) {
      const groups = c.groups.map((g) => `{ type: ${q(g.type)}, count: ${g.count} }`).join(', ');
      lines.push(`      { ${c.name ? `name: ${q(c.name)}, ` : ''}groups: [${groups}] },`);
    }
    lines.push('    ],');
  }
  lines.push('  },', '  timeline: [');
  for (const e of WAVE_SCRIPT.timeline) {
    const rep = e.every && e.every > 0 && e.until !== undefined ? `, every: ${e.every}, until: ${e.until}` : '';
    const cfg = e.config ? `, config: ${e.config}` : '';
    lines.push(`    { at: ${e.at}, level: ${e.level}${rep}${cfg} },`);
  }
  const m = WAVE_SCRIPT.model ?? DEFAULT_WAVE_MODEL;
  lines.push('  ],', `  model: { dpsStart: ${m.dpsStart}, growthPerMin: ${m.growthPerMin}, efficiency: ${m.efficiency}, bossWeight: ${m.bossWeight} },`);
  const target = WAVE_SCRIPT.target ?? [];
  if (target.length >= 2) lines.push(`  target: [${target.map((p) => `{ t: ${Math.round(p.t * 2) / 2}, hp: ${Math.round(p.hp)} }`).join(', ')}],`);
  lines.push('};');
  return lines.join('\n');
}
