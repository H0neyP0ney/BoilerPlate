/**
 * Constantes du jeu. Ce fichier est partagé par la simulation (sim/) et
 * l'affichage : il doit rester sans import (pur).
 */

/** Safe zone carrée toujours visible (Scale.EXPAND) : 1280×720 sur desktop Poki. */
export const SAFE_SIZE = 720;

export const SQUAD = {
  startSize: 4,
  baseMaxSize: 12,
} as const;

/**
 * Grab (langue) : l'unité tirée garde sa liberté de mouvement (aucun stun). Pendant `GRAB_OUT` s elle ne compte plus pour le
 * mouvement de foule (centre, slots, laisse) : la traction (~0,5 s) puis encore 1 s ; elle reste immunisée contre tout autre grab pendant `GRAB_IMMUNE` s.
 * Un soldat avalé par une bulle (`capturedBy`) ou gelé (`frozen`) en est sorti aussi, tant que dure l'état puis encore `RELEASE_OUT` s (`Squad.isOut`).
 */
export const GRAB_OUT = 1.5;
/** Soldat libéré d'une bulle ou d'un glaçon : encore hors du mouvement de foule pendant ce délai (s). */
export const RELEASE_OUT = 1;

/** Zone de réanimation (coop) : rayon (px) et temps (s) qu'un équipier doit y passer pour ramener un joueur mort. */
export const REVIVE_RADIUS = 80;
export const REVIVE_TIME = 2;
/** Invincibilité (s, les soldats clignotent) d'un joueur qui vient d'être réanimé par un équipier. */
export const REVIVE_INVULN = 3;
export const GRAB_IMMUNE = 2;
/**
 * Soldat isolé (tiré par une langue, emmené par une bulle, repoussé…) : au-delà de `radius + DETACH_EXTRA` px de la squad il sort du mouvement
 * de foule (ni centre, ni slots, ni laisse : il ne tire plus la squad vers lui), et n'y revient qu'en dessous de `radius + REJOIN_EXTRA` px.
 */
export const DETACH_EXTRA = 200;
export const REJOIN_EXTRA = 70;
/** Ralentissement de l'unité qui vient d'être grabée : facteur de vitesse et durée (s) depuis le grab. */
export const GRAB_SLOW = 0.55;
export const GRAB_SLOW_TIME = 1.2;

/** Mêlée des aliens : ils frappent un soldat quand l'écart entre leurs deux cercles (bords) est sous cette distance (px ; 4 avant le 07/10). */
export const MELEE_REACH = 10;
/**
 * Gel d'un soldat (boucle du slime de glace, nuage de glace du chaman) : il est pris dans la glace avec `hp` PV de gel. Chaque coup
 * d'un allié (balle, rayon, explosion, quelle que soit sa puissance) en retire 1 ; à 0 il est libéré. Les `invuln` premières secondes,
 * les coups alliés ne comptent pas (on voit la glace se former). Le soldat gelé ne bouge ni ne tire, et reste attaquable par les aliens.
 */
export const FREEZE = { hp: 50, invuln: 0.5 };
/** Alien qui sort du sol : immobile ce temps (s) (view/UnitViews.ts : EMERGE_OPEN + EMERGE_POP). */
export const ALIEN_SPAWN_HOLD = 0.7;
/**
 * Unités enterrées (`Horde.burial`) : pendant les animations (s'enterrer, se déterrer) elles prennent 100 % des dégâts. SEMI-ENTERRÉES (lurker
 * en embuscade : généralement immobiles) : `semiDmg` des dégâts, seul le haut du sprite dépasse du sol (`semiShow`, part en partant du haut).
 * TOTALEMENT ENTERRÉES (Scarab qui se déplace sous terre) : intouchables, invisibles, et les soldats ne les visent pas.
 */
export const BURIED = { semiDmg: 0.5, semiShow: 0.3 };
/**
 * Recyclage des traînards (méthode Vampire Survivors, `Horde.relocateStragglers`) : un alien resté plus de `after` s à plus de `far` px
 * de toutes les squads est retiré et réapparaît hors écran DEVANT la squad la plus proche (à `distance` px, dans sa direction de course
 * ± `cone` rad ; squad plus lente que `minSpeed` px/s : direction au hasard), avec ses PV. Fuir ne laisse plus une horde s'accumuler
 * derrière soi : on finit par foncer dedans. Jamais un boss ni un alien occupé (bulle avec prisonnier, chaman qui incante, lurker enterré).
 */
export const RELOCATE = { far: 1000, after: 5, distance: 850, cone: 0.9, minSpeed: 50, sink: 0.6, flankChance: 0.25, flankFor: 10 };
// `sink` : durée (s) pendant laquelle l'alien s'arrête et s'enterre (trou, il s'enfonce) avant d'être déplacé ; il ressort ensuite de son trou
// d'apparition habituel (nouvel alien : animation d'apparition de vague).
// `flankChance` : part des traînards qui, au lieu de s'enterrer, passent en MODE CONTOURNEMENT (`CHASE`) pour encercler la squad ; ils sont
// épargnés par le recyclage pendant `flankFor` s, puis, s'ils sont toujours loin, retirent au sort.
/**
 * Mode contournement (`AlienState.flank` ≠ 0, tiré au sort parmi les traînards : `RELOCATE.flankChance`) : au lieu de foncer sur la position
 * actuelle de sa cible, l'alien vise le premier point de la course PRÉVUE de la squad (vitesse et virage actuels, `Squad.vel` / `Squad.turn`)
 * qu'il peut atteindre à temps, décalé sur son flanc : il coupe la route du joueur qui tourne en rond et l'encercle (`Horde.chaseDir`).
 */
export const CHASE = {
  /** Horizon de prévision de la course de la squad (s). */
  horizon: 6,
  /** Pas de recherche du point d'interception (s). */
  step: 0.25,
  /** Virage pris en compte au plus (rad/s) : au-delà, la squad zigzague, la prévision n'a plus de sens. */
  maxTurn: 1.2,
  /** Décalage latéral maximal (px) par rapport à la course de la squad. */
  flank: 280,
  /** Le décalage s'efface en approchant : nul à `flankNear` px de la cible, entier à `flankNear + flankFade`. */
  flankNear: 120,
  flankFade: 650,
  /** Squad plus lente (px/s) : poursuite directe. */
  minSpeed: 50,
};
/** Une bulle qui digère un soldat est « super vulnérable » : dégâts reçus multipliés (3 → 3,6 le 07/10 : +20 %). */
export const CAPTIVE_VULN = 3.6;
/**
 * Montée de niveau : onde de choc qui repousse les aliens. `radius` : portée (px) ; `reach` : temps (s) que le front met à
 * l'atteindre (même courbe Cubic.Out que l'anneau affiché) ; chaque alien est repoussé quand le front le touche, à `speed` px/s
 * (au centre, moins au bord) pendant `duration` s. Déplacement direct : les aliens lourds sont repoussés comme les légers.
 */
export const UPGRADE_REPEL = { radius: 640, speed: 460, duration: 0.9, reach: 0.6 };
/** Tous les `PRISM_LEVEL_EVERY` niveaux (10, 20, 30…), les 3 upgrades proposées sont prismatiques ; une relance les retire au sort (`DIFFICULTY.prismChance`). */
export const PRISM_LEVEL_EVERY = 10;
/** Montée de niveau : le jeu se met en pause et chaque joueur a ce temps (s) pour choisir son upgrade ; sinon, choix au hasard. */
export const UPGRADE_CHOICE_TIME = 5;
/** Montée de niveau : délai (s) de jeu normal entre la montée (onde de choc, texte « LEVEL UP! ») et la pause qui ouvre l'écran des cartes. */
export const LEVEL_UP_DELAY = 0.75;
/** Renforts express : plus proposés quand la squad dépasse déjà sa taille max d'au moins ce nombre de soldats (15/12 → plus de carte). */
export const REINFORCE_MAX_OVERCAP = 3;
/** Les `FREE_GAMES` premières parties jouées sont sans pub interstitielle : elle précède chaque partie à partir de la suivante (la 4e). Compteur des parties lancées, mémorisé d'une session à l'autre (`gamesPlayed`). */
export const FREE_GAMES = 3;
/** Interrupteur des interstitielles entre deux parties : FAUX pour le moment (seule la pub récompensée du revive est active). Remettre à `true` pour appliquer la règle `FREE_GAMES`. */
export const INTERSTITIALS_ENABLED = false;
/**
 * Recrues : durée de vie au sol (s). À l'apparition, elle fait un saut en cloche (`hopTime` s, `hopHeight` px de haut dans l'affichage)
 * vers la squad du tueur : distance tirée dans `hopDist` (px, sans dépasser la squad), direction écartée au hasard de ± `hopSpread` rad.
 */
export const RECRUIT = { life: 18, hopTime: 0.55, hopDist: [110, 154] as [number, number], hopSpread: 0.5, hopHeight: 70 };
/**
 * Ramassage des recrues et des power-ups : rayon de ramassage (px) et vitesse max (px/s) d'un objet attiré, multipliés par la stat
 * `magnet` de la squad (upgrade). `magnetRadius` (px) est le rayon d'attraction de base de TOUS les objets au sol, globes d'XP
 * compris (`Xp.ts`), lui aussi multiplié par `magnet`.
 */
export const PICKUP = { magnetRadius: 110, pickRadius: 34, maxSpeed: 1400, caughtLife: 8, pullStart: 250, pullAccel: 2600 };
// `pullStart` / `pullAccel` : un objet attrapé part à `pullStart` px/s vers son soldat et accélère de `pullAccel` px/s² jusqu'à `maxSpeed`
// (× stat `magnet`) ; il suit la squad qui l'a attrapé sans limite de distance : une squad rapide ne peut plus le distancer (`Pickup.chase`).
// `caughtLife` : durée de vie (s) d'un objet attrapé (attiré ou aspiré), au-dessus de tous les seuils de clignotement ; elle ne décompte plus (`catchItem`).
/** Globes d'XP : durée de vie au sol (s) ; l'affichage s'en sert pour l'animation d'apparition (scale Back.Out sur les `XP_ORB_POP` premières secondes). */
export const XP_ORB_LIFE = 45;
export const XP_ORB_POP = 0.3;

/** Multiplicateur de dégâts d'un coup critique (la chance de critique vient de la stat `crit` de la squad, en %, 0 de base). */
export const CRIT_MUL = 2;

/** Chance de critique maximale (%) : plafond appliqué même avec les upgrades prismatiques (double bonus). */
export const CRIT_MAX = 30;
/** Stimpack : multiplicateurs de vitesse de déplacement (+25 %) et de cadence de tir (+50 %) ; durée : `DIFFICULTY.stimTime`. */
export const STIM_SPEED = 1.25;
export const STIM_FIRE = 1.5;
/** Power-ups : durée de vie au sol (s) ; fréquence, premier et nombre max : `DIFFICULTY.powerup*`. */
export const POWERUP_LIFE = 12;

/**
 * Difficulté : TOUS les réglages d'équilibrage globaux (les stats propres à chaque unité sont dans `data/aliens.ts` / `data/classes.ts`, panneau
 * Stats ; le contenu des vagues dans `data/waves.ts`, Gestionnaire de vagues). VALEURS MODIFIABLES : le panneau Difficulté (bouton tête de mort
 * du HUD en dev) les change en direct ; `DIFFICULTY_DEFAULTS` est la référence (Save l'y écrit). Les PV sont fixés à l'apparition (les unités
 * déjà là ne changent pas). Seul l'hôte / le solo simule : en ligne, ce sont les réglages de l'hôte qui comptent.
 */
export const DIFFICULTY_DEFAULTS = {
  // ---- aliens
  /** PV des aliens (hors boss). */
  alienHpMul: 1.5,
  /** Dégâts infligés aux soldats par les aliens (mêlée, projectiles, capacités, flaques, stalactites…) ; les coups « un coup = un mort » restent mortels. */
  alienDamageMul: 1,
  /** Vitesse de déplacement des aliens (boss compris). */
  alienSpeedMul: 1.25,
  /** Nombre d'aliens des vagues et plafond d'aliens à l'apparition. */
  alienCountMul: 1.5,
  // ---- boss
  /** PV des boss (mini et final) : +1000 % = ×11. */
  bossHpMul: 11,
  /**
   * Escalade : chaque boss ou mini-boss tué rend TOUS les aliens qui apparaissent ensuite plus forts de cette part (0,1 = +10 % de PV, de vitesse,
   * de dégâts et de cadence d'attaque, cumulés : ×1,1 par boss tué, `Sim.escalation`). Les aliens déjà là ne changent pas ; remis à zéro à la relance.
   */
  bossEscalation: 0.1,
  /**
   * Coffre laissé par chaque boss tué (sauf le final) : un soldat doit rester à moins de `chestRadius` px pendant `chestTime` s pour l'ouvrir ;
   * il libère alors `chestOrbs` globes d'upgrade aléatoire PAR JOUEUR vivant (réservés à leur joueur, entier).
   */
  chestTime: 2, // 3 avant le 08/10
  chestRadius: 100,
  chestOrbs: 2,
  /** Un globe d'upgrade est imprenable (ni attiré ni ramassé) pendant ce temps (s) après sa sortie du coffre : on le voit retomber avant de pouvoir le prendre. */
  chestOrbGrace: 1,
  /** Boss enragé : un niveau d'enragement toutes les `bossEnrageEvery` s après son apparition, SANS FIN (flammes plus denses dès le niveau 2). */
  bossEnrageEvery: 45,
  /** Par niveau d'enragement (cumulés) : + vitesse de déplacement, + cadence d'attaque, − cooldown des capacités (gain plafonné à ×10). */
  bossEnrageSpeed: 0.3,
  bossEnrageAttack: 0.3,
  bossEnrageCooldownCut: 0.3,
  // ---- zombies (aliens ressuscités par un chaman)
  /** Exemplaires ressuscités par incantation (entier). */
  zombieCopies: 2,
  /** PV, dégâts, vitesse de déplacement et cadence d'attaque d'un zombie par rapport à la version de base. */
  zombieHpMul: 3,
  zombieDmgMul: 1,
  zombieSpeedMul: 1.35,
  zombieAttackMul: 3,
  // ---- squad (stats de base de toute squad avant upgrade, tutoriel compris)
  /** PV max des soldats (ancien 0,7 × 1,3 de base de squad, fusionnés le 08/10). */
  soldierHpMul: 0.91,
  squadDamage: 1.2,
  squadFireRate: 1.15,
  squadSpeed: 1.08,
  /** Chance de recrue (stat `recruit`). */
  squadRecruit: 1.3,
  // ---- multijoueur
  /** Chaque joueur vivant en plus ajoute cette part du nombre d'aliens d'une vague et des PV des boss (0,75 = +75 %). */
  extraPlayerAliens: 0.75,
  /** Plafond d'aliens à l'apparition par joueur vivant (× `alienCountMul`, survie). */
  maxAliensPerPlayer: 100,
  // ---- vagues (`WaveRunner`)
  /** La timeline se met en pause au-delà de `wavePauseAbove` aliens vivants et reprend à `waveResumeAt` (entiers). */
  wavePauseAbove: 150,
  waveResumeAt: 100,
  /** Pendant un combat de boss : nombre de derniers envois d'avant le boss rejoués en boucle (entier ; aliens sans XP). */
  bossReplayCount: 5,
  /** Effectif des vagues rejouées pendant un combat de boss (× celui de leur colonne « Effectif × » dans la timeline ; 0,8 = −20 %). */
  bossReplayMul: 0.8,
  // ---- aides au joueur
  /** Power-ups : premier à `powerupFirst` s, puis un toutes les `powerupEveryMin`-`powerupEveryMax` s, `powerupMax` au sol au plus (entier). */
  powerupFirst: 20,
  powerupEveryMin: 10.6, // fréquence +10 % le 09/10 (ajout du power-up Relance ; 11,7 et 18,3 avant)
  powerupEveryMax: 16.6,
  powerupMax: 3,
  /** Roquettes du power-up sans aucune cible : elles filent droit dans une direction au hasard sur cette distance (px) avant d'exploser, au lieu d'exploser tout près de la squad. */
  rocketIdleRange: 1000,
  /** Durée du stimpack (s). */
  stimTime: 6.5,
  /** Revive (solo) : part de l'effectif maximal de la partie avec laquelle la squad réapparaît (minimum 1 soldat). */
  reviveSquadFraction: 0.6,
  /** Coop : taille de l'escouade d'un joueur réanimé, en part de l'effectif maximal de l'équipier qui l'a ramené. */
  coopReviveRatio: 0.6,
  /** Relances des propositions d'upgrade par partie et par joueur (entier). */
  rerolls: 2,
  /** Chance qu'une upgrade proposée soit prismatique (bonus doublé). */
  prismChance: 0.05,
};
export type DifficultyKey = keyof typeof DIFFICULTY_DEFAULTS;
export const DIFFICULTY: Record<DifficultyKey, number> = { ...DIFFICULTY_DEFAULTS };

/**
 * Réglages du mouvement de foule (voir sim/Squad.ts). VALEURS MODIFIABLES : le panneau Foule
 * (touche ² / F2, sliders) les change en direct ; `CROWD_DEFAULTS` est la référence de départ.
 * Seul l'hôte / le solo simule : en ligne, ce sont les réglages de l'hôte qui comptent.
 *
 * Défauts « réactifs » (mesurés avec `node scripts/crowd-headless.mjs`) : 0,23 s pour atteindre 90 % de la vitesse
 * et 0,23 s pour se reformer à l'arrêt. Anciens réglages : gainMin 4, gainSpread 2, velDamp 10, maxSpeedMul 1.6 (0,43 s / 0,5 s).
 */
export const CROWD_DEFAULTS = {
  /** Vitesse de l'ancre = vitesse max de la squad (px/s). */
  speed: 210,
  /** Distance entre voisins dans la formation (px). */
  spacing: 39,
  /** L'ancre ne s'éloigne jamais plus que ça du coeur de la squad (px) : plus grand = la squad « tire » plus loin devant. */
  leash: 70,
  /** Laisse en plus par √(nombre de soldats). */
  leashPerRoot: 6,
  /** Réactivité individuelle minimale : vitesse voulue = écart au slot × gain (1/s). */
  gainMin: 8,
  /** Écart aléatoire de réactivité entre soldats (0 = tous identiques = formation rigide). */
  gainSpread: 6,
  /** Vivacité de la vitesse vers la vitesse voulue (1/s) : plus grand = accélère / freine plus sec. */
  velDamp: 30,
  /** Vitesse max d'un soldat qui rattrape son slot, en multiple de `speed`. */
  maxSpeedMul: 1.35,
  /** Force de la séparation entre soldats (0 = ils se traversent, 1 = repoussés d'un coup). */
  separation: 0.5,
  /** Amortissement du knockback (1/s). */
  knockDamp: 5,
  /** Décor : largeur (px) de la zone douce autour des hitbox où les unités glissent au lieu de buter (0 = hitbox dure seule). */
  wallMargin: 22,
  /** Décor : vitesse (px/s) qui écarte doucement de la hitbox, maximale au contact. */
  wallPush: 50,
  /** Décor : part de la vitesse « dans le mur » convertie en glissade le long du bord (0 = elle s'annule, 1 = tout glisse). */
  wallNudge: 1.5,
  /** Temps à l'arrêt avant que le Medic soigne (s). 0 = il soigne dès que la squad s'arrête (ancienne valeur : 0,5). */
  stillDelay: 0,
};

export type CrowdKey = keyof typeof CROWD_DEFAULTS;
export const CROWD: Record<CrowdKey, number> = { ...CROWD_DEFAULTS };

/** Réglages visuels ajustables depuis le menu Réglages (dev). Ne touche pas à la simulation. */
export const VISUAL_DEFAULTS = {
  /** Échelle d'affichage de la texture de sol (1024 px × échelle). Plus petit = motif plus petit et plus répété. */
  groundScale: 0.73,
  /** Opacité des taches sombres (0 → 1). */
  stainAlpha: 0.6,
};

export type VisualKey = keyof typeof VISUAL_DEFAULTS;
export const VISUAL: Record<VisualKey, number> = { ...VISUAL_DEFAULTS };

/** Profondeurs : sol < ombres/anneaux < acteurs (triés par y) < barres de vie. */
export const DEPTH = {
  ground: 0,
  groundFx: 1,
  actors: 10,
  fx: 50_000,
  bars: 60_000,
} as const;

/** Fond (RGB 0, 125, 125) de toutes les vues de dev : visionneuses, éditeurs de vagues et de carte. */
export const VIEW_BG = 0x007d7d;

/** Un globe d'XP clignote pendant ses dernières secondes de vie (l'hôte l'indique aux clients dans le snapshot). */
export const ORB_BLINK_TIME = 5;

/** Opacité de l'ombre portée sous les soldats et les aliens (jeu et visionneuse d'unités). */
export const SHADOW_ALPHA = 0.8;

export const PALETTE = {
  bgDark: 0x1b2a1f,
  panel: 0x13233a,
  panelBorder: 0x3fb6e8,
  primary: 0xffc83d,
  rewarded: 0x7a5cff,
  allyRing: 0x39c6ff,
  hpAlly: 0x5ee05e,
  hpEnemy: 0xe84a4a,
  /** Barre de bouclier (celui du Scarab : les soldats n'en ont plus) : grise, au-dessus de la barre de PV et dans la barre de boss du HUD. */
  shield: 0xa8aeb8,
  hpBack: 0x1a1a24,
  text: '#ffffff',
  textDim: '#a9c3dd',
  outline: '#2a1d2e',
} as const;

/**
 * Couleur des joueurs (multi) : un emplacement (`Squad.slot`, attribué par l'hôte et le même chez tous) = une couleur d'anneau, de barre de
 * vie et de capsule, et un décalage de teinte (degrés) des bleus du soldat (`art/playerVariants.ts`). L'emplacement 0 est le bleu d'origine.
 */
export const PLAYER_COLORS = [0x39c6ff, 0xff5a5a, 0xffb938, 0x7dff9a, 0xc77dff, 0xff7ad9, 0x3de0c0, 0xff8a3a, 0x9aa0ff] as const;
export const PLAYER_HUE_SHIFT = [0, 150, 195, -70, 75, 115, -37, 180, 30] as const;

export const SCENES = {
  boot: 'Boot',
  game: 'Game',
  levelUp: 'LevelUp',
  hud: 'Hud',
  pause: 'Pause',
  options: 'Options',
  viewer: 'Viewer',
  obstacles: 'Obstacles',
  particles: 'Particles',
  misc: 'Misc',
  bonus: 'Bonus',
  upgrades: 'Upgrades',
  waves: 'Waves',
  mapEditor: 'MapEditor',
  gameOver: 'GameOver',
} as const;
