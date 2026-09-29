import type { Point, Rng, WaveEvent } from '@xiao/engine/sim';
import { onlyActive, WAVE_SCRIPT, WAVES, type AlienId } from './aliens';
import { JUNGLE_ARENA, makeRoyaleMap, type MapDef } from './maps';

/**
 * Modes de jeu en données. Le solo et le battle royale partagent 100 % de la
 * simulation ; seuls la carte, les points de départ, le PvP et la fin changent.
 */
export interface ModeDef {
  id: 'survival' | 'royale' | 'versus';
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

/** Vagues du mode versus : celles du solo, mais sans fin, avec un crabe toutes les minutes. */
const VERSUS_WAVES: WaveEvent<AlienId>[] = onlyActive([
  ...WAVE_SCRIPT.map((w) => ('to' in w && w.to === 300 ? { ...w, to: 36000 } : w)),
  { from: 300, to: 36000, every: 60, type: 'crab', count: 1, label: '6' },
]);

/**
 * PvPvE en ligne (2 joueurs et plus) : la carte du solo, des aliens qui
 * attaquent tout le monde, et les squads se tirent dessus. On peut rejoindre en
 * cours de partie ; une squad anéantie peut revenir. Pas de fin : `duration` infinie.
 */
export const VERSUS: ModeDef = {
  id: 'versus',
  map: () => JUNGLE_ARENA,
  pvp: true,
  duration: Infinity,
  waves: VERSUS_WAVES,
  maxAliens: { base: 30, perPlayer: 70 },
  spawnPoints(map, players) {
    const r = Math.min(map.width, map.height) * 0.3;
    return Array.from({ length: players }, (_, i) => {
      const a = (i / players) * Math.PI * 2;
      return { x: map.width / 2 + Math.cos(a) * r, y: map.height / 2 + Math.sin(a) * r };
    });
  },
};

export const MODES = { survival: SURVIVAL, royale: ROYALE, versus: VERSUS } as const;
