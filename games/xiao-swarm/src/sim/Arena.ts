import { clamp, pushOutOfCircle, type Circle, type Point } from '@xiao/engine/sim';
import type { MapDef } from '../data/maps';
import { OBSTACLES } from '../data/obstacles';

/**
 * Géométrie de collision de la carte (GDD §12) : obstacles en cercles,
 * bords infranchissables. Aucune donnée visuelle ici (voir view/ArenaView).
 */
export class Arena {
  readonly obstacles: Circle[] = [];
  readonly bounds: { minX: number; minY: number; maxX: number; maxY: number };

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
  }

  /** Garde un cercle dans l'arène et hors des obstacles. */
  constrain(c: Circle): void {
    for (const o of this.obstacles) {
      if (Math.abs(c.x - o.x) < c.radius + o.radius && Math.abs(c.y - o.y) < c.radius + o.radius) pushOutOfCircle(c, o);
    }
    c.x = clamp(c.x, this.bounds.minX + c.radius, this.bounds.maxX - c.radius);
    c.y = clamp(c.y, this.bounds.minY + c.radius, this.bounds.maxY - c.radius);
  }

  isFree(p: Point, radius: number): boolean {
    const b = this.bounds;
    if (p.x < b.minX + radius || p.x > b.maxX - radius || p.y < b.minY + radius || p.y > b.maxY - radius) return false;
    for (const o of this.obstacles) {
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      if (dx * dx + dy * dy < (o.radius + radius) ** 2) return false;
    }
    return true;
  }
}
