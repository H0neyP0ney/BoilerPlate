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
    { x: 1170, y: 635, w: 220, h: 200 },
    { x: 1176, y: 1110, w: 200, h: 180 },
    { x: 2288, y: 492, w: 305, h: 285 },
    { x: 1909, y: 2007, w: 300, h: 285 },
    { x: 2275, y: 1935, w: 330, h: 275 },
    { x: 1775, y: 1225, w: 370, h: 290 },
    { x: 2154, y: 1550, w: 400, h: 380 },
    { x: 580, y: 730, w: 220, h: 200 },
    { x: 1503, y: 2110, w: 325, h: 280 },
    { x: 713, y: 1970, w: 385, h: 360 },
    { x: 2285, y: 2325, w: 365, h: 360 },
    { x: 468, y: 1268, w: 240, h: 240 },
    { x: 806, y: 359, w: 240, h: 240 },
    { x: 2225, y: 925, w: 240, h: 240 },
    { x: 1695, y: 665, w: 320, h: 255 },
    { x: 835, y: 2480, w: 390, h: 125 },
    { x: 1535, y: 2485, w: 225, h: 275 },
  ],
};

/** Zones en cours (celles qu'utilise la carte) : en dev, la visionneuse les modifie ; sinon ce sont les valeurs livrées. */
export const MAP_ZONES: MapZoneConfig = { obstacleZones: DEFAULT_MAP_ZONES.obstacleZones.map((z) => ({ ...z })) };
