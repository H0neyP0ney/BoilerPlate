import Phaser from 'phaser';
import { lerp } from '@xiao/engine';
import { ensureUpgradeOrbTexture, loadedKey, starKey } from '../art/upgradeOrbs';
import { DEPTH } from '../config';
import { FX } from '../fxParams';
import { ORB_FALL_TIME } from '../sim/Chests';
import type { UpgradeOrbState } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import type { PlayerId } from '../sim/types';
import { createGlobeGlitter, GLOBE_LIFT, UPGRADE_PINK, type GlobeGlitter } from './GlobeGlitter';
import { drawPickupSpot } from './PickupViews';

/** Or de l'éclat quand un œuf de boss est détruit. */
export const CHEST_GOLD = 0xffd24a;
/** Hauteur maximale (px) de l'arc de chute d'un globe qui sort de l'œuf. */
const ORB_FALL_HEIGHT = 70;

/** Repli sans les pièces d'art du bonus recrue : globe rose à aura rose, centré sur (0, 0). */
function drawUpgradeOrb(g: Phaser.GameObjects.Graphics, time: number, seed: number): void {
  g.clear();
  const beat = 0.5 + 0.5 * Math.sin(time * 6 + seed);
  g.fillStyle(UPGRADE_PINK, 0.22 + 0.2 * beat).fillCircle(0, 0, 40 + beat * 4);
  g.fillStyle(0xff7ad9, 0.35).fillCircle(0, 0, 27);
  g.fillStyle(0xffd0f0, 1).fillCircle(0, 0, 21);
  g.fillStyle(0xff7ad9, 1).fillCircle(0, 0, 16);
  g.lineStyle(4, 0xffffff, 0.9).strokeCircle(0, 0, 21);
}

/**
 * Globe d'upgrade : sprite façon bonus recrue (globe + anneau + icône de la carte d'upgrade, étoiles et paillettes de la couleur du globe), qui retombe en
 * cloche depuis le coffre puis flotte. Sans les pièces d'art, repli sur le globe dessiné (`drawUpgradeOrb`).
 */
export class UpgradeOrbView {
  private readonly img?: Phaser.GameObjects.Image;
  private readonly g?: Phaser.GameObjects.Graphics;
  private readonly glitter?: GlobeGlitter;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly state: UpgradeOrbState,
  ) {
    const key = ensureUpgradeOrbTexture(scene, state.upgrade);
    if (key) this.img = scene.add.image(state.x, state.y, key).setScale(FX.recruit.displayScale);
    else this.g = scene.add.graphics();
    // les étoiles de la recrue, en rose : le même effet que les recrues (doré) et les power-ups (vert)
    const star = loadedKey(scene, starKey('upgrade'));
    if (star) this.glitter = createGlobeGlitter(scene, state.x, state.y, star) ?? undefined;
  }

  sync(x: number, y: number, depthY: number, time: number): void {
    this.glitter?.setPosition(x, y, DEPTH.actors + depthY + 41);
    if (this.img) {
      this.img.setScale(FX.recruit.displayScale).setPosition(x, y).setDepth(DEPTH.actors + depthY + 40); // `FX` modifié à chaud dans la visionneuse
    } else if (this.g) {
      drawUpgradeOrb(this.g, time, this.state.id);
      this.g.setPosition(x, y).setDepth(DEPTH.actors + depthY + 40);
    }
  }

  /** Ramassé : le globe éclate (grossit en s'effaçant). */
  destroy(): void {
    const targets = [this.img, this.g].filter((t): t is Phaser.GameObjects.Image | Phaser.GameObjects.Graphics => !!t);
    this.glitter?.destroy();
    this.scene.tweens.add({ targets, alpha: 0, scale: this.img ? FX.recruit.displayScale * 1.8 : 1.8, duration: 240, onComplete: () => targets.forEach((t) => t.destroy()) });
  }

  /** Destruction immédiate (changement de partie). */
  kill(): void {
    this.img?.destroy();
    this.g?.destroy();
    this.glitter?.destroy();
  }
}

/**
 * Globes d'upgrade (`sim.upgradeOrbs`, aussi rempli par `Mirror` en ligne) : un objet dessiné par globe, calé chaque frame sur la simulation. Un joueur ne voit QUE ses propres globes d'upgrade (ceux des autres joueurs ne sont pas dessinés).
 */
export class LootViews {
  private readonly orbs = new Map<number, UpgradeOrbView>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Sim,
    private readonly localPlayer: PlayerId,
  ) {}

  /** Au sol : rond rose sous chacun de MES globes posés. */
  drawGround(g: Phaser.GameObjects.Graphics, time: number): void {
    for (const o of this.sim.upgradeOrbs.items) {
      if (o.owner !== this.localPlayer || o.hop) continue; // pas les globes des autres joueurs ; en l'air : pas encore de rond au sol
      drawPickupSpot(g, o.x, o.y, UPGRADE_PINK, time, o.id);
    }
  }

  sync(time: number, alpha: number): void {
    const liveOrbs = new Set<number>();
    for (const o of this.sim.upgradeOrbs.items) {
      if (o.owner !== this.localPlayer) continue; // le globe d'un autre joueur n'est pas visible
      liveOrbs.add(o.id);
      let v = this.orbs.get(o.id);
      if (!v) {
        v = new UpgradeOrbView(this.scene, o);
        this.orbs.set(o.id, v);
      }
      const x = lerp(o.px, o.x, alpha);
      const y = lerp(o.py, o.y, alpha);
      const fall = o.hop ? Math.max(0, Math.min(1, 1 - o.hop.t / ORB_FALL_TIME)) : 1;
      const arc = o.hop ? Math.sin(Math.PI * fall) * ORB_FALL_HEIGHT : 0; // retombe en cloche depuis l'œuf
      const bob = o.hop ? 0 : Math.sin(time * 5 + o.id) * 4;
      v.sync(x, y - GLOBE_LIFT * FX.recruit.displayScale - arc + bob, y, time);
    }
    for (const [id, v] of this.orbs) {
      if (liveOrbs.has(id)) continue;
      this.orbs.delete(id);
      v.destroy();
    }
  }

  destroy(): void {
    for (const v of this.orbs.values()) v.kill();
    this.orbs.clear();
  }
}
