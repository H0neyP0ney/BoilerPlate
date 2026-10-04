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
  /** Bouclier : barre en plus des PV, consommée la première (power-up « shield » pour les soldats, `def.shield` pour le Scarab). 0 = aucun. */
  shield: number;
  maxShield: number;
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
  /**
   * Temps restant (s) d'un « grab » (langue) : tant qu'il est > GRAB_HOLD il est tiré hors de la formation (il ne rejoint pas son
   * slot), et jusqu'à 0 il est immunisé contre tout autre grab (langue ou bulle).
   */
  grabbed: number;
}

export interface AlienState extends Body {
  kind: 'alien';
  def: AlienDef;
  target: SoldierState | null;
  goalX: number;
  goalY: number;
  retarget: number;
  attackCd: number;
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
  /** Point de départ du couloir de charge (là où l'alien s'est arrêté pour annoncer) : le télégraphe s'y ancre, chez l'hôte comme chez les clients. */
  rushX: number;
  rushY: number;
  /** Saut écrasant (`def.leap`) : délai avant le prochain, temps restant de la séquence (0 = au sol), départ et point d'impact. */
  leapCd: number;
  leapT: number;
  leapFromX: number;
  leapFromY: number;
  leapX: number;
  leapY: number;
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
  /** Lurker : phase (0 en route, 1 s'enterre, 2 enterré, 3 vise, 4 lance les pics, 5 ressort), temps restant dans la phase (s) et direction des pics. */
  lurkPhase: number;
  lurkT: number;
  spikeAng: number;
  /** Aliens à `def.shield` : secondes écoulées depuis les derniers dégâts reçus (le bouclier ne se régénère qu'après `regenDelay`). */
  shieldT: number;
  /** Tutoriel seulement : écrase ce que l'alien lâche en mourant (XP, recrue, power-up). Absent hors tutoriel. */
  tut?: { xp: number; recruit: boolean; powerup?: PowerUpKind };
}

export type Unit = SoldierState | AlienState;

export interface Projectile {
  /** Identifiant unique, attribué à chaque acquisition du pool (le client le retrouve dans le snapshot pour lisser le mouvement). */
  id: number;
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
  /** Tir critique (dégâts déjà multipliés) : l'impact émet un événement `crit` pour l'affichage. */
  crit: boolean;
  /** Grenade en cloche : pas de collision en vol, explose à la fin de sa course (rayon `aoe`). */
  lob: boolean;
  aoe: number;
  /** Recul infligé au soldat touché (px/s, divisé par sa masse) : boules du cracheur. */
  knock: number;
  /** Flaque ralentissante laissée à l'impact (rayon 0 = aucune), durée (s) et facteur de vitesse des soldats dedans. */
  puddle: number;
  puddleTtl: number;
  puddleSlow: number;
  texture: string;
  team: Team;
  owner: PlayerId;
  hit: Set<number>;
}

/** Flaque de flammes au sol (traînée du slime de feu) : brûle les soldats qui s'y trouvent. */
export type PowerUpKind = 'stim' | 'magnet' | 'heal' | 'stasis' | 'rockets' | 'shield';

/** Power-up au sol : petit boost immédiat ramassé par une squad ; disparaît vite si personne ne le prend. */
export interface PowerUpState {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
  life: number;
  /** Aimant (power-up) : joueur vers qui le power-up est aspiré (simulation seulement). */
  pulled?: string;
}

/** Zone persistante laissée par un power-up : globe de soin (soigne les soldats dedans) ou de stase (ralentit énormément les aliens). */
export interface Field {
  id: number;
  kind: 'heal' | 'stasis';
  x: number;
  y: number;
  r: number;
  ttl: number;
}

/** Flaque laissée par un crachat : ralentit les soldats qui s'y trouvent (`slow` = facteur de vitesse, < 1). */
/** Mur annoncé (télégraphe jaune) : à la fin du compte à rebours, une ligne de rochers surgit. */
export interface WallTelegraph {
  id: number;
  x: number;
  y: number;
  /** Direction du mur (rad). */
  angle: number;
  length: number;
  /** Rayon des rochers (= demi-largeur du mur) et durée de vie du mur une fois posé (s). */
  rockR: number;
  ttl: number;
  /** Temps restant avant l'apparition, et durée totale du télégraphe (s). */
  t: number;
  dur: number;
}

export interface Puddle {
  id: number;
  x: number;
  y: number;
  r: number;
  ttl: number;
  slow: number;
}

/** Zone laissée au sol par un joueur mort (coop) : un équipier qui y reste `REVIVE_TIME` s le ramène avec une escouade de base. */
export interface ReviveZone {
  owner: PlayerId;
  x: number;
  y: number;
  r: number;
  /** Secondes passées dedans par un équipier (0 → REVIVE_TIME). */
  progress: number;
}

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
  /** Aimant (power-up) : joueur vers qui le globe est aspiré (sim seulement). */
  pulled?: string;
}

export interface RecruitState {
  id: number;
  cls: SoldierClassId;
  x: number;
  y: number;
  px: number;
  py: number;
  life: number;
  /** Aimant (power-up) : joueur vers qui la recrue est aspirée (simulation seulement). */
  pulled?: string;
  /** Saut en cloche à l'apparition (simulation seulement : le client n'en a pas besoin, il déduit l'arc de `life`). */
  hop?: { vx: number; vy: number; t: number };
  /** Tutoriel : recrue qui ne disparaît pas tant qu'elle n'est pas ramassée. */
  forced?: boolean;
}

export const hpRatio = (b: Body): number => b.hp / b.maxHp;
