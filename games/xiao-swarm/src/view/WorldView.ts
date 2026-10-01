import Phaser from 'phaser';
import { lerp, sfx, sprites } from '@xiao/engine';
import { DEPTH, PALETTE, REVIVE_TIME, UPGRADE_REPEL } from '../config';
import { ALIENS } from '../data/aliens';
import { CLASSES } from '../data/classes';
import { t } from '../i18n';
import { SFX } from '../settings';
import type { Projectile } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import type { PlayerId, SimEvent } from '../sim/types';
import { ArenaView } from './ArenaView';
import { Fx } from './Fx';
import { FX } from '../fxParams';
import { ROCKET_TEXTURE } from '../sim/Combat';
import { PickupViews, POWERUP_INFO } from './PickupViews';
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
  /** Préparation de charge vue la dernière fois (valeur reçue et heure locale) : chez un client, `rushWind` n'arrive qu'à chaque snapshot, on la fait décroître entre deux pour un remplissage fluide. */
  private readonly rushWindSeen = new Map<number, { v: number; at: number }>();
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
  /** Bulles d'upgrade, power-ups, globes, compteurs d'escouade. */
  private readonly pickups: PickupViews;
  /** Halos d'apparition en cours : ils suivent leur soldat / leur squad au lieu de rester à l'endroit où ils sont nés. */
  private readonly followers: { parts: { img: Phaser.GameObjects.Image; dy: number }[]; pos: () => { x: number; y: number } | null }[] = [];
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
    this.pickups = new PickupViews(scene, sim, (id) => {
      const v = this.soldiers.get(id);
      return v ? { x: v.rx, y: v.ry } : undefined;
    });
    for (const sq of sim.squads) this.colorOf(sq.owner);
    this.quietUntil = scene.time.now + 1000; // les soldats déjà présents au chargement n'ont pas de colonne d'arrivée
  }

  /** Pas de colonne d'arrivée avant cet instant (ms) : départ de partie, réapparition, relance. */
  private quietUntil = 0;

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
        // gelée et flaques : vrais slimes seulement (`slime_pink` est désormais un petit cafard : simple éclaboussure)
        if (e.alien === 'slime_basic' || e.alien === 'slime_bombardier') {
          const size = e.alien === 'slime_bombardier' ? 1.6 : 1;
          const light = e.alien === 'slime_bombardier' ? 0xcfe6ff : 0xc8ffb0;
          this.fx.gloop(e.x, e.y - def.radius * 0.6, def.color, light, size);
          if (nearCam(e.x, e.y)) this.fx.puddles(e.x, e.y, def.color, size);
        }
        if (e.alien === 'crab') {
          this.fx.explosion(e.x, e.y, 160, nearCam(e.x, e.y));
          this.fx.text(e.x, e.y - 90, 'BOSS DOWN!', '#ffe066', 34);
        }
        break;
      }
      case 'soldierDied': {
        this.corpse(e.id, e.cls, e.x, e.y);
        this.fx.death(e.x, e.y, CLASSES[e.cls].color);
        if (e.owner === this.localPlayer && !CLASSES[e.cls].deathBlast) this.scene.cameras.main.shake(160, 0.009);
        break;
      }
      case 'shot':
        if (sprites.get(`soldier_${e.cls}`)?.muzzleFlash && nearCam(e.x, e.y)) {
          const view = this.soldiers.get(e.id);
          const mp = view?.muzzlePoint();
          const p = mp ?? e;
          if (mp) this.shiftFreshBullets(e.x, e.y, mp.x - e.x, mp.y - e.y);
          const img = this.fx.muzzleFlash(p.x, p.y);
          if (view) this.flashes.push({ img, view, dx: e.x - view.rx, dy: e.y - view.ry });
          sfx.play(this.scene, SFX.blaster.key, SFX.blaster); // cadence limitée : une escouade entière ne sature pas le son
        }
        break;
      case 'impact':
        if (e.texture === 'fx_blaster_blue' && nearCam(e.x, e.y)) this.fx.impact(e.x, e.y, 0x5ab4ff);
        break;
      case 'restart': {
        this.quietUntil = this.scene.time.now + 1000;
        // nouvelle partie : on efface tout ce qui reste au sol
        for (const img of this.corpseImgs.values()) img.destroy();
        this.pendingWaves.length = 0;
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
          .setScale(1.105 * (ALIENS[e.alien].radius / 16), 0.715 * (ALIENS[e.alien].radius / 16)) // flaque +30 %
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
      case 'rock':
        // l'image du caillou est créée / retirée par `syncRocks` (qui suit la liste de la simulation) ; ici, seulement la poussière
        if (nearCam(e.x, e.y)) this.fx.burst(e.x, e.y, 0x8a7d74, 8);
        break;
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
        if (e.style === 'spit') {
          // crachat du cracheur : éclaboussure violette (la flaque ralentissante est dessinée par drawOverlay)
          this.fx.gloop(e.x, e.y, 0xb060e0, 0xf2dcff, e.r / 50);
          this.fx.ring(e.x, e.y, e.r, 0xb060e0);
          break;
        }
        if (e.style === 'acid') {
          // blob du crabe : éclaboussure verte acide
          this.fx.gloop(e.x, e.y, 0x5ed02a, 0xe6ffb8, e.r / 55);
          this.fx.puddles(e.x, e.y, 0x5ed02a, e.r / 70);
          this.fx.ring(e.x, e.y, e.r, 0x7be23a);
          break;
        }
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
        // le halo d'arrivée (colonne) est créé avec le nouveau soldat et le suit ; ici, éclat et texte
        this.fx.burst(e.x, e.y - 20, CLASSES[e.cls].color, 16);
        if (e.owner === this.localPlayer) this.fx.text(e.x, e.y - 60, t('recruit', { name: t(`class_${e.cls}`) }), '#ffe066', 24);
        break;
      case 'upgradePicked': {
        const col = e.prism ? 0xfff3a0 : 0x7fc8ff;
        this.fx.burst(e.x, e.y - 20, col, 30);
        this.fx.ring(e.x, e.y, 120, col);
        this.fx.column(e.x, e.y, col, 150, 700);
        if (e.owner === this.localPlayer) this.scene.cameras.main.shake(80, 0.003);
        break;
      }
      case 'powerup': {
        const info = POWERUP_INFO[e.kind as keyof typeof POWERUP_INFO];
        if (!info) break;
        this.fx.ring(e.x, e.y, 110, info.color);
        this.fx.burst(e.x, e.y - 14, info.color, 22);
        this.fx.text(e.x, e.y - 46, `${info.icon} ${t(`pu_${e.kind}` as 'pu_stim')}`, '#ffffff', 22);
        break;
      }
      case 'heal':
        if (nearCam(e.x, e.y)) this.fx.heal(e.x, e.y);
        break;
      case 'squadSpawned': {
        this.quietUntil = this.scene.time.now + 1000;
        const ring = this.fx.ring(e.x, e.y, 200, this.colorOf(e.owner));
        const owner = e.owner;
        this.followers.push({ parts: [{ img: ring, dy: 0 }], pos: () => this.squadFocus(owner) }); // l'onde suit la squad qui bouge
        break;
      }
      case 'levelUp': {
        if (e.owner !== this.localPlayer) break;
        const c = this.sim.squadOf(e.owner)?.center;
        if (!c) break;
        // l'onde de choc (repoussement, sim) ne démarre qu'à la fin de la pause de choix : l'effet attend donc lui aussi (voir fireLevelWaves)
        this.pendingWaves.push({ x: c.x, y: c.y, level: e.level });
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

  /** Ondes de montée de niveau en attente : elles partent quand la pause de choix d'upgrade est terminée (comme le repoussement). */
  private readonly pendingWaves: { x: number; y: number; level: number }[] = [];

  /** Lance l'effet d'onde (anneau + spirale + texte) une fois la popup d'upgrade fermée ; une seule onde même si plusieurs niveaux d'un coup. */
  private fireLevelWaves(): void {
    if (this.pendingWaves.length === 0 || this.sim.choiceT > 0) return;
    const w = this.pendingWaves[0];
    const level = this.pendingWaves[this.pendingWaves.length - 1].level;
    this.pendingWaves.length = 0;
    const ms = UPGRADE_REPEL.reach * 1000;
    this.fx.ring(w.x, w.y, UPGRADE_REPEL.radius, 0x5aa8ff, ms); // onde de choc : les aliens sont repoussés quand le front les touche
    this.fx.spiral(w.x, w.y, UPGRADE_REPEL.radius * 0.95, 0x3d9bff, ms * 1.5);
    this.fx.text(w.x, w.y - 80, t('levelUpTitle', { level }), '#9fd3ff', 30);
  }

  render(alpha: number, dt: number, time: number): void {
    this.fireLevelWaves();
    this.syncUnits(alpha, dt, time);
    this.followFlashes();
    this.syncProjectiles(alpha);
    this.syncOrbs(alpha, time);
    this.syncRocks();
    this.pickups.sync(time);
    this.followHalos();
    this.updateFuses(dt, time);
    this.updateFires(time);
    this.drawOverlay(time, dt);
    this.arena.update(this.scene.cameras.main.worldView);
  }

  destroyPickups(): void {
    this.pickups.destroy();
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
          if (this.scene.time.now > this.quietUntil) {
            // nouvelle unité dans une squad : la colonne bleue suit le soldat
            const view = v;
            this.followers.push({ parts: this.fx.column(s.x, s.y, 0x4aa8ff), pos: () => ({ x: view.rx, y: view.ry }) });
          }
        }
        v.seen = true;
        v.sync(alpha, dt, time);
        if (v.healTick(dt)) this.fx.heal(v.rx, v.ry - 30);
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
      img.setDepth(DEPTH.fx - 1);
      if (p.lob) {
        // grenade : trajectoire au sol + arc vertical ; l'ombre reste au sol
        const k = Math.min(1, Math.max(0, 1 - p.life / p.maxLife));
        const h = 4 * LOB_HEIGHT * k * (1 - k);
        this.lobShadows.push({ x, y, h });
        // les boules ennemies passent au-dessus des acteurs (le crabe géant les cachait) ; le blob vert du crabe est plus gros
        const big = p.texture === 'fx_blob_green' ? 1.9 : 1;
        img.setVisible(true).setPosition(x, y - h).setRotation(k * 14).setScale((1 + (h / LOB_HEIGHT) * 0.3) * big).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
        if (p.team === 'aliens') img.setDepth(DEPTH.fx + 3);
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
        const rot = Math.atan2(p.vy, p.vx);
        img.setVisible(true).setPosition(bx, by).setRotation(rot);
        const rocket = p.texture === ROCKET_TEXTURE;
        img.setScale(rocket ? FX.rocket.scale : 1).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
        if (rocket) this.fx.rocketSmoke(bx - Math.cos(rot) * 16, by - Math.sin(rot) * 16); // fumée sortant de la tuyère
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

  /**
   * Cailloux lancés par les aliens : les images suivent la liste de la simulation (snapshot en ligne), jamais les événements
   * seuls — un événement perdu ou une éviction silencieuse laissait un visuel sans collision.
   */
  private syncRocks(): void {
    const live = new Set<number>();
    for (const k of this.sim.arena.rocks) {
      live.add(k.id);
      if (this.rockImgs.has(k.id)) continue;
      const img = this.scene.add.image(k.x, k.y, 'fx_rock').setOrigin(0.5, 0.6).setDepth(DEPTH.actors + k.y);
      const target = (k.radius * 2.1) / 48;
      img.setScale(target * 0.4);
      this.scene.tweens.add({ targets: img, scale: target, duration: 160, ease: 'Back.Out' });
      this.rockImgs.set(k.id, img);
    }
    for (const [id, img] of this.rockImgs) {
      if (live.has(id)) continue;
      this.rockImgs.delete(id);
      this.scene.tweens.add({ targets: img, alpha: 0, scale: img.scale * 0.6, duration: 350, onComplete: () => img.destroy() });
    }
  }

  /** Globes d'XP : taille selon la valeur, léger flottement, clignote avant de disparaître ; masqués hors caméra. */
  private syncOrbs(alpha: number, time: number): void {
    const orbs = this.sim.xp.orbs;
    const view = this.scene.cameras.main.worldView;
    // image fournie (assets/manifest.ts `xp_orb`) sinon orbe procédural ; blend normal : en additif le bleu virait au blanc
    const orbTex = this.scene.textures.exists('xp_orb') ? 'xp_orb' : 'fx_xp';
    const orbBase = orbTex === 'xp_orb' ? 32 / this.scene.textures.get('xp_orb').getSourceImage().width : 1;
    while (this.orbImgs.length < orbs.length) this.orbImgs.push(this.scene.add.image(0, 0, orbTex).setDepth(DEPTH.groundFx + 0.2));
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
      img.setVisible(true).setPosition(x, y - 8 + bob).setScale(size * orbBase * (1 + Math.sin(time * 6 + o.id) * 0.06)).setAlpha(blink ? 0.35 : 1);
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

  /** Halos d'apparition : recalés chaque frame sur leur soldat / squad, retirés quand leur animation est finie. */
  private followHalos(): void {
    for (let i = this.followers.length - 1; i >= 0; i--) {
      const f = this.followers[i];
      const alive = f.parts.filter((p) => p.img.active);
      if (alive.length === 0) {
        this.followers.splice(i, 1);
        continue;
      }
      const p = f.pos();
      if (!p) continue;
      for (const part of alive) part.img.setPosition(p.x, p.y + part.dy);
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
    this.pickups.drawGround(g, time);
    g.fillStyle(0x2a1d2e, 0.28);
    for (const v of this.aliens.values()) {
      if (v.state.def.lurk && v.state.lurkPhase >= 2 && v.state.lurkPhase <= 4) continue; // enterré : pas d'ombre
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
    // Zones de réanimation (coop) : cercle au sol qui se remplit tant qu'un équipier y reste
    for (const z of this.sim.reviveZones) {
      const k = z.progress / REVIVE_TIME;
      const beat = 0.5 + 0.5 * Math.sin(time * 6); // pulsation 0 → 1
      const rr = z.r * (1 + beat * 0.12);
      g.fillStyle(0x3dff6a, 0.12 + 0.16 * beat + 0.12 * k).fillEllipse(z.x, z.y, rr * 2, rr * 1.4);
      g.fillStyle(0x7dff9a, 0.2 + 0.25 * k).fillEllipse(z.x, z.y, z.r * 2 * k, z.r * 1.4 * k);
      g.lineStyle(4, 0x8dffa8, 0.5 + 0.5 * beat).strokeEllipse(z.x, z.y, rr * 2, rr * 1.4);
      g.lineStyle(2, 0xffffff, 0.25 + 0.3 * beat).strokeEllipse(z.x, z.y, z.r * 2 * 0.6, z.r * 1.4 * 0.6);
    }
    // Flaques de crachat : violettes, elles ralentissent les soldats dedans ; s'effacent dans la dernière seconde
    for (const p of this.sim.puddles) {
      const a = Math.min(1, p.ttl);
      g.fillStyle(0x6a2aa8, 0.42 * a).fillEllipse(p.x, p.y, p.r * 2, p.r * 1.3);
      g.fillStyle(0xb060e0, 0.3 * a).fillEllipse(p.x, p.y, p.r * 1.5, p.r * 0.95);
      g.lineStyle(2, 0xd9a0ff, 0.55 * a).strokeEllipse(p.x, p.y, p.r * 2, p.r * 1.3);
    }
    // Lurker : trou dans le sol tant qu'il est enterré (il se creuse puis se rebouche), et ligne rouge avant les pics
    for (const v of this.aliens.values()) {
      const a = v.state;
      const L = a.def.lurk;
      if (!L || a.lurkPhase === 0) continue;
      const open = a.lurkPhase === 1 ? 1 - a.lurkT / L.digTime : a.lurkPhase === 5 ? a.lurkT / L.rise : 1;
      const r = a.radius * 1.55 * open;
      g.fillStyle(0x6a4a30, 0.9).fillEllipse(a.x, a.y + 4, r * 2.3, r * 1.25); // rebord de terre
      g.fillStyle(0x1a0f0a, 0.95).fillEllipse(a.x, a.y + 5, r * 1.8, r * 0.95); // trou
      g.fillStyle(0x000000, 0.7).fillEllipse(a.x, a.y + 7, r * 1.1, r * 0.55);
      if (a.lurkPhase === 3) {
        const k = 1 - a.lurkT / L.aim;
        const cos = Math.cos(a.spikeAng);
        const sin = Math.sin(a.spikeAng);
        const hw = L.width / 2;
        const quad = (len: number, wd: number): Phaser.Math.Vector2[] =>
          [[0, -wd], [len, -wd], [len, wd], [0, wd]].map(([u, w]) => new Phaser.Math.Vector2(a.x + cos * u - sin * w, a.y + sin * u + cos * w));
        g.fillStyle(0xff2a2a, 0.1 + 0.2 * k).fillPoints(quad(L.length, hw), true);
        g.fillStyle(0xff2a2a, 0.15 + 0.2 * k).fillPoints(quad(L.length * k, hw * k), true);
        g.lineStyle(3, 0xff4a3a, 0.5 + 0.4 * k).strokePoints(quad(L.length, hw), true);
      }
    }
    // Murs du bâtisseur : télégraphe jaune (rectangle allongé qui se remplit) avant que les rochers ne surgissent
    for (const w of this.sim.walls) {
      const k = 1 - w.t / w.dur;
      const cos = Math.cos(w.angle);
      const sin = Math.sin(w.angle);
      const hl = w.length / 2;
      const hw = w.rockR;
      const quad = (l: number, wd: number): Phaser.Math.Vector2[] =>
        [[-l, -wd], [l, -wd], [l, wd], [-l, wd]].map(([u, v]) => new Phaser.Math.Vector2(w.x + cos * u - sin * v, w.y + sin * u + cos * v));
      g.fillStyle(0xffd23a, 0.1 + 0.2 * k).fillPoints(quad(hl + hw * 0.6, hw), true);
      g.fillStyle(0xffd23a, 0.15 + 0.25 * k).fillPoints(quad((hl + hw * 0.6) * k, hw * k), true);
      g.lineStyle(3, 0xffe066, 0.5 + 0.4 * k).strokePoints(quad(hl + hw * 0.6, hw), true);
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
    // Saut écrasant (crabe) : zone d'impact qui se remplit jusqu'à l'atterrissage
    for (const v of this.aliens.values()) {
      const a = v.state;
      const L = a.def.leap;
      if (!L || a.leapT <= 0) continue;
      const toLand = a.leapT - L.recover; // s avant l'impact (négatif : déjà atterri)
      if (toLand <= 0) continue;
      const k = 1 - toLand / (L.windup + L.flight);
      const pulse = toLand < 0.35 && Math.sin(this.scene.time.now / 45) > 0 ? 0.15 : 0;
      g.fillStyle(0xff2a2a, 0.12 + 0.2 * k + pulse).fillEllipse(a.leapX, a.leapY, L.radius * 2, L.radius * 1.4);
      g.fillStyle(0xff2a2a, 0.15 + 0.25 * k).fillEllipse(a.leapX, a.leapY, L.radius * 2 * k, L.radius * 1.4 * k);
      g.lineStyle(4, 0xff4a3a, 0.6 + 0.4 * k).strokeEllipse(a.leapX, a.leapY, L.radius * 2, L.radius * 1.4);
    }
    for (const v of this.aliens.values()) {
      const a = v.state;
      const rush = a.def.rush;
      if (!rush || !(a.rushWind > 0 || a.rushT > 0)) {
        this.rushWindSeen.delete(a.id);
        continue;
      }
      // préparation restante : la valeur reçue, décomptée localement jusqu'au snapshot suivant (sans quoi le remplissage avance par à-coups)
      const now = this.scene.time.now / 1000;
      let seen = this.rushWindSeen.get(a.id);
      if (!seen || seen.v !== a.rushWind) {
        seen = { v: a.rushWind, at: now };
        this.rushWindSeen.set(a.id, seen);
      }
      const wind = a.rushWind > 0 ? Math.max(0.001, seen.v - (now - seen.at)) : 0;
      const k = wind > 0 ? 1 - wind / rush.windup : 1;
      const dx = a.rushDx;
      const dy = a.rushDy;
      const nx = -dy * (rush.width / 2);
      const ny = dx * (rush.width / 2);
      const L = rush.length;
      // La zone reste au sol à l'endroit où la charge a été annoncée (fourni par la simulation, donc identique chez l'hôte et chez les clients) : elle ne suit pas l'alien pendant la charge.
      const x0 = a.rushX;
      const y0 = a.rushY;
      const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
      const lane = (len: number) => [V(x0 + nx, y0 + ny), V(x0 - nx, y0 - ny), V(x0 - nx + dx * len, y0 - ny + dy * len), V(x0 + nx + dx * len, y0 + ny + dy * len)];
      g.fillStyle(0xff2a2a, wind > 0 ? 0.1 + 0.12 * k : 0.12).fillPoints(lane(L), true);
      if (wind > 0) g.fillStyle(0xff2a2a, 0.15 + 0.2 * k).fillPoints(lane(L * k), true);
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
      if (a.hp >= a.maxHp || (a.def.lurk && a.lurkPhase >= 2 && a.lurkPhase <= 4)) continue;
      const top = v.body.displayHeight * v.body.originY + 8;
      this.bar(b, v.rx, v.ry - top, a.def.hpBarWidth, a.hp / a.maxHp, PALETTE.hpEnemy);
    }

    const l = this.beams;
    l.clear();
    this.drawTongues(l, dt);
    this.drawSpikes(l);
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

  /** Lignes de pics du lurker : des pointes d'os qui jaillissent du sol de proche en proche, le front avance avec la phase 4. */
  private drawSpikes(l: Phaser.GameObjects.Graphics): void {
    for (const v of this.aliens.values()) {
      const a = v.state;
      const L = a.def.lurk;
      if (!L || a.lurkPhase !== 4) continue;
      const p = 1 - a.lurkT / L.sweep;
      const front = p * L.length;
      const cos = Math.cos(a.spikeAng);
      const sin = Math.sin(a.spikeAng);
      const fade = p > 0.75 ? 1 - (p - 0.75) / 0.25 * 0.6 : 1;
      const rows = [-L.width / 3, 0, L.width / 3];
      for (let d = 18; d <= front; d += 22) {
        const rise = Math.min(1, (front - d) / 70 + 0.25); // la pointe sort du sol quand le front passe
        const h = 36 * rise;
        for (let i = 0; i < rows.length; i++) {
          const off = rows[i] + ((d / 22 + i) % 2 ? 4 : -4);
          const x = a.x + cos * d - sin * off;
          const y = a.y + sin * d + cos * off;
          l.fillStyle(0x2a1d2e, 0.55 * fade).fillEllipse(x, y + 2, 14, 6);
          l.fillStyle(0xe8dcc0, fade).fillTriangle(x - 6, y, x + 6, y, x + (i - 1) * 2, y - h);
          l.lineStyle(1.5, 0x6a4a3a, fade).strokeTriangle(x - 6, y, x + 6, y, x + (i - 1) * 2, y - h);
        }
      }
    }
  }

  private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, ratio: number, color: number): void {
    const h = 5;
    g.fillStyle(PALETTE.hpBack, 0.85).fillRoundedRect(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3, 3);
    g.fillStyle(color, 1).fillRect(x - w / 2, y, Math.max(0, w * Math.max(0, ratio)), h);
  }
}
