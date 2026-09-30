import Phaser from 'phaser';
import { lerp, sprites } from '@xiao/engine';
import { DEPTH, PALETTE } from '../config';
import { ALIENS } from '../data/aliens';
import { CLASSES } from '../data/classes';
import { t } from '../i18n';
import type { Sim } from '../sim/Sim';
import type { PlayerId, SimEvent } from '../sim/types';
import { ArenaView } from './ArenaView';
import { Fx } from './Fx';
import { AlienView, RecruitView, SoldierView } from './UnitViews';

/** Couleurs d'anneau des autres joueurs (battle royale) ; le joueur local est toujours bleu. */
export const RIVAL_COLORS = [0xff5a5a, 0xffb938, 0xc77dff, 0x7dff9a, 0xff7ad9, 0xffffff, 0x3de0c0, 0xff8a3a, 0x9aa0ff];

/** Hauteur maximale (px) de l'arc d'une grenade en cloche (effet d'affichage uniquement). */
export const LOB_HEIGHT = 55;

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
        if (e.alien === 'slime') {
          this.fx.gloop(e.x, e.y - def.radius * 0.6, def.color, 0xc8ffb0);
          if (nearCam(e.x, e.y)) this.fx.puddles(e.x, e.y, def.color);
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
          const p = view?.muzzlePoint() ?? e;
          const img = this.fx.muzzleFlash(p.x, p.y);
          if (view) this.flashes.push({ img, view, dx: e.x - view.rx, dy: e.y - view.ry });
        }
        break;
      case 'impact':
        if (e.texture === 'fx_blaster_blue' && nearCam(e.x, e.y)) this.fx.impact(e.x, e.y, 0x5ab4ff);
        break;
      case 'explosion':
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
        img.setVisible(true).setPosition(x, y).setRotation(Math.atan2(p.vy, p.vx));
        img.setScale(1).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
      }
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
