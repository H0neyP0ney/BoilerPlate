/**
 * Zones de la carte solo / coop (éditées dans la visionneuse « Carte », dev). Donnée pure, partagée par la simulation
 * (`data/maps.ts` tire les obstacles) et l'éditeur.
 *
 * Zone d'obstacle : un rectangle (centre `x` / `y`, taille `w` × `h`, en px du monde). À chaque début de partie, la carte tire
 * UN obstacle au hasard (parmi tous ceux de `data/obstacles.ts`) à une position au hasard dans chaque zone, avec la seed de la
 * partie : tous les joueurs d'une même partie ont donc exactement la même carte. `chance` (0 → 1, 1 par défaut) = probabilité
 * que la zone donne bien un obstacle.
 */
export interface ObstacleZone {
  x: number;
  y: number;
  w: number;
  h: number;
  chance?: number;
}

export interface MapZoneConfig {
  obstacleZones: ObstacleZone[];
}

/** Valeurs livrées (le « Save » de la visionneuse Carte réécrit ce bloc). */
export const DEFAULT_MAP_ZONES: MapZoneConfig = {
  obstacleZones: [
    { x: 985, y: 1329, w: 396, h: 634 },
    { x: 1685, y: 1136, w: 647, h: 554 },
    { x: 2904, y: 779, w: 290, h: 264 },
    { x: 2160, y: 2658, w: 429, h: 376 },
    { x: 2475, y: 3109, w: 429, h: 271 },
    { x: 2335, y: 2093, w: 515, h: 376 },
    { x: 3002, y: 1880, w: 488, h: 502 },
    { x: 755, y: 788, w: 323, h: 284 },
    { x: 1670, y: 2774, w: 462, h: 482 },
    { x: 799, y: 2303, w: 290, h: 264 },
    { x: 3049, y: 3095, w: 290, h: 264 },
    { x: 2453, y: 1285, w: 469, h: 521 },
    { x: 1473, y: 636, w: 317, h: 317 },
    { x: 2154, y: 680, w: 191, h: 172 },
    { x: 740, y: 3104, w: 422, h: 284 },
    { x: 1353, y: 2138, w: 317, h: 317 },
    { x: 3012, y: 2562, w: 482, h: 422 },
  ],
};

/** Zones en cours (celles qu'utilise la carte) : en dev, la visionneuse les modifie ; sinon ce sont les valeurs livrées. */
export const MAP_ZONES: MapZoneConfig = { obstacleZones: DEFAULT_MAP_ZONES.obstacleZones.map((z) => ({ ...z })) };
