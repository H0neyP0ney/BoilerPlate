import Phaser from 'phaser';
import { DEPTH } from '../config';

/** Arcs électriques : couleurs du halo et du cœur, durée de vie (s) d'un arc, nombre de segments brisés. */
const ARC = { glow: 0x4fc8ff, core: 0xffffff, life: [0.1, 0.2] as const, segments: [3, 6] as const };

interface Arc {
  pts: number[];
  age: number;
  life: number;
  width: number;
}

/**
 * Petits éclairs brisés qui crépitent au hasard autour d'un point (affichage seulement, `Math.random` permis côté vue) : alien électrique
 * (`AlienDef.electric`, chargeur) et soldat étourdi. Tous les arcs sont redessinés chaque frame dans un seul Graphics.
 */
export class ElectricArcs {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly arcs: Arc[] = [];

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.fx - 1).setBlendMode(Phaser.BlendModes.ADD);
  }

  /** En moyenne `perSecond` arcs par seconde autour de (x, y), dans un rayon `radius` ; `size` : longueur d'un arc (px). */
  crackle(x: number, y: number, radius: number, size: number, perSecond: number, dt: number): void {
    if (Math.random() < perSecond * dt) this.spawn(x, y, radius, size);
  }

  spawn(x: number, y: number, radius: number, size: number): void {
    const a0 = Math.random() * Math.PI * 2;
    const r0 = radius * (0.35 + Math.random() * 0.65);
    let px = x + Math.cos(a0) * r0;
    let py = y + Math.sin(a0) * r0 * 0.75;
    const dir = a0 + (Math.random() - 0.5) * 2.4; // plutôt le long du bord du corps qu'au travers
    const n = ARC.segments[0] + Math.floor(Math.random() * (ARC.segments[1] - ARC.segments[0] + 1));
    const step = size / n;
    const pts = [px, py];
    for (let i = 0; i < n; i++) {
      const d = dir + (Math.random() - 0.5) * 1.6; // zigzag
      px += Math.cos(d) * step;
      py += Math.sin(d) * step;
      pts.push(px, py);
    }
    this.arcs.push({ pts, age: 0, life: ARC.life[0] + Math.random() * (ARC.life[1] - ARC.life[0]), width: size > 30 ? 2.2 : 1.6 });
  }

  update(dt: number): void {
    const g = this.g.clear();
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.age += dt;
      if (a.age >= a.life) {
        this.arcs.splice(i, 1);
        continue;
      }
      const k = 1 - a.age / a.life;
      for (const [w, color, alpha] of [
        [a.width * 4, ARC.glow, 0.5 * k],
        [a.width, ARC.core, 0.95 * k],
      ] as const) {
        g.lineStyle(w, color, alpha).beginPath().moveTo(a.pts[0], a.pts[1]);
        for (let j = 2; j < a.pts.length; j += 2) g.lineTo(a.pts[j], a.pts[j + 1]);
        g.strokePath();
      }
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
