import type { AlienId } from './aliens';

/**
 * Vagues scriptées (éditables dans le Gestionnaire de vagues, dev) :
 *  - 9 NIVEAUX de vague, du plus doux (1) au plus dur (9). Chaque niveau contient plusieurs CONFIGURATIONS
 *    (compositions d'aliens) ; quand un niveau est envoyé, une de ses configurations est tirée au hasard (`sim.rng`).
 *  - une TIMELINE : à quel moment (s) quel niveau est envoyé, éventuellement en boucle (`every`, jusqu'à `until`).
 * Pur (données, sans Phaser ni DOM) : lu par `sim/WaveRunner.ts`.
 */
export interface WaveGroup {
  type: AlienId;
  count: number;
}

export interface WaveConfig {
  /** Nom libre, pour s'y retrouver dans l'éditeur. */
  name?: string;
  groups: WaveGroup[];
}

export interface TimelineEntry {
  /** Premier envoi (s depuis le début du run). */
  at: number;
  /** Niveau de vague envoyé (1 → 9). */
  level: number;
  /** Numéro (1, 2…) de la configuration envoyée ; absent = tirée au hasard parmi celles du niveau (boss : configuration précise). */
  config?: number;
  /** Si > 0, renvoie ce niveau toutes les `every` secondes... */
  every?: number;
  /** ... jusqu'à `until` (s, inclus). Sans `until`, un seul envoi. */
  until?: number;
}

export interface WaveScript {
  /** Niveau (1 → 9) → configurations possibles. */
  levels: Record<number, WaveConfig[]>;
  timeline: TimelineEntry[];
}

/** Fin du script par défaut (s) : les boucles qui s'y arrêtent continuent indéfiniment en mode versus. */
export const WAVE_SCRIPT_END = 600;

export const WAVE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * Script de départ : 10 minutes en DENTS DE SCIE — la pression monte pendant ~1 min 30, culmine, puis retombe à ~60 % avant de
 * remonter plus haut. Boss : mini-boss à 2:00 (Rhinocéros Alpha) et 5:00 (Crabe géant), boss final à 10:00 (Roi Crabe) ;
 * les vagues continuent tant que le boss final n'est pas mort. Chaque niveau 1-8 introduit un nouveau type d'ennemi
 * (1 slime · 2 rose · 3 kamikaze · 4 grenouille · 5 slime bleu · 6 cracheur, feu, chaman · 7 rhinocéros, lanceur, bulle ·
 * 8 gros mélanges). Niveau 9 = boss (configuration forcée par la timeline via `config`).
 */
export const DEFAULT_WAVE_SCRIPT: WaveScript = {
  levels: {
    1: [
      { name: 'Quelques slimes', groups: [{ type: 'slime', count: 2 }] },
      { name: 'Trio', groups: [{ type: 'slime', count: 3 }] },
      { name: 'Petit groupe', groups: [{ type: 'slime', count: 5 }] },
    ],
    2: [
      { name: 'Essaim rose', groups: [{ type: 'slime_pink', count: 5 }] },
      { name: 'Mixte', groups: [{ type: 'slime', count: 4 }, { type: 'slime_pink', count: 4 }] },
      { name: 'Ruée rose', groups: [{ type: 'slime_pink', count: 8 }, { type: 'slime', count: 1 }] },
    ],
    3: [
      { name: 'Kamikazes', groups: [{ type: 'kamikaze', count: 3 }, { type: 'slime', count: 4 }] },
      { name: 'Kamikazes + roses', groups: [{ type: 'kamikaze', count: 4 }, { type: 'slime_pink', count: 4 }] },
      { name: 'Deux kamikazes', groups: [{ type: 'kamikaze', count: 3 }] },
    ],
    4: [
      { name: 'Langue', groups: [{ type: 'frog', count: 2 }, { type: 'slime', count: 7 }] },
      { name: 'Grenouilles', groups: [{ type: 'frog', count: 3 }, { type: 'kamikaze', count: 3 }] },
      { name: 'Langue + essaim', groups: [{ type: 'frog', count: 2 }, { type: 'slime_pink', count: 8 }] },
    ],
    5: [
      { name: 'Un gros', groups: [{ type: 'slime_blue', count: 2 }, { type: 'slime', count: 7 }] },
      { name: 'Artillerie', groups: [{ type: 'slime_blue', count: 4 }, { type: 'slime_pink', count: 6 }] },
      { name: 'Mélange', groups: [{ type: 'slime_blue', count: 2 }, { type: 'frog', count: 2 }, { type: 'kamikaze', count: 4 }] },
    ],
    6: [
      { name: 'Cracheurs et feu', groups: [{ type: 'spitter', count: 4 }, { type: 'fire', count: 4 }, { type: 'slime', count: 6 }] },
      { name: 'Brasier', groups: [{ type: 'fire', count: 6 }, { type: 'slime_pink', count: 10 }] },
      { name: 'Chaman', groups: [{ type: 'shaman', count: 2 }, { type: 'slime', count: 10 }, { type: 'slime_pink', count: 6 }] },
    ],
    7: [
      { name: 'Rhinocéros', groups: [{ type: 'charger', count: 2 }, { type: 'thrower', count: 4 }, { type: 'slime', count: 6 }] },
      { name: 'Bulle', groups: [{ type: 'bubble', count: 2 }, { type: 'spitter', count: 4 }, { type: 'slime_pink', count: 11 }] },
      { name: 'Barrage', groups: [{ type: 'thrower', count: 6 }, { type: 'frog', count: 4 }, { type: 'fire', count: 4 }] },
    ],
    8: [
      { name: 'Chaman et bulle', groups: [{ type: 'shaman', count: 2 }, { type: 'bubble', count: 2 }, { type: 'slime', count: 12 }, { type: 'slime_pink', count: 9 }] },
      { name: 'Troupeau', groups: [{ type: 'charger', count: 5 }, { type: 'spitter', count: 5 }, { type: 'kamikaze', count: 7 }] },
      { name: 'Ménagerie', groups: [{ type: 'shaman', count: 5 }, { type: 'charger', count: 2 }, { type: 'fire', count: 7 }, { type: 'bubble', count: 2 }] },
    ],
    9: [
      { name: 'Mini-boss : Rhinocéros Alpha', groups: [{ type: 'rhino_boss', count: 1 }, { type: 'slime', count: 6 }] },
      { name: 'Mini-boss : Crabe géant', groups: [{ type: 'crab', count: 1 }, { type: 'slime_blue', count: 3 }, { type: 'slime', count: 6 }] },
      { name: 'BOSS FINAL : Roi Crabe', groups: [{ type: 'crab_king', count: 1 }, { type: 'shaman', count: 1 }, { type: 'bubble', count: 1 }, { type: 'charger', count: 1 }] },
    ],
  },
  timeline: [
    // ---- Dent de scie : montée (~90 s) → pic + mini-boss → creux (~60 % du pic) ----
    // 0:00 → 2:00 : apprentissage, pic vers 1:50, mini-boss à 2:00
    { at: 1, level: 1, every: 4, until: 40 },
    { at: 20, level: 2, every: 9, until: 70 },
    { at: 50, level: 3, every: 9, until: 95 },
    { at: 85, level: 4, every: 8, until: 118 },
    { at: 120, level: 9, config: 1 },
    // creux 2:10 → 2:45
    { at: 130, level: 3, every: 10, until: 165 },
    // 2:45 → 5:00 : montée, pic vers 4:50, mini-boss à 5:00
    { at: 165, level: 4, every: 9, until: 215 },
    { at: 200, level: 5, every: 8, until: 255 },
    { at: 245, level: 6, every: 8, until: 298 },
    { at: 300, level: 9, config: 2 },
    // creux 5:10 → 5:45
    { at: 310, level: 4, every: 10, until: 345 },
    // 5:45 → 8:00 : montée, pic vers 7:50
    { at: 345, level: 5, every: 9, until: 395 },
    { at: 385, level: 6, every: 8, until: 435 },
    { at: 425, level: 7, every: 8, until: 478 },
    // creux 8:10 → 8:45
    { at: 490, level: 5, every: 10, until: 525 },
    // 8:45 → 10:00 : dernière montée, boss final à 10:00 puis vagues continues tant qu'il n'est pas mort
    { at: 525, level: 6, every: 8, until: 560 },
    { at: 555, level: 7, every: 8, until: 590 },
    { at: 580, level: 8, every: 8, until: 598 },
    { at: 600, level: 9, config: 3 },
    { at: 600, level: 8, every: 10, until: 36000 },
    { at: 605, level: 7, every: 7, until: 36000 },
  ],
};

/** Script courant : modifié par le Gestionnaire de vagues (dev), mémorisé dans le navigateur (debugWaves.ts). */
export const WAVE_SCRIPT: WaveScript = JSON.parse(JSON.stringify(DEFAULT_WAVE_SCRIPT)) as WaveScript;

/** Instants (s) où une entrée de la timeline envoie son niveau. */
export function entryTimes(e: TimelineEntry): number[] {
  const out = [e.at];
  const every = e.every ?? 0;
  if (every >= 0.5 && e.until !== undefined) for (let t = e.at + every; t <= e.until + 1e-6 && out.length < 2000; t += every) out.push(t);
  return out;
}

/** Plus haut niveau déjà envoyé à l'instant `time` (numéro de vague affiché) ; 1 au minimum. */
export function levelAt(script: WaveScript, time: number): number {
  let level = 1;
  for (const e of script.timeline) if (e.config === undefined && e.at <= time && e.level > level) level = e.level; // les boss (configuration forcée) ne comptent pas
  return level;
}
