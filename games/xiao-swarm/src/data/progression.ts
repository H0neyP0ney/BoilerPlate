import type { Modifier } from '@xiao/engine/sim';
import type { SquadStat } from '../sim/Squad';

/**
 * Progression (données pures) : globes d'XP laissés par les aliens, courbe de niveaux et pool d'upgrades proposés
 * à chaque niveau (3 au choix). Lu par `sim/Xp.ts` et `sim/Squad.ts` ; l'affichage ne fait que dessiner.
 */

/** Globes d'XP : valeur (XP) de chaque taille, de la plus petite à la plus grosse. */
export const XP_ORB_VALUES = [1, 3, 8] as const;

/** XP à accumuler pour passer du niveau `level` au suivant. */
export const xpToNext = (level: number): number => 10 + 8 * (level - 1) + Math.round(1.2 * (level - 1) ** 2);

/** Découpe l'XP d'un alien en globes (les plus gros d'abord, au plus `max` globes). */
export function splitXp(value: number, max = 9): number[] {
  const out: number[] = [];
  let v = Math.round(value);
  const [small, medium, large] = XP_ORB_VALUES;
  while (v >= large && out.length < max - 2) {
    out.push(large);
    v -= large;
  }
  while (v >= medium && out.length < max) {
    out.push(medium);
    v -= medium;
  }
  while (v >= small && out.length < max) {
    out.push(small);
    v -= small;
  }
  return out;
}

export type UpgradeId = 'damage' | 'fireRate' | 'hp' | 'speed' | 'maxSquad' | 'magnet' | 'recruit' | 'xpGain' | 'reinforce' | 'range';

export interface UpgradeDef {
  id: UpgradeId;
  /** Bonus appliqué aux stats de la squad (absent pour un effet instantané, ex. soin). */
  stat?: SquadStat;
  mod?: Modifier;
  /** Nombre maximum de fois où l'upgrade peut être prise. */
  maxStacks: number;
  /** Valeur affichée dans la description (« +{value} % »). */
  value: number;
  /** Couleur de la carte (0xRRGGBB). */
  color: number;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  damage: { id: 'damage', stat: 'damage', mod: { pct: 0.15 }, maxStacks: 10, value: 15, color: 0xff6a4a },
  fireRate: { id: 'fireRate', stat: 'fireRate', mod: { pct: 0.15 }, maxStacks: 10, value: 15, color: 0xffd166 },
  /** PV max +15 % ; les soldats déjà là gagnent aussi, à plat, les PV max supplémentaires (pas de soin en plus). */
  hp: { id: 'hp', stat: 'hp', mod: { pct: 0.15 }, maxStacks: 8, value: 15, color: 0x6fdc6f },
  range: { id: 'range', stat: 'range', mod: { pct: 0.05 }, maxStacks: 8, value: 5, color: 0xffa07a },
  speed: { id: 'speed', stat: 'speed', mod: { pct: 0.08 }, maxStacks: 5, value: 8, color: 0x7dd3ff },
  maxSquad: { id: 'maxSquad', stat: 'maxSquad', mod: { flat: 2 }, maxStacks: 4, value: 2, color: 0xb388ff },
  magnet: { id: 'magnet', stat: 'magnet', mod: { pct: 0.35 }, maxStacks: 4, value: 35, color: 0x5aa8ff },
  recruit: { id: 'recruit', stat: 'recruit', mod: { pct: 0.3 }, maxStacks: 4, value: 30, color: 0xff8fc8 },
  xpGain: { id: 'xpGain', stat: 'xpGain', mod: { pct: 0.2 }, maxStacks: 4, value: 20, color: 0x4fe0d0 },
  /** Effet instantané : `value` gunners rejoignent l'escouade (proposée seulement s'il reste de la place). */
  reinforce: { id: 'reinforce', maxStacks: 99, value: 2, color: 0xffa94d },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

/** Nombre d'upgrades proposées à chaque niveau. */
export const OFFER_SIZE = 3;
