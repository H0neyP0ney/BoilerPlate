import { DEV_TOOLS } from '@xiao/engine';
import { UPGRADES, type UpgradeId } from './data/progression';
import { saveToCode } from './dev/devSave';
import { dropStaleOverride } from './dev/staleOverrides';

/**
 * Stats des upgrades éditées dans la visionneuse d'upgrades (dev uniquement) : « bonus » (valeur affichée sur la carte, qui fixe aussi
 * `mod.pct` = valeur / 100 ou `mod.flat` = valeur × `FLAT_SCALE`) et nombre maximal de prises. Modifiés en direct dans `UPGRADES` (pris en compte à la
 * prochaine prise), mémorisés dans le navigateur (`xiao-debug-upgrades`) et réappliqués au démarrage ; Save les écrit dans
 * data/progression.ts, Reset revient à la dernière sauvegarde.
 */
const STORAGE_KEY = 'xiao-debug-upgrades';

export interface UpgradeStats {
  value: number;
  maxStacks: number;
}

const DEFAULTS = new Map<UpgradeId, UpgradeStats>();
/** Échelle `mod.flat` / valeur affichée, d'après le code : 1 pour une valeur fixe (Max Squad), 0,01 pour une fraction affichée en % (Esprit d'équipe, Dernier rempart, Chasseur de boss). */
const FLAT_SCALE = new Map<UpgradeId, number>();
for (const [id, u] of Object.entries(UPGRADES)) {
  DEFAULTS.set(id as UpgradeId, { value: u.value, maxStacks: u.maxStacks });
  if (u.mod?.flat !== undefined && u.value !== 0) FLAT_SCALE.set(id as UpgradeId, u.mod.flat / u.value);
}
let overrides: Partial<Record<UpgradeId, UpgradeStats>> = {};

/** Valeurs du code (dernière sauvegarde) : repère de l'échelle des réglettes, qui ne doit pas se réduire quand la valeur courante tombe à 0. */
export const getDefaultUpgradeStats = (id: UpgradeId): UpgradeStats => ({ ...(DEFAULTS.get(id) ?? getUpgradeStats(id)) });

export const getUpgradeStats = (id: UpgradeId): UpgradeStats => ({ value: UPGRADES[id].value, maxStacks: UPGRADES[id].maxStacks });

/** Applique le bonus à la définition : valeur affichée + modificateur (pourcentage ou valeur fixe selon l'upgrade). */
function apply(id: UpgradeId, s: UpgradeStats): void {
  const u = UPGRADES[id];
  u.value = s.value;
  u.maxStacks = s.maxStacks;
  if (u.mod) {
    if (u.mod.pct !== undefined) u.mod.pct = s.value / 100;
    else if (u.mod.flat !== undefined) u.mod.flat = s.value * (FLAT_SCALE.get(id) ?? 1);
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // stockage indisponible : les réglages ne survivent simplement pas au rechargement
  }
}

export function setUpgradeStat(id: UpgradeId, key: keyof UpgradeStats, v: number): void {
  const s = { ...getUpgradeStats(id), [key]: v };
  apply(id, s);
  overrides[id] = s;
  persist();
}

export function resetUpgrade(id: UpgradeId): void {
  const d = DEFAULTS.get(id);
  if (d) apply(id, d);
  delete overrides[id];
  persist();
}

/** À appeler au démarrage (dev), avant de créer la simulation. */
export function loadUpgradeOverrides(): void {
  if (!DEV_TOOLS) return;
  dropStaleOverride(STORAGE_KEY, 'Upgrades', UPGRADES);
  try {
    overrides = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as typeof overrides;
  } catch {
    overrides = {};
  }
  for (const [id, s] of Object.entries(overrides)) if (s && UPGRADES[id as UpgradeId]) apply(id as UpgradeId, s);
}

/** Save : écrit l'upgrade dans data/progression.ts (elle devient la valeur par défaut). */
export async function saveUpgradeToCode(id: UpgradeId): Promise<string> {
  const u = UPGRADES[id];
  const msg = await saveToCode('upgrades', { id, value: u.value, maxStacks: u.maxStacks, pct: u.mod?.pct, flat: u.mod?.flat });
  if (msg.startsWith('✔')) {
    DEFAULTS.set(id, getUpgradeStats(id));
    delete overrides[id];
    persist();
  }
  return msg;
}
