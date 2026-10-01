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
    { x: 1080, y: 1032, w: 220, h: 200 },
    { x: 1176, y: 1110, w: 200, h: 180 },
    { x: 1872, y: 984, w: 220, h: 200 },
    { x: 1800, y: 1860, w: 220, h: 200 },
    { x: 1920, y: 1932, w: 200, h: 180 },
    { x: 1400, y: 1660, w: 220, h: 180 },
    { x: 2280, y: 1440, w: 220, h: 200 },
    { x: 840, y: 1140, w: 220, h: 200 },
    { x: 1440, y: 2064, w: 220, h: 200 },
    { x: 744, y: 1740, w: 220, h: 200 },
    { x: 2100, y: 2100, w: 220, h: 200 },
  ],
};

/** Zones en cours (celles qu'utilise la carte) : en dev, la visionneuse les modifie ; sinon ce sont les valeurs livrées. */
export const MAP_ZONES: MapZoneConfig = { obstacleZones: DEFAULT_MAP_ZONES.obstacleZones.map((z) => ({ ...z })) };
