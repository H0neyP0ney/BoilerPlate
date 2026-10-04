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
    { x: 895, y: 1208, w: 360, h: 576 },
    { x: 1532, y: 1033, w: 588, h: 504 },
    { x: 2640, y: 708, w: 264, h: 240 },
    { x: 1964, y: 2416, w: 390, h: 342 },
    { x: 2250, y: 2826, w: 390, h: 246 },
    { x: 2123, y: 1903, w: 468, h: 342 },
    { x: 2729, y: 1709, w: 444, h: 456 },
    { x: 686, y: 716, w: 294, h: 258 },
    { x: 1518, y: 2522, w: 420, h: 438 },
    { x: 726, y: 2094, w: 264, h: 240 },
    { x: 2772, y: 2814, w: 264, h: 240 },
    { x: 2230, y: 1168, w: 426, h: 474 },
    { x: 1339, y: 578, w: 288, h: 288 },
    { x: 1958, y: 618, w: 174, h: 156 },
    { x: 673, y: 2822, w: 384, h: 258 },
    { x: 1230, y: 1944, w: 288, h: 288 },
    { x: 2738, y: 2329, w: 438, h: 384 },
  ],
};

/** Zones en cours (celles qu'utilise la carte) : en dev, la visionneuse les modifie ; sinon ce sont les valeurs livrées. */
export const MAP_ZONES: MapZoneConfig = { obstacleZones: DEFAULT_MAP_ZONES.obstacleZones.map((z) => ({ ...z })) };
