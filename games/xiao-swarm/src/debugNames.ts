import en from './locales/en.json';
import { saveToCode } from './dev/devSave';
import { dropStaleOverride } from './dev/staleOverrides';

/**
 * Noms des unités édités dans la visionneuse d'unités (dev uniquement) : clés de langue `class_<classe>` (soldats) et
 * `alien_<id>` (aliens), en anglais. Modifiés en mémoire (les dictionnaires d'i18n sont ces mêmes objets JSON), mémorisés
 * dans le navigateur, réappliqués au démarrage ; Save les écrit dans locales/en.json, Reset revient à
 * la dernière sauvegarde.
 */
const STORAGE_KEY = 'xiao-debug-names';
type Lang = 'en';
type Names = Record<string, Partial<Record<Lang, string>>>;

const DICTS: Record<Lang, Record<string, string>> = { en: en as Record<string, string> };
/** Valeurs du code (dernière sauvegarde), pour Reset. */
const DEFAULTS: Record<Lang, Record<string, string>> = { en: { ...DICTS.en } };
let edits: Names = {};

/** Clé de langue du nom d'une unité de la visionneuse (`soldier_trooper` → `class_trooper`, `alien_boss_crab` → `alien_boss_crab`). */
export function nameKey(kind: 'soldier' | 'alien' | 'recruit', unit: string): string {
  return kind === 'alien' ? `alien_${unit}` : `class_${unit}`;
}

export function getName(key: string, lang: Lang): string {
  return DICTS[lang][key] ?? '';
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
  } catch {
    // stockage indisponible : les noms ne survivent simplement pas au rechargement
  }
}

export function setName(key: string, lang: Lang, value: string): void {
  DICTS[lang][key] = value;
  (edits[key] ??= {})[lang] = value;
  persist();
}

/** Reset : revient aux noms du code pour cette clé (absente du code = clé supprimée, le jeu affiche alors l'id). */
export function resetName(key: string): void {
  for (const lang of ['en'] as Lang[]) {
    if (key in DEFAULTS[lang]) DICTS[lang][key] = DEFAULTS[lang][key];
    else delete DICTS[lang][key];
  }
  delete edits[key];
  persist();
}

/** À appeler au démarrage (dev) : réapplique les noms mémorisés. */
export function loadNameOverrides(): void {
  if (!import.meta.env.DEV) return;
  dropStaleOverride(STORAGE_KEY, 'Noms', en);
  try {
    edits = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Names;
  } catch {
    edits = {};
  }
  // clés de classes renommées (gunner → trooper, tank → bruiser)
  for (const [from, to] of [['class_gunner', 'class_trooper'], ['class_tank', 'class_bruiser'], ['class_grenadier', 'class_bomber'], ['alien_shoot', 'alien_shooter'], ['alien_fire', 'alien_burner']]) {
    if (edits[from]) edits[to] = edits[from];
    delete edits[from];
  }
  for (const [key, langs] of Object.entries(edits)) {
    for (const lang of ['en'] as Lang[]) {
      const v = langs[lang];
      if (typeof v === 'string') DICTS[lang][key] = v;
    }
  }
}

/** Save : écrit TOUS les noms modifiés dans locales/en.json (ils deviennent les valeurs du code). */
export async function saveNamesToCode(): Promise<string> {
  const data: Record<Lang, Record<string, string>> = { en: {} };
  for (const [key, langs] of Object.entries(edits)) {
    for (const lang of ['en'] as Lang[]) {
      const v = langs[lang];
      if (typeof v === 'string') data[lang][key] = v;
    }
  }
  const msg = await saveToCode('names', data);
  if (msg.startsWith('✔')) {
    for (const lang of ['en'] as Lang[]) Object.assign(DEFAULTS[lang], data[lang]);
    edits = {};
    persist();
  }
  return msg;
}
