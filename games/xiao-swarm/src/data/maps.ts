import { Rng, type Point } from '@xiao/engine/sim';

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

export interface RockDef {
  x: number;
  y: number;
  size: 'big' | 'small';
}

export interface MapDef {
  id: string;
  width: number;
  height: number;
  /** Bande de jungle infranchissable sur les bords. */
  border: number;
  ponds: PondDef[];
  rocks: RockDef[];
  logs: Point[];
  /** Seed du décor procédural (sol, végétation). */
  seed: number;
}

/**
 * Arène solo compacte (GDD §3). Seuls des rochers font obstacle (`ponds` / `logs` restent disponibles dans MapDef).
 * Un rocher = un cercle de collision (Arena) + un sprite `rock_big` / `rock_small` (ArenaView).
 */
export const JUNGLE_ARENA: MapDef = {
  id: 'jungle',
  width: 2400,
  height: 1800,
  border: 170,
  seed: 7,
  ponds: [],
  rocks: [
    { x: 900, y: 560, size: 'big' },
    { x: 960, y: 600, size: 'small' },
    { x: 1560, y: 520, size: 'big' },
    { x: 1500, y: 1250, size: 'big' },
    { x: 1580, y: 1290, size: 'big' },
    { x: 1150, y: 1000, size: 'small' },
    { x: 1900, y: 900, size: 'big' },
    { x: 700, y: 650, size: 'small' },
    { x: 1200, y: 1420, size: 'big' },
    { x: 620, y: 1150, size: 'big' },
    { x: 1750, y: 1450, size: 'small' },
  ],
  logs: [],
};

/**
 * Grande carte battle royale générée depuis une seed : rochers répartis, coins dégagés pour les départs.
 * Même seed = même carte chez tous les joueurs (réseau).
 */
export function makeRoyaleMap(seed: number, size = 4800): MapDef {
  const rng = new Rng(seed);
  const border = 220;
  const rocks: RockDef[] = [];
  const cornerClear = 700;
  const inCorner = (x: number, y: number) => (x < cornerClear || x > size - cornerClear) && (y < cornerClear || y > size - cornerClear);
  for (let i = 0; i < 70; i++) {
    const x = rng.range(border + 100, size - border - 100);
    const y = rng.range(border + 100, size - border - 100);
    if (inCorner(x, y)) continue;
    rocks.push({ x, y, size: rng.chance(0.55) ? 'big' : 'small' });
    if (rng.chance(0.3)) rocks.push({ x: x + rng.range(50, 80), y: y + rng.range(20, 50), size: 'small' });
  }
  return { id: `royale-${seed}`, width: size, height: size, border, seed, ponds: [], rocks, logs: [] };
}
