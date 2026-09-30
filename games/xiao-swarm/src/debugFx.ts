import { FX, FX_DEFAULTS, type FxName, type FxParams } from './fxParams';

/**
 * Réglages d'effets édités dans la visionneuse de particules (dev uniquement) : mémorisés dans le navigateur et
 * réappliqués au démarrage (BootScene) pour voir le résultat en jeu. Seul `fxParams.ts` est livré.
 */
const STORAGE_KEY = 'xiao-debug-fx';

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(FX));
  } catch {
    // stockage indisponible : les réglages ne survivent simplement pas au rechargement
  }
}

/** À appeler au démarrage, avant la création des effets. */
export function loadFxOverrides(): void {
  if (!import.meta.env.DEV) return;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Record<FxName, Record<string, number>>>;
    for (const name of Object.keys(FX_DEFAULTS) as FxName[]) {
      const block = saved[name];
      if (!block) continue;
      for (const key of Object.keys(FX_DEFAULTS[name])) {
        const v = block[key];
        if (typeof v === 'number' && Number.isFinite(v)) (FX[name] as Record<string, number>)[key] = v;
      }
    }
  } catch {
    // réglages illisibles : valeurs par défaut
  }
}

export function setFx<N extends FxName>(name: N, key: keyof FxParams[N], value: number): void {
  (FX[name] as Record<string, number>)[key as string] = value;
  persist();
}

export function resetFx(name: FxName): void {
  Object.assign(FX[name], FX_DEFAULTS[name]);
  persist();
}

/** Bloc à coller dans FX_DEFAULTS (fxParams.ts). */
export function fxSnippet(name: FxName): string {
  const hex = (k: string, v: number) => (k.toLowerCase().includes('color') ? `0x${v.toString(16).padStart(6, '0')}` : String(Math.round(v * 1000) / 1000));
  const entries = Object.entries(FX[name]).map(([k, v]) => `${k}: ${hex(k, v as number)}`);
  return `${name}: { ${entries.join(', ')} },`;
}
