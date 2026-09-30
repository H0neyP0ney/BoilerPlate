import type { DebugOverlay } from '@xiao/engine';
import { VISUAL, VISUAL_DEFAULTS, type VisualKey } from './config';

/**
 * Menu debug des réglages visuels (dev uniquement) : un slider par paramètre de `VISUAL`,
 * mémorisé dans le navigateur (comme debugCrowd.ts). Les vues relisent `VISUAL` à chaque frame.
 */
const STORAGE_KEY = 'xiao-debug-visual';

const SPECS: { key: VisualKey; label: string; min: number; max: number; step: number; hint: string }[] = [
  { key: 'stainAlpha', label: 'Opacité des taches', min: 0, max: 1, step: 0.05, hint: 'Opacité des taches sombres sous les obstacles' },
  { key: 'groundScale', label: 'Échelle du sol', min: 0.2, max: 2, step: 0.01, hint: 'Taille de la texture de sol à l\'écran (1024 px × échelle)' },
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
  if (!import.meta.env.DEV) return;
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
  dbg.button('Réinitialiser le visuel', () => {
    Object.assign(VISUAL, VISUAL_DEFAULTS);
    save();
    dbg.syncSliders();
    dbg.message('Réglages visuels par défaut restaurés');
  });
}
