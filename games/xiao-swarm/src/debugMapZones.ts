import { DEFAULT_MAP_ZONES, MAP_ZONES, type ObstacleZone } from './data/mapZones';
import { JUNGLE_SIZE } from './data/maps';
import { saveToCode } from './dev/devSave';

/**
 * Zones de la carte éditées dans la visionneuse « Carte » (dev uniquement) : mémorisées dans le navigateur et réappliquées au
 * démarrage (BootScene) pour les jouer telles quelles. Save les écrit dans `DEFAULT_MAP_ZONES` (data/mapZones.ts), seule source
 * livrée ; Reset revient à cette dernière sauvegarde.
 */
const STORAGE_KEY = 'xiao-debug-mapzones';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const r1 = (v: number): number => Math.round(v);

/** Zones valides à partir de données quelconques (réglages mémorisés possiblement abîmés). */
function sanitize(raw: unknown): ObstacleZone[] | null {
  const list = (raw as { obstacleZones?: unknown } | null)?.obstacleZones;
  if (!Array.isArray(list)) return null;
  return list
    .filter((z) => z && typeof z === 'object')
    .map((z): ObstacleZone => {
      const chance = Math.min(1, Math.max(0, num(z.chance, 1)));
      return {
        x: r1(Math.min(JUNGLE_SIZE, Math.max(0, num(z.x, JUNGLE_SIZE / 2)))),
        y: r1(Math.min(JUNGLE_SIZE, Math.max(0, num(z.y, JUNGLE_SIZE / 2)))),
        w: r1(Math.max(1, num(z.w, 200))),
        h: r1(Math.max(1, num(z.h, 200))),
        ...(chance < 1 ? { chance: Math.round(chance * 100) / 100 } : {}),
      };
    });
}

/** À appeler au démarrage, avant de créer la simulation : réapplique les zones mémorisées. */
export function loadMapZoneOverrides(): void {
  if (!import.meta.env.DEV) return;
  try {
    const saved = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
    if (saved) MAP_ZONES.obstacleZones = saved;
  } catch {
    // zones illisibles : valeurs par défaut
  }
}

/** À appeler après chaque modification (mémorise dans le navigateur). */
export function persistMapZones(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(MAP_ZONES));
  } catch {
    // stockage indisponible : les zones ne survivent simplement pas au rechargement
  }
}

/** Revient aux zones livrées (data/mapZones.ts). */
export function resetMapZones(): void {
  MAP_ZONES.obstacleZones = clone(DEFAULT_MAP_ZONES.obstacleZones);
  persistMapZones();
}

/** Save : écrit les zones courantes dans `DEFAULT_MAP_ZONES` (data/mapZones.ts) ; Reset ramène ensuite à cette sauvegarde. */
export async function saveMapZonesToCode(): Promise<string> {
  const msg = await saveToCode('mapzones', { code: mapZonesSnippet() });
  if (msg.startsWith('✔')) DEFAULT_MAP_ZONES.obstacleZones = clone(MAP_ZONES.obstacleZones);
  return msg;
}

/** Code de `DEFAULT_MAP_ZONES` (data/mapZones.ts). */
export function mapZonesSnippet(): string {
  const lines = ['export const DEFAULT_MAP_ZONES: MapZoneConfig = {', '  obstacleZones: ['];
  for (const z of MAP_ZONES.obstacleZones) {
    lines.push(`    { x: ${r1(z.x)}, y: ${r1(z.y)}, w: ${r1(z.w)}, h: ${r1(z.h)}${z.chance !== undefined && z.chance < 1 ? `, chance: ${z.chance}` : ''} },`);
  }
  lines.push('  ],', '};');
  return lines.join('\n');
}
