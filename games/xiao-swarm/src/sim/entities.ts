import type { AlienDef, AlienId } from '../data/aliens';
import type { SoldierClassDef, SoldierClassId } from '../data/classes';
import type { PlayerId, Team } from './types';

/**
 * États d'entités = données pures (pas de sprites). `px/py` = position au tick
 * précédent, pour que l'affichage interpole entre deux ticks.
 */
export interface Body {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  /** Vélocité de knockback, amortie séparément. */
  kx: number;
  ky: number;
  radius: number;
  mass: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  team: Team;
}

export interface SoldierState extends Body {
  kind: 'soldier';
  owner: PlayerId;
  def: SoldierClassDef;
  /** Slot relatif à l'ancre de la squad. */
  slotX: number;
  slotY: number;
  /** Aléa de réactivité individuelle (0 → 1), mis à l'échelle par CROWD.gainMin / gainSpread (formation organique). */
  gain: number;
  cooldown: number;
  retarget: number;
  target: Unit | null;
  /** 1 = regarde à droite. */
  facing: number;
  aim: number;
  invulnerable: number;
  /** Id de la bulle qui le tient captif (0 = libre) : il ne bouge ni ne tire, et seule la bulle peut le blesser. */
  capturedBy: number;
}

export interface AlienState extends Body {
  kind: 'alien';
  def: AlienDef;
  target: SoldierState | null;
  goalX: number;
  goalY: number;
  retarget: number;
  attackCd: number;
  chargeT: number;
  chargeCd: number;
  chargeDx: number;
  chargeDy: number;
  slamWind: number;
  slamCd: number;
  /** Délai avant le prochain tir en cloche (aliens à `def.lob`). */
  lobCd: number;
  /** Langue (grenouille) et crachat (cracheur) : délai avant le prochain. */
  tongueCd: number;
  sprayCd: number;
  /** Charge télégraphiée : délai avant la prochaine, préparation (zone rouge), charge en cours, direction verrouillée. */
  rushCd: number;
  rushWind: number;
  rushT: number;
  rushDx: number;
  rushDy: number;
  /** Chaman : délai avant la prochaine incantation, incantation en cours (s restantes) et flaque visée. */
  reviveCd: number;
  castT: number;
  castCorpse: number;
  /** Slime de feu : délai avant la prochaine flaque de flammes. */
  trailCd: number;
  /** Bulle : le soldat qu'elle digère (null = à la recherche d'une proie). */
  captive: SoldierState | null;
  /** Déjà ressuscité une fois : sa flaque ne pourra plus servir. */
  revived: boolean;
}

export type Unit = SoldierState | AlienState;

export interface Projectile {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  damage: number;
  pierce: number;
  flame: boolean;
  /** Grenade en cloche : pas de collision en vol, explose à la fin de sa course (rayon `aoe`). */
  lob: boolean;
  aoe: number;
  /** Recul infligé au soldat touché (px/s, divisé par sa masse) : boules du cracheur. */
  knock: number;
  /** Caillou : rayon de l'obstacle laissé au sol à l'atterrissage (0 = aucun) et sa durée de vie (s). */
  rock: number;
  rockTtl: number;
  texture: string;
  team: Team;
  owner: PlayerId;
  hit: Set<number>;
}

/** Flaque de flammes au sol (traînée du slime de feu) : brûle les soldats qui s'y trouvent. */
export interface FirePatch {
  id: number;
  x: number;
  y: number;
  r: number;
  ttl: number;
  dps: number;
}

/** Flaque d'un slime mort : un chaman peut le ressusciter tant qu'elle dure (`claimed` = id du chaman qui l'incante). */
export interface Corpse {
  id: number;
  x: number;
  y: number;
  type: AlienId;
  ttl: number;
  claimed: number;
}

/** Globe d'XP au sol (voir sim/Xp.ts). `value` = 1, 3 ou 8 (taille affichée). */
export interface XpOrb {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  value: number;
  life: number;
}

export interface RecruitState {
  id: number;
  cls: SoldierClassId;
  x: number;
  y: number;
  px: number;
  py: number;
  life: number;
}

export const hpRatio = (b: Body): number => b.hp / b.maxHp;
