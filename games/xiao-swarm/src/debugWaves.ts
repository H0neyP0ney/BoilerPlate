import { ALIENS, type AlienId } from './data/aliens';
import { DEFAULT_WAVE_SCRIPT, WAVE_LEVELS, WAVE_SCRIPT, type WaveConfig, type WaveScript } from './data/waves';
import { saveToCode } from './dev/devSave';

/**
 * Script de vagues édité dans le Gestionnaire de vagues (dev uniquement) : mémorisé dans le navigateur et réappliqué au
 * démarrage (BootScene) pour le jouer tel quel. Une fois satisfait, « Copier le code » donne le bloc à coller dans
 * `DEFAULT_WAVE_SCRIPT` (data/waves.ts), seule source livrée.
 */
const STORAGE_KEY = 'xiao-debug-waves';

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
  return { levels, timeline };
}

function assign(script: WaveScript): void {
  WAVE_SCRIPT.levels = script.levels;
  WAVE_SCRIPT.timeline = script.timeline;
}

/** À appeler au démarrage, avant de créer la simulation : réapplique le script mémorisé. */
export function loadWaveOverrides(): void {
  if (!import.meta.env.DEV) return;
  try {
    const saved = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
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
  lines.push('  ],', '};');
  return lines.join('\n');
}
