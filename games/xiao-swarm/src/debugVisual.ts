import { DEV_TOOLS } from '@xiao/engine';
import type { DebugOverlay } from '@xiao/engine';
import { VISUAL, VISUAL_DEFAULTS, type VisualKey } from './config';
import { saveToCode } from './dev/devSave';
import { dropStaleOverride } from './dev/staleOverrides';

/**
 * Menu debug des réglages visuels (dev uniquement) : un slider par paramètre de `VISUAL`,
 * mémorisé dans le navigateur (comme debugCrowd.ts). Les vues relisent `VISUAL` à chaque frame.
 */
const STORAGE_KEY = 'xiao-debug-visual';

const SPECS: { key: VisualKey; label: string; min: number; max: number; step: number; hint: string }[] = [
  { key: 'stainAlpha', label: 'Opacité des taches', min: 0, max: 1, step: 0.05, hint: 'Opacité des taches sombres sous les obstacles' },
  { key: 'groundScale', label: 'Échelle du sol', min: 0.2, max: 2, step: 0.01, hint: 'Taille de la texture de sol à l\'écran (1024 px × échelle)' },
  { key: 'camFollowTime', label: 'Caméra : temps de suivi (s)', min: 0, max: 1, step: 0.01, hint: 'Constante de temps du suivi de la squad : 0 = collée, plus grand = plus doux et plus en retard (la caméra rattrape en ~3 × ce temps)' },
  { key: 'camLookAhead', label: 'Caméra : avance (px)', min: 0, max: 400, step: 5, hint: 'Décalage de la caméra dans le sens de course de la squad (à vitesse normale) : on voit plus devant' },
  { key: 'camLookTime', label: 'Caméra : lissage de l\'avance (s)', min: 0.05, max: 2, step: 0.05, hint: 'Temps que met l\'avance à s\'installer ou à revenir quand la squad tourne ou s\'arrête' },
  { key: 'camDeadzone', label: 'Caméra : zone morte (px)', min: 0, max: 300, step: 5, hint: 'Rayon autour du centre de l\'écran dans lequel la squad peut bouger sans que la caméra bouge' },
  { key: 'camZoomSpeed', label: 'Caméra : vitesse du zoom', min: 0.2, max: 10, step: 0.1, hint: 'Vitesse du zoom automatique (dézoome quand la squad grossit)' },
];

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(VISUAL));
  } catch {
    // stockage indisponible : les réglages ne survivent simplement pas au rechargement
  }
}

/** À appeler avant de créer la vue : réapplique les réglages mémorisés. */
export function loadSavedVisual(): void {
  if (!DEV_TOOLS) return;
  dropStaleOverride(STORAGE_KEY, 'Réglages visuels', VISUAL_DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Record<VisualKey, number>>;
    for (const key of Object.keys(VISUAL_DEFAULTS) as VisualKey[]) {
      const v = saved[key];
      if (typeof v === 'number' && Number.isFinite(v)) VISUAL[key] = v;
    }
  } catch {
    // réglages illisibles : valeurs par défaut
  }
}

export function addVisualMenu(dbg: DebugOverlay): void {
  dbg.section('Visuel');
  for (const s of SPECS) {
    dbg.slider(s.label, {
      min: s.min,
      max: s.max,
      step: s.step,
      hint: `${s.hint} (défaut ${VISUAL_DEFAULTS[s.key]})`,
      get: () => VISUAL[s.key],
      set: (v) => {
        VISUAL[s.key] = v;
        save();
      },
    });
  }
  dbg.button('Save (visuel)', () => {
    void saveToCode('visual', VISUAL).then((msg) => {
      if (msg.startsWith('✔')) Object.assign(VISUAL_DEFAULTS, VISUAL);
      dbg.message(msg);
    });
  });
  dbg.button('Reset (visuel)', () => {
    Object.assign(VISUAL, VISUAL_DEFAULTS);
    save();
    dbg.syncSliders();
    dbg.message('Retour à la dernière sauvegarde');
  });
}
