import Phaser from 'phaser';
import { DEPTH, PALETTE, SHADOW_ALPHA } from '../config';
import type { TurretState } from '../sim/entities';
import type { PlayerId } from '../sim/types';
import { TURRET_BASE, TURRET_GUN, TURRET_GUN_ORIGIN } from '../art/turret';
import type { Fx } from './Fx';

/** Durée (s) de l'apparition (la tourelle « pop » : elle grossit avec un petit rebond) et fin de vie (s) où elle clignote. */
const POP_TIME = 0.3;
const BLINK_TIME = 3;
const BAR_W = 34;
/** Hauteur (px) du canon au-dessus du pied de la tourelle. */
const GUN_LIFT = 17;

interface View {
  base: Phaser.GameObjects.Image;
  gun: Phaser.GameObjects.Image;
  age: number;
  seen: boolean;
  x: number;
  y: number;
}

/** Affichage des tourelles automatiques (`Sim.turrets`) : socle + canon qui vise, ombre, barre de vie et barre de temps restant. */
export class TurretViews {
  private readonly views = new Map<number, View>();
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly bars: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: Fx,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH.groundFx + 0.5);
    this.bars = scene.add.graphics().setDepth(DEPTH.bars);
  }

  update(items: readonly TurretState[], localPlayer: PlayerId, dt: number): void {
    for (const v of this.views.values()) v.seen = false;
    const g = this.g;
    const b = this.bars;
    g.clear();
    b.clear();
    for (const t of items) {
      if (!t.alive) continue;
      let v = this.views.get(t.id);
      if (!v) {
        v = {
          base: this.scene.add.image(t.x, t.y, TURRET_BASE).setOrigin(0.5, 0.8),
          gun: this.scene.add.image(t.x, t.y - GUN_LIFT, TURRET_GUN).setOrigin(TURRET_GUN_ORIGIN.x, TURRET_GUN_ORIGIN.y),
          age: 0,
          seen: true,
          x: t.x,
          y: t.y,
        };
        this.views.set(t.id, v);
        this.fx.dust(t.x, t.y, 26);
      }
      v.seen = true;
      v.x = t.x;
      v.y = t.y;
      v.age += dt;
      const k = v.age < POP_TIME ? Phaser.Math.Easing.Back.Out(v.age / POP_TIME) : 1;
      const blink = t.ttl < BLINK_TIME ? (Math.sin(v.age * 18) > 0 ? 1 : 0.35) : 1;
      const depth = DEPTH.actors + t.y;
      v.base.setPosition(t.x, t.y).setScale(k).setAlpha(blink).setDepth(depth);
      v.gun.setPosition(t.x, t.y - GUN_LIFT * k).setScale(k).setRotation(t.aim).setAlpha(blink).setDepth(depth + 0.1);
      g.fillStyle(0x2a1d2e, SHADOW_ALPHA).fillEllipse(t.x, t.y, 44 * k, 20 * k);
      // barres : PV (vert pour la squad locale, couleur d'ennemi sinon) puis temps restant (violet, mince)
      const by = t.y - 52;
      const x0 = t.x - BAR_W / 2;
      b.fillStyle(0x1a1226, 0.85).fillRect(x0 - 1, by - 1, BAR_W + 2, 7);
      b.fillStyle(t.owner === localPlayer ? PALETTE.hpAlly : PALETTE.hpEnemy, 1).fillRect(x0, by, BAR_W * Math.max(0, Math.min(1, t.hp / t.maxHp)), 5);
      b.fillStyle(0xa86bff, 0.9).fillRect(x0, by + 7, BAR_W * Math.max(0, Math.min(1, t.ttl / t.ttlMax)), 2);
    }
    for (const [id, v] of this.views) {
      if (v.seen) continue;
      this.fx.dust(v.x, v.y, 22); // détruite ou fin de vie
      v.base.destroy();
      v.gun.destroy();
      this.views.delete(id);
    }
  }

  destroy(): void {
    for (const v of this.views.values()) {
      v.base.destroy();
      v.gun.destroy();
    }
    this.views.clear();
    this.g.destroy();
    this.bars.destroy();
  }
}
