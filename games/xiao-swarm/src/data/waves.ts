import { ALIENS, type AlienId } from './aliens';
import type { TargetPoint, WaveModel } from './waveModel';

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
  /** Réglages de la courbe de pression du Gestionnaire de vagues (estimation, dev) ; absent = `DEFAULT_WAVE_MODEL`. */
  model?: WaveModel;
  /** Courbe de pression cible dessinée dans le Gestionnaire de vagues (bouton « Générer ») ; absente = pas de cible. */
  target?: TargetPoint[];
}

/** Fin du script par défaut (s) : les boucles qui s'y arrêtent continuent indéfiniment en mode versus. */
export const WAVE_SCRIPT_END = 600;

export const WAVE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * Script de départ : 10 minutes en DENTS DE SCIE COURTES (cycles de 75 s : ~55 s de montée, ~20 s de creux plus doux). Boss : mini-boss à 2:00 (Alpha Rhino) et 5:00 (Scarab), boss final à 10:00 (Giant Crab) ;
 * les vagues continuent tant que le boss final n'est pas mort. Chaque niveau 1-8 introduit un nouveau type d'ennemi
 * (1 slime bleu · 2 cafard · 3 kamikaze · 4 grenouille · 5 gros slime vert · 6 cracheur, feu, chaman · 7 rhinocéros, lanceur, bulle ·
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
      { name: 'Essaim rose', groups: [{ type: 'gling', count: 5 }] },
      { name: 'Mixte', groups: [{ type: 'slime', count: 4 }, { type: 'gling', count: 4 }] },
      { name: 'Ruée rose', groups: [{ type: 'gling', count: 8 }, { type: 'slime', count: 1 }] },
    ],
    3: [
      { name: 'Kamikazes', groups: [{ type: 'kamikaze', count: 3 }, { type: 'slime', count: 4 }] },
      { name: 'Kamikazes + roses', groups: [{ type: 'kamikaze', count: 4 }, { type: 'gling', count: 4 }] },
      { name: 'Deux kamikazes', groups: [{ type: 'kamikaze', count: 3 }] },
    ],
    4: [
      { name: 'Langue', groups: [{ type: 'toad', count: 2 }, { type: 'slime', count: 7 }] },
      { name: 'Grenouilles', groups: [{ type: 'toad', count: 3 }, { type: 'kamikaze', count: 3 }] },
      { name: 'Langue + essaim', groups: [{ type: 'toad', count: 2 }, { type: 'gling', count: 8 }] },
    ],
    5: [
      { name: 'Un gros', groups: [{ type: 'shooter', count: 2 }, { type: 'slime', count: 7 }] },
      { name: 'Artillerie', groups: [{ type: 'shooter', count: 4 }, { type: 'gling', count: 6 }] },
      { name: 'Mélange', groups: [{ type: 'shooter', count: 2 }, { type: 'toad', count: 2 }, { type: 'kamikaze', count: 4 }] },
      { name: 'Slimes de glace', groups: [{ type: 'iceballer', count: 2 }, { type: 'slime', count: 4 }] },
    ],
    6: [
      { name: 'Cracheurs et feu', groups: [{ type: 'spitter', count: 4 }, { type: 'burner', count: 4 }, { type: 'slime', count: 6 }] },
      { name: 'Brasier', groups: [{ type: 'burner', count: 6 }, { type: 'gling', count: 10 }] },
      { name: 'Chaman', groups: [{ type: 'shaman', count: 2 }, { type: 'slime', count: 10 }, { type: 'gling', count: 6 }] },
    ],
    7: [
      { name: 'Rhinocéros', groups: [{ type: 'charger', count: 2 }, { type: 'wall', count: 4 }, { type: 'slime', count: 6 }] },
      { name: 'Embuscade', groups: [{ type: 'lurker', count: 3 }, { type: 'slime', count: 8 }, { type: 'gling', count: 6 }] },
      { name: 'Bulle', groups: [{ type: 'bubble', count: 1 }, { type: 'spitter', count: 4 }, { type: 'gling', count: 11 }] },
      { name: 'Barrage', groups: [{ type: 'wall', count: 6 }, { type: 'toad', count: 4 }, { type: 'burner', count: 4 }] },
    ],
    8: [
      { name: 'Chaman et bulle', groups: [{ type: 'shaman', count: 2 }, { type: 'bubble', count: 1 }, { type: 'slime', count: 12 }, { type: 'gling', count: 9 }] },
      { name: 'Nid de lurkers', groups: [{ type: 'lurker', count: 5 }, { type: 'toad', count: 3 }, { type: 'kamikaze', count: 4 }] },
      { name: 'Troupeau', groups: [{ type: 'charger', count: 5 }, { type: 'spitter', count: 5 }, { type: 'kamikaze', count: 7 }] },
      { name: 'Ménagerie', groups: [{ type: 'shaman', count: 5 }, { type: 'charger', count: 2 }, { type: 'burner', count: 7 }, { type: 'bubble', count: 1 }] },
    ],
    9: [
      { name: 'Mini-boss : Alpha Rhino', groups: [{ type: 'boss_rhino', count: 1 }, { type: 'slime', count: 6 }] },
      { name: 'Mini-boss : Scarab', groups: [{ type: 'boss_scarab', count: 1 }, { type: 'shooter', count: 3 }, { type: 'slime', count: 6 }] },
      { name: 'BOSS FINAL : Giant Crab', groups: [{ type: 'boss_crab', count: 1 }, { type: 'shaman', count: 1 }, { type: 'bubble', count: 1 }, { type: 'charger', count: 1 }] },
      { name: 'Mini-boss : Gling Mère', groups: [{ type: 'boss_gling', count: 1 }, { type: 'gling', count: 6 }] },
    ],
  },
  timeline: [
    { at: 0, level: 1 },
    { at: 3, level: 1, every: 2, until: 7 },
    { at: 8, level: 2 },
    { at: 11, level: 2, every: 2, until: 15 },
    { at: 17, level: 2, every: 1.75, until: 22 },
    { at: 30, level: 3 },
    { at: 32.5, level: 2, every: 2, until: 38.5 },
    { at: 40, level: 3 },
    { at: 42, level: 2, every: 8, until: 58 },
    { at: 60, level: 9, config: 4 },
    { at: 64.5, level: 2 },
    { at: 71, level: 2 },
    { at: 76, level: 2 },
    { at: 84, level: 2, every: 2, until: 88 },
    { at: 89.5, level: 3 },
    { at: 91, level: 2 },
    { at: 92.5, level: 3 },
    { at: 94.5, level: 2 },
    { at: 96, level: 3 },
    { at: 97.5, level: 2 },
    { at: 99, level: 3 },
    { at: 100, level: 4 },
    { at: 102.5, level: 2 },
    { at: 103.5, level: 3 },
    { at: 105, level: 2, every: 2, until: 109 },
    { at: 106, level: 3 },
    { at: 108, level: 3 },
    { at: 110.5, level: 3, every: 2, until: 114.5 },
    { at: 111.5, level: 2 },
    { at: 113.5, level: 2 },
    { at: 116, level: 2 },
    { at: 117, level: 3 },
    { at: 118, level: 2 },
    { at: 119, level: 3 },
    { at: 120, level: 9, config: 1 },
    { at: 127, level: 2, every: 8, until: 159 },
    { at: 128, level: 3, every: 4, until: 156 }, // après le Rhinocéros : kamikazes en continu (la zone creuse de 127 à 159 s)
    { at: 134, level: 4, every: 6, until: 158 },
    { at: 161.5, level: 2 },
    { at: 162.5, level: 3, every: 2, until: 166.5 },
    { at: 163.5, level: 2 },
    { at: 165, level: 4 },
    { at: 167, level: 2, every: 3, until: 176 },
    { at: 168.5, level: 4 },
    { at: 169.5, level: 3, every: 3, until: 175.5 },
    { at: 171, level: 4, every: 3, until: 177 },
    { at: 177.5, level: 3, every: 2, until: 185.5 },
    { at: 178, level: 5, every: 2, until: 186 },
    { at: 179, level: 4, every: 2, until: 185 },
    { at: 188, level: 4, every: 3, until: 212 }, // trou de 186 à 213 s : grenouilles, shooters et kamikazes
    { at: 192, level: 5, every: 6, until: 212 },
    { at: 194, level: 3, every: 8, until: 210 },
    { at: 200, level: 3, every: 4, until: 212 },
    { at: 213.5, level: 3, every: 2, until: 225.5 },
    { at: 216.5, level: 5, every: 2, until: 224.5 },
    { at: 217, level: 4, every: 2, until: 225 },
    { at: 227, level: 4, every: 2.5, until: 245 }, // 226-246 s : encore creux avant la montée vers le Scarab
    { at: 230, level: 5, every: 5, until: 245 },
    { at: 233.5, level: 3 },
    { at: 238, level: 6 },
    { at: 241.5, level: 3 },
    { at: 244, level: 6 },
    { at: 246, level: 3, every: 2, until: 250 },
    { at: 251, level: 4 },
    { at: 252, level: 6 },
    { at: 255.5, level: 4 },
    { at: 257, level: 5 },
    { at: 259, level: 4 },
    { at: 260.5, level: 5 },
    { at: 262, level: 4 },
    { at: 264, level: 4 },
    { at: 265.5, level: 5 },
    { at: 267, level: 4 },
    { at: 268.5, level: 5 },
    { at: 270.5, level: 4 },
    { at: 272, level: 5 },
    { at: 273.5, level: 4 },
    { at: 275.5, level: 4, every: 3, until: 281.5 },
    { at: 276.5, level: 5 },
    { at: 280, level: 5 },
    { at: 283, level: 5 },
    { at: 284, level: 4, every: 2, until: 290 },
    { at: 285, level: 5 },
    { at: 287, level: 6 },
    { at: 288.5, level: 5 },
    { at: 290.5, level: 5, every: 3, until: 296.5 },
    { at: 291.5, level: 6 },
    { at: 292.5, level: 4 },
    { at: 294.5, level: 4 },
    { at: 295, level: 6 },
    { at: 297, level: 4 },
    { at: 298, level: 6 },
    { at: 299, level: 4, every: 8, until: 323 },
    { at: 300, level: 9, config: 2 },
    { at: 328, level: 7 },
    { at: 335.5, level: 5, every: 2, until: 343.5 },
    { at: 346, level: 5, every: 2, until: 350 },
    { at: 352.5, level: 5, every: 2, until: 360.5 },
    { at: 368.5, level: 5, every: 8, until: 392.5 },
    { at: 395, level: 5, every: 2, until: 399 },
    { at: 400.5, level: 6 },
    { at: 402, level: 5 },
    { at: 403, level: 8 },
    { at: 409, level: 6, every: 2, until: 419 },
    { at: 414.5, level: 7 },
    { at: 416.5, level: 7 },
    { at: 418, level: 8 },
    { at: 420, level: 7 },
    { at: 428, level: 6 },
    { at: 436, level: 6 },
    { at: 440.5, level: 6, every: 2, until: 460.5 },
    { at: 462, level: 7, every: 2.5, until: 472 },
    { at: 463, level: 6 },
    { at: 466, level: 6 },
    { at: 468.5, level: 6 },
    { at: 470.5, level: 6 },
    { at: 471, level: 8 },
    { at: 473, level: 6 },
    { at: 474, level: 7 },
    { at: 482, level: 6 },
    { at: 490, level: 6 },
    { at: 497, level: 6, every: 2, until: 503 },
    { at: 498, level: 7, every: 2, until: 504 },
    { at: 512, level: 6, every: 8, until: 528 },
    { at: 530, level: 6, every: 2, until: 534 },
    { at: 535.5, level: 7 },
    { at: 537.5, level: 6 },
    { at: 539.5, level: 6 },
    { at: 541, level: 7 },
    { at: 542.5, level: 6 },
    { at: 544.5, level: 6 },
    { at: 546, level: 7 },
    { at: 547.5, level: 6 },
    { at: 549.5, level: 6 },
    { at: 550.5, level: 7, every: 3.5, until: 561 },
    { at: 552.5, level: 6, every: 3.5, until: 559.5 },
    { at: 562.5, level: 6 },
    { at: 564, level: 7 },
    { at: 565.5, level: 6 },
    { at: 567, level: 7 },
    { at: 568, level: 6, every: 3, until: 574 },
    { at: 569.5, level: 7, every: 3, until: 575.5 },
    { at: 576.5, level: 6 },
    { at: 578, level: 7 },
    { at: 579.5, level: 6 },
    { at: 581, level: 7 },
    { at: 582, level: 6 },
    { at: 583, level: 7 },
    { at: 584, level: 6, every: 2.5, until: 589 },
    { at: 585.5, level: 7 },
    { at: 587.5, level: 7 },
    { at: 590, level: 7 },
    { at: 591, level: 6 },
    { at: 592, level: 7 },
    { at: 593.5, level: 6 },
    { at: 594.5, level: 7 },
    { at: 595.5, level: 6 },
    { at: 596.5, level: 7 },
    { at: 598, level: 6 },
    { at: 599, level: 7 },
    { at: 600, level: 8, every: 10, until: 36000 },
    { at: 600, level: 9, config: 3 },
    { at: 605, level: 7, every: 7, until: 36000 },
  ],
  model: { dpsStart: 125, growthPerMin: 1.5, efficiency: 0.5, bossWeight: 0.25 },
  target: [{ t: 0, hp: 0 }, { t: 20, hp: 1512 }, { t: 42, hp: 3699 }, { t: 60, hp: 2021 }, { t: 80, hp: 0 }, { t: 100, hp: 856 }, { t: 120, hp: 3562 }, { t: 140, hp: 148 }, { t: 160, hp: 0 }, { t: 177, hp: 2926 }, { t: 185.5, hp: 11174 }, { t: 191.5, hp: 4789 }, { t: 203, hp: 2394 }, { t: 216, hp: 1009 }, { t: 223, hp: 10375 }, { t: 230, hp: 2926 }, { t: 240, hp: 0 }, { t: 263, hp: 798 }, { t: 283, hp: 1330 }, { t: 300, hp: 9886 }, { t: 320, hp: 3818 }, { t: 340, hp: 3021 }, { t: 360, hp: 555 }, { t: 380, hp: 0 }, { t: 400, hp: 701 }, { t: 414, hp: 2394 }, { t: 420, hp: 13036 }, { t: 426, hp: 2128 }, { t: 440, hp: 1816 }, { t: 460, hp: 867 }, { t: 469, hp: 6385 }, { t: 473.5, hp: 16760 }, { t: 482.5, hp: 5055 }, { t: 496.5, hp: 1596 }, { t: 504, hp: 9577 }, { t: 512, hp: 1596 }, { t: 520, hp: 0 }, { t: 540, hp: 1699 }, { t: 560, hp: 4724 }, { t: 580, hp: 12568 }, { t: 600, hp: 26466 }],
};

/** Script courant : modifié par le Gestionnaire de vagues (dev), mémorisé dans le navigateur (debugWaves.ts). */
export const WAVE_SCRIPT: WaveScript = JSON.parse(JSON.stringify(DEFAULT_WAVE_SCRIPT)) as WaveScript;

/**
 * Réglage de la pression par tranche de la timeline : le nombre d'aliens de chaque vague envoyée entre `from` et `to` (s, position dans la
 * timeline) est multiplié par `mul` (les boss ne sont pas touchés). 120-300 s = de l'Alpha Rhino au Scarab : −20 % ; au-delà de 6:00 : −20 % (07/10).
 */
export const WAVE_PRESSURE: { from: number; to: number; mul: number }[] = [
  { from: 120, to: 300, mul: 0.8 },
  { from: 360, to: Infinity, mul: 0.8 },
];

/** Multiplicateur de pression à l'instant `time` de la timeline (1 si aucune tranche ne s'applique). */
export function pressureAt(time: number): number {
  let mul = 1;
  for (const p of WAVE_PRESSURE) if (time >= p.from && time < p.to) mul *= p.mul;
  return mul;
}

/**
 * Plafond d'aliens : au-dessus de `pauseAbove` aliens vivants, le gestionnaire de vagues se met en pause (plus aucun envoi, timeline figée)
 * jusqu'à ce qu'il en reste `resumeAt` ou moins.
 */
export const WAVE_CAP = { pauseAbove: 150, resumeAt: 100 };

/**
 * Combat de boss : la timeline est suspendue tant qu'un boss est vivant ; on renvoie à la place, en boucle, les `count` derniers envois qui ont
 * précédé son apparition (écarts plafonnés à `maxGap` s, `wrapGap` s de repos entre deux tours). Ces aliens ne laissent aucun globe d'XP.
 */
export const BOSS_REPLAY = { count: 5, maxGap: 4, wrapGap: 3 };

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

/** Prochain boss (mini ou final) après l'instant `time` : moment du spawn et type du boss ; null s'il n'y en a plus. */
export function nextBoss(script: WaveScript, time: number): { at: number; type: AlienId } | null {
  let best: { at: number; type: AlienId } | null = null;
  for (const e of script.timeline) {
    if (e.config === undefined || e.at <= time || (best && e.at >= best.at)) continue;
    const type = script.levels?.[e.level]?.[e.config - 1]?.groups[0]?.type;
    if (type && ALIENS[type].boss) best = { at: e.at, type };
  }
  return best;
}
