/**
 * Obstacles de la carte : visuel (image `obstacle_N`), hitbox de collision en cercles et jeu de taches sombres.
 *
 * Donnée partagée par la simulation (Arena : collisions) et l'affichage (ArenaView : sprite, taches) : même contenu
 * chez tous les joueurs. Hitbox et taches sont relatives au point d'ancrage du sprite (pied de l'obstacle), en pixels
 * du monde (échelle d'affichage déjà appliquée, y vers le bas : un point « sur » le sprite a un y négatif).
 *
 * Taches : chaque obstacle a un jeu de variantes ; le jeu en tire une au hasard (seed de la carte) pour chaque
 * obstacle posé. Une entrée sans `stains` reçoit 4 variantes par défaut, une par image, centrées sur l'emprise.
 *
 * Réglage : visionneuse d'obstacles (bouton en haut à gauche du jeu, dev) puis « Copier le code » → coller ici.
 */
export type ObstacleId = 'obstacle_1' | 'obstacle_2' | 'obstacle_3' | 'obstacle_4' | 'obstacle_5' | 'obstacle_6' | 'obstacle_7' | 'obstacle_8';

export type StainId = 'tache_1' | 'tache_2' | 'tache_3' | 'tache_4';
export const STAIN_IDS: StainId[] = ['tache_1', 'tache_2', 'tache_3', 'tache_4'];

export interface HitCircle {
  /** Centre du cercle, relatif à l'ancrage du sprite (px). */
  x: number;
  y: number;
  /** Rayon (px). */
  r: number;
}

/** Une variante de tache sous un obstacle. */
export interface StainDef {
  tex: StainId;
  /** Centre de la tache, relatif à l'ancrage du sprite (px). */
  x: number;
  y: number;
  /** Largeur affichée (px) ; la hauteur suit le ratio de l'image, multiplié par `sy`. */
  w: number;
  /** Échelle verticale relative à la largeur : 1 = proportions de l'image, < 1 = tache aplatie (vue en perspective). */
  sy: number;
  flip: boolean;
}

export interface ObstacleDef {
  id: ObstacleId;
  /** Échelle d'affichage de l'image. */
  scale: number;
  /** Ancrage dans l'image (fraction) : le point posé sur la carte. */
  originX: number;
  originY: number;
  hitbox: HitCircle[];
  /** Variantes de taches (une est tirée au hasard par obstacle posé ; vide = pas de tache). */
  stains: StainDef[];
}

type RawObstacle = Omit<ObstacleDef, 'stains'> & { stains?: StainDef[] };

const RAW: Record<ObstacleId, RawObstacle> = {
  // flaque de lave cerclée de rochers (200×179)
  obstacle_1: {
    id: 'obstacle_1',
    scale: 0.88,
    originX: 0.5,
    originY: 0.5,
    hitbox: [{ x: 1, y: 0, r: 61 }],
    stains: [
      { tex: 'tache_1', x: 6, y: -1, w: 334.4, sy: 0.85, flip: false },
      { tex: 'tache_2', x: 5.8, y: 0, w: 341.2, sy: 1, flip: false },
      { tex: 'tache_3', x: -6.8, y: -6.8, w: 318.8, sy: 0.89, flip: false },
      { tex: 'tache_4', x: 1, y: 5.8, w: 291.4, sy: 1, flip: false },
    ],
  },
  // gros rocher (161×124)
  obstacle_2: {
    id: 'obstacle_2',
    scale: 0.6,
    originX: 0.5,
    originY: 0.8,
    hitbox: [{ x: 3, y: -19, r: 26 }],
    stains: [
      { tex: 'tache_1', x: 3, y: -19, w: 159, sy: 1, flip: false },
      { tex: 'tache_2', x: 3, y: -20, w: 166, sy: 1, flip: false },
      { tex: 'tache_3', x: 0, y: -22, w: 163, sy: 0.9, flip: false },
      { tex: 'tache_4', x: 3, y: -16, w: 152, sy: 0.88, flip: false },
    ],
  },
  // rocher à cristaux (229×196)
  obstacle_3: {
    id: 'obstacle_3',
    scale: 0.55,
    originX: 0.5,
    originY: 0.85,
    hitbox: [{ x: -15, y: -35, r: 29 }, { x: 30, y: -12, r: 18 }, { x: 10, y: -22, r: 24 }],
    stains: [
      { tex: 'tache_1', x: 3, y: -27, w: 203, sy: 0.86, flip: false },
      { tex: 'tache_2', x: 1, y: -31, w: 214, sy: 1, flip: false },
      { tex: 'tache_3', x: -4, y: -32, w: 205, sy: 0.88, flip: false },
      { tex: 'tache_4', x: -2, y: -24, w: 205, sy: 0.93, flip: false },
    ],
  },
  // rocher sur coulée de lave (191×152)
  obstacle_4: {
    id: 'obstacle_4',
    scale: 0.6,
    originX: 0.5,
    originY: 0.8,
    hitbox: [{ x: -15, y: -20, r: 27 }, { x: 15, y: -16, r: 26 }],
    stains: [
      { tex: 'tache_1', x: -1, y: -25, w: 182, sy: 1, flip: false },
      { tex: 'tache_2', x: -3, y: -23, w: 198, sy: 1, flip: false },
      { tex: 'tache_3', x: -4, y: -26, w: 201, sy: 0.85, flip: false },
      { tex: 'tache_4', x: -1, y: -22, w: 201, sy: 0.89, flip: false },
    ],
  },
  // grand pilier à cristaux (242×305)
  obstacle_5: {
    id: 'obstacle_5',
    scale: 0.5,
    originX: 0.5,
    originY: 0.9,
    hitbox: [{ x: 17, y: -30, r: 33 }, { x: -13, y: -32, r: 30 }],
    stains: [
      { tex: 'tache_1', x: 6, y: -31, w: 209, sy: 0.86, flip: false },
      { tex: 'tache_2', x: 6, y: -25, w: 207, sy: 1, flip: false },
      { tex: 'tache_3', x: 0, y: -32, w: 203, sy: 0.81, flip: false },
      { tex: 'tache_4', x: 4, y: -27, w: 215, sy: 0.88, flip: false },
    ],
  },
  // grande flaque de lave (260×189)
  obstacle_6: {
    id: 'obstacle_6',
    scale: 0.6,
    originX: 0.5,
    originY: 0.5,
    hitbox: [{ x: -23, y: 0, r: 32 }, { x: 21, y: 6, r: 36 }, { x: -2, y: 3, r: 35 }],
    stains: [
      { tex: 'tache_1', x: 1, y: 0, w: 238, sy: 0.92, flip: false },
      { tex: 'tache_2', x: 0, y: 0, w: 249, sy: 1, flip: false },
      { tex: 'tache_3', x: -2, y: -2, w: 244, sy: 0.86, flip: false },
      { tex: 'tache_4', x: 5, y: 8, w: 236, sy: 0.94, flip: false },
    ],
  },
  // petit tas de rochers (132×109)
  obstacle_7: {
    id: 'obstacle_7',
    scale: 0.6,
    originX: 0.5,
    originY: 0.8,
    hitbox: [{ x: 3, y: -14, r: 22 }],
    stains: [
      { tex: 'tache_1', x: 5, y: -16, w: 130, sy: 1, flip: false },
      { tex: 'tache_2', x: 4, y: -15, w: 140, sy: 1, flip: false },
      { tex: 'tache_3', x: -1, y: -18, w: 141, sy: 0.85, flip: false },
      { tex: 'tache_4', x: 5, y: -13, w: 138, sy: 1, flip: false },
    ],
  },
  // petits cailloux (111×107)
  obstacle_8: {
    id: 'obstacle_8',
    scale: 0.6,
    originX: 0.5,
    originY: 0.8,
    hitbox: [{ x: -1, y: -15, r: 18 }],
    stains: [
      { tex: 'tache_1', x: -1, y: -17, w: 105, sy: 1, flip: false },
      { tex: 'tache_2', x: 0, y: -17, w: 138, sy: 1, flip: false },
      { tex: 'tache_3', x: -6, y: -21, w: 126, sy: 0.85, flip: false },
      { tex: 'tache_4', x: 0, y: -16, w: 121, sy: 1, flip: false },
    ],
  },
};

/** Largeur (px) de l'image source de chaque obstacle : sert aux taches par défaut. */
const SPRITE_WIDTH: Record<ObstacleId, number> = {
  obstacle_1: 200,
  obstacle_2: 161,
  obstacle_3: 229,
  obstacle_4: 191,
  obstacle_5: 242,
  obstacle_6: 260,
  obstacle_7: 132,
  obstacle_8: 111,
};

/** Taches par défaut : une par image, centrées sur l'emprise de la hitbox, 1,45× plus larges que le sprite. */
function defaultStains(o: RawObstacle): StainDef[] {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const c of o.hitbox) {
    x0 = Math.min(x0, c.x - c.r);
    x1 = Math.max(x1, c.x + c.r);
    y0 = Math.min(y0, c.y - c.r);
    y1 = Math.max(y1, c.y + c.r);
  }
  const w = Math.round(Math.max(SPRITE_WIDTH[o.id] * o.scale, x1 - x0) * 1.45);
  return STAIN_IDS.map((tex) => ({ tex, x: Math.round((x0 + x1) / 2), y: Math.round((y0 + y1) / 2), w, sy: 1, flip: false }));
}

export const OBSTACLES = Object.fromEntries(
  (Object.values(RAW) as RawObstacle[]).map((o) => [o.id, { ...o, stains: o.stains ?? defaultStains(o) }]),
) as Record<ObstacleId, ObstacleDef>;

export const OBSTACLE_IDS = Object.keys(OBSTACLES) as ObstacleId[];

/** Grands obstacles (le reste sert de petits ajouts) : utile aux cartes générées. */
export const BIG_OBSTACLES: ObstacleId[] = ['obstacle_1', 'obstacle_3', 'obstacle_5', 'obstacle_6'];
export const SMALL_OBSTACLES: ObstacleId[] = ['obstacle_2', 'obstacle_4', 'obstacle_7', 'obstacle_8'];
