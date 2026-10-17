import Phaser from 'phaser';
import { lerp } from '@xiao/engine';
import { COIN_GOLD, COIN_KEY, ensureGemTextures, GEM_CHEST_KEY, GEM_GREEN, GEM_KEY, PARACHUTE_KEY } from '../art/gems';
import { COINS, CRATES, DEPTH, GEM_CHEST } from '../config';
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
 * Un coffre à diamants : il descend du ciel en parachute (il grossit, son ombre marque l'endroit d'atterrissage, rebond écrasé et poussière à l'arrivée, le parachute
 * s'affaisse), puis icône « vidéo récompensée » au-dessus et jauge circulaire qui se remplit pendant que la squad reste autour.
 */
class ChestView {
  private readonly chest: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly gauge: Phaser.GameObjects.Graphics;
  private parachute?: Phaser.GameObjects.Image;
  private landed = false;

  constructor(
    scene: Phaser.Scene,
    readonly state: GemChestState,
    private readonly onLand: () => ((x: number, y: number, r: number) => void) | undefined,
  ) {
    this.chest = scene.add.image(state.x, state.y, GEM_CHEST_KEY).setOrigin(0.5, 0.85).setScale(0.01);
    this.icon = scene.add.image(state.x, state.y - ICON_LIFT, scene.textures.exists(REWARDED_ICON) ? REWARDED_ICON : GEM_KEY);
    this.icon.setScale((GAUGE_R * 1.3) / Math.max(this.icon.width, this.icon.height));
    this.gauge = scene.add.graphics();
    this.parachute = scene.add.image(state.x, state.y, PARACHUTE_KEY).setOrigin(0.5, 1);
  }

  /** Avancement de la chute (0 → 1) : sert aussi à l'ombre dessinée au sol (`GemViews.drawGround`). */
  get fall(): number {
    return Math.min(1, this.state.age / CRATES.fall);
  }

  sync(time: number): void {
    const s = this.state;
    const F = CRATES.fall;
    const p = this.fall;
    const lift = s.age < F ? CRATES.height * (1 - p) ** 2 : 0; // descente en parachute : rapide au début, elle ralentit en arrivant
    let bump = 0;
    if (s.age >= F) {
      if (!this.landed) {
        this.landed = true;
        this.onLand()?.(s.x, s.y, 60); // atterrit : poussière
      }
      const tau = s.age - F;
      if (tau < 0.4) bump = 0.3 * Math.exp(-9 * tau) * Math.cos(22 * tau); // écrasé, puis rebondit en s'amortissant
    }
    const grow = Phaser.Math.Easing.Back.Out(p); // il grossit pendant qu'il tombe
    const base = 0.95 * grow;
    const depth = DEPTH.actors + s.y;
    this.chest.setPosition(s.x, s.y - lift).setDepth(depth).setScale(base * (1 + bump), base * (1 - bump));
    if (this.parachute) {
      const k = s.age < F ? 1 : 1 - (s.age - F) / 0.3; // à l'atterrissage il s'affaisse en 0,3 s puis disparaît
      if (k <= 0) {
        this.parachute.destroy();
        this.parachute = undefined;
      } else {
        this.parachute.setPosition(s.x, s.y - lift - 84 * base + (1 - k) * 30).setScale(base * 1.1, base * 1.1 * k).setDepth(depth + 1).setAlpha(Math.min(1, k * 1.5));
      }
    }
    const bob = Math.sin(time * 4 + s.id) * 3;
    const shown = s.age >= F;
    const iy = s.y - ICON_LIFT + bob;
    this.icon.setPosition(s.x, iy).setDepth(depth + 1).setAlpha(s.state === 'cooldown' ? 0.4 : 1).setVisible(shown);
    const g = this.gauge;
    g.clear().setDepth(depth + 0.5).setVisible(shown);
    if (!shown) return;
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
    this.parachute?.destroy();
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

  /** Rond vert sous chaque diamant posé. */
  drawGround(g: Phaser.GameObjects.Graphics, time: number): void {
    for (const [, v] of this.chests) g.fillStyle(0x2a1d2e, 0.18 + 0.22 * v.fall).fillEllipse(v.state.x, v.state.y, 62 + 16 * v.fall, 26 + 6 * v.fall); // ombre portée : marque l'endroit d'atterrissage
    for (const it of this.sim.gems.items) if (!it.hop) drawPickupSpot(g, it.x, it.y, GEM_GREEN, time, it.id, 0.8, 0.45);
    for (const it of this.sim.gems.coins) if (!it.hop) drawPickupSpot(g, it.x, it.y, COIN_GOLD, time, it.id, 0.6, 0.32);
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
