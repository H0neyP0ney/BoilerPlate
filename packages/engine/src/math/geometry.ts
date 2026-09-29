export interface Point {
  x: number;
  y: number;
}

export interface Circle extends Point {
  radius: number;
}

export const TAU = Math.PI * 2;
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lissage indépendant du framerate : `damp(cur, target, 10, dt)`. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Centre de masse robuste : ignore les points à plus de `maxDist` du centre
 * initial (unités isolées, coincées derrière un obstacle…). Idéal pour la caméra.
 */
export function robustCentroid(points: readonly Point[], maxDist: number, out: Point = { x: 0, y: 0 }): Point {
  if (points.length === 0) return out;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  const cx = sx / points.length;
  const cy = sy / points.length;
  const max2 = maxDist * maxDist;
  let n = 0;
  sx = 0;
  sy = 0;
  for (const p of points) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    if (dx * dx + dy * dy <= max2) {
      sx += p.x;
      sy += p.y;
      n++;
    }
  }
  out.x = n > 0 ? sx / n : cx;
  out.y = n > 0 ? sy / n : cy;
  return out;
}

/**
 * Positions en spirale de Vogel (tournesol) : distribution organique et dense
 * quel que soit N, sans couronne à moitié vide. `spacing` ≈ distance entre voisins.
 */
export function sunflowerSlots(n: number, spacing: number, out: Point[] = []): Point[] {
  out.length = 0;
  const c = spacing * 0.55;
  for (let i = 0; i < n; i++) {
    const r = c * Math.sqrt(i + 0.5) * (n === 1 ? 0 : 1);
    const a = i * GOLDEN_ANGLE;
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return out;
}

/**
 * Affectation gloutonne agents → slots en minimisant les distances
 * (évite les grands croisements quand la taille du groupe change).
 * Retourne `assignment[agentIndex] = slotIndex`.
 */
export function assignSlots(agents: readonly Point[], slots: readonly Point[]): number[] {
  const pairs: [number, number, number][] = [];
  for (let a = 0; a < agents.length; a++) {
    for (let s = 0; s < slots.length; s++) pairs.push([dist2(agents[a], slots[s]), a, s]);
  }
  pairs.sort((p, q) => p[0] - q[0]);
  const result = new Array<number>(agents.length).fill(-1);
  const used = new Set<number>();
  let done = 0;
  for (const [, a, s] of pairs) {
    if (result[a] !== -1 || used.has(s)) continue;
    result[a] = s;
    used.add(s);
    if (++done === agents.length) break;
  }
  return result;
}

/** Repousse un cercle hors d'un autre cercle (obstacle statique). true si collision. */
export function pushOutOfCircle(p: Circle, obstacle: Circle): boolean {
  const dx = p.x - obstacle.x;
  const dy = p.y - obstacle.y;
  const min = p.radius + obstacle.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2) || 0.0001;
  const push = min - d;
  p.x += (dx / d) * push;
  p.y += (dy / d) * push;
  return true;
}
