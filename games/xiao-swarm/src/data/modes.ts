import type { Point, Rng, WaveEvent } from '@xiao/engine/sim';
import { WAVES, type AlienId } from './aliens';
import { JUNGLE_ARENA, makeRoyaleMap, type MapDef } from './maps';

/**
 * Modes de jeu en données. Le solo et le battle royale partagent 100 % de la
 * simulation ; seuls la carte, les points de départ, le PvP et la fin changent.
 */
export interface ModeDef {
  id: 'survival' | 'royale';
  map: (seed: number) => MapDef;
  /** Les soldats de squads différentes se tirent dessus. */
  pvp: boolean;
  /** Durée du run (s). Survival : victoire à la fin. */
  duration: number;
  waves: WaveEvent<AlienId>[];
  /** Plafond d'aliens = base + perPlayer × joueurs. */
  maxAliens: { base: number; perPlayer: number };
  spawnPoints(map: MapDef, players: number, rng: Rng): Point[];
}

export const SURVIVAL: ModeDef = {
  id: 'survival',
  map: () => JUNGLE_ARENA,
  pvp: false,
  duration: 300,
  waves: WAVES,
  maxAliens: { base: 0, perPlayer: 90 },
  spawnPoints: (map) => [{ x: map.width / 2, y: map.height / 2 }],
};

/**
 * Battle royale (~10 joueurs) : départ dans les coins / le long des bords,
 * tout le monde converge vers le centre (zone qui rétrécit : à venir).
 */
export const ROYALE: ModeDef = {
  id: 'royale',
  map: (seed) => makeRoyaleMap(seed),
  pvp: true,
  duration: 480,
  waves: WAVES,
  maxAliens: { base: 40, perPlayer: 30 },
  spawnPoints(map, players, rng) {
    const m = map.border + 260;
    const W = map.width;
    const H = map.height;
    // coins d'abord, puis milieux des bords, puis répartition sur le périmètre
    const anchors: Point[] = [
      { x: m, y: m },
      { x: W - m, y: H - m },
      { x: W - m, y: m },
      { x: m, y: H - m },
      { x: W / 2, y: m },
      { x: W / 2, y: H - m },
      { x: m, y: H / 2 },
      { x: W - m, y: H / 2 },
    ];
    const points: Point[] = [];
    for (let i = 0; i < players; i++) {
      if (i < anchors.length) {
        points.push(anchors[i]);
      } else {
        const t = rng.next() * 4;
        const side = Math.floor(t);
        const f = t - side;
        points.push(
          side === 0 ? { x: m + f * (W - 2 * m), y: m } : side === 1 ? { x: W - m, y: m + f * (H - 2 * m) } : side === 2 ? { x: m + f * (W - 2 * m), y: H - m } : { x: m, y: m + f * (H - 2 * m) },
        );
      }
    }
    return rng.shuffle(points);
  },
};

export const MODES = { survival: SURVIVAL, royale: ROYALE } as const;
