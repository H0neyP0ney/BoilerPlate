import { clamp, pushOutOfCircle, type Circle, type Point } from '@xiao/engine/sim';
import type { MapDef } from '../data/maps';
import { CROWD } from '../config';
import { OBSTACLES } from '../data/obstacles';

/** Côté (px) d'une case de la grille des obstacles : de l'ordre d'un gros obstacle, plus grand qu'une unité. */
const CELL = 128;
/** Marge (px) ajoutée au rayon de recherche de `constrain` : un cercle repoussé peut sortir un peu de sa case de départ. */
const PUSH_SLACK = 24;
/** Tri par insertion sur place (listes de quelques éléments : bien plus rapide que Array.sort, sans allocation). */
function sortAscending(a: number[]): number[] {
  for (let i = 1; i < a.length; i++) {
    const v = a[i];
    let j = i - 1;
    while (j >= 0 && a[j] > v) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = v;
  }
  return a;
}

/**
 * Géométrie de collision de la carte (GDD §12) : obstacles en cercles,
 * bords infranchissables. Aucune donnée visuelle ici (voir view/ArenaView).
 *
 * Les obstacles ne bougent jamais : ils sont rangés une fois pour toutes dans une grille (`CELL` px). Chaque requête
 * (`constrain`, `steer`, `isFree`) ne regarde que les cercles des cases voisines de l'unité, pas toute la carte :
 * le coût par unité ne dépend plus du nombre total d'obstacles.
 */
export class Arena {
  readonly obstacles: Circle[] = [];
  /** Cailloux lancés par les aliens : obstacles temporaires (peu nombreux : parcours direct, sans grille). */
  readonly rocks: (Circle & { id: number; ttl: number })[] = [];
  readonly bounds: { minX: number; minY: number; maxX: number; maxY: number };

  private grid: number[][] = [];
  private cols = 0;
  private rows = 0;
  /** Contenu de `obstacles` au moment où la grille a été construite (détecte un ajout / retrait, ex. dans les scripts de test). */
  private builtLen = -1;
  private builtFirst: Circle | undefined;
  private seen = new Uint32Array(0);
  private seenId = 0;
  private readonly near: number[] = [];

  constructor(readonly map: MapDef) {
    this.bounds = {
      minX: map.border,
      minY: map.border,
      maxX: map.width - map.border,
      maxY: map.height - map.border,
    };
    for (const p of map.ponds) {
      // étang approximé par une rangée de cercles
      const n = 5;
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1)) * 2 - 1;
        this.obstacles.push({ x: p.x + t * p.rx * 0.62, y: p.y, radius: p.ry * (1 - Math.abs(t) * 0.35) });
      }
    }
    for (const o of map.obstacles) {
      // hitbox = cercles relatifs à l'ancrage du sprite (data/obstacles.ts), à la taille de cette instance
      const k = o.size ?? 1;
      for (const c of OBSTACLES[o.kind].hitbox) this.obstacles.push({ x: o.x + c.x * k, y: o.y + c.y * k, radius: c.r * k });
    }
    this.rebuildGrid();
  }

  /** (Re)construit la grille depuis `obstacles`. Automatique si la liste change ; à appeler après avoir modifié un cercle en place. */
  rebuildGrid(): void {
    this.cols = Math.max(1, Math.ceil(this.map.width / CELL));
    this.rows = Math.max(1, Math.ceil(this.map.height / CELL));
    this.grid = Array.from({ length: this.cols * this.rows }, () => []);
    this.obstacles.forEach((o, i) => {
      const x0 = this.cellX(o.x - o.radius);
      const x1 = this.cellX(o.x + o.radius);
      const y0 = this.cellY(o.y - o.radius);
      const y1 = this.cellY(o.y + o.radius);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) this.grid[cy * this.cols + cx].push(i);
    });
    this.seen = new Uint32Array(this.obstacles.length);
    this.seenId = 0;
    this.builtLen = this.obstacles.length;
    this.builtFirst = this.obstacles[0];
  }

  private cellX(x: number): number {
    return clamp(Math.floor(x / CELL), 0, this.cols - 1);
  }

  private cellY(y: number): number {
    return clamp(Math.floor(y / CELL), 0, this.rows - 1);
  }

  /** Indices (dans `obstacles`, sans doublon) des cercles qui touchent le carré de demi-côté `r` autour de (x, y). */
  private collect(x: number, y: number, r: number): number[] {
    if (this.obstacles.length !== this.builtLen || this.obstacles[0] !== this.builtFirst) this.rebuildGrid();
    const near = this.near;
    near.length = 0;
    const id = ++this.seenId;
    const x1 = this.cellX(x + r);
    const y1 = this.cellY(y + r);
    for (let cy = this.cellY(y - r); cy <= y1; cy++) {
      for (let cx = this.cellX(x - r); cx <= x1; cx++) {
        for (const i of this.grid[cy * this.cols + cx]) {
          if (this.seen[i] === id) continue;
          this.seen[i] = id;
          near.push(i);
        }
      }
    }
    return near;
  }

  /** Garde un cercle dans l'arène et hors des obstacles. */
  constrain(c: Circle): void {
    // indices triés : les poussées successives se font dans le même ordre que la liste `obstacles` (résultat identique à un parcours complet)
    for (const i of sortAscending(this.collect(c.x, c.y, c.radius + PUSH_SLACK))) {
      const o = this.obstacles[i];
      if (Math.abs(c.x - o.x) < c.radius + o.radius && Math.abs(c.y - o.y) < c.radius + o.radius) pushOutOfCircle(c, o);
    }
    for (const o of this.rocks) {
      if (Math.abs(c.x - o.x) < c.radius + o.radius && Math.abs(c.y - o.y) < c.radius + o.radius) pushOutOfCircle(c, o);
    }
    c.x = clamp(c.x, this.bounds.minX + c.radius, this.bounds.maxX - c.radius);
    c.y = clamp(c.y, this.bounds.minY + c.radius, this.bounds.maxY - c.radius);
  }

  /**
   * Zone douce autour des hitbox (CROWD.wallMargin) : corrige un VECTEUR vitesse `v` pour une unité en (x, y).
   * Plus on approche de la hitbox (t : 0 au bord de la zone, 1 au contact), plus la part de vitesse dirigée vers le
   * décor est retirée ; une fraction (wallNudge) est reversée en glissade tangentielle, du côté où l'unité allait déjà,
   * et une poussée douce (wallPush) éloigne du bord. La hitbox dure (`constrain`) reste le filet de sécurité.
   * `noBoost` (soldats et ancre de la squad) : la glissade et la poussée de tous les cercles à portée sont sommées puis plafonnées à celles du plus fort, et la vitesse finale ne dépasse jamais la vitesse d'entrée :
   * un mur de rochers qui se chevauchent (5 à 10 cercles) faisait sinon filer les soldats le long du mur (vitesse × 2).
   * Les aliens gardent le comportement d'origine.
   */
  steer(x: number, y: number, radius: number, v: Point, noBoost = false): void {
    const m = CROWD.wallMargin;
    if (m <= 0) return;
    const inSpeed = Math.hypot(v.x, v.y);
    const near = this.collect(x, y, radius + m);
    const n = near.length;
    const nr = n + this.rocks.length;
    // glissade et poussée des cercles s'ACCUMULAIENT (un mur de rochers qui se chevauchent = 5 à 10 cercles à portée : vitesse × 2 le long d'un long mur) : on les somme
    // puis on plafonne au plus fort d'un seul cercle ; seul le retrait de la vitesse vers le décor reste cumulatif (une projection : elle ne peut pas accélérer)
    let nudgeX = 0;
    let nudgeY = 0;
    let nudgeMax = 0;
    let pushX = 0;
    let pushY = 0;
    let pushMax = 0;
    for (let k = 0; k < nr; k++) {
      const o = k < n ? this.obstacles[near[k]] : this.rocks[k - n];
      const reach = radius + o.radius + m;
      const dx = x - o.x;
      const dy = y - o.y;
      if (Math.abs(dx) >= reach || Math.abs(dy) >= reach) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= reach * reach) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const nx = dx / d;
      const ny = dy / d;
      const t = clamp(1 - (d - radius - o.radius) / m, 0, 1);
      const inward = -(v.x * nx + v.y * ny);
      if (inward > 0) {
        v.x += nx * inward * t;
        v.y += ny * inward * t;
        const tx = -ny;
        const ty = nx;
        const side = v.x * tx + v.y * ty;
        const sign = side !== 0 ? Math.sign(side) : (Math.round(o.x + o.y) & 1) === 0 ? 1 : -1; // pile de face : côté stable
        const nudge = inward * t * CROWD.wallNudge;
        if (noBoost) {
          nudgeX += tx * sign * nudge;
          nudgeY += ty * sign * nudge;
          if (nudge > nudgeMax) nudgeMax = nudge;
        } else {
          v.x += tx * sign * nudge;
          v.y += ty * sign * nudge;
        }
      }
      const push = CROWD.wallPush * t * t;
      if (noBoost) {
        pushX += nx * push;
        pushY += ny * push;
        if (push > pushMax) pushMax = push;
      } else {
        v.x += nx * push;
        v.y += ny * push;
      }
    }
    if (!noBoost) return; // aliens : comportement d'origine
    const nudgeLen = Math.hypot(nudgeX, nudgeY);
    const nudgeK = nudgeLen > nudgeMax && nudgeLen > 0 ? nudgeMax / nudgeLen : 1;
    const pushLen = Math.hypot(pushX, pushY);
    const pushK = pushLen > pushMax && pushLen > 0 ? pushMax / pushLen : 1;
    v.x += nudgeX * nudgeK + pushX * pushK;
    v.y += nudgeY * nudgeK + pushY * pushK;
    // la glissade dévie le mouvement, elle ne l'accélère jamais : vitesse finale ≤ vitesse d'entrée (ou la poussée douce d'un mur, pour une unité quasi immobile).
    // Sans ça, `wallNudge` (×1,5 de la vitesse « dans le mur » rendue en tangente) faisait filer les soldats le long des longs murs de rochers.
    const cap = Math.max(inSpeed, CROWD.wallPush);
    const out = Math.hypot(v.x, v.y);
    if (out > cap) {
      v.x *= cap / out;
      v.y *= cap / out;
    }
  }

  /**
   * Longueur (px, au plus `max`) d'un rayon parti de (`x`, `y`) dans la direction unitaire (`dx`, `dy`) avant de sortir de la carte : les lignes de pics du lurker et du
   * Giant Crab s'arrêtent au bord (pas de pics dans le vide). Les obstacles, eux, ne les coupent pas.
   */
  rayLength(x: number, y: number, dx: number, dy: number, max: number): number {
    const b = this.bounds;
    let t = max;
    if (dx > 1e-6) t = Math.min(t, (b.maxX - x) / dx);
    else if (dx < -1e-6) t = Math.min(t, (b.minX - x) / dx);
    if (dy > 1e-6) t = Math.min(t, (b.maxY - y) / dy);
    else if (dy < -1e-6) t = Math.min(t, (b.minY - y) / dy);
    return Math.max(0, t);
  }

  isFree(p: Point, radius: number): boolean {
    if (!this.isFreeOfMap(p, radius)) return false;
    for (const o of this.rocks) {
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      if (dx * dx + dy * dy < (o.radius + radius) ** 2) return false;
    }
    return true;
  }

  /** Comme `isFree`, sans les rochers (murs d'alien, temporaires) : seulement le bord de l'arène et les obstacles de la carte. */
  isFreeOfMap(p: Point, radius: number): boolean {
    const b = this.bounds;
    if (p.x < b.minX + radius || p.x > b.maxX - radius || p.y < b.minY + radius || p.y > b.maxY - radius) return false;
    for (const i of this.collect(p.x, p.y, radius)) {
      const o = this.obstacles[i];
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      if (dx * dx + dy * dy < (o.radius + radius) ** 2) return false;
    }
    return true;
  }
}
