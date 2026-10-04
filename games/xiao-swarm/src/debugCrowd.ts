import { log } from '@xiao/engine';
import { CROWD, CROWD_DEFAULTS, type CrowdKey } from './config';
import { saveToCode } from './dev/devSave';
import { dropStaleOverride } from './dev/staleOverrides';

/**
 * Réglages du mouvement de foule (dev uniquement) : un paramètre de `CROWD` par slider du panneau « Foule »
 * (dev/crowdPanel.ts). Deux mémoires dans le navigateur (localStorage) :
 *  - les réglages COURANTS, réenregistrés à chaque changement (ils survivent aux rechargements) ;
 *  - une CONFIG DE TRAVAIL, point de retour que tu enregistres / recharges à la demande (boutons ou F8 / F9).
 * « Copier » met les valeurs en JSON dans le presse-papiers (à recoller dans CROWD_DEFAULTS de config.ts).
 */
const STORAGE_KEY = 'xiao-debug-crowd';
const PRESET_KEY = 'xiao-debug-crowd-preset';

export interface CrowdSpec {
  key: CrowdKey;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}

export const CROWD_SPECS: CrowdSpec[] = [
  { key: 'speed', label: 'Vitesse', min: 80, max: 500, step: 5, hint: "Vitesse de l'ancre = vitesse max de la squad (px/s)" },
  { key: 'gainMin', label: 'Réactivité (gain)', min: 1, max: 20, step: 0.5, hint: 'Vitesse voulue = écart au slot × gain. Plus grand = les soldats rejoignent leur place plus vite' },
  { key: 'gainSpread', label: 'Écart de réactivité', min: 0, max: 12, step: 0.5, hint: 'Aléa entre soldats. 0 = formation rigide, grand = organique / étirée' },
  { key: 'velDamp', label: 'Vivacité vitesse', min: 2, max: 40, step: 0.5, hint: 'Accélère / freine plus sec quand grand (inertie quand petit)' },
  { key: 'maxSpeedMul', label: 'Vitesse rattrapage ×', min: 1, max: 4, step: 0.05, hint: "Vitesse max d'un soldat qui rattrape, en multiple de la vitesse" },
  { key: 'leash', label: 'Laisse', min: 10, max: 250, step: 2, hint: "Distance max ancre ↔ coeur de la squad : petit = la squad ne peut pas être distancée par l'ancre" },
  { key: 'leashPerRoot', label: 'Laisse / √soldats', min: 0, max: 20, step: 0.5, hint: 'Laisse en plus selon la taille de la squad' },
  { key: 'spacing', label: 'Espacement', min: 25, max: 100, step: 1, hint: 'Distance entre voisins dans la formation' },
  { key: 'separation', label: 'Séparation', min: 0, max: 1, step: 0.05, hint: 'Force qui écarte les soldats qui se chevauchent' },
  { key: 'wallMargin', label: 'Décor : zone douce', min: 0, max: 80, step: 1, hint: "Largeur autour des hitbox où les unités glissent au lieu de buter. 0 = hitbox dure seule" },
  { key: 'wallPush', label: 'Décor : écartement', min: 0, max: 300, step: 5, hint: 'Vitesse qui écarte doucement du décor, maximale au contact de la hitbox' },
  { key: 'wallNudge', label: 'Décor : glisse', min: 0, max: 1.5, step: 0.05, hint: "Part de la vitesse vers le mur convertie en glissade le long du bord (0 = elle s'annule, évite de contourner)" },
  { key: 'knockDamp', label: 'Amorti knockback', min: 1, max: 15, step: 0.5, hint: "Vitesse à laquelle le recul des coups s'éteint" },
];

/** Enregistre les réglages courants (à appeler après chaque changement de slider). */
export function saveCrowd(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(CROWD));
  } catch {
    // stockage indisponible : les réglages ne survivent simplement pas au rechargement
  }
}

/** Applique les valeurs connues et valides d'un objet aux réglages courants. */
function apply(values: Partial<Record<CrowdKey, number>>): void {
  for (const key of Object.keys(CROWD_DEFAULTS) as CrowdKey[]) {
    const v = values[key];
    if (typeof v === 'number' && Number.isFinite(v)) CROWD[key] = v;
  }
}

/** À appeler avant de créer la simulation : réapplique les réglages courants mémorisés. */
export function loadSavedCrowd(): void {
  if (!import.meta.env.DEV) return;
  dropStaleOverride(STORAGE_KEY, 'Foule', CROWD_DEFAULTS);
  try {
    apply(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Record<CrowdKey, number>>);
  } catch {
    // réglages illisibles : valeurs par défaut
  }
}

export function resetCrowd(): void {
  Object.assign(CROWD, CROWD_DEFAULTS);
  saveCrowd();
}

/** Save : écrit les valeurs courantes dans `CROWD_DEFAULTS` (config.ts) ; Reset ramène ensuite à cette sauvegarde. */
export async function saveCrowdToCode(): Promise<string> {
  const msg = await saveToCode('crowd', CROWD);
  if (msg.startsWith('✔')) Object.assign(CROWD_DEFAULTS, CROWD);
  return msg;
}

/** Copie les valeurs courantes en JSON (presse-papiers + console) : à recoller dans CROWD_DEFAULTS. */
export function copyCrowd(): void {
  const json = JSON.stringify(CROWD, null, 2);
  log.info('[crowd] valeurs actuelles :\n' + json);
  void navigator.clipboard?.writeText(json).catch(() => {});
}

const clock = (t: number): string => new Date(t).toLocaleTimeString('fr-FR');

/** Enregistre la config de travail ; `say` affiche le résultat. */
export function savePreset(say: (msg: string) => void): void {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify({ savedAt: Date.now(), values: CROWD }));
    say(`Config de travail sauvegardée (${clock(Date.now())})`);
  } catch {
    say('Sauvegarde impossible (stockage indisponible)');
  }
}

/** Recharge la config de travail ; `onLoaded` permet de resynchroniser l'interface. */
export function loadPreset(say: (msg: string) => void, onLoaded: () => void): void {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (!raw) return say('Aucune config de travail sauvegardée (F8 pour en créer une)');
    const preset = JSON.parse(raw) as { savedAt?: number; values?: Partial<Record<CrowdKey, number>> };
    apply(preset.values ?? {});
    saveCrowd();
    onLoaded();
    say(`Config de travail chargée (sauvegardée à ${preset.savedAt ? clock(preset.savedAt) : '?'})`);
  } catch {
    say('Config de travail illisible');
  }
}
