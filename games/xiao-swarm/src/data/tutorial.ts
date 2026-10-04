import type { AlienId } from './aliens';
import type { PowerUpKind } from '../sim/entities';
import type { UpgradeId } from './progression';

/**
 * Onboarding scripté (données pures) : une partie normale dont les vagues de la timeline sont REMPLACÉES au début par quelques
 * vagues de tutoriel, jouées dans l'ordre (voir `sim/Tutorial.ts`) ; à la fin le gestionnaire de vagues normal prend le relai.
 *
 *   1. un point vert pulsant sur le sol, en haut à droite de la squad : le joueur s'y rend (« WASD to move » / « Drag to move » au début, flèche verte autour de la squad) ;
 *   2. vague 1 (après une courte pause, flèche rouge « ennemis en approche », arrivée par la gauche) : des glings et 1 slime, sans XP ; le slime lâche
 *      toujours une recrue, À DISTANCE de la squad (flèche + « Get +1 trooper ») ; vague vaincue et recrue ramassée → étape suivante directement ;
 *   3. vague 2 : plus grosse, que de l'XP, assez pour UN level-up ; tous les globes doivent être ramassés (flèche et zone bleues) ;
 *      l'offre de level-up est imposée (damage / speed / fireRate) avec `suggest` mis en avant, mais le joueur choisit ce qu'il veut ;
 *   4. vague 3 : encore plus grosse, sans XP ; une recrue et un power-up de soin seulement ; puis le tutoriel se termine.
 *
 * Valeurs d'XP : le niveau 1 coûte `xpToNext(1)` = 10 XP (data/progression.ts). Vague 1 : aucune XP (pas de globe) ;
 * vague 2 : 12 XP (≥ 10 : un seul level-up, et 12 < 10 + xpToNext(2) = 29).
 */
export interface TutorialGroup {
  type: AlienId;
  count: number;
  /** XP lâchée par chaque alien du groupe (écrase `def.xp` ; 0 = aucun globe). */
  xp: number;
  /** Chaque alien du groupe lâche toujours une recrue (là où il meurt, qui ne disparaît pas) ; absent = jamais de recrue dans le tutoriel. */
  recruit?: boolean;
  /** Chaque alien du groupe lâche ce power-up (qui ne disparaît pas). */
  powerup?: PowerUpKind;
}

/**
 * Cadeau CACHÉ de fin de tutoriel (première partie) : upgrades déjà « prises » en secret pour adoucir le début de la vraie partie.
 * Elles agissent sur les stats de la squad mais n'apparaissent ni dans ses upgrades prises ni à l'écran, et ne comptent pas dans les
 * piles maximales : le joueur peut encore les choisir normalement.
 */
export const TUTORIAL_REWARD: Partial<Record<UpgradeId, number>> = { damage: 1, speed: 3, recruit: 3, range: 2, fireRate: 1, hp: 2 };

export interface TutorialConfig {
  /** Rayon (px) du point vert : un soldat dedans valide l'étape. */
  markerRadius: number;
  /** Distance (px) du 1er point vert à la squad, et du 2e au 1er : assez près pour rester à l'écran. */
  markerDistance: number;
  /** Pause (s) entre l'arrivée sur le 1er point vert et la 1re vague. */
  firstWaveDelay: number;
  /** Rayon (px) de la 1re vague : plus loin, hors champ, signalée par une flèche rouge « ennemis en approche » dès l'arrivée sur le 1er point vert. */
  firstRingRadius: number;
  /** Rayon (px) de la 2e vague (celle des globes d'XP) : encore plus loin que la 1re, toujours à droite de la squad. */
  secondRingRadius: number;
  /** Rayon (px) autour de la squad où apparaissent les aliens d'une vague (à l'écran, pas hors champ). */
  ringRadius: number;
  waves: { first: TutorialGroup[]; second: TutorialGroup[]; third: TutorialGroup[] };
  /** Offre de level-up imposée et celle qui est recommandée (flèche sur la carte). */
  offer: UpgradeId[];
  suggest: UpgradeId;
}

export const TUTORIAL: TutorialConfig = {
  markerRadius: 55,
  markerDistance: 240,
  firstWaveDelay: 1.2,
  firstRingRadius: 680,
  secondRingRadius: 850,
  ringRadius: 340,
  waves: {
    first: [
      { type: 'gling', count: 8, xp: 0 },
      { type: 'slime', count: 1, xp: 0, recruit: true },
    ], // pas de globe d'XP avant l'étape « ramasse les globes » (vague 3)
    second: [{ type: 'gling', count: 12, xp: 1 }], // 12 glings à 1 XP = les mêmes 12 XP qu'avant (un seul level-up)
    third: [
      { type: 'gling', count: 15, xp: 0 },
      { type: 'slime', count: 1, xp: 0, recruit: true },
      { type: 'slime', count: 1, xp: 0, powerup: 'heal' },
    ],
  },
  offer: ['damage', 'speed', 'fireRate'],
  suggest: 'damage',
};
