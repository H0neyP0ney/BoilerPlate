import type { AlienDef, AlienId } from '../data/aliens';
import type { SoldierClassDef, SoldierClassId } from '../data/classes';
import type { UpgradeId } from '../data/progression';
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
  /** PV de gel restants (0 = libre ; voir `FREEZE`) : gelé, il ne bouge ni ne tire, reste attaquable par les aliens ; les tirs alliés le dégèlent. */
  frozen: number;
  /** Début du gel (s) : les coups alliés ne retirent pas encore de PV de gel. */
  iceInvuln: number;
  /** Temps restant (s) d'étourdissement (slam du Scarab) : il ne bouge ni ne tire, mais reste attaquable. */
  stun: number;
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
  /** Temps passé à plus de `RELOCATE.far` px de toutes les squads (recyclage des traînards ; négatif : répit d'un alien en contournement). */
  farT: number;
  /** Mode contournement (`CHASE`) : 0 = poursuite directe ; sinon côté pris pour couper la route de la squad (−1 → 1). */
  flank: number;
  /** Recyclage : temps restant (s) de l'enfouissement avant le déplacement (0 = ne s'enterre pas) ; immobile pendant ce temps. */
  sinkT: number;
  retarget: number;
  attackCd: number;
  slamWind: number;
  slamCd: number;
  /** Délai avant le prochain tir en cloche (aliens à `def.lob`). */
  lobCd: number;
  /** Langue (grenouille) et crachat (cracheur) : délai avant le prochain. */
  tongueCd: number;
  sprayCd: number;
  /** Nuage ralentissant (cracheur, `def.cloud`) ou flocons (chaman, `def.frost`) : délai avant le prochain. */
  cloudCd: number;
  /** Charge télégraphiée : délai avant la prochaine, préparation (zone rouge), charge en cours, direction verrouillée. */
  rushCd: number;
  rushWind: number;
  rushT: number;
  rushDx: number;
  /** Soldats déjà touchés par la charge en cours (une seule fois chacun) ; vidé au début de chaque charge. */
  rushHits: Set<number>;
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
  /** Boss Gling : compte à rebours avant l'essaim (s), temps d'essaim restant (s) et temps écoulé depuis le dernier gling apparu. */
  swarmCd: number;
  swarmT: number;
  swarmAcc: number;
  /** Boss resté trop longtemps en vie : niveau d'enragement (0 = calme, +1 toutes les `DIFFICULTY.bossEnrageEvery` s sans fin). */
  enraged: number;
  /** Temps écoulé depuis l'apparition (s), pour l'enragement des boss. */
  age: number;
  /** Escalade à sa création (`Sim.escalation` : ×1,1 par boss tué avant son apparition) : multiplie ses PV, sa vitesse, ses dégâts et sa cadence. */
  esc: number;
  /** Chaman : résurrections lancées depuis le dernier repos, et repos restant (s) après `revive.maxRevives` d'entre elles. */
  revives: number;
  reviveLock: number;
  /** Ne laisse aucun globe d'XP : envoyé par un rejeu de vague pendant un combat de boss (pas de farm en laissant le boss en vie), invoqué ou ressuscité. */
  noXp: boolean;
  /** Invoqué ou ressuscité : ne laisse jamais de recrue (les aliens des vagues rejouées pendant un boss, eux, en laissent). */
  noRecruit: boolean;
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
  /** Boucle de glace : rayon (px) de la zone gelée à l'impact sur un soldat (0 = aucune). */
  freeze: number;
  texture: string;
  team: Team;
  owner: PlayerId;
  hit: Set<number>;
}

/** Flaque de flammes au sol (traînée du slime de feu) : brûle les soldats qui s'y trouvent. */
export type PowerUpKind = 'stim' | 'magnet' | 'heal' | 'stasis' | 'rockets';

/** Power-up au sol : petit boost immédiat ramassé par une squad ; disparaît vite si personne ne le prend. */
export interface PowerUpState {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
  life: number;
  /** Aimant (power-up) : joueur vers qui le power-up est aspiré (simulation seulement). */
  pulled?: string;
  /** Attrapé (attiré par un soldat ou aspiré par l'aimant) : ne disparaît plus et ne clignote plus (`Pickup.catchItem`). */
  caught?: boolean;
  /** Vitesse (px/s) d'un objet attrapé qui vole vers son soldat : elle croît jusqu'à `PICKUP.maxSpeed` (`Pickup.chase`). */
  pullV?: number;
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
/** Stalactite qui va tomber (Scarab) : zone annoncée (télégraphe) puis impact quand `t` atteint 0. */
export interface Stalactite {
  id: number;
  x: number;
  y: number;
  r: number;
  /** Temps restant avant l'impact, et durée totale du télégraphe (s). */
  t: number;
  dur: number;
  damage: number;
  knockback: number;
}

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
  /** Nuage de glace (flocons du chaman) : gèle le premier soldat qui y entre (puis disparaît) au lieu de ralentir. */
  frost?: boolean;
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
  /** Attrapé (attiré par un soldat ou aspiré par l'aimant) : ne disparaît plus et ne clignote plus (`Pickup.catchItem`). */
  caught?: boolean;
  /** Vitesse (px/s) d'un objet attrapé qui vole vers son soldat : elle croît jusqu'à `PICKUP.maxSpeed` (`Pickup.chase`). */
  pullV?: number;
}

/** Coffre laissé par un boss tué : `progress` (s) monte tant qu'un soldat est à côté, il s'ouvre à `DIFFICULTY.chestTime`. */
export interface ChestState {
  id: number;
  x: number;
  y: number;
  progress: number;
}

/** Globe d'upgrade sorti d'un coffre : réservé à `owner`, ne disparaît jamais, donne une upgrade au hasard à son ramassage. */
export interface UpgradeOrbState {
  id: number;
  owner: string;
  /** Upgrade qu'il donne, tirée au hasard à sa chute : son icône est celle de la carte d'upgrade (si elle est déjà au maximum au ramassage, une autre est tirée). */
  upgrade: UpgradeId;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Jamais décompté (le type est celui des objets attirables, `Pickup.catchItem`). */
  life: number;
  /** Temps écoulé depuis sa sortie du coffre (s) : imprenable pendant `DIFFICULTY.chestOrbGrace`. */
  age: number;
  /** Chute en cloche depuis le coffre (`t` = temps restant, s) : en l'air, ni aimant ni ramassage. Aussi dans le snapshot (arc de la chute). */
  hop?: { vx: number; vy: number; t: number };
  /** Aspiré / attrapé : suit sa squad sans limite de distance et accélère (`Pickup.chase`). */
  pulled?: string;
  caught?: boolean;
  pullV?: number;
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
  /** Attrapé (attiré par un soldat ou aspiré par l'aimant) : ne disparaît plus et ne clignote plus (`Pickup.catchItem`). */
  caught?: boolean;
  /** Vitesse (px/s) d'un objet attrapé qui vole vers son soldat : elle croît jusqu'à `PICKUP.maxSpeed` (`Pickup.chase`). */
  pullV?: number;
  /** Saut en cloche à l'apparition (simulation seulement : le client n'en a pas besoin, il déduit l'arc de `life`). */
  hop?: { vx: number; vy: number; t: number };
  /** Tutoriel : recrue qui ne disparaît pas tant qu'elle n'est pas ramassée. */
  forced?: boolean;
  /** Tutoriel : temps écoulé depuis son apparition (s), compté par la simulation, pour dessiner l'arc du saut sans à-coups (sa `life` est infinie). */
  age?: number;
}

export const hpRatio = (b: Body): number => b.hp / b.maxHp;
