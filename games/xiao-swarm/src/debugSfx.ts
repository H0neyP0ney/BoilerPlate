import Phaser from 'phaser';
import { DEV_TOOLS } from '@xiao/engine';
import { SFX_TUNING, type SfxTuning } from './data/sfxTuning';
import { saveToCode } from './dev/devSave';
import { dropStaleOverride } from './dev/staleOverrides';
import { SFX, sfxVariantUrl, type SfxId } from './settings';

/** Réglages des bruitages (page `?sounds`) : mémorisés dans le navigateur ; Save les écrit dans `data/sfxTuning.ts`. */
const STORAGE_KEY = 'xiao-debug-sfx-tuning';

/** Champs numériques réglables d'un son. */
export type SfxField = 'volume' | 'detune' | 'pitch' | 'rate' | 'minGapMs' | 'maxVoices';

type Def = { key: string; url: string[]; baseUrl: string; variant: string; volume: number; detune?: number; pitch?: number; rate?: number; minGapMs?: number; maxVoices?: number };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const ids = (): SfxId[] => Object.keys(SFX) as SfxId[];
const def = (id: SfxId): Def => SFX[id] as unknown as Def;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const validVariant = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]*$/.test(v);

/** Réglages tels qu'écrits dans le code (`data/sfxTuning.ts`, mis à jour par Save). */
const saved: Record<string, SfxTuning> = clone(SFX_TUNING);
/** Variantes connues de chaque son (hors base) : celles du code, complétées par les fichiers présents sur le disque (dev). */
const known: Record<string, string[]> = Object.fromEntries(Object.entries(SFX_TUNING).map(([k, t]) => [k, [...t.variants]]));
/** Variante réellement chargée dans le cache audio de chaque son (celle du code au lancement). */
const loaded: Record<string, string> = Object.fromEntries(Object.entries(SFX_TUNING).map(([k, t]) => [k, t.variant]));

/** Réglage actuel d'un son (celui qu'utilise le jeu). */
export function sfxTuning(id: SfxId): SfxTuning {
  const d = def(id);
  return { volume: d.volume, detune: d.detune ?? 0, pitch: d.pitch ?? 0, rate: d.rate ?? 1, minGapMs: d.minGapMs ?? 0, maxVoices: d.maxVoices ?? 0, variant: d.variant, variants: [...(known[id] ?? [])] };
}

function apply(id: SfxId, t: Partial<Record<SfxField, number>> & { variant?: string }): void {
  const d = def(id);
  if (t.volume !== undefined) d.volume = clamp(t.volume, 0, 1);
  if (t.detune !== undefined) d.detune = clamp(Math.round(t.detune), 0, 1200);
  if (t.pitch !== undefined) d.pitch = clamp(Math.round(t.pitch), -1200, 1200);
  if (t.rate !== undefined) d.rate = clamp(Math.round(t.rate * 100) / 100, 0.25, 4);
  if (t.minGapMs !== undefined) d.minGapMs = clamp(Math.round(t.minGapMs), 0, 5000);
  if (t.maxVoices !== undefined) d.maxVoices = t.maxVoices > 0 ? clamp(Math.round(t.maxVoices), 1, 16) : undefined; // 0 = pas de limite
  if (t.variant !== undefined && validVariant(t.variant)) {
    d.variant = t.variant;
    d.url = [sfxVariantUrl(d.baseUrl, t.variant)];
    if (t.variant && !(known[id] ??= []).includes(t.variant)) known[id].push(t.variant);
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(ids().map((i) => [i, sfxTuning(i)]))));
  } catch {
    // stockage indisponible
  }
}

/** À appeler au démarrage (dev / `?debug=1`) : réapplique les réglages mémorisés (volume, cadence, variante…). */
export function loadSfxOverrides(): void {
  if (!DEV_TOOLS) return;
  try {
    dropStaleOverride(STORAGE_KEY, 'Réglages des sons', SFX_TUNING);
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Record<string, Partial<Record<SfxField, number>> & { variant?: string; variants?: string[] }> | null;
    if (!raw) return;
    for (const id of ids()) {
      const r = raw[id];
      if (!r) continue;
      for (const v of r.variants ?? []) if (validVariant(v) && v && !(known[id] ??= []).includes(v)) known[id].push(v);
      apply(id, r);
    }
  } catch {
    // copie abîmée ou stockage indisponible : on garde le code
  }
}

/** Recharge le fichier audio des sons dont la variante choisie (mémorisée) n'est pas celle chargée au lancement. */
export function reloadChangedVariants(scene: Phaser.Scene, loadMissing = true): void {
  if (!DEV_TOOLS) return;
  for (const id of ids()) {
    const inCache = scene.cache.audio.exists(def(id).key);
    if (!inCache && !loadMissing) continue; // paquet 2 pas encore chargé : ses bruitages arrivent avec lui (`latePack.ensure`), pas au démarrage
    if (def(id).variant !== loaded[id] || !inCache) void reloadSound(scene, id); // variante changée, ou fichier absent du cache (chargement raté)
  }
}

/** Chargements en cours par son : un nouveau chargement attend le précédent (sinon deux chargements de la même clé se marchent dessus). */
const chain: Record<string, Promise<void>> = {};

/** Remplace dans le cache audio le fichier d'un son par celui de sa variante courante (au moment où le chargement démarre). */
function reloadSound(scene: Phaser.Scene, id: SfxId): Promise<void> {
  const run = (): Promise<void> => loadNow(scene, id);
  chain[id] = (chain[id] ?? Promise.resolve()).then(run, run);
  return chain[id];
}

function loadNow(scene: Phaser.Scene, id: SfxId): Promise<void> {
  const d = def(id);
  const wanted = d.variant;
  if (loaded[id] === wanted && scene.cache.audio.exists(d.key)) return Promise.resolve(); // déjà le bon fichier
  return new Promise((resolve) => {
    scene.cache.audio.remove(d.key);
    scene.load.audio(d.key, d.url);
    scene.load.once(`filecomplete-audio-${d.key}`, () => {
      loaded[id] = wanted;
      resolve();
    });
    scene.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => resolve()); // fichier introuvable : le son reste muet
    scene.load.start();
  });
}

/** Règle un champ numérique d'un son (immédiat dans le jeu) et le mémorise. */
export function setSfxField(id: SfxId, field: SfxField, value: number): void {
  apply(id, { [field]: value });
  persist();
}

/** Charge le fichier d'un son s'il n'est pas dans le cache audio (page `?sounds` : variante choisie avant le chargement, fichier arrivé après le lancement…). */
export function ensureSfxLoaded(scene: Phaser.Scene, id: SfxId): Promise<void> {
  return scene.cache.audio.exists(def(id).key) ? Promise.resolve() : reloadSound(scene, id);
}

/** Choisit la variante jouée par un son (`''` = la base) : charge son fichier, puis résout. */
export async function selectSfxVariant(scene: Phaser.Scene, id: SfxId, variant: string): Promise<void> {
  apply(id, { variant });
  persist();
  await reloadSound(scene, id);
}

/** Envoie un fichier son choisi par l'utilisateur au serveur de dev, qui l'enregistre comme variante `<id>--<nom>.mp3`. Renvoie le message à afficher et le nom de variante créé. */
export async function uploadSfxVariant(id: SfxId, file: File, name: string): Promise<{ ok: boolean; message: string; name: string }> {
  const clean = name.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!clean) return { ok: false, message: 'Nom de variante invalide (lettres, chiffres, - et _)', name: '' };
  try {
    const res = await fetch(`/__dev/sfx-upload?id=${id}&name=${encodeURIComponent(clean)}&ext=${encodeURIComponent(ext)}`, { method: 'POST', body: file });
    if (!(res.headers.get('content-type') ?? '').includes('json')) return { ok: false, message: 'Ajout disponible en dev seulement (npm run dev)', name: clean };
    const out = (await res.json()) as { ok: boolean; message: string };
    if (out.ok) await refreshSfxVariants();
    return { ok: out.ok, message: out.message, name: clean };
  } catch {
    return { ok: false, message: 'Ajout impossible : serveur de dev injoignable', name: clean };
  }
}

/** Envoie un fichier comme NOUVEAU son (`<id>.mp3`), l'enregistre dans le catalogue (`SFX`) et le charge. `id` : minuscules, chiffres et `_`. */
export async function addNewSfx(scene: Phaser.Scene, file: File, id: string): Promise<{ ok: boolean; message: string; id: string }> {
  const clean = id.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  if (!clean || clean in SFX) return { ok: false, message: clean ? `« ${clean} » existe déjà : choisis un autre nom` : 'Nom invalide', id: clean };
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  try {
    const res = await fetch(`/__dev/sfx-upload?id=${clean}&new=1&ext=${encodeURIComponent(ext)}`, { method: 'POST', body: file });
    if (!(res.headers.get('content-type') ?? '').includes('json')) return { ok: false, message: 'Ajout disponible en dev seulement (npm run dev)', id: clean };
    const out = (await res.json()) as { ok: boolean; message: string };
    if (!out.ok) return { ...out, id: clean };
    const entry = { key: `sfx_${clean}`, baseUrl: `assets/audio/sfx/${clean}.mp3`, url: [`assets/audio/sfx/${clean}.mp3`], variant: '', volume: 0.5 };
    (SFX as Record<string, unknown>)[clean] = entry;
    known[clean] = [];
    loaded[clean] = '';
    await reloadSound(scene, clean as SfxId);
    persist();
    return { ok: true, message: `${out.message} — pense à Save pour le garder dans le catalogue`, id: clean };
  } catch {
    return { ok: false, message: 'Ajout impossible : serveur de dev injoignable', id: clean };
  }
}

/** Complète les variantes connues avec les fichiers présents sur le disque (serveur de dev seulement). */
export async function refreshSfxVariants(): Promise<void> {
  try {
    const res = await fetch('/__dev/sfx-list');
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return;
    const list = (await res.json()) as Record<string, string[]>;
    // le disque fait foi (en dev) : une variante dont le fichier a été supprimé disparaît de la liste (et le son retombe sur la base s'il l'utilisait)
    for (const id of Object.keys(known)) known[id] = (list[id] ?? []).filter(validVariant).sort();
    for (const [id, vs] of Object.entries(list)) known[id] = vs.filter(validVariant).sort();
    for (const id of ids()) if (def(id).variant && !known[id]?.includes(def(id).variant)) apply(id, { variant: '' });
  } catch {
    // pas de serveur de dev : on garde les variantes du code
  }
}

/** Reset : revient aux réglages de la dernière sauvegarde (code), variantes comprises. */
export async function resetSfxTuning(scene: Phaser.Scene): Promise<void> {
  for (const id of ids()) if (saved[id]) apply(id, saved[id]);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // stockage indisponible
  }
  await Promise.all(ids().filter((id) => def(id).variant !== loaded[id]).map((id) => reloadSound(scene, id)));
}

const q = (s: string): string => `'${s.replace(/'/g, "\\'")}'`;

/** Save : écrit les réglages courants dans `SFX_TUNING` (data/sfxTuning.ts) ; Reset ramène ensuite à cette sauvegarde. */
export async function saveSfxTuningToCode(): Promise<string> {
  const lines = ids().map((id) => {
    const t = sfxTuning(id);
    return `  ${id}: { volume: ${Math.round(t.volume * 100) / 100}, detune: ${t.detune}, pitch: ${t.pitch}, rate: ${t.rate}, minGapMs: ${t.minGapMs}, maxVoices: ${t.maxVoices}, variant: ${q(t.variant)}, variants: [${t.variants.map(q).join(', ')}] },`;
  });
  const code = `export const SFX_TUNING: Record<string, SfxTuning> = {\n${lines.join('\n')}\n};`;
  const msg = await saveToCode('sfxtuning', { code });
  if (msg.startsWith('✔')) for (const id of ids()) saved[id] = { ...sfxTuning(id), volume: Math.round(sfxTuning(id).volume * 100) / 100 };
  return msg;
}
