import Phaser from 'phaser';
import { lerp, sprites } from '@xiao/engine';
import { DEPTH, PALETTE } from '../config';
import { ALIENS } from '../data/aliens';
import { CLASSES } from '../data/classes';
import { t } from '../i18n';
import type { Projectile } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import type { PlayerId, SimEvent } from '../sim/types';
import { ArenaView } from './ArenaView';
import { Fx } from './Fx';
import { AlienView, RecruitView, SoldierView } from './UnitViews';

/** Couleurs d'anneau des autres joueurs (battle royale) ; le joueur local est toujours bleu. */
export const RIVAL_COLORS = [0xff5a5a, 0xffb938, 0xc77dff, 0x7dff9a, 0xff7ad9, 0xffffff, 0x3de0c0, 0xff8a3a, 0x9aa0ff];

/** Hauteur maximale (px) de l'arc d'une grenade en cloche (effet d'affichage uniquement). */
export const LOB_HEIGHT = 55;
/** Durée (s) avant l'impact pendant laquelle la zone d'une boule ennemie est signalée en rouge. */
const TELEGRAPH_S = 0.8;
/** Distance (px) de vol sur laquelle une balle rejoint sa trajectoire depuis la bouche du canon dessinée. */
const MUZZLE_BLEND_PX = 40;

interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
}

/**
 * Pont entre la simulation et Phaser : crée/détruit les vues au fil des entités
 * (par id), interpole leurs positions, dessine l'overlay (ombres, anneaux,
 * barres de vie, traçantes) et transforme les événements en effets.
 *
 * En réseau côté client, la même vue lira un état reconstruit depuis les snapshots.
 */
export class WorldView {
  readonly arena: ArenaView;
  readonly fx: Fx;
  private readonly soldiers = new Map<number, SoldierView>();
  private readonly aliens = new Map<number, AlienView>();
  private readonly recruits = new Map<number, RecruitView>();
  private readonly bullets: Phaser.GameObjects.Image[] = [];
  private readonly tracers: Tracer[] = [];
  /** Flashes de tir en cours : ils suivent la bouche du canon de leur soldat (dx, dy : repli si la planche n'en définit pas). */
  private readonly flashes: { img: Phaser.GameObjects.Image; view: SoldierView; dx: number; dy: number }[] = [];
  /**
   * Balles fraîchement tirées : décalage (dx, dy) entre l'origine simulée (sx, sy) et la bouche du canon dessinée.
   * Affichage seulement : la balle part visuellement du flash de tir puis rejoint sa vraie trajectoire.
   */
  private readonly muzzleShift = new Map<Projectile, { sx: number; sy: number; dx: number; dy: number }>();
  /** Globes d'XP : pool d'images réutilisées dans l'ordre (comme les projectiles). */
  private readonly orbImgs: Phaser.GameObjects.Image[] = [];
  /** Kamikazes morts : le corps reste sur place, clignote puis explose (l'explosion elle-même vient de la simulation). */
  private readonly fuses: { x: number; y: number; r: number; t: number; dur: number; img: Phaser.GameObjects.Sprite; base: number }[] = [];
  /** Langues en cours : elles relient une grenouille au soldat attrapé pendant `dur` secondes. */
  private readonly tongues: { alien: number; target: number; t: number; dur: number }[] = [];
  /** Flaques de slimes morts (ressuscitables) et cailloux au sol, par id de simulation. */
  private readonly corpseImgs = new Map<number, Phaser.GameObjects.Image>();
  private readonly rockImgs = new Map<number, Phaser.GameObjects.Image>();
  /** Flammes au sol (traînées des slimes de feu), par id de simulation. */
  private readonly fireImgs = new Map<number, { img: Phaser.GameObjects.Image; base: number; seed: number; r: number }>();
  private readonly lobShadows: { x: number; y: number; h: number }[] = [];
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly beams: Phaser.GameObjects.Graphics;
  private readonly colors = new Map<PlayerId, number>();
  private nextRival = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Sim,
    readonly localPlayer: PlayerId,
  ) {
    this.arena = new ArenaView(scene, sim.map);
    this.fx = new Fx(scene);
    this.ground = scene.add.graphics().setDepth(DEPTH.groundFx);
    this.bars = scene.add.graphics().setDepth(DEPTH.bars);
    this.beams = scene.add.graphics().setDepth(DEPTH.fx);
    for (const sq of sim.squads) this.colorOf(sq.owner);
  }

  /** Couleur d'anneau d'un joueur, attribuée à sa première apparition (arrivée en cours de partie comprise). */
  colorOf(owner: PlayerId): number {
    let c = this.colors.get(owner);
    if (c === undefined) {
      c = owner === this.localPlayer ? PALETTE.allyRing : RIVAL_COLORS[this.nextRival++ % RIVAL_COLORS.length];
      this.colors.set(owner, c);
    }
    return c;
  }

  // ---------- Événements ----------

  handle(e: SimEvent): void {
    const nearCam = (x: number, y: number) => {
      const v = this.scene.cameras.main.worldView;
      return x > v.x - 200 && x < v.right + 200 && y > v.y - 200 && y < v.bottom + 200;
    };
    switch (e.t) {
      case 'hit': {
        const v = this.soldiers.get(e.id) ?? this.aliens.get(e.id);
        if (v) v.flash = v instanceof SoldierView ? 0.1 : 0.06;
        break;
      }
      case 'beam':
        this.tracers.push({ ...e, life: 0.12 });
        this.fx.burst(e.x2, e.y2, 0xb8ffb8, 6);
        break;
      case 'alienDied': {
        const def = ALIENS[e.alien];
        this.fx.burst(e.x, e.y - def.radius * 0.6, def.color, e.alien === 'crab' ? 40 : 10);
        if (e.alien.startsWith('slime')) {
          const size = e.alien === 'slime_pink' ? 0.5 : e.alien === 'slime_blue' ? 1.6 : 1;
          const light = e.alien === 'slime_pink' ? 0xffd6ea : e.alien === 'slime_blue' ? 0xcfe6ff : 0xc8ffb0;
          this.fx.gloop(e.x, e.y - def.radius * 0.6, def.color, light, size);
          if (nearCam(e.x, e.y)) this.fx.puddles(e.x, e.y, def.color, size === 0.5 ? 0.6 : size);
        }
        if (e.alien === 'crab') {
          this.fx.explosion(e.x, e.y, 160, nearCam(e.x, e.y));
          this.fx.text(e.x, e.y - 90, 'BOSS DOWN!', '#ffe066', 34);
        }
        break;
      }
      case 'soldierDied': {
        this.corpse(e.id, e.cls, e.x, e.y);
        this.fx.burst(e.x, e.y - 20, CLASSES[e.cls].color, 14);
        if (e.owner === this.localPlayer && !CLASSES[e.cls].deathBlast) this.scene.cameras.main.shake(90, 0.004);
        break;
      }
      case 'shot':
        if (e.cls === 'gunner' && nearCam(e.x, e.y)) {
          const view = this.soldiers.get(e.id);
          const mp = view?.muzzlePoint();
          const p = mp ?? e;
          if (mp) this.shiftFreshBullets(e.x, e.y, mp.x - e.x, mp.y - e.y);
          const img = this.fx.muzzleFlash(p.x, p.y);
          if (view) this.flashes.push({ img, view, dx: e.x - view.rx, dy: e.y - view.ry });
        }
        break;
      case 'impact':
        if (e.texture === 'fx_blaster_blue' && nearCam(e.x, e.y)) this.fx.impact(e.x, e.y, 0x5ab4ff);
        break;
      case 'restart': {
        // nouvelle partie : on efface tout ce qui reste au sol
        for (const img of this.corpseImgs.values()) img.destroy();
        for (const img of this.rockImgs.values()) img.destroy();
        for (const f of this.fireImgs.values()) f.img.destroy();
        for (const f of this.fuses) f.img.destroy();
        this.corpseImgs.clear();
        this.rockImgs.clear();
        this.fireImgs.clear();
        this.fuses.length = 0;
        this.tongues.length = 0;
        break;
      }
      case 'fuse': {
        const id = `alien_${e.alien}`;
        const img = sprites.add(this.scene, id, e.x, e.y).setDepth(DEPTH.actors + e.y);
        sprites.place(img, id);
        const base = sprites.scaleOf(id);
        img.setScale(base);
        this.fuses.push({ x: e.x, y: e.y, r: e.r, t: e.delay, dur: e.delay, img, base });
        break;
      }
      case 'corpse': {
        const color = ALIENS[e.alien].color;
        const img = this.scene.add
          .image(e.x, e.y, 'fx_puddle')
          .setTint(color)
          .setDepth(DEPTH.groundFx - 0.3)
          .setScale(0.85 * (ALIENS[e.alien].radius / 16), 0.55 * (ALIENS[e.alien].radius / 16))
          .setFlipX(Math.random() < 0.5)
          .setAlpha(0.8);
        this.corpseImgs.set(e.id, img);
        break;
      }
      case 'corpseEnd': {
        const img = this.corpseImgs.get(e.id);
        this.corpseImgs.delete(e.id);
        if (e.revived) {
          img?.destroy();
          this.fx.ring(e.x, e.y, 70, 0xffe14a);
          this.fx.gloop(e.x, e.y - 8, 0xffd84a, 0xfff6c0, 0.9);
        } else if (img) {
          this.scene.tweens.add({ targets: img, alpha: 0, duration: 400, onComplete: () => img.destroy() });
        }
        break;
      }
      case 'rock': {
        const img = this.scene.add.image(e.x, e.y, 'fx_rock').setOrigin(0.5, 0.6).setDepth(DEPTH.actors + e.y);
        const target = (e.r * 2.1) / 48;
        img.setScale(target * 0.4);
        this.scene.tweens.add({ targets: img, scale: target, duration: 160, ease: 'Back.Out' });
        this.rockImgs.set(e.id, img);
        if (nearCam(e.x, e.y)) this.fx.burst(e.x, e.y, 0x8a7d74, 8);
        break;
      }
      case 'rockEnd': {
        const img = this.rockImgs.get(e.id);
        this.rockImgs.delete(e.id);
        if (img) this.scene.tweens.add({ targets: img, alpha: 0, scale: img.scale * 0.6, duration: 350, onComplete: () => img.destroy() });
        break;
      }
      case 'fire': {
        const img = this.scene.add.image(e.x, e.y - 6, 'fx_flame').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.groundFx + 0.3);
        const base = (e.r * 2.4) / 40;
        img.setScale(base * 0.3);
        this.fireImgs.set(e.id, { img, base, seed: Math.random() * 10, r: e.r });
        break;
      }
      case 'fireEnd': {
        const f = this.fireImgs.get(e.id);
        this.fireImgs.delete(e.id);
        if (f) this.scene.tweens.add({ targets: f.img, alpha: 0, scale: f.base * 0.3, duration: 300, onComplete: () => f.img.destroy() });
        break;
      }
      case 'capture': {
        const v = this.aliens.get(e.alien);
        if (v) this.fx.ring(v.rx, v.ry, 60, 0x8fe0ff);
        break;
      }
      case 'release':
        this.fx.ring(e.x, e.y, 80, 0xffffff);
        this.fx.burst(e.x, e.y - 14, 0x8fe0ff, 16);
        break;
      case 'tongue':
        this.tongues.push({ alien: e.alien, target: e.target, t: e.dur, dur: e.dur });
        break;
      case 'explosion':
        if (e.style === 'slime') {
          // boule de slime : éclaboussure bleue au sol plutôt que des flammes
          this.fx.gloop(e.x, e.y, 0x5aa8ff, 0xcfe6ff, e.r / 60);
          this.fx.puddles(e.x, e.y, 0x5aa8ff, e.r / 70);
          this.fx.ring(e.x, e.y, e.r, 0x5aa8ff);
          break;
        }
        // pas de secousse pour les petites explosions (grenades), sinon l'écran tremble en permanence
        this.fx.explosion(e.x, e.y, e.r, e.r >= 100 && nearCam(e.x, e.y));
        break;
      case 'slam':
        this.fx.ring(e.x, e.y, e.r, 0xff6a6a);
        if (nearCam(e.x, e.y)) this.scene.cameras.main.shake(220, 0.01);
        break;
      case 'recruited':
        this.fx.burst(e.x, e.y - 20, CLASSES[e.cls].color, 16);
        this.fx.ring(e.x, e.y, 60, CLASSES[e.cls].color);
        if (e.owner === this.localPlayer) this.fx.text(e.x, e.y - 60, t('recruit', { name: t(`class_${e.cls}`) }), '#ffe066', 24);
        break;
      case 'heal':
        if (nearCam(e.x, e.y)) this.fx.heal(e.x, e.y);
        break;
      case 'squadSpawned':
        this.fx.ring(e.x, e.y, 200, this.colorOf(e.owner));
        break;
      case 'levelUp': {
        if (e.owner !== this.localPlayer) break;
        const c = this.sim.squadOf(e.owner)?.center;
        if (!c) break;
        this.fx.ring(c.x, c.y, 150, 0x5aa8ff);
        this.fx.text(c.x, c.y - 80, t('levelUpTitle', { level: e.level }), '#9fd3ff', 30);
        break;
      }
      case 'squadWiped':
        break;
    }
  }

  /** Animation de mort (si la planche en a une) : le corps reste un instant puis s'efface. */
  private corpse(soldierId: number, cls: string, x: number, y: number): void {
    const id = `soldier_${cls}`;
    if (!sprites.hasAnim(id, 'die')) return;
    const c = sprites.add(this.scene, id, x, y).setDepth(DEPTH.actors + y - 1);
    c.setFlipX(this.soldiers.get(soldierId)?.flipX ?? false);
    sprites.play(c, id, 'die');
    sprites.place(c, id);
    this.scene.tweens.add({ targets: c, alpha: 0, delay: 1400, duration: 600, onComplete: () => c.destroy() });
  }

  // ---------- Rendu ----------

  render(alpha: number, dt: number, time: number): void {
    this.syncUnits(alpha, dt, time);
    this.followFlashes();
    this.syncProjectiles(alpha);
    this.syncOrbs(alpha, time);
    this.updateFuses(dt, time);
    this.updateFires(time);
    this.drawOverlay(time, dt);
    this.arena.update(this.scene.cameras.main.worldView);
  }

  /** Centre affiché (interpolé) de la squad d'un joueur, pour la caméra. */
  squadFocus(owner: PlayerId): { x: number; y: number } | null {
    const sq = this.sim.squadOf(owner);
    if (!sq || !sq.alive) return null;
    const c = sq.center;
    return { x: c.x, y: c.y };
  }

  private syncUnits(alpha: number, dt: number, time: number): void {
    for (const v of this.soldiers.values()) v.seen = false;
    for (const sq of this.sim.squads) {
      for (const s of sq.soldiers) {
        let v = this.soldiers.get(s.id);
        if (!v) {
          v = new SoldierView(this.scene, s, this.colorOf(s.owner));
          this.soldiers.set(s.id, v);
        }
        v.seen = true;
        v.sync(alpha, dt, time);
      }
    }
    this.prune(this.soldiers);

    for (const v of this.aliens.values()) v.seen = false;
    for (const a of this.sim.aliens) {
      let v = this.aliens.get(a.id);
      if (!v) {
        v = new AlienView(this.scene, a);
        this.aliens.set(a.id, v);
      }
      v.seen = true;
      v.sync(alpha, dt, time);
    }
    this.prune(this.aliens);

    for (const v of this.recruits.values()) v.seen = false;
    for (const r of this.sim.recruits.items) {
      let v = this.recruits.get(r.id);
      if (!v) {
        v = new RecruitView(this.scene, r, CLASSES[r.cls].color);
        this.recruits.set(r.id, v);
      }
      v.seen = true;
      v.sync(alpha, time);
    }
    this.prune(this.recruits);
  }

  private prune<V extends { seen: boolean; destroy(): void }>(map: Map<number, V>): void {
    for (const [id, v] of map) {
      if (v.seen) continue;
      v.destroy();
      map.delete(id);
    }
  }

  /** Les projectiles n'ont pas d'id : on réutilise un pool d'images, dans l'ordre. */
  private syncProjectiles(alpha: number): void {
    const list = this.sim.combat.projectiles.active;
    this.lobShadows.length = 0;
    while (this.bullets.length < list.length) this.bullets.push(this.scene.add.image(0, 0, 'fx_bullet').setDepth(DEPTH.fx - 1));
    for (let i = 0; i < this.bullets.length; i++) {
      const img = this.bullets[i];
      const p = list[i];
      if (!p) {
        img.setVisible(false);
        continue;
      }
      const x = lerp(p.px, p.x, alpha);
      const y = lerp(p.py, p.y, alpha);
      if (img.texture.key !== p.texture) img.setTexture(p.texture);
      if (p.lob) {
        // grenade : trajectoire au sol + arc vertical ; l'ombre reste au sol
        const k = Math.min(1, Math.max(0, 1 - p.life / p.maxLife));
        const h = 4 * LOB_HEIGHT * k * (1 - k);
        this.lobShadows.push({ x, y, h });
        img.setVisible(true).setPosition(x, y - h).setRotation(k * 14).setScale(1 + (h / LOB_HEIGHT) * 0.3).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
      } else if (p.flame) {
        img.setVisible(true).setPosition(x, y).setRotation(Math.atan2(p.vy, p.vx));
        const k = 1 - p.life / p.maxLife;
        img.setScale(0.35 + k * 1.3).setAlpha(1 - k * k).setBlendMode(Phaser.BlendModes.ADD);
      } else {
        let bx = x;
        let by = y;
        const sh = this.muzzleShift.get(p);
        if (sh) {
          const k = 1 - Math.hypot(x - sh.sx, y - sh.sy) / MUZZLE_BLEND_PX;
          if (k > 0) {
            bx += sh.dx * k;
            by += sh.dy * k;
          } else this.muzzleShift.delete(p);
        }
        img.setVisible(true).setPosition(bx, by).setRotation(Math.atan2(p.vy, p.vx));
        img.setScale(1).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
      }
    }
  }

  /** Les balles nées à (sx, sy) ce tick partent visuellement de la bouche du canon (décalage dx, dy, résorbé en vol). */
  private shiftFreshBullets(sx: number, sy: number, dx: number, dy: number): void {
    if (this.muzzleShift.size > 200) this.muzzleShift.clear();
    for (const p of this.sim.combat.projectiles.active) {
      if (p.lob || p.flame || Math.abs(p.px - sx) > 0.5 || Math.abs(p.py - sy) > 0.5) continue;
      this.muzzleShift.set(p, { sx, sy, dx, dy });
    }
  }

  /** Globes d'XP : taille selon la valeur, léger flottement, clignote avant de disparaître ; masqués hors caméra. */
  private syncOrbs(alpha: number, time: number): void {
    const orbs = this.sim.xp.orbs;
    const view = this.scene.cameras.main.worldView;
    while (this.orbImgs.length < orbs.length) this.orbImgs.push(this.scene.add.image(0, 0, 'fx_xp').setDepth(DEPTH.groundFx + 0.2).setBlendMode(Phaser.BlendModes.ADD));
    for (let i = 0; i < this.orbImgs.length; i++) {
      const img = this.orbImgs[i];
      const o = orbs[i];
      if (!o) {
        img.setVisible(false);
        continue;
      }
      const x = lerp(o.px, o.x, alpha);
      const y = lerp(o.py, o.y, alpha);
      if (x < view.x - 40 || x > view.right + 40 || y < view.y - 40 || y > view.bottom + 40) {
        img.setVisible(false);
        continue;
      }
      const size = o.value >= 8 ? 1.25 : o.value >= 3 ? 0.85 : 0.55;
      const bob = Math.sin(time * 4 + o.id) * 2.5;
      const blink = o.life < 5 && Math.sin(time * 18) > 0;
      img.setVisible(true).setPosition(x, y - 8 + bob).setScale(size * (1 + Math.sin(time * 6 + o.id) * 0.06)).setAlpha(blink ? 0.35 : 1);
    }
  }

  /** Flammes : elles vacillent (taille, transparence) ; cachées hors de la caméra. */
  private updateFires(time: number): void {
    const view = this.scene.cameras.main.worldView;
    for (const f of this.fireImgs.values()) {
      const { img } = f;
      if (!img.active) continue;
      if (img.x < view.x - 40 || img.x > view.right + 40 || img.y < view.y - 40 || img.y > view.bottom + 40) {
        img.setVisible(false);
        continue;
      }
      const w = 1 + Math.sin(time * 11 + f.seed) * 0.12 + Math.sin(time * 23 + f.seed * 2) * 0.06;
      img.setVisible(true).setScale(Math.min(f.base, img.scaleX + f.base * 0.12) * w, Math.min(f.base, img.scaleY + f.base * 0.12) * w * 0.9).setAlpha(0.75 + Math.sin(time * 15 + f.seed) * 0.2);
    }
  }

  /** Corps de kamikaze en attente d'explosion : clignote de plus en plus vite, enfle un peu. */
  private updateFuses(dt: number, time: number): void {
    for (let i = this.fuses.length - 1; i >= 0; i--) {
      const f = this.fuses[i];
      f.t -= dt;
      if (f.t <= 0) {
        f.img.destroy();
        this.fuses.splice(i, 1);
        continue;
      }
      const k = 1 - f.t / f.dur;
      if (Math.sin(time * (14 + 34 * k)) > 0) f.img.setTint(0xff3a2a).setTintMode(Phaser.TintModes.FILL);
      else f.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      f.img.setScale(f.base * (1 + 0.18 * k));
    }
  }

  /** Incantations des chamans : un fil magique pulsé jusqu'à la flaque visée, qui se referme en cercle jusqu'à la résurrection. */
  private drawCasts(l: Phaser.GameObjects.Graphics, time: number): void {
    for (const v of this.aliens.values()) {
      const a = v.state;
      const rv = a.def.revive;
      if (!rv || a.castT <= 0) continue;
      const ci = this.corpseImgs.get(a.castCorpse);
      if (!ci?.active) continue;
      const c = { x: ci.x, y: ci.y };
      const k = 1 - a.castT / rv.cast;
      const sx = v.rx;
      const sy = v.ry - a.radius;
      const steps = 14;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 0.55) / steps;
        const wob = (t: number) => Math.sin(time * 9 + t * 8) * 7 * Math.sin(t * Math.PI);
        l.lineStyle(3, 0xffe14a, 0.35 + 0.5 * k).lineBetween(
          sx + (c.x - sx) * t0,
          sy + (c.y - sy) * t0 + wob(t0),
          sx + (c.x - sx) * t1,
          sy + (c.y - sy) * t1 + wob(t1),
        );
      }
      l.lineStyle(3, 0xffe14a, 0.4 + 0.5 * k).strokeCircle(c.x, c.y, 34 * (1 - 0.6 * k) + 6);
      l.fillStyle(0xffe14a, 0.12 + 0.25 * k).fillCircle(c.x, c.y, 26 * k + 4);
      l.lineStyle(2, 0xffe14a, 0.5).strokeCircle(sx, sy, a.radius + 6 + Math.sin(time * 10) * 3);
    }
  }

  /** Langues des grenouilles : elles jaillissent vite, suivent le soldat tiré, puis s'effacent. */
  private drawTongues(l: Phaser.GameObjects.Graphics, dt: number): void {
    for (let i = this.tongues.length - 1; i >= 0; i--) {
      const tg = this.tongues[i];
      tg.t -= dt;
      const av = this.aliens.get(tg.alien);
      const sv = this.soldiers.get(tg.target);
      if (tg.t <= 0 || !av || !sv) {
        this.tongues.splice(i, 1);
        continue;
      }
      const sx = av.rx;
      const sy = av.ry - av.state.radius * 0.6;
      const ext = Math.min(1, (tg.dur - tg.t) / 0.1); // part de la longueur déjà sortie
      const ex = sx + (sv.rx - sx) * ext;
      const ey = sy + (sv.ry - 12 - sy) * ext;
      const a = Math.min(1, tg.t / 0.12);
      l.lineStyle(7, 0xc23a6a, a).lineBetween(sx, sy, ex, ey);
      l.lineStyle(4, 0xff7fa8, a).lineBetween(sx, sy, ex, ey);
      l.fillStyle(0xff7fa8, a).fillCircle(ex, ey, 6);
    }
  }

  private followFlashes(): void {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      if (!f.img.active) {
        this.flashes.splice(i, 1);
        continue;
      }
      const p = f.view.muzzlePoint() ?? { x: f.view.rx + f.dx, y: f.view.ry + f.dy };
      f.img.setPosition(p.x, p.y);
    }
  }

  private drawOverlay(time: number, dt: number): void {
    const g = this.ground;
    g.clear();
    g.fillStyle(0x2a1d2e, 0.28);
    for (const v of this.aliens.values()) {
      const k = sprites.get(`alien_${v.state.def.id}`).shadow ?? 1;
      const r = v.state.radius * (v.state.def.floats ? 0.7 : 1) * k;
      g.fillEllipse(v.rx, v.ry, r * 2.1, r * 0.9);
    }
    for (const sq of this.sim.squads) {
      if (!sq.isHealing) continue;
      for (const s of sq.soldiers) {
        const heal = s.def.heal;
        const v = this.soldiers.get(s.id);
        if (!heal || !v) continue;
        const r = heal.radius * (0.95 + Math.sin(time * 4) * 0.05);
        g.fillStyle(0x5eff8a, 0.08).fillEllipse(v.rx, v.ry, r * 2, r * 1.4);
        g.lineStyle(2, 0x5eff8a, 0.35).strokeEllipse(v.rx, v.ry, r * 2, r * 1.4);
      }
    }
    // Télégraphe : zone d'impact des boules ennemies, en rouge, pendant la dernière partie du vol (uniquement là où la
    // simulation tourne : le client réseau ne connaît ni la durée ni le rayon).
    for (const p of this.sim.combat.projectiles.active) {
      if (!p.lob || p.team !== 'aliens' || p.aoe <= 0 || p.life >= TELEGRAPH_S) continue;
      const k = 1 - p.life / TELEGRAPH_S; // 0 → 1 jusqu'à l'impact
      const ix = p.x + p.vx * p.life;
      const iy = p.y + p.vy * p.life;
      g.fillStyle(0xff2a2a, 0.1 + 0.22 * k).fillEllipse(ix, iy, p.aoe * 2, p.aoe * 1.4);
      g.fillStyle(0xff2a2a, 0.12 + 0.2 * k).fillEllipse(ix, iy, p.aoe * 2 * k, p.aoe * 1.4 * k);
      g.lineStyle(3, 0xff4a3a, 0.5 + 0.4 * k).strokeEllipse(ix, iy, p.aoe * 2, p.aoe * 1.4);
    }
    // Télégraphes rouges : explosion retardée d'un kamikaze (zone qui se remplit) et couloir de charge du rhinocéros
    for (const f of this.fuses) {
      const k = 1 - f.t / f.dur;
      g.fillStyle(0xff2a2a, 0.1 + 0.22 * k).fillEllipse(f.x, f.y, f.r * 2, f.r * 1.4);
      g.fillStyle(0xff2a2a, 0.12 + 0.2 * k).fillEllipse(f.x, f.y, f.r * 2 * k, f.r * 1.4 * k);
      g.lineStyle(3, 0xff4a3a, 0.5 + 0.4 * k).strokeEllipse(f.x, f.y, f.r * 2, f.r * 1.4);
    }
    for (const v of this.aliens.values()) {
      const a = v.state;
      const rush = a.def.rush;
      if (!rush || !(a.rushWind > 0 || a.rushT > 0)) continue;
      const k = a.rushWind > 0 ? 1 - a.rushWind / rush.windup : 1;
      const dx = a.rushDx;
      const dy = a.rushDy;
      const nx = -dy * (rush.width / 2);
      const ny = dx * (rush.width / 2);
      const L = rush.length;
      const x0 = v.rx; // la zone part de l'alien
      const y0 = v.ry;
      const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
      const lane = (len: number) => [V(x0 + nx, y0 + ny), V(x0 - nx, y0 - ny), V(x0 - nx + dx * len, y0 - ny + dy * len), V(x0 + nx + dx * len, y0 + ny + dy * len)];
      g.fillStyle(0xff2a2a, a.rushWind > 0 ? 0.1 + 0.12 * k : 0.12).fillPoints(lane(L), true);
      if (a.rushWind > 0) g.fillStyle(0xff2a2a, 0.15 + 0.2 * k).fillPoints(lane(L * k), true);
      g.lineStyle(3, 0xff4a3a, 0.5 + 0.4 * k).strokePoints(lane(L), true);
    }
    // traces de brûlure au sol sous les flammes
    for (const f of this.fireImgs.values()) {
      if (!f.img.active) continue;
      g.fillStyle(0x3a1408, 0.3).fillEllipse(f.img.x, f.img.y + 8, f.r * 2.1, f.r * 1.3);
      g.fillStyle(0xff5a1a, 0.1).fillEllipse(f.img.x, f.img.y + 8, f.r * 1.7, f.r * 1.05);
    }
    for (const s of this.lobShadows) {
      const k = 1 - Math.min(1, s.h / LOB_HEIGHT) * 0.4;
      g.fillStyle(0x2a1d2e, 0.3 * k).fillEllipse(s.x, s.y, 16 * k, 7 * k);
    }
    for (const v of this.soldiers.values()) {
      const r = v.state.radius;
      const k = sprites.get(`soldier_${v.state.def.id}`).shadow ?? 1;
      g.fillStyle(0x2a1d2e, 0.3).fillEllipse(v.rx, v.ry, r * 2.2 * k, r * k);
      g.lineStyle(3, v.ringColor, 0.9).strokeEllipse(v.rx, v.ry, r * 2.6, r * 1.3);
    }

    const b = this.bars;
    b.clear();
    for (const v of this.soldiers.values()) {
      const s = v.state;
      if (s.hp >= s.maxHp) continue;
      const color = s.owner === this.localPlayer ? PALETTE.hpAlly : v.ringColor;
      this.bar(b, v.rx, v.ry - (s.def.id === 'tank' ? 66 : 58), 30, s.hp / s.maxHp, color);
    }
    for (const v of this.aliens.values()) {
      const a = v.state;
      if (a.hp >= a.maxHp) continue;
      const top = v.body.displayHeight * v.body.originY + 8;
      this.bar(b, v.rx, v.ry - top, a.def.hpBarWidth, a.hp / a.maxHp, PALETTE.hpEnemy);
    }

    const l = this.beams;
    l.clear();
    this.drawTongues(l, dt);
    this.drawCasts(l, time);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.tracers.splice(i, 1);
        continue;
      }
      const k = tr.life / 0.12;
      l.lineStyle(6 * k, 0x7dff9a, 0.35 * k).lineBetween(tr.x1, tr.y1, tr.x2, tr.y2);
      l.lineStyle(2.5 * k, 0xeaffea, k).lineBetween(tr.x1, tr.y1, tr.x2, tr.y2);
    }
  }

  private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, ratio: number, color: number): void {
    const h = 5;
    g.fillStyle(PALETTE.hpBack, 0.85).fillRoundedRect(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3, 3);
    g.fillStyle(color, 1).fillRect(x - w / 2, y, Math.max(0, w * Math.max(0, ratio)), h);
  }
}
