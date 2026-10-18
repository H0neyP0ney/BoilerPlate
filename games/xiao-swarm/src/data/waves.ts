import { ALIENS, type AlienId } from './aliens';
import type { TargetPoint, WaveModel } from './waveModel';

/**
 * Vagues scriptées (éditables dans le Gestionnaire de vagues, dev) :
 *  - des NIVEAUX de vague (`WAVE_LEVELS`), du plus doux (1) au plus dur. Chaque niveau contient plusieurs CONFIGURATIONS
 *    (compositions d'aliens) ; quand un niveau est envoyé, une de ses configurations est tirée au hasard (`sim.rng`).
 *  - le « niveau » `BOSS_LEVEL` (0) range à part les configurations de boss (jamais tirées au hasard : la timeline les désigne par `config`).
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
  /** Niveau de vague envoyé (1 → `WAVE_LEVELS`, ou `BOSS_LEVEL` avec `config` pour un boss). */
  level: number;
  /** Numéro (1, 2…) de la configuration envoyée ; absent = tirée au hasard parmi celles du niveau (boss : configuration précise). */
  config?: number;
  /** Si > 0, renvoie ce niveau toutes les `every` secondes... */
  every?: number;
  /** ... jusqu'à `until` (s, inclus). Sans `until`, un seul envoi. */
  until?: number;
  /**
   * Effectif × `mul` pour chaque envoi de cette entrée : nombre de chaque groupe hors boss × `mul`, arrondi, au moins 1 (absent = 1). Affiché et
   * modifiable dans le Gestionnaire de vagues. Rejouée pendant un combat de boss, une vague prend en plus × le réglage du boss affronté (`DIFFICULTY.bossReplayMul…`).
   */
  mul?: number;
}

/** Nombre d'aliens d'un groupe pour un envoi à l'effectif × `mul` (les boss ne sont jamais multipliés). */
export function scaledCount(count: number, boss: boolean, mul: number): number {
  return boss || mul === 1 ? count : Math.max(1, Math.round(count * mul));
}

export interface WaveScript {
  /** Niveau (`BOSS_LEVEL`, puis 1 → `WAVE_LEVELS`) → configurations possibles. */
  levels: Record<number, WaveConfig[]>;
  timeline: TimelineEntry[];
  /** Réglages de la courbe de pression du Gestionnaire de vagues (estimation, dev) ; absent = `DEFAULT_WAVE_MODEL`. */
  model?: WaveModel;
  /** Courbe de pression cible dessinée dans le Gestionnaire de vagues (bouton « Générer ») ; absente = pas de cible. */
  target?: TargetPoint[];
}

/** Fin du script par défaut (s) : les boucles qui s'y arrêtent continuent indéfiniment en mode versus. */
export const WAVE_SCRIPT_END = 600;

/** Niveau qui range les configurations de boss (forcées par la timeline via `config`, jamais tirées au hasard). */
export const BOSS_LEVEL = 0;

/** Niveaux de vague ordinaires, du plus doux au plus dur (9, 10 et 11 attendent leurs configurations). */
export const WAVE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

/**
 * Script de départ : 10 minutes en DENTS DE SCIE COURTES (cycles de 75 s : ~55 s de montée, ~20 s de creux plus doux). Boss : mini-boss à 2:00 (Alpha Rhino) et 4:30 (Scarab), boss final à 10:00 (Giant Crab) ;
 * les vagues continuent tant que le boss final n'est pas mort. Chaque niveau 1-8 introduit un nouveau type d'ennemi
 * (1 slime bleu · 2 cafard · 3 kamikaze · 4 grenouille · 5 gros slime vert · 6 cracheur, feu, chaman · 7 rhinocéros, lanceur, bulle ·
 * 8 gros mélanges ; 9 à 11 : libres). Niveau `BOSS_LEVEL` = boss (configuration forcée par la timeline via `config`).
 */
export const DEFAULT_WAVE_SCRIPT: WaveScript = {
  levels: {
    0: [
      { name: 'Mini-boss : Alpha Rhino', groups: [{ type: 'boss_rhino', count: 1 }] },
      { name: 'Mini-boss : Scarab', groups: [{ type: 'boss_scarab', count: 1 }] },
      { name: 'BOSS FINAL : Giant Crab', groups: [{ type: 'boss_crab', count: 1 }] },
      { name: 'Mini-boss : Gling Mère', groups: [{ type: 'boss_gling', count: 1 }] },
      { name: 'Mini-boss : Rhinos jumeaux (feu et glace)', groups: [{ type: 'boss_rhino_fire', count: 1 }, { type: 'boss_rhino_ice', count: 1 }] },
    ],
    1: [
      { name: 'Quelques slimes', groups: [{ type: 'slime', count: 3 }] },
      { name: 'Trio', groups: [{ type: 'slime', count: 5 }] },
      { name: 'Petit groupe', groups: [{ type: 'gling', count: 4 }, { type: 'slime', count: 1 }] },
      { groups: [{ type: 'gling', count: 6 }] },
    ],
    2: [
      { name: 'Essaim rose', groups: [{ type: 'gling', count: 8 }] },
      { name: 'Mixte', groups: [{ type: 'slime', count: 4 }, { type: 'gling', count: 8 }] },
      { name: 'Ruée rose', groups: [{ type: 'gling', count: 12 }, { type: 'slime', count: 2 }] },
    ],
    3: [
      { name: 'Kamikazes', groups: [{ type: 'kamikaze', count: 4 }, { type: 'slime', count: 4 }] },
      { name: 'Kamikazes + roses', groups: [{ type: 'kamikaze', count: 4 }, { type: 'gling', count: 8 }] },
      { name: 'Kamikazes', groups: [{ type: 'kamikaze', count: 5 }] },
    ],
    4: [
      { name: 'Langue', groups: [{ type: 'toad', count: 3 }, { type: 'slime', count: 10 }] },
      { name: 'Grenouilles', groups: [{ type: 'toad', count: 4 }, { type: 'kamikaze', count: 5 }] },
      { name: 'Langue + essaim', groups: [{ type: 'toad', count: 3 }, { type: 'gling', count: 12 }] },
      { name: 'Cracheurs', groups: [{ type: 'spitter', count: 3 }, { type: 'slime', count: 6 }] },
      { name: 'Cracheurs et essaim', groups: [{ type: 'spitter', count: 3 }, { type: 'gling', count: 12 }] },
    ],
    5: [
      { name: 'Un gros', groups: [{ type: 'shooter', count: 3 }, { type: 'slime', count: 11 }] },
      { name: 'Artillerie', groups: [{ type: 'shooter', count: 6 }, { type: 'gling', count: 9 }] },
      { name: 'Mélange', groups: [{ type: 'shooter', count: 3 }, { type: 'toad', count: 3 }, { type: 'kamikaze', count: 6 }] },
      { name: 'Slimes de glace', groups: [{ type: 'iceballer', count: 3 }, { type: 'slime', count: 6 }] },
    ],
    6: [
      { name: 'Cracheurs et feu', groups: [{ type: 'spitter', count: 6 }, { type: 'burner', count: 6 }, { type: 'slime', count: 9 }] },
      { name: 'Brasier', groups: [{ type: 'burner', count: 9 }, { type: 'gling', count: 15 }] },
      { name: 'Chaman', groups: [{ type: 'shaman', count: 3 }, { type: 'slime', count: 15 }, { type: 'gling', count: 9 }] },
      { name: 'Slimes de feu', groups: [{ type: 'fireballer', count: 3 }, { type: 'slime', count: 12 }, { type: 'gling', count: 9 }] },
    ],
    7: [
      { name: 'Rhinocéros', groups: [{ type: 'charger', count: 3 }, { type: 'wall', count: 6 }, { type: 'slime', count: 9 }] },
      { name: 'Embuscade', groups: [{ type: 'lurker', count: 5 }, { type: 'slime', count: 12 }, { type: 'gling', count: 9 }] },
      { name: 'Bulle', groups: [{ type: 'bubble', count: 3 }, { type: 'spitter', count: 6 }, { type: 'gling', count: 17 }] },
      { name: 'Barrage', groups: [{ type: 'wall', count: 9 }, { type: 'toad', count: 6 }, { type: 'burner', count: 6 }] },
    ],
    8: [
      { name: 'Chaman et bulle', groups: [{ type: 'shaman', count: 3 }, { type: 'bubble', count: 3 }, { type: 'slime', count: 18 }, { type: 'gling', count: 14 }] },
      { name: 'Nid de lurkers', groups: [{ type: 'lurker', count: 8 }, { type: 'toad', count: 5 }, { type: 'kamikaze', count: 6 }] },
      { name: 'Troupeau', groups: [{ type: 'charger', count: 8 }, { type: 'spitter', count: 8 }, { type: 'kamikaze', count: 11 }] },
      { name: 'Ménagerie', groups: [{ type: 'shaman', count: 8 }, { type: 'charger', count: 3 }, { type: 'burner', count: 11 }, { type: 'bubble', count: 3 }] },
    ],
    9: [
    ],
    10: [
    ],
    11: [
    ],
  },
  timeline: [
    { at: 0, level: 1 },
    { at: 2.5, level: 1, every: 2, until: 6.5 },
    { at: 8, level: 2 },
    { at: 10, level: 1 },
    { at: 11.5, level: 2 },
    { at: 13.5, level: 1 },
    { at: 15.5, level: 1 },
    { at: 17, level: 2 },
    { at: 18.5, level: 1 },
    { at: 20.5, level: 1 },
    { at: 21.5, level: 2, every: 3, until: 27.5 },
    { at: 23, level: 1, every: 3, until: 29 },
    { at: 30, level: 3 },
    { at: 31.5, level: 1, every: 2.5, until: 41.5 },
    { at: 33, level: 3, every: 2.5, until: 40.5 },
    { at: 43.5, level: 1 },
    { at: 49.5, level: 1 },
    { at: 54, level: 1 },
    { at: 58, level: 1, every: 8, until: 74 },
    { at: 44.5, level: 2 },
    { at: 47.5, level: 3 },
    { at: 51.5, level: 2, every: 3, until: 57.5 },
    { at: 56, level: 3 },
    { at: 62, level: 2, every: 3, until: 74 },
    { at: 65, level: 3 },
    { at: 69.5, level: 3 },
    { at: 72, level: 2 },
    { at: 60, level: 0, config: 4 },
    { at: 75, level: 3 },
    { at: 83, level: 4 },
    { at: 87, level: 3 },
    { at: 88.5, level: 2 },
    { at: 90, level: 3, every: 2.5, until: 95 },
    { at: 91, level: 2 },
    { at: 94, level: 2, every: 2.5, until: 101.5 },
    { at: 98, level: 3 },
    { at: 100.5, level: 3, every: 2, until: 116.5 },
    { at: 103.5, level: 2, every: 2, until: 107.5 },
    { at: 109, level: 4 },
    { at: 111.5, level: 2, every: 2, until: 117.5 },
    { at: 118, level: 4 },
    { at: 119.5, level: 3, every: 8, until: 159.5 },
    { at: 120, level: 0, config: 1 },
    { at: 123, level: 3 },
    { at: 126, level: 4 },
    { at: 129, level: 2, every: 3, until: 141 },
    { at: 134, level: 3, every: 6, until: 158 },
    { at: 142, level: 4 },
    { at: 148, level: 4 },
    { at: 153, level: 3, every: 2.5, until: 158 },
    { at: 161.5, level: 3 },
    { at: 162, level: 2 },
    { at: 163.5, level: 4, every: 2.5, until: 168.5 },
    { at: 164.5, level: 2, every: 3, until: 170.5 },
    { at: 165, level: 3 },
    { at: 167, level: 3 },
    { at: 169.5, level: 3 },
    { at: 171.5, level: 3, every: 2.5, until: 176.5 },
    { at: 172, level: 4 },
    { at: 173, level: 2 },
    { at: 174.5, level: 4 },
    { at: 176, level: 2 },
    { at: 177.5, level: 4, every: 2, until: 187.5 },
    { at: 178, level: 2 },
    { at: 178.5, level: 3, every: 2, until: 186.5 },
    { at: 180, level: 5, every: 2, until: 186 },
    { at: 195.5, level: 3 },
    { at: 203.5, level: 3 },
    { at: 207.5, level: 3 },
    { at: 209, level: 4 },
    { at: 211, level: 3 },
    { at: 212.5, level: 4 },
    { at: 214, level: 3, every: 2, until: 226 },
    { at: 216.5, level: 5, every: 2, until: 226.5 },
    { at: 217, level: 4, every: 2, until: 225 },
    { at: 234.5, level: 3 },
    { at: 242.5, level: 3 },
    { at: 244, level: 6 },
    { at: 250, level: 4 },
    { at: 252, level: 4 },
    { at: 253.5, level: 5 },
    { at: 255, level: 4 },
    { at: 256.5, level: 5 },
    { at: 258.5, level: 4 },
    { at: 260, level: 5 },
    { at: 261.5, level: 4, every: 2, until: 269.5 },
    { at: 263, level: 5, every: 2, until: 269 },
    { at: 264, level: 6, every: 2, until: 268 },
    { at: 270, level: 0, config: 2 },
    { at: 272, level: 5 },
    { at: 274, level: 4, every: 2, until: 276 },
    { at: 277.5, level: 4 },
    { at: 281, level: 5 },
    { at: 285.5, level: 4 },
    { at: 289, level: 5 },
    { at: 292.5, level: 4 },
    { at: 294, level: 5 },
    { at: 295.5, level: 4 },
    { at: 297, level: 5 },
    { at: 298, level: 7 },
    { at: 302, level: 5 },
    { at: 306, level: 5 },
    { at: 312, level: 5, every: 2, until: 334 },
    { at: 338, level: 5 },
    { at: 342, level: 5, every: 8, until: 358 },
    { at: 362.5, level: 5, every: 2, until: 370.5 },
    { at: 372, level: 6 },
    { at: 373, level: 8 },
    { at: 381, level: 6 },
    { at: 385.5, level: 6 },
    { at: 387, level: 7 },
    { at: 388.5, level: 6 },
    { at: 390, level: 7 },
    { at: 398, level: 6, every: 8, until: 414 },
    { at: 419.5, level: 6 },
    { at: 420, level: 0, config: 5 },
    { at: 427.5, level: 6 },
    { at: 432.5, level: 6, every: 2, until: 436.5 },
    { at: 438, level: 7 },
    { at: 440, level: 6 },
    { at: 441, level: 7 },
    { at: 442, level: 6 },
    { at: 443.5, level: 7 },
    { at: 451.5, level: 6, every: 8, until: 467.5 },
    { at: 469.5, level: 6 },
    { at: 471.5, level: 6 },
    { at: 472.5, level: 7 },
    { at: 475, level: 6, every: 4, until: 483 },
    { at: 487.5, level: 6 },
    { at: 490.5, level: 6 },
    { at: 492.5, level: 6, every: 2.5, until: 505 },
    { at: 507, level: 6, every: 2.5, until: 512 },
    { at: 514, level: 6 },
    { at: 519, level: 6, every: 2, until: 523 },
    { at: 524.5, level: 7 },
    { at: 527.5, level: 6 },
    { at: 529.5, level: 6 },
    { at: 530, level: 7 },
    { at: 532, level: 6 },
    { at: 533.5, level: 7 },
    { at: 536.5, level: 6 },
    { at: 541.5, level: 6 },
    { at: 545, level: 6, every: 3, until: 551 },
    { at: 553.5, level: 6 },
    { at: 556, level: 6 },
    { at: 558, level: 6 },
    { at: 559.5, level: 7 },
    { at: 562, level: 6, every: 2, until: 566 },
    { at: 567, level: 7 },
    { at: 569.5, level: 6 },
    { at: 571, level: 7 },
    { at: 572.5, level: 6 },
    { at: 574, level: 7 },
    { at: 579, level: 6 },
    { at: 583.5, level: 6 },
    { at: 586, level: 6 },
    { at: 588, level: 6 },
    { at: 589, level: 7 },
    { at: 591, level: 6 },
    { at: 593, level: 6 },
    { at: 594, level: 7 },
    { at: 596, level: 6 },
    { at: 598, level: 6 },
    { at: 598.5, level: 7 },
    { at: 600, level: 0, config: 3 },
    { at: 600, level: 8, every: 11.25, until: 36000 },
    { at: 605, level: 7, every: 8, until: 36000 },
  ],
  model: { dpsStart: 125, growthPerMin: 1.5, efficiency: 0.5, bossWeight: 0.25 },
  target: [{ t: 0, hp: 0 }, { t: 20, hp: 1512 }, { t: 42, hp: 3699 }, { t: 60, hp: 2021 }, { t: 80, hp: 0 }, { t: 100, hp: 856 }, { t: 120, hp: 3562 }, { t: 140, hp: 148 }, { t: 160, hp: 0 }, { t: 177, hp: 2926 }, { t: 185.5, hp: 11174 }, { t: 191.5, hp: 4789 }, { t: 203, hp: 2394 }, { t: 216, hp: 1009 }, { t: 223, hp: 10375 }, { t: 230, hp: 2926 }, { t: 240, hp: 0 }, { t: 263, hp: 798 }, { t: 270, hp: 9886 }, { t: 290, hp: 3818 }, { t: 310, hp: 3021 }, { t: 330, hp: 555 }, { t: 350, hp: 0 }, { t: 370, hp: 701 }, { t: 384, hp: 2394 }, { t: 390, hp: 13036 }, { t: 396, hp: 2128 }, { t: 410, hp: 1816 }, { t: 430, hp: 867 }, { t: 439, hp: 6385 }, { t: 443.5, hp: 16760 }, { t: 452.5, hp: 5055 }, { t: 466.5, hp: 1596 }, { t: 474, hp: 9577 }, { t: 488.5, hp: 3936 }, { t: 503, hp: 2224 }, { t: 518, hp: 513 }, { t: 527.5, hp: 4507 }, { t: 535, hp: 13351 }, { t: 542.5, hp: 9072 }, { t: 555, hp: 5077 }, { t: 568.5, hp: 11639 }, { t: 574.5, hp: 20198 }, { t: 585, hp: 13922 }, { t: 600, hp: 26466 }],
};

/** Script courant : modifié par le Gestionnaire de vagues (dev), mémorisé dans le navigateur (debugWaves.ts). */
export const WAVE_SCRIPT: WaveScript = JSON.parse(JSON.stringify(DEFAULT_WAVE_SCRIPT)) as WaveScript;

/**
 * Combat de boss : la timeline est suspendue tant qu'un boss est vivant ; on renvoie à la place, en boucle, les `DIFFICULTY.bossReplayCount` derniers envois qui ont
 * précédé son apparition (écarts plafonnés à `maxGap` s, `wrapGap` s de repos entre deux tours). Ces aliens ne laissent aucun globe d'XP.
 */
export const BOSS_REPLAY = { maxGap: 4, wrapGap: 3 };

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

/**
 * Prochain boss (mini ou final) après l'instant `time` : moment du spawn et type du premier boss, plus `types` = tous les boss distincts de la
 * configuration (2 pour les rhinos jumeaux : la timeline affiche les deux) ; null s'il n'y en a plus.
 */
export function nextBoss(script: WaveScript, time: number): { at: number; type: AlienId; types: AlienId[] } | null {
  let best: { at: number; type: AlienId; types: AlienId[] } | null = null;
  for (const e of script.timeline) {
    if (e.config === undefined || e.at <= time || (best && e.at >= best.at)) continue;
    const groups = script.levels?.[e.level]?.[e.config - 1]?.groups ?? [];
    const type = groups[0]?.type;
    if (type && ALIENS[type].boss) best = { at: e.at, type, types: [...new Set(groups.map((g) => g.type).filter((t) => ALIENS[t].boss))] };
  }
  return best;
}
