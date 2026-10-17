import Phaser from 'phaser';
import { lerp } from '@xiao/engine';
import { COIN_GOLD, COIN_KEY, ensureGemTextures, GEM_CHEST_KEY, GEM_GREEN, GEM_KEY } from '../art/gems';
import { COINS, DEPTH, GEM_CHEST } from '../config';
import type { GemChestState } from '../sim/entities';
import { GEM_FALL_TIME } from '../sim/Gems';
import type { Sim } from '../sim/Sim';
import { GLOBE_LIFT } from './GlobeGlitter';
import { drawPickupSpot } from './PickupViews';

/** Icône « vidéo récompensée » (paquet 1, la même que les boutons rewarded). */
const REWARDED_ICON = 'ui_rewarded';
const GEM_SCALE = 0.5;
const CHEST_SCALE = 0.95;
/** Hauteur maximale (px) de l'arc de chute d'un diamant. */
const FALL_HEIGHT = 70;
/** Rayon (px) de la jauge circulaire autour de l'icône rewarded, et hauteur de l'icône au-dessus du coffre. */
const GAUGE_R = 34;
const ICON_LIFT = 118;

/** Un coffre à diamants : coffre, icône « vidéo récompensée » au-dessus et jauge circulaire qui se remplit pendant que la squad reste autour. */
class ChestView {
  private readonly chest: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly gauge: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    readonly state: GemChestState,
  ) {
    this.chest = scene.add.image(state.x, state.y, GEM_CHEST_KEY).setOrigin(0.5, 0.85).setScale(CHEST_SCALE);
    this.icon = scene.add.image(state.x, state.y - ICON_LIFT, scene.textures.exists(REWARDED_ICON) ? REWARDED_ICON : GEM_KEY);
    this.icon.setScale((GAUGE_R * 1.3) / Math.max(this.icon.width, this.icon.height));
    this.gauge = scene.add.graphics();
    // apparition : le coffre tombe du ciel en rebondissant
    this.chest.setAlpha(0);
    scene.tweens.add({ targets: this.chest, alpha: 1, duration: 120 });
  }

  sync(time: number): void {
    const s = this.state;
    const bob = Math.sin(time * 4 + s.id) * 3;
    const appear = Math.min(1, s.age / 0.35);
    const drop = (1 - appear) * (1 - appear) * 160; // descend du haut en 0,35 s
    const depth = DEPTH.actors + s.y;
    this.chest.setPosition(s.x, s.y - drop).setDepth(depth);
    const iy = s.y - ICON_LIFT + bob - drop;
    this.icon.setPosition(s.x, iy).setDepth(depth + 1).setAlpha(s.state === 'cooldown' ? 0.4 : 1).setVisible(appear >= 1);
    const g = this.gauge;
    g.clear().setDepth(depth + 0.5).setVisible(appear >= 1);
    // pastille sombre derrière l'icône, piste de la jauge puis arc vert qui se remplit à partir du haut
    g.fillStyle(0x0b1a2e, 0.75).fillCircle(s.x, iy, GAUGE_R);
    g.lineStyle(6, 0xffffff, 0.22).strokeCircle(s.x, iy, GAUGE_R);
    if (s.charge > 0.001) {
      const start = -Math.PI / 2;
      g.lineStyle(6, GEM_GREEN, 1).beginPath().arc(s.x, iy, GAUGE_R, start, start + s.charge * Math.PI * 2, false).strokePath();
    }
  }

  destroy(): void {
    this.chest.destroy();
    this.icon.destroy();
    this.gauge.destroy();
  }
}

/**
 * Coffres et diamants verts (`sim.gems`, solo seulement) : un objet dessiné par coffre / diamant, calé chaque image sur la simulation. Un diamant retombe en
 * cloche depuis le coffre, puis flotte avec un rond vert au sol jusqu'à être aspiré.
 */
export class GemViews {
  private readonly chests = new Map<number, ChestView>();
  private readonly gems = new Map<number, Phaser.GameObjects.Image>();
  private readonly coins = new Map<number, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Sim,
  ) {
    ensureGemTextures(scene);
  }

  /** Rond vert sous chaque diamant posé. */
  drawGround(g: Phaser.GameObjects.Graphics, time: number): void {
    for (const it of this.sim.gems.items) if (!it.hop) drawPickupSpot(g, it.x, it.y, GEM_GREEN, time, it.id, 0.8, 0.45);
    for (const it of this.sim.gems.coins) if (!it.hop) drawPickupSpot(g, it.x, it.y, COIN_GOLD, time, it.id, 0.6, 0.32);
  }

  sync(time: number, alpha: number): void {
    const liveC = new Set<number>();
    for (const c of this.sim.gems.chests) {
      liveC.add(c.id);
      let v = this.chests.get(c.id);
      if (!v) {
        v = new ChestView(this.scene, c);
        this.chests.set(c.id, v);
      }
      v.sync(time);
    }
    for (const [id, v] of this.chests) {
      if (liveC.has(id)) continue;
      this.chests.delete(id);
      v.destroy();
    }
    const live = new Set<number>();
    for (const it of this.sim.gems.items) {
      live.add(it.id);
      let img = this.gems.get(it.id);
      if (!img) {
        img = this.scene.add.image(it.x, it.y, GEM_KEY).setScale(GEM_SCALE);
        this.gems.set(it.id, img);
      }
      const x = lerp(it.px, it.x, alpha);
      const y = lerp(it.py, it.y, alpha);
      const fall = it.hop ? Math.max(0, Math.min(1, 1 - it.hop.t / GEM_FALL_TIME)) : 1;
      const arc = it.hop ? Math.sin(Math.PI * fall) * FALL_HEIGHT : 0;
      const bob = it.hop ? 0 : Math.sin(time * 5 + it.id) * 3;
      img.setPosition(x, y - GLOBE_LIFT * 0.4 - arc + bob).setDepth(DEPTH.actors + y + 40).setRotation(it.hop ? fall * Math.PI * 2 : Math.sin(time * 3 + it.id) * 0.12).setAlpha(it.life < GEM_CHEST.blink && Math.sin(time * 18) > 0 ? 0.35 : 1); // clignote avant de disparaître
    }
    for (const [id, img] of this.gems) {
      if (live.has(id)) continue;
      this.gems.delete(id);
      img.destroy();
    }
    // pièces d'or : plus petites, elles tournent sur elles-mêmes (écrasées en largeur) et clignotent avant de disparaître
    const liveCoins = new Set<number>();
    for (const it of this.sim.gems.coins) {
      liveCoins.add(it.id);
      let img = this.coins.get(it.id);
      if (!img) {
        img = this.scene.add.image(it.x, it.y, COIN_KEY).setScale(0.34);
        this.coins.set(it.id, img);
      }
      const x = lerp(it.px, it.x, alpha);
      const y = lerp(it.py, it.y, alpha);
      const fall = it.hop ? Math.max(0, Math.min(1, 1 - it.hop.t / GEM_FALL_TIME)) : 1;
      const arc = it.hop ? Math.sin(Math.PI * fall) * 40 : 0;
      const bob = it.hop ? 0 : Math.sin(time * 5 + it.id) * 2;
      img.setPosition(x, y - 14 - arc + bob).setDepth(DEPTH.actors + y + 40).setScale(0.34 * Math.max(0.15, Math.abs(Math.cos(time * 4 + it.id))), 0.34).setAlpha(it.life < COINS.blink && Math.sin(time * 18) > 0 ? 0.35 : 1);
    }
    for (const [id, img] of this.coins) {
      if (liveCoins.has(id)) continue;
      this.coins.delete(id);
      img.destroy();
    }
  }

  destroy(): void {
    for (const v of this.chests.values()) v.destroy();
    this.chests.clear();
    for (const img of this.gems.values()) img.destroy();
    this.gems.clear();
    for (const img of this.coins.values()) img.destroy();
    this.coins.clear();
  }
}
