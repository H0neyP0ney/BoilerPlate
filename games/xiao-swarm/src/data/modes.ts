import type { Point, Rng } from '@xiao/engine/sim';
import { DIFFICULTY } from '../config';
import { WAVE_SCRIPT, WAVE_SCRIPT_END, type WaveScript, type TimelineEntry } from './waves';
import { makeJungleMap, makeRoyaleMap, type MapDef } from './maps';

/**
 * Modes de jeu en données. Le solo et le battle royale partagent 100 % de la
 * simulation ; seuls la carte, les points de départ, le PvP et la fin changent.
 */
export interface ModeDef {
  id: 'survival' | 'royale' | 'versus';
  map: (seed: number) => MapDef;
  /** Les soldats de squads différentes se tirent dessus. */
  pvp: boolean;
  /** En ligne, un joueur mort laisse une zone de réanimation au sol, au lieu de réapparaître tout seul. */
  reviveZones?: boolean;
  /** Durée du run (s). Survival : victoire à la fin. */
  duration: number;
  /** Script de vagues (niveaux + timeline, voir data/waves.ts). */
  waves: WaveScript;
  /** Plafond d'aliens à l'apparition = (base + perPlayer × joueurs vivants) × `DIFFICULTY.alienCountMul` (voir `Horde.canSpawn`). */
  maxAliens: { base: number; perPlayer: number };
  spawnPoints(map: MapDef, players: number, rng: Rng): Point[];
}

/**
 * Survie (08/10 : fusion de l'ancien mode solo et de l'ancienne coop) : la carte de jungle et la timeline complète, pas de tir ami ; victoire
 * en tuant le boss final (~10:00). Jouable SEUL (hors ligne : pause, revive par pub, tutoriel) ou À PLUSIEURS en ligne (2-4 joueurs, humains
 * et / ou coéquipiers IA : XP partagée, zones de réanimation, difficulté qui grandit avec les joueurs vivants, spectateur, relance) ; ce qui
 * change en ligne dépend de `SimConfig.online`, pas du mode.
 */
export const SURVIVAL: ModeDef = {
  id: 'survival',
  map: (seed) => makeJungleMap(seed),
  pvp: false,
  reviveZones: true, // seulement en ligne (`SimConfig.online`) : seul, la squad anéantie a le revive par pub
  duration: 600, // la partie se gagne en tuant le boss final (~10:00), pas à la fin du chrono
  waves: WAVE_SCRIPT,
  get maxAliens() {
    return { base: 0, perPlayer: DIFFICULTY.maxAliensPerPlayer }; // × alienCountMul (1,5) = 150 par joueur vivant ; réglable (panneau Difficulté)
  },
  spawnPoints(map, players) {
    // seul : au centre ; à plusieurs : en cercle autour du centre
    return Array.from({ length: players }, (_, i) => {
      const a = (i / Math.max(1, players)) * Math.PI * 2;
      const r = players > 1 ? 110 : 0;
      return { x: map.width / 2 + Math.cos(a) * r, y: map.height / 2 + Math.sin(a) * r };
    });
  },
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
  waves: WAVE_SCRIPT,
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

/**
 * Vagues du mode versus : celles du solo (script courant), mais sans fin — les boucles qui s'arrêtaient à 300 s
 * continuent — avec un boss (niveau 9) toutes les minutes ensuite. Recalculé à chaque partie (le script est éditable).
 */
const versusWaves = (): WaveScript => ({
  levels: WAVE_SCRIPT.levels,
  timeline: [
    ...WAVE_SCRIPT.timeline.map((e): TimelineEntry => (e.until === WAVE_SCRIPT_END ? { ...e, until: 36000 } : e)),
    { at: WAVE_SCRIPT_END, level: 8, every: 10, until: 36000 },
  ],
});

/**
 * PvPvE en ligne (2 joueurs et plus) : la carte du solo, des aliens qui
 * attaquent tout le monde, et les squads se tirent dessus. On peut rejoindre en
 * cours de partie ; une squad anéantie peut revenir. Pas de fin : `duration` infinie.
 */
export const VERSUS: ModeDef = {
  id: 'versus',
  map: (seed) => makeJungleMap(seed),
  pvp: true,
  duration: Infinity,
  get waves() {
    return versusWaves();
  },
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
