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
  obstacle_1: { id: 'obstacle_1', scale: 0.6, originX: 0.5, originY: 0.5, hitbox: [{ x: 0, y: 0, r: 48 }] },
  // gros rocher (161×124)
  obstacle_2: { id: 'obstacle_2', scale: 0.6, originX: 0.5, originY: 0.8, hitbox: [{ x: 0, y: -22, r: 34 }] },
  // rocher à cristaux (229×196)
  obstacle_3: {
    id: 'obstacle_3',
    scale: 0.55,
    originX: 0.5,
    originY: 0.85,
    hitbox: [
      { x: -14, y: -36, r: 38 },
      { x: 30, y: -12, r: 24 },
    ],
  },
  // rocher sur coulée de lave (191×152)
  obstacle_4: { id: 'obstacle_4', scale: 0.6, originX: 0.5, originY: 0.8, hitbox: [{ x: -4, y: -26, r: 38 }] },
  // grand pilier à cristaux (242×305)
  obstacle_5: { id: 'obstacle_5', scale: 0.5, originX: 0.5, originY: 0.9, hitbox: [{ x: 0, y: -22, r: 44 }] },
  // grande flaque de lave (260×189)
  obstacle_6: {
    id: 'obstacle_6',
    scale: 0.6,
    originX: 0.5,
    originY: 0.5,
    hitbox: [
      { x: -30, y: 0, r: 40 },
      { x: 30, y: 0, r: 40 },
    ],
  },
  // petit tas de rochers (132×109)
  obstacle_7: { id: 'obstacle_7', scale: 0.6, originX: 0.5, originY: 0.8, hitbox: [{ x: 0, y: -16, r: 28 }] },
  // petits cailloux (111×107)
  obstacle_8: { id: 'obstacle_8', scale: 0.6, originX: 0.5, originY: 0.8, hitbox: [{ x: 0, y: -14, r: 24 }] },
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
