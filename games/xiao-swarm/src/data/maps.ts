import { Rng, type Point } from '@xiao/engine/sim';
import { MAP_ZONES } from './mapZones';
import { BIG_OBSTACLES, OBSTACLE_IDS, SMALL_OBSTACLES, type ObstacleId } from './obstacles';

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

/** Côté (px) de l'arène solo / coop : 2400 d'origine, +20 % (2880), puis encore +20 % (3456). Les zones de `data/mapZones.ts` sont à la même échelle. */
export const JUNGLE_SIZE = 3456;

/**
 * Arène solo : une île carrée flottant dans l'espace (GDD §3). Seuls des obstacles volcaniques (data/obstacles.ts) font obstacle
 * (`ponds` / `logs` restent disponibles dans MapDef). Un obstacle = ses cercles de collision (Arena) + son sprite (ArenaView).
 *
 * Les obstacles sont TIRÉS à chaque partie depuis les zones d'obstacle de `data/mapZones.ts` (éditeur : visionneuse « Carte ») :
 * un obstacle au hasard, à une position au hasard, dans chaque zone. Tout vient de la seed de la partie, donc tous les joueurs
 * ont la même carte. Le nombre de tirages par zone est fixe (même si la zone ne donne rien) : changer une zone ne change pas le
 * tirage des autres.
 */
export function makeJungleMap(seed: number): MapDef {
  const rng = new Rng(seed + 11);
  const obstacles: PlacedObstacle[] = [];
  for (const z of MAP_ZONES.obstacleZones) {
    const roll = rng.next();
    const kind = OBSTACLE_IDS[Math.floor(rng.next() * OBSTACLE_IDS.length)];
    const x = z.x + (rng.next() - 0.5) * z.w;
    const y = z.y + (rng.next() - 0.5) * z.h;
    if (roll < (z.chance ?? 1)) obstacles.push({ x: Math.round(x), y: Math.round(y), kind });
  }
  return { id: `jungle-${seed}`, width: JUNGLE_SIZE, height: JUNGLE_SIZE, border: 170, seed, ponds: [], obstacles: withSizes(obstacles, seed), logs: [] };
}

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
