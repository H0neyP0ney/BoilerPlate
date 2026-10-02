import { ALIENS } from './data/aliens';
import { CLASSES } from './data/classes';
import { saveToCode } from './dev/devSave';

/**
 * Statistiques des unités éditées dans la visionneuse d'unités (dev uniquement) pour l'équilibrage : tous les nombres de
 * `ALIENS[id]` (PV, vitesse, dégâts, cooldown, capacités : `lob.range`…) et de `CLASSES[id]` (PV, arme, soin…). Modifiés EN DIRECT dans
 * les définitions du jeu (la simulation les relit à chaque apparition : les unités déjà en jeu gardent leurs anciennes valeurs),
 * mémorisés dans le navigateur (`xiao-debug-stats`) et réappliqués au démarrage ; Save les écrit dans data/aliens.ts / data/classes.ts
 * (ils deviennent les valeurs du code), Reset revient à la dernière sauvegarde.
 */
const STORAGE_KEY = 'xiao-debug-stats';

export type StatKind = 'alien' | 'soldier';
/** Une statistique : chemin pointé (`hp`, `lob.range`, `weapon.cooldown`) et valeur courante. */
export interface Stat {
  path: string;
  value: number;
}

type Def = Record<string, unknown>;
type Overrides = Record<string, Record<string, number>>; // clé `alien:slime` → { 'lob.range': 240, hp: 60 }

const defs = (kind: StatKind): Record<string, Def> => (kind === 'alien' ? (ALIENS as unknown as Record<string, Def>) : (CLASSES as unknown as Record<string, Def>));
const keyOf = (kind: StatKind, id: string): string => `${kind}:${id}`;

/** Valeurs du code (dernière sauvegarde), pour Reset. */
const DEFAULTS: Record<string, Def> = {};
for (const kind of ['alien', 'soldier'] as StatKind[]) for (const [id, d] of Object.entries(defs(kind))) DEFAULTS[keyOf(kind, id)] = structuredClone(d);

let overrides: Overrides = {};

/** Nombres finis de l'objet (récursif, profondeur limitée) ; `color` et `id` exclus. */
function collect(obj: Def, prefix: string, out: Stat[], depth = 0): void {
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'color' || k === 'id') continue;
    if (typeof v === 'number' && Number.isFinite(v)) out.push({ path: prefix + k, value: v });
    else if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) collect(v as Def, `${prefix}${k}.`, out, depth + 1);
  }
}

export function listStats(kind: StatKind, id: string): Stat[] {
  const d = defs(kind)[id];
  const out: Stat[] = [];
  if (d) collect(d, '', out);
  return out;
}

function resolve(root: Def, path: string): { obj: Def; key: string } | null {
  const parts = path.split('.');
  let obj = root;
  for (const p of parts.slice(0, -1)) {
    const next = obj[p];
    if (!next || typeof next !== 'object') return null;
    obj = next as Def;
  }
  return { obj, key: parts[parts.length - 1] };
}

export function getStat(kind: StatKind, id: string, path: string): number {
  const r = resolve(defs(kind)[id], path);
  const v = r?.obj[r.key];
  return typeof v === 'number' ? v : 0;
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // stockage indisponible : les stats ne survivent simplement pas au rechargement
  }
}

export function setStat(kind: StatKind, id: string, path: string, value: number): void {
  const r = resolve(defs(kind)[id], path);
  if (!r || !Number.isFinite(value)) return;
  r.obj[r.key] = value;
  (overrides[keyOf(kind, id)] ??= {})[path] = value;
  persist();
}

/** Reset : revient aux valeurs du code pour cette unité. */
export function resetStats(kind: StatKind, id: string): void {
  const def = DEFAULTS[keyOf(kind, id)];
  const live = defs(kind)[id];
  if (!def || !live) return;
  const list: Stat[] = [];
  collect(def, '', list);
  for (const s of list) {
    const r = resolve(live, s.path);
    if (r) r.obj[r.key] = s.value;
  }
  delete overrides[keyOf(kind, id)];
  persist();
}

/** À appeler au démarrage (dev), avant de créer la simulation : réapplique les stats mémorisées. */
export function loadStatOverrides(): void {
  if (!import.meta.env.DEV) return;
  try {
    overrides = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Overrides;
  } catch {
    overrides = {};
  }
  // ids d'aliens renommés (shoot → shooter, fire → burner) : réglages mémorisés repris sous les nouveaux ids
  for (const [from, to] of [['alien:shoot', 'alien:shooter'], ['alien:fire', 'alien:burner']]) {
    if (overrides[from]) overrides[to] = overrides[from];
    delete overrides[from];
  }
  for (const [key, values] of Object.entries(overrides)) {
    const [kind, id] = key.split(':') as [StatKind, string];
    if (!defs(kind)?.[id]) continue;
    for (const [path, v] of Object.entries(values)) {
      const r = resolve(defs(kind)[id], path);
      if (r && typeof v === 'number') r.obj[r.key] = v;
    }
  }
}

/** Save : écrit les stats courantes de l'unité dans le code (elles deviennent les valeurs par défaut). */
export async function saveStatsToCode(kind: StatKind, id: string): Promise<string> {
  const msg = await saveToCode('stats', { kind, id, values: Object.fromEntries(listStats(kind, id).map((s) => [s.path, s.value])) });
  if (msg.startsWith('✔')) {
    DEFAULTS[keyOf(kind, id)] = structuredClone(defs(kind)[id]);
    delete overrides[keyOf(kind, id)];
    persist();
  }
  return msg;
}
