import Phaser from 'phaser';
import { lerp } from '@xiao/engine';
import { DEPTH } from '../config';
import type { Sim } from '../sim/Sim';

const STORAGE_KEY = 'xiao-debug-hitboxes';

/**
 * Hitboxes de debug (dev uniquement, bouton du menu ² / F2 ou touche H) : les formes RÉELLEMENT utilisées par la
 * simulation, pas celles des sprites.
 *  - rouge  : obstacles (rochers, étangs) et limites de la zone jouable
 *  - vert   : soldats (cercle de collision) ; jaune fin = cercle touché par les balles (décalé de 10 px vers le haut)
 *  - orange : aliens, même convention
 *  - bleu   : ancre de la squad (croix), coeur de la squad (losange) et laisse ; points blancs = slots
 *  - blanc  : projectiles (rayon de touche)
 */
export class DebugHitboxes {
  enabled = false;
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly sim: Sim,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH.fx + 100);
    try {
      this.enabled = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // stockage indisponible : désactivé par défaut
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      // ignoré
    }
    if (!on) this.g.clear();
  }

  render(alpha: number): void {
    const g = this.g;
    g.clear();
    if (!this.enabled) return;
    const sim = this.sim;

    // Obstacles + limites de la zone jouable
    for (const o of sim.arena.obstacles) {
      g.fillStyle(0xff3355, 0.18).fillCircle(o.x, o.y, o.radius);
      g.lineStyle(2, 0xff3355, 0.95).strokeCircle(o.x, o.y, o.radius);
    }
    const b = sim.arena.bounds;
    g.lineStyle(2, 0xff3355, 0.6).strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);

    for (const sq of sim.squads) {
      for (const s of sq.soldiers) {
        const x = lerp(s.px, s.x, alpha);
        const y = lerp(s.py, s.y, alpha);
        g.lineStyle(1.5, 0x39ff7a, 0.95).strokeCircle(x, y, s.radius);
        g.lineStyle(1, 0xffe14d, 0.7).strokeCircle(x, y - 10, s.radius);
        g.fillStyle(0xffffff, 0.9).fillCircle(sq.anchor.x + s.slotX, sq.anchor.y + s.slotY, 2);
      }
      if (!sq.alive) continue;
      const a = sq.anchor;
      g.lineStyle(2, 0x39c6ff, 1).lineBetween(a.x - 9, a.y, a.x + 9, a.y).lineBetween(a.x, a.y - 9, a.x, a.y + 9);
      g.strokeCircle(a.x, a.y, a.radius);
      const c = sq.center;
      g.lineStyle(2, 0x39c6ff, 0.8).lineBetween(c.x, c.y - 8, c.x + 8, c.y).lineBetween(c.x + 8, c.y, c.x, c.y + 8).lineBetween(c.x, c.y + 8, c.x - 8, c.y).lineBetween(c.x - 8, c.y, c.x, c.y - 8);
      g.lineBetween(c.x, c.y, a.x, a.y);
    }

    for (const al of sim.aliens) {
      const x = lerp(al.px, al.x, alpha);
      const y = lerp(al.py, al.y, alpha);
      g.lineStyle(1.5, 0xff9a2e, 0.95).strokeCircle(x, y, al.radius);
      g.lineStyle(1, 0xffe14d, 0.7).strokeCircle(x, y - 10, al.radius);
    }

    g.lineStyle(1, 0xffffff, 0.9);
    for (const p of sim.combat.projectiles.active) g.strokeCircle(lerp(p.px, p.x, alpha), lerp(p.py, p.y, alpha), p.flame ? 14 + (1 - p.life / p.maxLife) * 16 : 4);
  }
}
