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
  /** Temps restant (s) d'empoisonnement (boules du Giant Crab) : ses PV descendent progressivement vers 1 (jamais mortel), voir `Sim.updatePoison`. */
  poison: number;
  /** Temps restant (s) d'étourdissement (slam du Scarab) : il ne bouge ni ne tire, mais reste attaquable. */
  stun: number;
  /** Saut vers la Gling Mère après une toile : temps restant (s, 0 = au sol), départ et arrivée (le soldat est hors formation, ni visé par la foule ni tireur pendant le vol). */
  jumpT: number;
  /** Enflammé : temps restant (s) de brûlure et débit de dégâts (PV/s) ; le feu est une brûlure dans le temps, voir `FIRE`. */
  burn: number;
  burnDps: number;
  /** Soufflé en cloche par l'explosion d'un kamikaze : temps restant (s) pendant lequel seul le recul le déplace (il ne rejoint pas son slot), puis il revient en marchant. */
  knockT: number;
  jx0: number;
  jy0: number;
  jx1: number;
  jy1: number;
  /** Id de la Gling Mère visée par le saut (le point d'arrivée la suit pendant le vol). */
  jm: number;
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
  /** Compteurs (s) des capacités des niveaux Expert (cercle d'araignées) et Impossible (zones de gel), voir `AlienDef.expert` / `impossible`. */
  ringCd: number;
  webCd: number;
  /** Délai (s) avant les prochains murs du Scarab (Impossible). */
  wallsCd: number;
  /** Délai (s) avant les prochains nuages de gel du Rhino Alpha (Expert). */
  frostCd: number;
  /** Alien doré : 0 = attend, 1 = en fuite ; nombre de tentatives d'enfouissage déjà interrompues (0 : la 1re est interruptible, 1 : la 2e ne l'est plus) ; délai avant la prochaine pièce semée. */
  goldState: number;
  goldTries: number;
  goldDrop: number;
  /** Alien doré : 0 = en fuite, 1 = tentative d'enfouissage (interruptible), 2 = dernier enfouissage (jamais interrompu) ; PV au début de la tentative ; délai avant la prochaine tentative (s). */
  goldBury: number;
  goldHp0: number;
  goldNext: number;
  /** Délai (s) avant les prochains pics en croix du Rhino Alpha. */
  crossCd: number;
  /** Lurker : temps (s) passé à marcher parce qu'un autre lurker enterré occupait l'endroit où il voulait s'enterrer (au-delà d'un moment, il se contente d'un écart minimal). */
  lurkBlockT: number;
  swarmT: number;
  swarmAcc: number;
  /** Boss resté trop longtemps en vie : niveau d'enragement (0 = calme, +1 toutes les `DIFFICULTY.bossEnrageEvery` s sans fin). */
  enraged: number;
  /** Temps écoulé depuis l'apparition (s), pour l'enragement des boss. */
  age: number;
  /** Escalade à sa création (`Sim.escalation*` : ×(1 + gain) par boss tué avant son apparition ; ses PV sont multipliés une fois pour toutes à la création) : dégâts, cadence, vitesse. */
  escDmg: number;
  escRate: number;
  escSpeed: number;
  /** Chaman : résurrections lancées depuis le dernier repos, et repos restant (s) après `revive.maxRevives` d'entre elles. */
  revives: number;
  reviveLock: number;
  /** Ne laisse aucun globe d'XP : envoyé par un rejeu de vague pendant un combat de boss (pas de farm en laissant le boss en vie), invoqué ou ressuscité. */
  noXp: boolean;
  /** Invoqué ou ressuscité : ne laisse jamais de recrue (les aliens des vagues rejouées pendant un boss, eux, en laissent). */
  noRecruit: boolean;
  /** Apparaît sur place, sans trou ni délai d'émergence (araignées qui surgissent du cadavre d'un chaman). */
  instant: boolean;
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
  /** Durée (s) du poison infligé aux soldats de la zone à l'impact (0 = aucun). */
  poison: number;
  /** Nombre d'araignées enragées qui surgissent à l'impact (boules du Giant Crab ; 0 = aucune). */
  spawn: number;
  /** PV des araignées nées à l'impact (× leurs PV de base ; boules du Giant Crab). */
  spawnHp: number;
  texture: string;
  team: Team;
  owner: PlayerId;
  hit: Set<number>;
}

/** Flaque de flammes au sol (traînée du slime de feu) : brûle les soldats qui s'y trouvent. */
export type PowerUpKind = 'stim' | 'magnet' | 'heal' | 'stasis' | 'rockets' | 'reroll' | 'prism' | 'electro';

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
  /** Loot de relance : saut en cloche à la sortie de l'alien (comme une recrue), en l'air ni aimant ni ramassage (simulation seulement ; l'affichage trace l'arc). */
  hop?: { vx: number; vy: number; t: number };
  /** Loot de relance : âge (s) depuis sa chute ; imprenable avant `DIFFICULTY.chestOrbGrace`, comme les globes d'upgrade (simulation seulement). */
  age?: number;
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
/** Mèche d'un kamikaze mort : son corps reste sur place et explose (zone `r`) quand `t` atteint 0. Dans le snapshot (v80) : un événement perdu effaçait le télégraphe. */
export interface Fuse {
  id: number;
  x: number;
  y: number;
  r: number;
  /** Temps restant avant l'explosion, et durée totale de la mèche (s). */
  t: number;
  dur: number;
  dmg: number;
  knock: number;
  /** Alien dont le corps attend l'explosion (son sprite clignote à l'écran). */
  alien: AlienId;
}

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

/** Pics en croix (Rhino Alpha) : télégraphe `t` s puis poussée `s` s ; 4 rangées d'angle 0, 90°, 180°, 270° autour de (x, y). Les mesures (`length`, `width`…) viennent de `def.spikeCross`. */
export interface SpikeCross {
  id: number;
  x: number;
  y: number;
  /** Temps restant du télégraphe (s), puis de la poussée des pics. */
  t: number;
  s: number;
  length: number;
  width: number;
  aim: number;
  sweep: number;
  damage: number;
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
  /** Toile de la Gling Mère (id de l'alien qui l'a posée, sim seulement) : le premier soldat qui y marche la consomme et saute vers elle (`WEB`). Absente du snapshot : `web` y suffit. */
  web?: boolean;
  owner?: number;
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
  /** Glissade à la sortie de l'alien (px/s, freinée : `XP_SLIDE`) ; 0 / absent = immobile. Sim seulement (la position passe par le snapshot). */
  vx?: number;
  vy?: number;
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

/** Diamant vert (ressource des skins) au sol : il retombe en cloche autour du coffre, attend, puis est aspiré comme un globe. Solo seulement, jamais dans le snapshot. */
export interface GemState {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Jamais décompté (le type est celui des objets attirables, `Pickup.catchItem`). */
  life: number;
  age: number;
  hop?: { vx: number; vy: number; t: number };
  pulled?: string;
  caught?: boolean;
  pullV?: number;
}

/** Coffre à diamants laissé par un boss (solo) : rester autour charge la jauge, pleine = vidéo récompensée, puis il explose en diamants. */
export interface GemChestState {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Saut en cloche depuis l'œuf jusqu'à sa place (`t` = temps restant) : pas de jauge pendant le saut. */
  hop?: { vx: number; vy: number; t: number };
  /** Jauge de charge, 0 → 1 (`GEM_CHEST.chargeTime` s de présence). */
  charge: number;
  /** `idle` : se charge ; `ad` : la vidéo est demandée (la vue répond par `Gems.adResult`) ; `cooldown` : vidéo ratée, pause avant de pouvoir recommencer. */
  state: 'idle' | 'ad' | 'cooldown';
  cool: number;
  age: number;
  /** Nombre de diamants que le coffre contiendra à son ouverture (moyenne du boss × multiplicateur du niveau, ± `GEM_CHEST.spread`). */
  qty: number;
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
