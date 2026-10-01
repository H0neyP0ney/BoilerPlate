import en from './locales/en.json';
import fr from './locales/fr.json';
import { saveToCode } from './dev/devSave';

/**
 * Noms des unités édités dans la visionneuse d'unités (dev uniquement) : clés de langue `class_<classe>` (soldats) et
 * `alien_<id>` (aliens), en FR et EN. Modifiés en mémoire (les dictionnaires d'i18n sont ces mêmes objets JSON), mémorisés
 * dans le navigateur, réappliqués au démarrage ; Save les écrit dans locales/fr.json et locales/en.json, Reset revient à
 * la dernière sauvegarde.
 */
const STORAGE_KEY = 'xiao-debug-names';
type Lang = 'fr' | 'en';
type Names = Record<string, Partial<Record<Lang, string>>>;

const DICTS: Record<Lang, Record<string, string>> = { fr: fr as Record<string, string>, en: en as Record<string, string> };
/** Valeurs du code (dernière sauvegarde), pour Reset. */
const DEFAULTS: Record<Lang, Record<string, string>> = { fr: { ...DICTS.fr }, en: { ...DICTS.en } };
let edits: Names = {};

/** Clé de langue du nom d'une unité de la visionneuse (`soldier_gunner` → `class_gunner`, `alien_crab` → `alien_crab`). */
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
  for (const lang of ['fr', 'en'] as Lang[]) {
    if (key in DEFAULTS[lang]) DICTS[lang][key] = DEFAULTS[lang][key];
    else delete DICTS[lang][key];
  }
  delete edits[key];
  persist();
}

/** À appeler au démarrage (dev) : réapplique les noms mémorisés. */
export function loadNameOverrides(): void {
  if (!import.meta.env.DEV) return;
  try {
    edits = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Names;
  } catch {
    edits = {};
  }
  for (const [key, langs] of Object.entries(edits)) {
    for (const lang of ['fr', 'en'] as Lang[]) {
      const v = langs[lang];
      if (typeof v === 'string') DICTS[lang][key] = v;
    }
  }
}

/** Save : écrit TOUS les noms modifiés dans locales/fr.json et locales/en.json (ils deviennent les valeurs du code). */
export async function saveNamesToCode(): Promise<string> {
  const data: Record<Lang, Record<string, string>> = { fr: {}, en: {} };
  for (const [key, langs] of Object.entries(edits)) {
    for (const lang of ['fr', 'en'] as Lang[]) {
      const v = langs[lang];
      if (typeof v === 'string') data[lang][key] = v;
    }
  }
  const msg = await saveToCode('names', data);
  if (msg.startsWith('✔')) {
    for (const lang of ['fr', 'en'] as Lang[]) Object.assign(DEFAULTS[lang], data[lang]);
    edits = {};
    persist();
  }
  return msg;
}
