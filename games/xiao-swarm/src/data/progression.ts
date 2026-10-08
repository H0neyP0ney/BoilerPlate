import type { Modifier } from '@xiao/engine/sim';
import type { SquadStat } from '../sim/Squad';

/**
 * Progression (données pures) : globes d'XP laissés par les aliens, courbe de niveaux et pool d'upgrades proposés
 * à chaque niveau (3 au choix). Lu par `sim/Xp.ts` et `sim/Squad.ts` ; l'affichage ne fait que dessiner.
 */

/** Globes d'XP : valeur (XP) de chaque taille, de la plus petite à la plus grosse. */
export const XP_ORB_VALUES = [1, 3, 8] as const;

/**
 * XP à accumuler pour passer du niveau `level` au suivant (niveaux 1 à 40). Courbe à « bosse de départ » : les premiers niveaux coûtent plus cher (le 2 : 42 au lieu de 19,
 * le 5 : 93 au lieu de 61) pour espacer les montées de niveau du début, puis elle rejoint l'ancienne courbe (10 + 8(n−1) + 1,2(n−1)²) un peu en dessous :
 * l'XP cumulée pour atteindre le niveau 21 (≈ 6 min) est la même qu'avant (4684). Table fixe plutôt qu'une formule : pas de `Math.exp` dans la simulation
 * (une dernière décimale différente selon le navigateur pourrait décaler un arrondi). Le niveau 1 reste à 10 : le tutoriel en dépend.
 */
const XP_TABLE = [
  10, 42, 60, 77, 93, 111, 129, 149, 170, 192, 217, 244, 273, 304, 338, 374, 412, 453, 496, 540, 588, 638, 691, 745, 802, 861, 922, 986, 1052, 1119, 1190, 1262, 1337, 1413, 1492, 1573, 1656, 1742, 1829, 1919,
] as const;
/** Au-delà du niveau 40 : l'ancienne formule × cette échelle (continuité avec la table). */
const XP_TAIL_SCALE = 0.8935;
export const xpToNext = (level: number): number => XP_TABLE[level - 1] ?? Math.round((10 + 8 * (level - 1) + Math.round(1.2 * (level - 1) ** 2)) * XP_TAIL_SCALE);

/** Découpe l'XP d'un alien en globes (les plus gros d'abord, au plus `max` globes). */
export function splitXp(value: number, max = 9): number[] {  // `max` = nombre maximal de globes (Infinity : aucune limite, boss)
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

export type UpgradeId = 'damage' | 'fireRate' | 'hp' | 'speed' | 'maxSquad' | 'magnet' | 'recruit' | 'xpGain' | 'reinforce' | 'range' | 'crit' | 'teamSpirit' | 'lastStand' | 'bossHunter';

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
  range: { id: 'range', stat: 'range', mod: { pct: 0.1 }, maxStacks: 5, value: 10, color: 0xffa07a },
  /** Chance de critique en points de % (stat `crit`, 0 de base) : +5 par prise, dégâts × `CRIT_MUL`, plafonné à `CRIT_MAX` % (config.ts). */
  crit: { id: 'crit', stat: 'crit', mod: { flat: 5 }, maxStacks: 6, value: 5, color: 0xffe14a },
  speed: { id: 'speed', stat: 'speed', mod: { pct: 0.08 }, maxStacks: 5, value: 8, color: 0x7dd3ff },
  maxSquad: { id: 'maxSquad', stat: 'maxSquad', mod: { flat: 2 }, maxStacks: 6, value: 2, color: 0xb388ff },
  magnet: { id: 'magnet', stat: 'magnet', mod: { pct: 0.5 }, maxStacks: 3, value: 50, color: 0x5aa8ff },
  recruit: { id: 'recruit', stat: 'recruit', mod: { pct: 0.3 }, maxStacks: 4, value: 30, color: 0xff8fc8 },
  xpGain: { id: 'xpGain', stat: 'xpGain', mod: { pct: 0.25 }, maxStacks: 4, value: 25, color: 0x4fe0d0 },
  /** Effet instantané : `value` gunners rejoignent l'escouade, même au-delà de la taille max, avec un bouclier plein. Plus proposée dès que la squad dépasse déjà son max de `REINFORCE_MAX_OVERCAP` (config.ts). */
  reinforce: { id: 'reinforce', maxStacks: 99, value: 3, color: 0xffa94d },
  /** Esprit d'équipe : +1,5 % de dégâts par soldat vivant de la squad, par prise (stat `teamSpirit`, lue par `Combat.update`). */
  teamSpirit: { id: 'teamSpirit', stat: 'teamSpirit', mod: { flat: 0.015 }, maxStacks: 4, value: 1.5, color: 0xa8e04a },
  /** Dernier rempart : +2 % de dégâts par soldat MANQUANT (taille max de la squad − soldats vivants), par prise : 2, 4, 6, 8 % (stat `lastStand`, lue par `Combat.update`). */
  lastStand: { id: 'lastStand', stat: 'lastStand', mod: { flat: 0.02 }, maxStacks: 4, value: 2, color: 0xe0304f },
  /** Chasseur de boss : +30 % de dégâts aux boss et mini-boss par prise (stat `bossHunter`, lue par `Sim.damage`). */
  bossHunter: { id: 'bossHunter', stat: 'bossHunter', mod: { flat: 0.3 }, maxStacks: 4, value: 30, color: 0xe05ae0 },
};


export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
/**
 * Upgrades désactivées : jamais proposées (elles restent dans `UPGRADES` / `UPGRADE_IDS` : le format réseau n'a pas à changer).
 * `reinforce` (renforts : +3 soldats tout de suite) retirée le 08/10 : elle ne permet pas de capitaliser, personne ne la prenait.
 */
export const DISABLED_UPGRADES: readonly UpgradeId[] = ['reinforce'];

/** Nombre d'upgrades proposées à chaque niveau. */
export const OFFER_SIZE = 3;
