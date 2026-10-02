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
export const GRAB_IMMUNE = 2;
/** Ralentissement de l'unité qui vient d'être grabée : facteur de vitesse et durée (s) depuis le grab. */
export const GRAB_SLOW = 0.55;
export const GRAB_SLOW_TIME = 1.2;

/** Zombie (alien ressuscité par un chaman) : multiplicateur de PV et de dégâts par rapport à la version de base. */
export const ZOMBIE_MUL = 3;
/** Enragé (zombie) : multiplicateurs de vitesse de déplacement et de cadence d'attaque. */
export const ENRAGED_SPEED = 1.35;
export const ENRAGED_ATTACK = 1.5;
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
/** Power-ups : délai entre deux apparitions (s), durée de vie au sol (s), nombre max simultané. */
/** Stimpack : multiplicateurs de vitesse de déplacement (+25 %) et de cadence de tir (+50 %). */
export const STIM_SPEED = 1.25;
export const STIM_FIRE = 1.5;
export const POWERUPS = { every: [14, 22], life: 12, max: 3, first: 20 } as const;

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
  gainSpread: 3,
  /** Vivacité de la vitesse vers la vitesse voulue (1/s) : plus grand = accélère / freine plus sec. */
  velDamp: 18,
  /** Vitesse max d'un soldat qui rattrape son slot, en multiple de `speed`. */
  maxSpeedMul: 1.35,
  /** Force de la séparation entre soldats (0 = ils se traversent, 1 = repoussés d'un coup). */
  separation: 0.5,
  /** Amortissement du knockback (1/s). */
  knockDamp: 5,
  /** Décor : largeur (px) de la zone douce autour des hitbox où les unités glissent au lieu de buter (0 = hitbox dure seule). */
  wallMargin: 22,
  /** Décor : vitesse (px/s) qui écarte doucement de la hitbox, maximale au contact. */
  wallPush: 90,
  /** Décor : part de la vitesse « dans le mur » convertie en glissade le long du bord (0 = elle s'annule, 1 = tout glisse). */
  wallNudge: 0.9,
  /** Temps à l'arrêt avant que le Medic soigne (s). */
  stillDelay: 0.5,
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

export const PALETTE = {
  bgDark: 0x1b2a1f,
  panel: 0x13233a,
  panelBorder: 0x3fb6e8,
  primary: 0xffc83d,
  rewarded: 0x7a5cff,
  allyRing: 0x39c6ff,
  hpAlly: 0x5ee05e,
  hpEnemy: 0xe84a4a,
  hpBack: 0x1a1a24,
  text: '#ffffff',
  textDim: '#a9c3dd',
  outline: '#2a1d2e',
} as const;

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
  waves: 'Waves',
  mapEditor: 'MapEditor',
  gameOver: 'GameOver',
} as const;
