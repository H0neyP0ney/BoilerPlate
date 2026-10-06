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
 * Difficulté globale (multiplicateurs appliqués par sim/) : PV des soldats, PV des aliens et des boss, nombre d'aliens par vague (et plafond
 * d'aliens simultanés, sinon le doublement serait bridé), vitesse des aliens. Les boss ne sont pas multipliés en nombre (mais leurs PV le sont, voir `bossHpMul`).
 */
/**
 * Grab (langue) : l'unité tirée garde sa liberté de mouvement (aucun stun). Pendant `GRAB_OUT` s elle ne compte plus pour le
 * mouvement de foule (centre, slots, laisse) ; elle reste immunisée contre tout autre grab pendant `GRAB_IMMUNE` s.
 */
export const GRAB_OUT = 0.7;

/** Zone de réanimation (coop) : rayon (px) et temps (s) qu'un équipier doit y passer pour ramener un joueur mort. */
export const REVIVE_RADIUS = 80;
export const REVIVE_TIME = 2;
/** Taille de l'escouade d'un joueur réanimé, en part de celle de l'équipier qui l'a ramené. */
export const REVIVE_SQUAD_RATIO = 0.6;
/** Invincibilité (s, les soldats clignotent) d'un joueur qui vient d'être réanimé par un équipier. */
export const REVIVE_INVULN = 3;
/** Revive (solo) : part de l'effectif maximal atteint dans la partie avec laquelle la squad réapparaît (minimum 1 soldat). */
export const REVIVE_SQUAD_FRACTION = 0.6;
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

/** Zombie (alien ressuscité par un chaman) : multiplicateur de PV par rapport à la version de base. */
export const ZOMBIE_MUL = 3;
/** Zombie : multiplicateur de dégâts (1 = pas de bonus : sa force vient de sa cadence d'attaque). */
export const ZOMBIE_DMG_MUL = 1;
/** Nombre d'exemplaires ressuscités par une incantation du chaman. */
export const ZOMBIE_COPIES = 5;
/** Enragé (zombie) : multiplicateurs de vitesse de déplacement et de cadence d'attaque. */
export const ENRAGED_SPEED = 1.35;
export const ENRAGED_ATTACK = 3;
/** Alien qui sort du sol : immobile ce temps (s) (view/UnitViews.ts : EMERGE_OPEN + EMERGE_POP). */
export const ALIEN_SPAWN_HOLD = 0.7;
/** Stats de base de toute squad (partie normale comme tutoriel) avant toute upgrade : dégâts +20 %, cadence +15 %, PV +30 %, vitesse +8 %, recrues +30 %. */
export const SQUAD_BASE = { damage: 1.2, fireRate: 1.15, hp: 1.3, speed: 1.08, recruit: 1.3 } as const;
/**
 * Boss enragé : un niveau d'enragement toutes les `every` s après son apparition, SANS FIN (30 s, 1:00, 1:30, 2:00…) ; chaque niveau ajoute
 * +30 % de vitesse de déplacement et d'attaque et −30 % de cooldown des capacités spéciales (cumulés ; le gain de cooldown plafonne à ×10).
 * Les flammes d'enragé sont plus denses à partir du niveau 2.
 */
export const BOSS_ENRAGE = { every: 45, speed: 0.3, attack: 0.3, cooldownCut: 0.3 } as const; // 45 s (était 60)
/**
 * Escalade : chaque boss ou mini-boss tué rend TOUS les aliens qui apparaissent ensuite plus forts de cette part (+10 % de PV, de vitesse, de dégâts et de
 * cadence d'attaque, cumulés : ×1,1 par boss tué, `Sim.escalation`). Les aliens déjà là ne changent pas ; remis à zéro à la relance de la partie.
 */
export const BOSS_ESCALATION = 0.1;
/** Une bulle qui digère un soldat est « super vulnérable » : dégâts reçus multipliés. */
export const CAPTIVE_VULN = 3;
/**
 * Montée de niveau : onde de choc qui repousse les aliens. `radius` : portée (px) ; `reach` : temps (s) que le front met à
 * l'atteindre (même courbe Cubic.Out que l'anneau affiché) ; chaque alien est repoussé quand le front le touche, à `speed` px/s
 * (au centre, moins au bord) pendant `duration` s. Déplacement direct : les aliens lourds sont repoussés comme les légers.
 */
export const UPGRADE_REPEL = { radius: 640, speed: 460, duration: 0.9, reach: 0.6 };
/** Chance qu'une upgrade proposée soit prismatique (bonus doublé). */
export const PRISM_CHANCE = 0.05;
/** Montée de niveau : le jeu se met en pause et chaque joueur a ce temps (s) pour choisir son upgrade ; sinon, choix au hasard. */
export const UPGRADE_CHOICE_TIME = 5;
/** Montée de niveau : délai (s) de jeu normal entre la montée (onde de choc, texte « LEVEL UP! ») et la pause qui ouvre l'écran des cartes. */
export const LEVEL_UP_DELAY = 0.75;
/** Renforts express : plus proposés quand la squad dépasse déjà sa taille max d'au moins ce nombre de soldats (15/12 → plus de carte). */
export const REINFORCE_MAX_OVERCAP = 3;
/** Relances des propositions d'upgrade par partie et par joueur (le temps du choix en ligne ne repart pas). */
export const REROLLS_PER_RUN = 2;
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
export const PICKUP = { magnetRadius: 110, pickRadius: 34, maxSpeed: 1400 };
/** Globes d'XP : durée de vie au sol (s) ; l'affichage s'en sert pour l'animation d'apparition (scale Back.Out sur les `XP_ORB_POP` premières secondes). */
export const XP_ORB_LIFE = 45;
export const XP_ORB_POP = 0.3;

/** Multiplicateur de dégâts d'un coup critique (la chance de critique vient de la stat `crit` de la squad, en %, 0 de base). */
export const CRIT_MUL = 2;

/** Chance de critique maximale (%) : plafond appliqué même avec les upgrades prismatiques (double bonus). */
export const CRIT_MAX = 30;
/** Power-ups : délai entre deux apparitions (s), durée de vie au sol (s), nombre max simultané. */
/** Stimpack : multiplicateurs de vitesse de déplacement (+25 %) et de cadence de tir (+50 %). */
/** Stimpack : durée (s) ; facteurs de vitesse de déplacement et de cadence ci-dessous. Aussi activé par les renforts express. */
export const STIM_TIME = 6.5;
export const STIM_SPEED = 1.25;
export const STIM_FIRE = 1.5;
export const POWERUPS = { every: [11.7, 18.3], life: 12, max: 3, first: 20 } as const;

/** Coop : chaque joueur vivant en plus ajoute cette part du nombre d'aliens d'une vague (0,75 = +75 %). */
export const EXTRA_PLAYER_ALIENS = 0.75;

export const DIFFICULTY = {
  soldierHpMul: 0.7,
  alienHpMul: 1.5,
  /** PV des boss (mini et final) : +1000 % = ×11. */
  bossHpMul: 11,
  alienCountMul: 1.5,
  alienSpeedMul: 1.25,
} as const;

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
  /** Barre de bouclier (soldats avec le power-up, Scarab) : bleue, au-dessus de la barre de PV. */
  shield: 0x4aa8ff,
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
