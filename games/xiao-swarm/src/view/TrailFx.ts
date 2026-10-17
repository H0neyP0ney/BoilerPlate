import Phaser from 'phaser';
import { trailById, type TrailDef } from '../data/trails';

/** Durée de vie (s) d'un point du ruban et distance minimale (px) entre deux points. */
const LIFE = 0.7;
const STEP = 7;
/** Largeur (px) du ruban à la tête. */
const WIDTH = 12;

interface Pt {
  x: number;
  y: number;
  age: number;
}

interface Ribbon {
  pts: Pt[];
  trail: TrailDef;
}

const lerpColor = (a: number, b: number, k: number): number => {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  return (Math.round(ar + (((b >> 16) & 255) - ar) * k) << 16) | (Math.round(ag + (((b >> 8) & 255) - ag) * k) << 8) | Math.round(ab + ((b & 255) - ab) * k);
};

/** Couleur du ruban à la position `k` (0 = tête, 1 = queue) : dégradé des couleurs de la trail, ou arc-en-ciel qui tourne avec le temps. */
export function trailColorAt(t: TrailDef, k: number, time: number): number {
  if (t.rainbow) return Phaser.Display.Color.HSLToColor(((time * 0.6 + k * 0.5) % 1 + 1) % 1, 0.9, 0.6).color;
  const n = t.colors.length;
  if (n === 1) return t.colors[0];
  const f = Math.min(n - 1 - 1e-6, k * (n - 1));
  const i = Math.floor(f);
  return lerpColor(t.colors[i], t.colors[i + 1], f - i);
}

/**
 * Trails : un ruban qui suit chaque soldat (de toutes les squads qui en ont une équipée, vues par tous les joueurs). `track` est appelé à chaque image pour
 * chaque soldat ; les points vieillissent et s'effacent seuls (le ruban se résorbe quand le soldat s'arrête ou meurt). Dessin dans le `Graphics` du sol.
 */
export class TrailFx {
  private readonly ribbons = new Map<number, Ribbon>();

  /** Position affichée (`x`, `y` = pieds) du soldat `id`, avec la trail de sa squad (id, '' = aucune). */
  track(id: number, x: number, y: number, trailId: string): void {
    const trail = trailById(trailId);
    if (!trail) return;
    let r = this.ribbons.get(id);
    if (!r || r.trail !== trail) {
      r = { pts: [], trail };
      this.ribbons.set(id, r);
    }
    const last = r.pts[r.pts.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) >= STEP) r.pts.push({ x, y, age: 0 });
    // immobile : aucun point ajouté, le ruban se résorbe tout seul
  }

  update(dt: number): void {
    for (const [id, r] of this.ribbons) {
      for (const p of r.pts) p.age += dt;
      while (r.pts.length && r.pts[0].age > LIFE) r.pts.shift();
      if (r.pts.length === 0) this.ribbons.delete(id);
    }
  }

  draw(g: Phaser.GameObjects.Graphics, time: number, visible: (x: number, y: number) => boolean): void {
    for (const r of this.ribbons.values()) {
      const pts = r.pts;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (!visible(b.x, b.y)) continue;
        const k = Math.min(1, b.age / LIFE); // 0 = tête, 1 = queue
        g.lineStyle(Math.max(1.5, WIDTH * (1 - k * 0.85)), trailColorAt(r.trail, k, time), 0.95 * (1 - k * 0.7)).lineBetween(a.x, a.y - 4, b.x, b.y - 4);
      }
    }
  }

  clear(): void {
    this.ribbons.clear();
  }
}
