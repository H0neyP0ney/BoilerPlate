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
export const REVIVE_RADIUS = 96;
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
/** Vague en embuscade (chance : `DIFFICULTY.ambushChance`) : le groupe sort du sol à `ahead` px DEVANT la squad (dans son sens de course ; direction au hasard si elle est immobile), dispersé de ±`spread` px, avec l'animation d'apparition habituelle. */
export const AMBUSH = { ahead: 330, spread: 60 };
/** Vague en cercle (chance : `DIFFICULTY.ringChance`) : tous les aliens de la vague sortent du sol en CERCLE autour de la squad d'UN joueur, à `radius` px de son centre (juste hors écran), avec l'animation d'apparition habituelle (`Horde.spawnRing`, la même fonction que la dernière vague du tutoriel). */
export const RING = { radius: 340 };

/**
 * Coffre à diamants des boss (solo, `sim/Gems.ts`) : posé `offsetY` px au-dessus de l'œuf ; rester à moins de `radius` px d'un soldat pendant `chargeTime` s remplit
 * sa jauge (elle redescend `decay` fois plus vite quand la squad s'éloigne), pleine = vidéo récompensée, puis il explose en `burst` diamants. En plus, `free` diamants
 * retombent tout de suite autour du coffre, ramassables sans vidéo. Un diamant au sol disparaît après `life` s (il clignote pendant les `blink` dernières secondes ;
 * attrapé par l'aimant, il ne disparaît plus). `cooldown` : pause (s) après une vidéo ratée / refusée.
 */
/**
 * Pièces d'or (solo, `sim/Gems.ts`) : lâchées par les aliens comme les globes d'XP (jamais par un alien sans XP : invoqué, rejeu de vague, œuf, orbe). `chance` par alien (0,3 : doublé le 17/10)
 * (`strongChance` si ses PV max atteignent `strongHp`), `bossCoins` pièces pour un boss ; elles disparaissent après `life` s (clignotent les `blink` dernières).
 */
/**
 * Boîte de power-up (`powerup_box`, 200 PV, `data/aliens.ts`). Les power-ups n'apparaissent plus à nu : le minuteur existant (`DIFFICULTY.powerupEvery…`) pose une boîte dont on
 * ignore le contenu. Elle descend du ciel en parachute (de `height` px, en `fall` s : elle grossit, son ombre marque l'endroit d'atterrissage, le parachute se replie à
 * l'atterrissage) et n'est destructible qu'une fois au sol ; casser la boîte fait SAUTER le power-up sur place. Une boîte restée à plus de `farDist` px de toutes les squads disparaît.
 */
export const CRATES = { fall: 0.9, height: 260, farDist: 1800 };

export const COINS = { chance: 0.3, strongHp: 200, strongChance: 1, bossCoins: 30, life: 14, blink: 5 };

export const GEM_CHEST = { offsetY: 130, radius: 120, chargeTime: 2, decay: 2, burst: [20, 25] as [number, number], free: [1, 5] as [number, number], cooldown: 4, grace: 0.6, life: 10, blink: 3 };
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
/** Montée de niveau : le jeu se met en pause et chaque joueur a ce temps (s) pour choisir son upgrade ; sinon, choix au hasard. */
export const UPGRADE_CHOICE_TIME = 5;
/** Montée de niveau : délai (s) de jeu normal entre la montée (onde de choc, texte « LEVEL UP! ») et la pause qui ouvre l'écran des cartes. */
export const LEVEL_UP_DELAY = 0.75;
/** Les `FREE_GAMES` premières parties jouées sont sans pub interstitielle : elle précède chaque partie à partir de la suivante (la 4e). Compteur des parties lancées, mémorisé d'une session à l'autre (`gamesPlayed`). */
export const FREE_GAMES = 3;
/** Interrupteur des interstitielles entre deux parties : FAUX pour le moment (seule la pub récompensée du revive est active). Remettre à `true` pour appliquer la règle `FREE_GAMES`. */
export const INTERSTITIALS_ENABLED = false;
/**
 * Recrues : durée de vie au sol (s). À l'apparition, elle fait un saut en cloche (`hopTime` s, `hopHeight` px de haut dans l'affichage)
 * vers la squad du tueur : distance tirée dans `hopDist` (px, sans dépasser la squad), direction écartée au hasard de ± `hopSpread` rad.
 */
/** Chance qu'un bonus recrue soit une recrue SPÉCIALE (unité débloquée à l'armurerie, tirée à égalité parmi celles du joueur ; rien si aucune n'est débloquée). */
export const SPECIAL_RECRUIT_CHANCE = 0.2;
export const RECRUIT = { life: 18, hopTime: 0.55, hopDist: [110, 154] as [number, number], hopSpread: 0.5, hopHeight: 70 };
/**
 * Ramassage des recrues et des power-ups : rayon de ramassage (px) et vitesse max (px/s) d'un objet attiré, multipliés par la stat
 * `magnet` de la squad (upgrade). `DIFFICULTY.magnetRadius` (px) est le rayon d'attraction de base de TOUS les objets au sol, globes d'XP
 * compris (`Xp.ts`), lui aussi multiplié par `magnet`.
 */
export const PICKUP = { pickRadius: 34, maxSpeed: 1400, caughtLife: 8, pullStart: 250, pullAccel: 2600 };
// `pullStart` / `pullAccel` : un objet attrapé part à `pullStart` px/s vers son soldat et accélère de `pullAccel` px/s² jusqu'à `maxSpeed`
// (× stat `magnet`) ; il suit la squad qui l'a attrapé sans limite de distance : une squad rapide ne peut plus le distancer (`Pickup.chase`).
// `caughtLife` : durée de vie (s) d'un objet attrapé (attiré ou aspiré), au-dessus de tous les seuils de clignotement ; elle ne décompte plus (`catchItem`).
/** Globes d'XP : durée de vie au sol (s) ; l'affichage s'en sert pour l'animation d'apparition (scale Back.Out sur les `XP_ORB_POP` premières secondes). */
export const XP_ORB_LIFE = 45;
export const XP_ORB_POP = 0.3;
/**
 * Globes d'XP lâchés par un alien : ils sont expulsés dans le sens du tir qui l'a tué (à défaut : à l'opposé de la squad du tueur) et glissent
 * en freinant. `speed` = vitesse de départ (px/s, × un tirage entre `speedJitter[0]` et `[1]`), `spread` = écart d'angle max autour de la
 * direction (radians), `friction` = freinage (1/s : distance parcourue ≈ speed / friction). Un globe attrapé par un soldat arrête de glisser.
 * `hopHeight` / `hopTime` : saut en cloche à la sortie (affichage seulement, `WorldView.syncOrbs`) : hauteur max (px) et durée (s).
 */
export const XP_SLIDE = { speed: 600, speedJitter: [0.55, 1.15] as const, spread: 0.7, friction: 7, hopHeight: 30, hopTime: 0.45 };

/** Multiplicateur de dégâts d'un coup critique (la chance de critique vient de la stat `crit` de la squad, en %, 0 de base) : ×3 depuis le 12/10 (×2 avant : une prise de Critique rapportait ~3 fois moins qu'une prise de Damage ; ×3 → +10 % de dégâts moyens par prise de 5 points de chance, ×1,5 à 5 prises, proche de Damage). */
export const CRIT_MUL = 2.5; // 3 le 12/10 puis 2,5 (×2 à l'origine)

/** Chance de critique maximale (%) : plafond appliqué même avec les upgrades prismatiques (double bonus). */
export const CRIT_MAX = 100; // plus de plafond depuis le 12/10 (100 % = limite naturelle : tout tir est déjà critique) ; 30 puis 40 avant
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
  // ---- boss
  /**
   * Escalade : chaque boss ou mini-boss tué rend TOUS les aliens qui apparaissent ensuite plus forts, chaque stat avec son propre gain
   * (0,15 = +15 % par boss tué, cumulés : ×1,15 puis ×1,3225…, `Sim.escalation*`). Les aliens déjà là ne changent pas ; remis à zéro à la relance.
   */
  bossEscalationHp: 0.15,
  /** Escalade des dégâts (contact, tirs, flammes, explosions…) par boss ou mini-boss tué. */
  bossEscalationDamage: 0.15,
  /** Escalade de la cadence d'attaque (cooldowns écoulés plus vite) par boss ou mini-boss tué. */
  bossEscalationRate: 0.15,
  /** Escalade de la vitesse de déplacement par boss ou mini-boss tué. */
  bossEscalationSpeed: 0.07,
  /**
   * Niveaux de difficulté (14/10), `expert` et `impossible` (en normal : ×1). Deux multiplicateurs par niveau : `…BaseMul` agit sur les stats de BASE de tous les aliens (PV, dégâts, cadence
   * d'attaque, vitesse ; ni XP ni recrues) ; `…ScaleMul` agit sur les stats qui GRANDISSENT avec les boss tués : il multiplie chaque gain d'escalade ci-dessus
   * (1,1 : +15 % par boss devient +16,5 %). Voir `Sim.escalation*`.
   */
  expertBaseMul: 1.1,
  expertScaleMul: 1.1,
  impossibleBaseMul: 1.2,
  impossibleScaleMul: 1.2,
  /**
   * Œuf laissé par chaque boss tué (sauf le final, `boss_egg` : 1000 PV, à détruire) : il libère alors `chestOrbs` globes d'upgrade aléatoire
   * PAR JOUEUR vivant (réservés à leur joueur, entier).
   */
  chestOrbs: 2,
  /** Un globe d'upgrade est imprenable (ni attiré ni ramassé) pendant ce temps (s) après sa sortie du coffre : on le voit retomber avant de pouvoir le prendre. */
  chestOrbGrace: 1,
  /** Boss enragé : un niveau d'enragement toutes les `bossEnrageEvery` s après son apparition, SANS FIN (flammes plus denses dès le niveau 2). */
  bossEnrageEvery: 40,
  /** Par niveau d'enragement (cumulés) : + vitesse de déplacement, + cadence d'attaque, − cooldown des capacités (gain plafonné à ×10). */
  bossEnrageSpeed: 0.3,
  bossEnrageAttack: 0.3,
  bossEnrageCooldownCut: 0.3,
  // ---- multijoueur
  /** Chaque joueur vivant en plus ajoute cette part du nombre d'aliens d'une vague et des PV des boss (0,75 = +75 %). */
  extraPlayerAliens: 0.75,
  /** Plafond d'aliens à l'apparition par joueur vivant (survie). */
  maxAliensPerPlayer: 150, // 100 × 1,5 (l'ancien `alienCountMul` est intégré aux effectifs des vagues et à ce plafond, 09/10)
  // ---- vagues (`WaveRunner`)
  /** Chance qu'une vague (hors boss et configurations forcées ; les vagues rejouées pendant un boss comprises) soit une embuscade : ses aliens sortent du sol juste devant la squad (`AMBUSH`, `Horde.spawnAhead`). 0 = jamais. */
  ambushChance: 0.1,
  /** Chance qu'une vague (hors boss, configurations forcées et tutoriel ; les vagues rejouées pendant un combat de boss peuvent aussi sortir en cercle) sorte du sol en cercle autour de la squad d'UN joueur tiré au hasard (`RING`, `Horde.spawnRing`). Prioritaire sur l'embuscade. 0 = jamais. */
  ringChance: 0.1,
  /** Mélange des vagues (`WaveRunner.trigger`) : une vague tirée au hasard (jamais un boss ni une configuration forcée) reçoit un groupe « invité » d'un niveau voisin (L−1 ou L+1). Chance de l'invité (1 = toujours, comme avant ; 0 = vagues exactement comme écrites dans le Gestionnaire). */
  waveGuestChance: 1,
  /** Part du groupe invité ajoutée à la vague : nombre du groupe tiré × cette valeur, arrondi, au moins 1. */
  waveGuestShare: 0.4,
  /** Même chance d'invité, mais pour les vagues rejouées pendant un combat de boss (0 = rejeux purs, sans cracheur ni autre alien d'un niveau voisin). */
  waveGuestReplayChance: 1,
  /** La timeline se met en pause au-delà de `wavePauseAbove` aliens vivants et reprend à `waveResumeAt` (entiers). */
  wavePauseAbove: 150,
  waveResumeAt: 100,
  /** Pendant un combat de boss : nombre de derniers envois d'avant le boss rejoués en boucle (entier ; aliens sans XP). */
  bossReplayCount: 4,
  /** Effectif des vagues rejouées pendant le combat de CHAQUE boss (× celui de leur colonne « Effectif × » dans la timeline ; 0,8 = −20 %). Rhinos jumeaux = un seul réglage. */
  bossReplayMulGling: 0.75,
  bossReplayMulRhino: 0.75,
  bossReplayMulScarab: 0.75,
  bossReplayMulTwins: 0.75,
  bossReplayMulCrab: 0.75,
  // ---- aides au joueur
  /** Power-ups : premier à `powerupFirst` s, puis un toutes les `powerupEveryMin`-`powerupEveryMax` s, `powerupMax` au sol au plus (entier). */
  powerupFirst: 20,
  powerupEveryMin: 10, // fréquence +10 % le 09/10 (ajout du power-up Relance ; 11,7 et 18,3 avant)
  powerupEveryMax: 15,
  powerupMax: 3,
  /**
   * Relance (loot rose, pas un power-up) : au NOMBRE D'ALIENS TUÉS (toutes squads, hors invoqués / ressuscités / œufs ; 14/10, avant : au temps, 90 s puis 110 s) : la première
   * après `rerollLootFirst` aliens tués, puis une tous les ~`rerollLootEvery` (± 20 %), sortie de l'alien qui atteint le seuil (comme une recrue) ; elle n'expire jamais.
   * Plus de joueurs = plus d'aliens = plus de relances. Environ 5 par partie de 10 min en solo (~8 aliens tués par seconde).
   */
  rerollLootFirst: 600,
  rerollLootEvery: 800,
  /**
   * Booster prismatique (loot arc-en-ciel, encore plus rare que la relance) : même mécanique, au nombre d'aliens tués : le premier après `prismLootFirst`, puis un tous les
   * ~`prismLootEvery` (± 20 %), sorti de l'alien qui atteint le seuil ; il n'expire jamais. Ramassé : le prochain level-up du joueur propose 3 cartes prismatiques
   * (sauf s'il relance : tirage normal). Environ 3 à 4 par partie de 10 min en solo (seule source de panneaux tout prismatiques).
   */
  prismLootFirst: 900, // 140 s avant le 14/10 (≈ 800-970 aliens tués à 140 s d'après les parties enregistrées)
  prismLootEvery: 1200, // 160 s avant le 14/10
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
  /** Recrues : le taux de drop d'un alien est multiplié par `clamp(recruitMax − (taille de la squad − recruitSizeRef) × recruitSlope, recruitMin, recruitMax)` (petite squad = plus de recrues). */
  recruitMax: 1.8,
  /** Recrues : taille de squad à partir de laquelle le facteur commence à baisser. */
  recruitSizeRef: 4,
  /** Recrues : perte de facteur par soldat au-delà de `recruitSizeRef` (au plus : la pente s'adoucit pour que `recruitMin` ne soit atteint qu'à la taille max de la squad, voir `Recruits.maybeDrop`). */
  recruitSlope: 0.12,
  /** Recrues : plancher du facteur (grosse squad). */
  recruitMin: 0.15, // 0,25 avant le 12/10
  /** Rayon d'attraction de base (px) de TOUS les objets au sol (globes d'XP, recrues, power-ups, globes d'upgrade), avant la stat `magnet` (upgrade). */
  magnetRadius: 110,
  /** Coût d'XP de chaque niveau × cette valeur (courbe `xpToNext`) ; sans effet pendant le tutoriel (le niveau 1 doit rester à 10 XP). */
  xpCostMul: 1,
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
  speed: 226.8, // 210 × 1,08 (l'ancien `squadSpeed` est intégré, 09/10)
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
  /** Caméra : constante de temps du suivi de la squad (s) ; la caméra la rattrape en ~3 × ce temps. 0 = collée à la squad, plus grand = plus doux et plus en retard (0,13 s ≈ l'ancien 0,12 par image à 60 FPS). */
  camFollowTime: 0.13,
  /** Caméra : avance (px) dans le sens de course de la squad quand elle va à sa vitesse normale (0 = la squad reste au centre de l'écran). */
  camLookAhead: 0,
  /** Caméra : temps (s) que met l'avance à s'installer ou à revenir quand la squad change de direction ou s'arrête. */
  camLookTime: 0.5,
  /** Caméra : zone morte (px, rayon autour du centre de l'écran) : la caméra ne bouge pas tant que la squad y reste. 0 = aucune. */
  camDeadzone: 0,
  /** Caméra : vitesse du zoom automatique (dézoome quand la squad grossit) ; plus grand = plus vif. */
  camZoomSpeed: 2,
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
  rewarded: 0xffa21f, // jaune orangé (jamais vert : règle Poki) ; « Play again » est vert
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
  ending: 'Ending',
  pause: 'Pause',
  lobby: 'Lobby',
  multiplayer: 'Multiplayer',
  title: 'Title',
  solo: 'SoloSetup',
  shop: 'Shop',
  armory: 'Armory',
  options: 'Options',
  viewer: 'Viewer',
  obstacles: 'Obstacles',
  particles: 'Particles',
  misc: 'Misc',
  bonus: 'Bonus',
  upgrades: 'Upgrades',
  waves: 'Waves',
  mapEditor: 'MapEditor',
  sounds: 'Sounds',
  packs: 'Packs',
  gameOver: 'GameOver',
} as const;
