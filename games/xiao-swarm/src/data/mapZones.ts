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
    { x: 940, y: 1351, w: 375, h: 420 },
    { x: 1710, y: 1160, w: 647, h: 554 },
    { x: 2904, y: 779, w: 290, h: 264 },
    { x: 2160, y: 2658, w: 429, h: 376 },
    { x: 2475, y: 3109, w: 429, h: 271 },
    { x: 2335, y: 2093, w: 515, h: 376 },
    { x: 3002, y: 1880, w: 488, h: 502 },
    { x: 516, y: 439, w: 415, h: 315 },
    { x: 1670, y: 2774, w: 462, h: 482 },
    { x: 799, y: 2303, w: 290, h: 264 },
    { x: 3055, y: 3065, w: 290, h: 264 },
    { x: 2453, y: 1285, w: 469, h: 521 },
    { x: 1473, y: 636, w: 317, h: 317 },
    { x: 2154, y: 680, w: 191, h: 172 },
    { x: 670, y: 3110, w: 422, h: 284 },
    { x: 1353, y: 2138, w: 317, h: 317 },
    { x: 3012, y: 2562, w: 482, h: 422 },
    { x: 530, y: 845, w: 250, h: 210 },
    { x: 490, y: 1625, w: 280, h: 355 },
    { x: 3110, y: 1235, w: 275, h: 280 },
    { x: 3135, y: 410, w: 515, h: 210 },
    { x: 1530, y: 3355, w: 380, h: 245 },
    { x: 720, y: 2665, w: 385, h: 190 },
    { x: 3325, y: 3375, w: 260, h: 170 },
    { x: 3430, y: 2150, w: 200, h: 370 },
  ],
};

/** Zones en cours (celles qu'utilise la carte) : en dev, la visionneuse les modifie ; sinon ce sont les valeurs livrées. */
export const MAP_ZONES: MapZoneConfig = { obstacleZones: DEFAULT_MAP_ZONES.obstacleZones.map((z) => ({ ...z })) };
