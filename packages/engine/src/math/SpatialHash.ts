export interface Spatial {
  x: number;
  y: number;
}

/**
 * Grille spatiale reconstruite à chaque frame : requêtes de voisinage en O(1)
 * pour la séparation, le ciblage et les collisions avec des centaines d'entités.
 *
 *   hash.clear(); for (const e of all) hash.insert(e);
 *   hash.query(x, y, radius, out);  // candidats (à filtrer par distance)
 */
export class SpatialHash<T extends Spatial> {
  private readonly cells = new Map<number, T[]>();
  private readonly spare: T[][] = [];

  constructor(readonly cellSize: number) {}

  clear(): void {
    for (const bucket of this.cells.values()) {
      bucket.length = 0;
      this.spare.push(bucket);
    }
    this.cells.clear();
  }

  insert(item: T): void {
    const key = this.key(Math.floor(item.x / this.cellSize), Math.floor(item.y / this.cellSize));
    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = this.spare.pop() ?? [];
      this.cells.set(key, bucket);
    }
    bucket.push(item);
  }

  /** Remplit `out` avec les éléments des cellules touchées par le cercle (x, y, radius). */
  query(x: number, y: number, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const cs = this.cellSize;
    const x0 = Math.floor((x - radius) / cs);
    const x1 = Math.floor((x + radius) / cs);
    const y0 = Math.floor((y - radius) / cs);
    const y1 = Math.floor((y + radius) / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (bucket) for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
    return out;
  }

  /** Plus proche élément dans le rayon qui passe le filtre, ou undefined. */
  nearest(x: number, y: number, radius: number, filter?: (item: T) => boolean, scratch: T[] = []): T | undefined {
    const candidates = this.query(x, y, radius, scratch);
    let best: T | undefined;
    let bestD = radius * radius;
    for (const c of candidates) {
      if (filter && !filter(c)) continue;
      const dx = c.x - x;
      const dy = c.y - y;
      const d = dx * dx + dy * dy;
      if (d <= bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  private key(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768);
  }
}
