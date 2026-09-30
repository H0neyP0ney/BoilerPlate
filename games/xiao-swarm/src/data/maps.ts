import { Rng, type Point } from '@xiao/engine/sim';
import { BIG_OBSTACLES, SMALL_OBSTACLES, type ObstacleId } from './obstacles';

/**
 * Cartes décrites en données : la simulation en tire les obstacles, l'affichage
 * le décor. Même seed = même carte chez tous les joueurs (réseau).
 */
export interface PondDef {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** Variation de taille aléatoire de chaque obstacle posé : ±10 % autour de la taille définie dans data/obstacles.ts. */
export const OBSTACLE_SIZE_JITTER = 0.1;

/** Obstacle posé sur la carte : son visuel, sa hitbox et ses taches viennent de `data/obstacles.ts`. */
export interface PlacedObstacle {
  x: number;
  y: number;
  kind: ObstacleId;
  /** Multiplicateur de taille de cette instance (sprite, hitbox et tache ensemble), autour de 1 ; absent = 1. */
  size?: number;
}

/**
 * Tire la taille de chaque obstacle (1 ± OBSTACLE_SIZE_JITTER) avec la seed de la carte : dans les données, donc la
 * simulation (hitbox) et l'affichage voient la même taille chez tous les joueurs.
 */
function withSizes(list: PlacedObstacle[], seed: number): PlacedObstacle[] {
  const rng = new Rng(seed + 3);
  return list.map((o) => ({ ...o, size: Math.round((1 + rng.range(-OBSTACLE_SIZE_JITTER, OBSTACLE_SIZE_JITTER)) * 1000) / 1000 }));
}

export interface MapDef {
  id: string;
  width: number;
  height: number;
  /** Bande de jungle infranchissable sur les bords. */
  border: number;
  ponds: PondDef[];
  obstacles: PlacedObstacle[];
  logs: Point[];
  /** Seed du décor procédural (sol, végétation). */
  seed: number;
}

/**
 * Arène solo compacte (GDD §3). Seuls des obstacles volcaniques (data/obstacles.ts) font obstacle
 * (`ponds` / `logs` restent disponibles dans MapDef). Un obstacle = ses cercles de collision (Arena) + son sprite (ArenaView).
 */
export const JUNGLE_ARENA: MapDef = {
  id: 'jungle',
  width: 2400,
  height: 1800,
  border: 170,
  seed: 7,
  ponds: [],
  obstacles: withSizes(
    [
      { x: 900, y: 560, kind: 'obstacle_3' },
      { x: 980, y: 625, kind: 'obstacle_8' },
      { x: 1560, y: 520, kind: 'obstacle_5' },
      { x: 1500, y: 1250, kind: 'obstacle_1' },
      { x: 1600, y: 1310, kind: 'obstacle_7' },
      { x: 1150, y: 1000, kind: 'obstacle_2' },
      { x: 1900, y: 900, kind: 'obstacle_6' },
      { x: 700, y: 650, kind: 'obstacle_7' },
      { x: 1200, y: 1420, kind: 'obstacle_4' },
      { x: 620, y: 1150, kind: 'obstacle_3' },
      { x: 1750, y: 1450, kind: 'obstacle_8' },
    ],
    7,
  ),
  logs: [],
};

/**
 * Grande carte battle royale générée depuis une seed : rochers répartis, coins dégagés pour les départs.
 * Même seed = même carte chez tous les joueurs (réseau).
 */
export function makeRoyaleMap(seed: number, size = 4800): MapDef {
  const rng = new Rng(seed);
  const border = 220;
  const obstacles: PlacedObstacle[] = [];
  const cornerClear = 700;
  const inCorner = (x: number, y: number) => (x < cornerClear || x > size - cornerClear) && (y < cornerClear || y > size - cornerClear);
  for (let i = 0; i < 70; i++) {
    const x = rng.range(border + 100, size - border - 100);
    const y = rng.range(border + 100, size - border - 100);
    if (inCorner(x, y)) continue;
    obstacles.push({ x, y, kind: rng.pick(rng.chance(0.45) ? BIG_OBSTACLES : SMALL_OBSTACLES) });
    if (rng.chance(0.3)) obstacles.push({ x: x + rng.range(90, 130), y: y + rng.range(20, 50), kind: rng.pick(SMALL_OBSTACLES) });
  }
  return { id: `royale-${seed}`, width: size, height: size, border, seed, ponds: [], obstacles: withSizes(obstacles, seed), logs: [] };
}
