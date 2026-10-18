import Phaser from 'phaser';
import { lerp } from '@xiao/engine';
import { COIN_KEY, ensureGemTextures, GEM_CHEST_KEY, GEM_GREEN, GEM_KEY } from '../art/gems';
import { COINS, DEPTH, DIFFICULTY, GEM_CHEST } from '../config';

/** Échelle des pièces d'or au sol (0,34 d'origine, +50 % le 17/10), sans cercle posé dessous. */
const COIN_SCALE = 0.34 * 1.5;
import type { GemChestState } from '../sim/entities';
import { GEM_FALL_TIME } from '../sim/Gems';
import type { Sim } from '../sim/Sim';
import { GLOBE_LIFT } from './GlobeGlitter';
import { drawPickupSpot } from './PickupViews';

/** Icône « vidéo récompensée » (paquet 1, la même que les boutons rewarded). */
const REWARDED_ICON = 'ui_rewarded';
const GEM_SCALE = 0.5;
/** Hauteur maximale (px) de l'arc de chute d'un diamant. */
const FALL_HEIGHT = 70;
/** Rayon (px) de la jauge circulaire autour de l'icône rewarded, et hauteur de l'icône au-dessus du coffre. */
const GAUGE_R = 34;
const ICON_LIFT = 118;

/**
 * Un coffre à diamants : il saute en cloche de l'œuf jusqu'à sa place (comme les globes d'upgrade ; poussière à l'atterrissage), puis icône « vidéo récompensée » au-dessus et jauge
 * circulaire qui se remplit pendant que la squad reste autour ; il clignote pendant ses dernières secondes avant de disparaître.
 */
class ChestView {
  private readonly chest: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly gauge: Phaser.GameObjects.Graphics;
  private landed = false;

  constructor(
    scene: Phaser.Scene,
    readonly state: GemChestState,
    private readonly onLand: () => ((x: number, y: number, r: number) => void) | undefined,
  ) {
    this.chest = scene.add.image(state.x, state.y, GEM_CHEST_KEY).setOrigin(0.5, 0.92).setScale(1);
    this.icon = scene.add.image(state.x, state.y - ICON_LIFT, scene.textures.exists(REWARDED_ICON) ? REWARDED_ICON : GEM_KEY);
    this.icon.setScale((GAUGE_R * 1.3) / Math.max(this.icon.width, this.icon.height));
    this.gauge = scene.add.graphics();
  }

  /** Avancement du saut (0 → 1) : sert aussi à l'ombre dessinée au sol (`GemViews.drawGround`). */
  get fall(): number {
    return this.state.hop ? Math.max(0, Math.min(1, 1 - this.state.hop.t / GEM_FALL_TIME)) : 1;
  }

  sync(time: number, alpha: number): void {
    const s = this.state;
    const x = lerp(s.px, s.x, alpha);
    const y = lerp(s.py, s.y, alpha);
    const p = this.fall;
    const arc = s.hop ? Math.sin(Math.PI * p) * FALL_HEIGHT : 0; // saut en cloche
    if (!s.hop && !this.landed) {
      this.landed = true;
      this.onLand()?.(x, y, 50); // atterrit : poussière
    }
    const blink = s.age > DIFFICULTY.gemChestLife - GEM_CHEST.blink && Math.sin(time * 18) > 0; // dernières secondes : clignote
    const depth = DEPTH.actors + y;
    this.chest.setPosition(x, y - arc).setDepth(depth).setAlpha(blink ? 0.35 : 1);
    const shown = !s.hop;
    const iy = y - ICON_LIFT + Math.sin(time * 4 + s.id) * 3;
    this.icon.setPosition(x, iy).setDepth(depth + 1).setAlpha(blink ? 0.35 : s.state === 'cooldown' ? 0.4 : 1).setVisible(shown);
    const g = this.gauge;
    g.clear().setDepth(depth + 0.5).setVisible(shown);
    if (!shown) return;
    // pastille sombre derrière l'icône, piste de la jauge puis arc vert qui se remplit à partir du haut
    g.fillStyle(0x0b1a2e, blink ? 0.3 : 0.75).fillCircle(x, iy, GAUGE_R);
    g.lineStyle(6, 0xffffff, 0.22).strokeCircle(x, iy, GAUGE_R);
    if (s.charge > 0.001) {
      const start = -Math.PI / 2;
      g.lineStyle(6, GEM_GREEN, 1).beginPath().arc(x, iy, GAUGE_R, start, start + s.charge * Math.PI * 2, false).strokePath();
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
  /** Posé par `WorldView` : poussière quand un coffre atterrit (seulement s'il est à l'écran). */
  onLand?: (x: number, y: number, r: number) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Sim,
  ) {
    ensureGemTextures(scene);
  }

  /** Ombre sous chaque pièce, rond vert sous chaque diamant posé. */
  drawGround(g: Phaser.GameObjects.Graphics, time: number): void {
    for (const [, v] of this.chests) g.fillStyle(0x2a1d2e, 0.18 + 0.22 * v.fall).fillEllipse(v.state.x, v.state.y, 62 + 16 * v.fall, 26 + 6 * v.fall); // ombre portée au sol (suit le saut)
    for (const it of this.sim.gems.coins) {
      // ombre portée de la pièce (elle se resserre et s'éclaircit quand la pièce est en l'air) ; clignote avec elle avant de disparaître
      const air = it.hop ? Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - it.hop.t / GEM_FALL_TIME))) : 0;
      const blink = it.life < COINS.blink && Math.sin(time * 18) > 0;
      g.fillStyle(0x2a1d2e, (0.3 - 0.14 * air) * (blink ? 0.35 : 1)).fillEllipse(it.x, it.y + 2, 30 * (1 - 0.3 * air), 11 * (1 - 0.3 * air));
    }
    for (const it of this.sim.gems.items) if (!it.hop) drawPickupSpot(g, it.x, it.y, GEM_GREEN, time, it.id, 0.8, 0.45);
  }

  sync(time: number, alpha: number): void {
    const liveC = new Set<number>();
    for (const c of this.sim.gems.chests) {
      liveC.add(c.id);
      let v = this.chests.get(c.id);
      if (!v) {
        v = new ChestView(this.scene, c, () => this.onLand);
        this.chests.set(c.id, v);
      }
      v.sync(time, alpha);
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
        img = this.scene.add.image(it.x, it.y, COIN_KEY).setScale(COIN_SCALE);
        this.coins.set(it.id, img);
      }
      const x = lerp(it.px, it.x, alpha);
      const y = lerp(it.py, it.y, alpha);
      const fall = it.hop ? Math.max(0, Math.min(1, 1 - it.hop.t / GEM_FALL_TIME)) : 1;
      const arc = it.hop ? Math.sin(Math.PI * fall) * 40 : 0;
      const bob = it.hop ? 0 : Math.sin(time * 5 + it.id) * 2;
      img.setPosition(x, y - 14 - arc + bob).setDepth(DEPTH.actors + y + 40).setScale(COIN_SCALE * Math.max(0.15, Math.abs(Math.cos(time * 4 + it.id))), COIN_SCALE).setAlpha(it.life < COINS.blink && Math.sin(time * 18) > 0 ? 0.35 : 1);
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
