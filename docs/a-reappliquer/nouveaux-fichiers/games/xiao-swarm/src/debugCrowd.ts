import { DebugOverlay, log } from '@xiao/engine';
import { CROWD, CROWD_DEFAULTS, type CrowdKey } from './config';

/**
 * Menu debug du mouvement de foule (dev uniquement) : un slider par paramètre de `CROWD`.
 * Les réglages sont mémorisés dans le navigateur (localStorage) pour survivre aux rechargements ;
 * « Copier » met les valeurs en JSON dans le presse-papiers (à recoller dans CROWD_DEFAULTS de config.ts).
 */
const STORAGE_KEY = 'xiao-debug-crowd';

interface Spec {
  key: CrowdKey;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}

const SPECS: Spec[] = [
  { key: 'speed', label: 'Vitesse', min: 80, max: 500, step: 5, hint: "Vitesse de l'ancre = vitesse max de la squad (px/s)" },
  { key: 'gainMin', label: 'Réactivité (gain)', min: 1, max: 20, step: 0.5, hint: 'Vitesse voulue = écart au slot × gain. Plus grand = les soldats rejoignent leur place plus vite' },
  { key: 'gainSpread', label: 'Écart de réactivité', min: 0, max: 12, step: 0.5, hint: 'Aléa entre soldats. 0 = formation rigide, grand = organique / étirée' },
  { key: 'velDamp', label: 'Vivacité vitesse', min: 2, max: 40, step: 0.5, hint: 'Accélère / freine plus sec quand grand (inertie quand petit)' },
  { key: 'maxSpeedMul', label: 'Vitesse rattrapage ×', min: 1, max: 4, step: 0.05, hint: 'Vitesse max d\'un soldat qui rattrape, en multiple de la vitesse' },
  { key: 'leash', label: 'Laisse', min: 10, max: 250, step: 2, hint: "Distance max ancre ↔ coeur de la squad : petit = la squad ne peut pas être distancée par l'ancre" },
  { key: 'leashPerRoot', label: 'Laisse / √soldats', min: 0, max: 20, step: 0.5, hint: 'Laisse en plus selon la taille de la squad' },
  { key: 'spacing', label: 'Espacement', min: 25, max: 100, step: 1, hint: 'Distance entre voisins dans la formation' },
  { key: 'separation', label: 'Séparation', min: 0, max: 1, step: 0.05, hint: 'Force qui écarte les soldats qui se chevauchent' },
  { key: 'knockDamp', label: 'Amorti knockback', min: 1, max: 15, step: 0.5, hint: 'Vitesse à laquelle le recul des coups s\'éteint' },
  { key: 'stillDelay', label: 'Délai soin (s)', min: 0, max: 2, step: 0.05, hint: 'Temps à l\'arrêt avant que le Medic soigne' },
];

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(CROWD));
  } catch {
    // stockage indisponible : les réglages ne survivent simplement pas au rechargement
  }
}

/** À appeler avant de créer la simulation : réapplique les réglages mémorisés. */
export function loadSavedCrowd(): void {
  if (!import.meta.env.DEV) return;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Record<CrowdKey, number>>;
    for (const key of Object.keys(CROWD_DEFAULTS) as CrowdKey[]) {
      if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) CROWD[key] = saved[key] as number;
    }
  } catch {
    // réglages illisibles : valeurs par défaut
  }
}

export function addCrowdMenu(dbg: DebugOverlay): void {
  dbg.section('Mouvement de foule');
  for (const s of SPECS) {
    dbg.slider(s.label, {
      min: s.min,
      max: s.max,
      step: s.step,
      hint: `${s.hint} (défaut ${CROWD_DEFAULTS[s.key]})`,
      get: () => CROWD[s.key],
      set: (v) => {
        CROWD[s.key] = v;
        save();
      },
    });
  }
  dbg.button('Réinitialiser', () => {
    Object.assign(CROWD, CROWD_DEFAULTS);
    save();
    dbg.syncSliders();
  });
  dbg.button('Copier (JSON)', () => {
    const json = JSON.stringify(CROWD, null, 2);
    log.info('[crowd] valeurs actuelles :\n' + json);
    void navigator.clipboard?.writeText(json).catch(() => {});
  });
}
