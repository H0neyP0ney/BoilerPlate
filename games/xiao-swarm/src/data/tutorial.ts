import type { AlienId } from './aliens';
import type { PowerUpKind } from '../sim/entities';
import type { UpgradeId } from './progression';

/**
 * Onboarding scripté (données pures) : une partie normale dont les vagues de la timeline sont REMPLACÉES au début par quelques
 * vagues de tutoriel, jouées dans l'ordre (voir `sim/Tutorial.ts`) ; à la fin le gestionnaire de vagues normal prend le relai.
 *
 *   1. un point vert pulsant sur le sol : le joueur s'y rend (conseil « WASD to move » affiché au début) ;
 *   2. vague 1 : des glings autour de la squad (peu d'XP, pas de level-up) ; tous morts → 2e point vert un peu plus loin, à l'écran ;
 *   3. vague 2 : glings + 1 slime ; le slime lâche toujours une recrue, À DISTANCE de la squad (flèche + « Get +1 trooper ») ;
 *   4. vague 3 (après la recrue) : plus grosse, que de l'XP, assez pour UN level-up ; tous les globes doivent être ramassés ;
 *      l'offre de level-up est imposée (damage / speed / fireRate) avec `suggest` mis en avant, mais le joueur choisit ce qu'il veut ;
 *   5. vague 4 : encore plus grosse, plus d'XP ; une recrue et un power-up de soin seulement ; puis le tutoriel se termine.
 *
 * Valeurs d'XP : le niveau 1 coûte `xpToNext(1)` = 10 XP (data/progression.ts). Vagues 1 + 2 : 4 + 3 + 2 = 9 XP < 10 (pas de level-up) ;
 * vague 3 : 12 XP (≥ 10 même si des globes précédents ont été ratés, et 9 + 12 < 10 + xpToNext(2) = 29 : un seul level-up).
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

export interface TutorialConfig {
  /** Rayon (px) du point vert : un soldat dedans valide l'étape. */
  markerRadius: number;
  /** Distance (px) du 1er point vert à la squad, et du 2e au 1er : assez près pour rester à l'écran. */
  markerDistance: [number, number];
  /** Rayon (px) autour de la squad où apparaissent les aliens d'une vague (à l'écran, pas hors champ). */
  ringRadius: number;
  waves: { first: TutorialGroup[]; second: TutorialGroup[]; third: TutorialGroup[]; fourth: TutorialGroup[] };
  /** Offre de level-up imposée et celle qui est recommandée (flèche sur la carte). */
  offer: UpgradeId[];
  suggest: UpgradeId;
}

export const TUTORIAL: TutorialConfig = {
  markerRadius: 55,
  markerDistance: [330, 320],
  ringRadius: 280,
  waves: {
    first: [{ type: 'gling', count: 4, xp: 1 }],
    second: [
      { type: 'gling', count: 3, xp: 1 },
      { type: 'slime', count: 1, xp: 2, recruit: true },
    ],
    third: [{ type: 'gling', count: 6, xp: 2 }],
    fourth: [
      { type: 'gling', count: 10, xp: 0 },
      { type: 'slime', count: 1, xp: 0, recruit: true },
      { type: 'slime', count: 1, xp: 0, powerup: 'heal' },
    ],
  },
  offer: ['damage', 'speed', 'fireRate'],
  suggest: 'damage',
};
