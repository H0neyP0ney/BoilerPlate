import Phaser from 'phaser';
import { lerp } from '@xiao/engine';
import { ensureStarTexture, ensureUpgradeOrbTexture } from '../art/upgradeOrbs';
import { DEPTH, DIFFICULTY } from '../config';
import { FX } from '../fxParams';
import { ORB_FALL_TIME } from '../sim/Chests';
import type { UpgradeOrbState } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import type { PlayerId } from '../sim/types';
import { createGlobeGlitter, GLOBE_LIFT, UPGRADE_PINK, type GlobeGlitter } from './GlobeGlitter';
import { drawPickupSpot } from './PickupViews';

/** Or du coffre, de sa zone d'ouverture et de l'éclat à l'ouverture. */
export const CHEST_GOLD = 0xffd24a;
/** Hauteur maximale (px) de l'arc de chute d'un globe qui sort du coffre. */
const ORB_FALL_HEIGHT = 70;

/** Zone d'ouverture d'un coffre (rayon `r`) : pulse en or, se remplit avec la progression `k` (0 → 1) tant qu'un soldat est à côté. */
export function drawChestZone(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, k: number, time: number): void {
  const beat = 0.5 + 0.5 * Math.sin(time * 5);
  g.fillStyle(CHEST_GOLD, 0.07 + 0.07 * beat + 0.1 * k).fillEllipse(x, y, r * 2, r * 1.4);
  if (k > 0) g.fillStyle(CHEST_GOLD, 0.15 + 0.3 * k).fillEllipse(x, y, r * 2 * k, r * 1.4 * k);
  g.lineStyle(3, CHEST_GOLD, 0.35 + 0.35 * beat + 0.3 * k).strokeEllipse(x, y, r * 2, r * 1.4);
}

/** Dessine le coffre centré sur (0, 0) = point au sol ; `k` = progression d'ouverture : le couvercle tremble et la lueur monte. */
function drawChest(g: Phaser.GameObjects.Graphics, k: number, time: number): void {
  g.clear();
  const shake = k > 0 ? Math.sin(time * 45) * 2.2 * k : 0;
  g.fillStyle(0x000000, 0.35).fillEllipse(0, 2, 84, 24); // ombre portée
  const glow = 0.18 + 0.12 * Math.sin(time * 3) + 0.4 * k;
  g.fillStyle(CHEST_GOLD, glow * 0.5).fillEllipse(0, -22, 100, 70);
  // caisse
  g.fillStyle(0x8a4b22, 1).fillRoundedRect(-30, -34, 60, 36, 5);
  g.fillStyle(0x6b3a1a, 1).fillRect(-30, -12, 60, 14);
  // couvercle bombé
  g.fillStyle(0xa8622c, 1).fillRoundedRect(-33 + shake, -52, 66, 22, { tl: 14, tr: 14, bl: 3, br: 3 });
  g.fillStyle(0xc77d3a, 0.7).fillRoundedRect(-27 + shake, -50, 54, 6, 3);
  // ferrures dorées
  g.fillStyle(CHEST_GOLD, 1);
  g.fillRect(-21 + shake * 0.5, -52, 8, 54);
  g.fillRect(13 + shake * 0.5, -52, 8, 54);
  g.fillRoundedRect(-8, -38, 16, 16, 3); // serrure
  g.fillStyle(0x3b1d0c, 1).fillCircle(0, -32, 3).fillRect(-1.5, -32, 3, 8);
  g.lineStyle(3, 0x3b1d0c, 1).strokeRoundedRect(-30, -34, 60, 36, 5);
}

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
    const star = ensureStarTexture(scene, FX.upgradeOrb.hue, FX.upgradeOrb.light);
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
 * Coffres des boss et globes d'upgrade (`sim.chests`, `sim.upgradeOrbs`, aussi remplis par `Mirror` en ligne) : un objet dessiné par coffre / globe,
 * calé chaque frame sur la simulation. Un joueur ne voit QUE ses propres globes d'upgrade (ceux des autres joueurs ne sont pas dessinés).
 */
export class LootViews {
  private readonly chests = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly orbs = new Map<number, UpgradeOrbView>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Sim,
    private readonly localPlayer: PlayerId,
  ) {}

  /** Zones au sol : zone d'ouverture des coffres, rond rose sous chacun de MES globes posés. */
  drawGround(g: Phaser.GameObjects.Graphics, time: number): void {
    const R = DIFFICULTY.chestRadius;
    const T = Math.max(0.1, DIFFICULTY.chestTime);
    for (const c of this.sim.chests.items) drawChestZone(g, c.x, c.y, R, Math.min(1, c.progress / T), time);
    for (const o of this.sim.upgradeOrbs.items) {
      if (o.owner !== this.localPlayer || o.hop) continue; // pas les globes des autres joueurs ; en l'air : pas encore de rond au sol
      drawPickupSpot(g, o.x, o.y, UPGRADE_PINK, time, o.id);
    }
  }

  sync(time: number, alpha: number): void {
    const T = Math.max(0.1, DIFFICULTY.chestTime);
    const liveChests = new Set<number>();
    for (const c of this.sim.chests.items) {
      liveChests.add(c.id);
      let g = this.chests.get(c.id);
      if (!g) {
        g = this.scene.add.graphics().setPosition(c.x, c.y);
        this.scene.tweens.add({ targets: g, scale: { from: 0.2, to: 1 }, duration: 260, ease: 'Back.Out' }); // pop à l'apparition
        this.chests.set(c.id, g);
      }
      drawChest(g, Math.min(1, c.progress / T), time);
      g.setPosition(c.x, c.y).setDepth(DEPTH.actors + c.y);
    }
    for (const [id, g] of this.chests) {
      if (liveChests.has(id)) continue;
      this.chests.delete(id);
      this.scene.tweens.add({ targets: g, alpha: 0, scale: 1.5, duration: 220, onComplete: () => g.destroy() }); // ouvert : se détruit
    }

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
      const arc = o.hop ? Math.sin(Math.PI * fall) * ORB_FALL_HEIGHT : 0; // retombe en cloche depuis le coffre
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
    for (const g of this.chests.values()) g.destroy();
    for (const v of this.orbs.values()) v.kill();
    this.chests.clear();
    this.orbs.clear();
  }
}
