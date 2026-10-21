import { ALIENS, type AlienId } from './aliens';
import type { TargetPoint, WaveModel } from './waveModel';

/**
 * Vagues scriptées (éditables dans le Gestionnaire de vagues, dev) :
 *  - des NIVEAUX de vague (`WAVE_LEVELS`), du plus doux (1) au plus dur. Chaque niveau contient plusieurs CONFIGURATIONS
 *    (compositions d'aliens) ; quand un niveau est envoyé, une de ses configurations est tirée au hasard (`sim.rng`).
 *  - le « niveau » `BOSS_LEVEL` (0) range à part les configurations de boss (jamais tirées au hasard : la timeline les désigne par `config`).
 *  - une TIMELINE : à quel moment (s) quel niveau est envoyé, un envoi par entrée (les boucles `every` / `until` ont été retirées de la survie le 21/10 : seul le mode versus / battle royale, désactivé, en garde une pour ses vagues sans fin).
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
  /** Si > 0, renvoie ce niveau toutes les `every` secondes... (mode versus / battle royale seulement : la timeline de la survie n'en a plus, voir `data/modes.ts`) */
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
      { name: 'Langue', groups: [{ type: 'toad', count: 3 }, { type: 'slime', count: 8 }] },
      { name: 'Grenouilles', groups: [{ type: 'toad', count: 4 }, { type: 'kamikaze', count: 4 }] },
      { name: 'Langue + essaim', groups: [{ type: 'toad', count: 3 }, { type: 'gling', count: 10 }] },
      { name: 'Cracheurs', groups: [{ type: 'spitter', count: 3 }, { type: 'slime', count: 5 }] },
      { name: 'Cracheurs et essaim', groups: [{ type: 'spitter', count: 3 }, { type: 'gling', count: 10 }] },
      { name: 'Premiers feux', groups: [{ type: 'fireballer', count: 2 }, { type: 'slime', count: 6 }] },
    ],
    5: [
      { name: 'Un gros', groups: [{ type: 'shooter', count: 3 }, { type: 'slime', count: 8 }] },
      { name: 'Artillerie', groups: [{ type: 'shooter', count: 6 }, { type: 'gling', count: 9 }] },
      { name: 'Mélange', groups: [{ type: 'shooter', count: 3 }, { type: 'toad', count: 3 }, { type: 'kamikaze', count: 3 }] },
      { name: 'Slimes de feu', groups: [{ type: 'fireballer', count: 3 }, { type: 'slime', count: 3 }] },
      { name: 'Feu et glace', groups: [{ type: 'fireballer', count: 2 }, { type: 'iceballer', count: 2 }, { type: 'slime', count: 4 }] },
    ],
    6: [
      { name: 'Cracheurs et feu', groups: [{ type: 'spitter', count: 4 }, { type: 'burner', count: 4 }, { type: 'slime', count: 8 }] },
      { name: 'Brasier', groups: [{ type: 'burner', count: 5 }, { type: 'gling', count: 10 }] },
      { name: 'Chaman', groups: [{ type: 'shaman', count: 3 }, { type: 'slime', count: 6 }, { type: 'gling', count: 10 }] },
      { name: 'Slimes de glace', groups: [{ type: 'iceballer', count: 3 }, { type: 'slime', count: 6 }, { type: 'gling', count: 10 }] },
    ],
    7: [
      { name: 'Rhinocéros', groups: [{ type: 'charger', count: 2 }, { type: 'wall', count: 3 }, { type: 'slime', count: 7 }] },
      { name: 'Embuscade', groups: [{ type: 'lurker', count: 5 }, { type: 'slime', count: 10 }, { type: 'gling', count: 10 }] },
      { name: 'Bulle', groups: [{ type: 'bubble', count: 3 }, { type: 'spitter', count: 5 }, { type: 'gling', count: 15 }] },
      { name: 'Barrage', groups: [{ type: 'wall', count: 6 }, { type: 'toad', count: 6 }, { type: 'burner', count: 6 }] },
    ],
    8: [
      { name: 'Chaman et bulle', groups: [{ type: 'shaman', count: 3 }, { type: 'bubble', count: 3 }, { type: 'slime', count: 18 }, { type: 'gling', count: 14 }] },
      { name: 'Nid de lurkers', groups: [{ type: 'lurker', count: 8 }, { type: 'toad', count: 5 }, { type: 'kamikaze', count: 6 }] },
      { name: 'Troupeau', groups: [{ type: 'charger', count: 3 }, { type: 'spitter', count: 8 }, { type: 'kamikaze', count: 11 }] },
      { name: 'Ménagerie', groups: [{ type: 'shaman', count: 8 }, { type: 'charger', count: 2 }, { type: 'burner', count: 11 }, { type: 'bubble', count: 3 }] },
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
    { at: 2.5, level: 1 },
    { at: 4.5, level: 1 },
    { at: 6.5, level: 1 },
    { at: 8, level: 2 },
    { at: 10, level: 1 },
    { at: 11.5, level: 2 },
    { at: 13.5, level: 1 },
    { at: 15.5, level: 1 },
    { at: 17, level: 2 },
    { at: 18.5, level: 1 },
    { at: 20.5, level: 1 },
    { at: 21.5, level: 2 },
    { at: 23, level: 1 },
    { at: 24.5, level: 2 },
    { at: 26, level: 1 },
    { at: 27.5, level: 2 },
    { at: 29, level: 1 },
    { at: 30, level: 3 },
    { at: 31.5, level: 1 },
    { at: 33, level: 3 },
    { at: 34, level: 1 },
    { at: 35.5, level: 3 },
    { at: 36.5, level: 1 },
    { at: 38, level: 3 },
    { at: 39, level: 1 },
    { at: 40.5, level: 3 },
    { at: 41.5, level: 1 },
    { at: 43.5, level: 1 },
    { at: 44.5, level: 2 },
    { at: 47.5, level: 3 },
    { at: 49.5, level: 1 },
    { at: 51.5, level: 2 },
    { at: 54, level: 1 },
    { at: 54.5, level: 2 },
    { at: 56, level: 3 },
    { at: 57.5, level: 2 },
    { at: 58, level: 1 },
    { at: 60, level: 0, config: 4 },
    { at: 62, level: 2 },
    { at: 65, level: 1 },
    { at: 65, level: 2 },
    { at: 66, level: 1 },
    { at: 68, level: 2 },
    { at: 69.5, level: 2 },
    { at: 71, level: 2 },
    { at: 72, level: 3 },
    { at: 74, level: 1 },
    { at: 74, level: 2 },
    { at: 75, level: 3 },
    { at: 77, level: 4 },
    { at: 79.5, level: 4 },
    { at: 82, level: 4 },
    { at: 83, level: 4 },
    { at: 87, level: 4 },
    { at: 88.5, level: 2 },
    { at: 91, level: 2 },
    { at: 94, level: 2 },
    { at: 96.5, level: 2 },
    { at: 98, level: 5 },
    { at: 99, level: 2 },
    { at: 100.5, level: 4 },
    { at: 101.5, level: 2 },
    { at: 102.5, level: 3 },
    { at: 104.5, level: 4 },
    { at: 106.5, level: 3 },
    { at: 108.5, level: 4 },
    { at: 109, level: 2 },
    { at: 110.5, level: 3 },
    { at: 112.5, level: 4 },
    { at: 114.5, level: 3 },
    { at: 116.5, level: 3 },
    { at: 118, level: 3 },
    { at: 119.5, level: 4 },
    { at: 120, level: 0, config: 1 },
    { at: 123, level: 3 },
    { at: 126, level: 4 },
    { at: 127.5, level: 4 },
    { at: 129, level: 2 },
    { at: 132, level: 2 },
    { at: 134, level: 3 },
    { at: 135, level: 2 },
    { at: 135.5, level: 4 },
    { at: 138, level: 2 },
    { at: 138, level: 3 },
    { at: 140, level: 3 },
    { at: 141, level: 2 },
    { at: 142, level: 3 },
    { at: 142, level: 4 },
    { at: 143.5, level: 4 },
    { at: 146, level: 3 },
    { at: 146, level: 3 },
    { at: 148, level: 4 },
    { at: 150, level: 3 },
    { at: 151.5, level: 4 },
    { at: 152, level: 3 },
    { at: 153, level: 3 },
    { at: 154, level: 3 },
    { at: 155.5, level: 3 },
    { at: 158, level: 3 },
    { at: 158, level: 3 },
    { at: 158, level: 3 },
    { at: 159.5, level: 4 },
    { at: 161.5, level: 3 },
    { at: 162, level: 2 },
    { at: 162, level: 3 },
    { at: 163.5, level: 4 },
    { at: 164.5, level: 2 },
    { at: 165, level: 3 },
    { at: 166, level: 4 },
    { at: 167, level: 3 },
    { at: 167.5, level: 2 },
    { at: 168.5, level: 4 },
    { at: 169.5, level: 3 },
    { at: 170.5, level: 2 },
    { at: 171.5, level: 3 },
    { at: 172, level: 4 },
    { at: 173, level: 2 },
    { at: 174, level: 3 },
    { at: 174.5, level: 4 },
    { at: 176, level: 1 },
    { at: 176, level: 2 },
    { at: 176.5, level: 3 },
    { at: 177.5, level: 4 },
    { at: 178, level: 2 },
    { at: 178.5, level: 3 },
    { at: 179.5, level: 4 },
    { at: 180, level: 5 },
    { at: 180.5, level: 3 },
    { at: 181.5, level: 4 },
    { at: 182, level: 5 },
    { at: 182.5, level: 3 },
    { at: 185, level: 4 },
    { at: 186, level: 3 },
    { at: 186, level: 5 },
    { at: 189, level: 3 },
    { at: 191, level: 4 },
    { at: 197, level: 3 },
    { at: 197, level: 4 },
    { at: 197, level: 5 },
    { at: 201, level: 3 },
    { at: 204, level: 1 },
    { at: 204, level: 3 },
    { at: 209, level: 4 },
    { at: 211, level: 3 },
    { at: 212.5, level: 4 },
    { at: 214, level: 3 },
    { at: 216, level: 3 },
    { at: 216.5, level: 5 },
    { at: 217, level: 4 },
    { at: 218, level: 3 },
    { at: 218.5, level: 5 },
    { at: 219, level: 4 },
    { at: 220, level: 3 },
    { at: 220.5, level: 5 },
    { at: 223, level: 3 },
    { at: 223, level: 4 },
    { at: 224.5, level: 5 },
    { at: 225, level: 4 },
    { at: 226, level: 3 },
    { at: 226.5, level: 5 },
    { at: 234.5, level: 3 },
    { at: 235, level: 3 },
    { at: 240, level: 5 },
    { at: 242.5, level: 3 },
    { at: 244, level: 6 },
    { at: 250, level: 4 },
    { at: 250, level: 4 },
    { at: 252, level: 4 },
    { at: 253.5, level: 5 },
    { at: 255, level: 4 },
    { at: 256.5, level: 5 },
    { at: 258.5, level: 4 },
    { at: 260, level: 5 },
    { at: 261.5, level: 3 },
    { at: 263, level: 2 },
    { at: 263.5, level: 3 },
    { at: 264, level: 5 },
    { at: 265, level: 2 },
    { at: 265.5, level: 3 },
    { at: 266, level: 5 },
    { at: 267, level: 2 },
    { at: 267.5, level: 3 },
    { at: 268, level: 5 },
    { at: 269, level: 2 },
    { at: 269.5, level: 3 },
    { at: 270, level: 0, config: 2 },
    { at: 272, level: 5 },
    { at: 274, level: 4 },
    { at: 276, level: 4 },
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
    { at: 312, level: 5 },
    { at: 314, level: 5 },
    { at: 316, level: 5 },
    { at: 318, level: 5 },
    { at: 320, level: 5 },
    { at: 322, level: 5 },
    { at: 324, level: 5 },
    { at: 326, level: 5 },
    { at: 328, level: 5 },
    { at: 330, level: 5 },
    { at: 332, level: 5 },
    { at: 334, level: 5 },
    { at: 338, level: 5 },
    { at: 342, level: 5 },
    { at: 350, level: 5 },
    { at: 358, level: 5 },
    { at: 362.5, level: 5 },
    { at: 364.5, level: 5 },
    { at: 366.5, level: 5 },
    { at: 368.5, level: 5 },
    { at: 370.5, level: 5 },
    { at: 372, level: 6 },
    { at: 373, level: 8 },
    { at: 381, level: 6 },
    { at: 385.5, level: 6 },
    { at: 387, level: 7 },
    { at: 388.5, level: 6 },
    { at: 390, level: 3 },
    { at: 398, level: 5 },
    { at: 406, level: 5 },
    { at: 414, level: 5 },
    { at: 419.5, level: 7 },
    { at: 420, level: 0, config: 5 },
    { at: 427.5, level: 6 },
    { at: 432.5, level: 6 },
    { at: 434.5, level: 6 },
    { at: 436.5, level: 6 },
    { at: 438, level: 7 },
    { at: 440, level: 3 },
    { at: 441, level: 7 },
    { at: 442, level: 6 },
    { at: 443.5, level: 7 },
    { at: 451.5, level: 3 },
    { at: 459.5, level: 6 },
    { at: 467.5, level: 6 },
    { at: 469.5, level: 6 },
    { at: 471.5, level: 4 },
    { at: 472.5, level: 7 },
    { at: 475, level: 6 },
    { at: 479, level: 6 },
    { at: 483, level: 6 },
    { at: 487.5, level: 2 },
    { at: 490.5, level: 6 },
    { at: 492.5, level: 6 },
    { at: 495, level: 3 },
    { at: 497.5, level: 7 },
    { at: 500, level: 6 },
    { at: 502.5, level: 8 },
    { at: 505, level: 5 },
    { at: 507, level: 6 },
    { at: 509.5, level: 8 },
    { at: 512, level: 7 },
    { at: 514, level: 6 },
    { at: 519, level: 6 },
    { at: 521, level: 3 },
    { at: 523, level: 6 },
    { at: 524.5, level: 4 },
    { at: 527.5, level: 6 },
    { at: 529.5, level: 6 },
    { at: 530, level: 7 },
    { at: 532, level: 6 },
    { at: 533.5, level: 7 },
    { at: 536.5, level: 6 },
    { at: 541.5, level: 6 },
    { at: 545, level: 6 },
    { at: 548, level: 6 },
    { at: 551, level: 3 },
    { at: 553.5, level: 5 },
    { at: 556, level: 6 },
    { at: 558, level: 6 },
    { at: 559.5, level: 7 },
    { at: 562, level: 3 },
    { at: 564, level: 6 },
    { at: 566, level: 6 },
    { at: 567, level: 7 },
    { at: 569.5, level: 3 },
    { at: 571, level: 4 },
    { at: 572.5, level: 6 },
    { at: 574, level: 7 },
    { at: 579, level: 6 },
    { at: 583.5, level: 8 },
    { at: 586, level: 6 },
    { at: 588, level: 4 },
    { at: 589, level: 7 },
    { at: 591, level: 6 },
    { at: 593, level: 6 },
    { at: 594, level: 3 },
    { at: 596, level: 4 },
    { at: 598, level: 6 },
    { at: 598.5, level: 8 },
    { at: 600, level: 0, config: 3 },
  ],
  model: { dpsStart: 125, growthPerMin: 1.5, efficiency: 0.5, bossWeight: 0.25 },
  target: [{ t: 0, hp: 0 }, { t: 20, hp: 1512 }, { t: 42, hp: 3699 }, { t: 61, hp: 2522 }, { t: 80.5, hp: 1009 }, { t: 102, hp: 2186 }, { t: 121, hp: 4708 }, { t: 140.5, hp: 1345 }, { t: 159.5, hp: 1177 }, { t: 177.5, hp: 3867 }, { t: 185.5, hp: 11174 }, { t: 191.5, hp: 4789 }, { t: 203, hp: 2394 }, { t: 213, hp: 3531 }, { t: 223, hp: 10375 }, { t: 234.5, hp: 3531 }, { t: 246.5, hp: 1177 }, { t: 262.5, hp: 3026 }, { t: 270, hp: 9886 }, { t: 282, hp: 4203 }, { t: 301, hp: 1850 }, { t: 315, hp: 6221 }, { t: 331.5, hp: 3195 }, { t: 347, hp: 1681 }, { t: 366, hp: 2690 }, { t: 378, hp: 3699 }, { t: 380, hp: 10761 }, { t: 391.5, hp: 4708 }, { t: 395.5, hp: 11097 }, { t: 410, hp: 1816 }, { t: 429, hp: 2354 }, { t: 439.5, hp: 5717 }, { t: 446, hp: 15469 }, { t: 452.5, hp: 5055 }, { t: 466.5, hp: 1596 }, { t: 474, hp: 9577 }, { t: 488.5, hp: 3936 }, { t: 503, hp: 1177 }, { t: 516.5, hp: 3026 }, { t: 528.5, hp: 5212 }, { t: 535, hp: 13351 }, { t: 544, hp: 8407 }, { t: 555, hp: 5077 }, { t: 567.5, hp: 8911 }, { t: 574.5, hp: 20198 }, { t: 585, hp: 13922 }, { t: 600, hp: 26466 }],
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
