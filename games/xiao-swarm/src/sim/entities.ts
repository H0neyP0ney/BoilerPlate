import type { AlienDef } from '../data/aliens';
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
  texture: string;
  team: Team;
  owner: PlayerId;
  hit: Set<number>;
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
