import Phaser from 'phaser';
import { lerp, sprites } from '@xiao/engine';
import { DEPTH } from '../config';
import { FX } from '../fxParams';
import { createEnragedFlames, ENRAGED_TINT } from './EnragedFx';
import { hasComposedRecruit, RECRUIT_STAR } from '../art/recruits';
import type { AlienState, RecruitState, SoldierState } from '../sim/entities';

/**
 * Représentations visuelles des entités de la simulation. Elles lisent l'état
 * (jamais l'inverse), interpolent entre deux ticks (`alpha`) et gèrent
 * l'animation purement cosmétique.
 *
 * Les visuels viennent du catalogue `sprites` : planche fournie (avec ses
 * animations idle / walk / shoot) ou dessin procédural (bob, squash).
 */
/** Particules de soin sur un soldat soigné : durée (s) pendant laquelle elles le suivent, et délai entre deux « + ». */
const HEAL_FX_TIME = 1;
const HEAL_FX_EVERY = 0.12;

export class SoldierView {
  /** Position affichée (interpolée), utilisée par l'overlay et la caméra. */
  rx = 0;
  ry = 0;
  flash = 0;
  seen = true;
  private walk = 0;
  /** Soin : PV vus à la frame précédente, durée restante des particules de soin (s) et cadence d'émission. */
  private lastHp: number;
  private lastMaxHp: number;
  private healT = 0;
  private healAcc = 0;
  private readonly phase = Math.random() * Math.PI * 2;
  private readonly bodyId: string;
  private readonly gunId: string;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly gun: Phaser.GameObjects.Sprite;
  private readonly hasGun: boolean;
  private readonly animated: boolean;

  constructor(
    scene: Phaser.Scene,
    readonly state: SoldierState,
    readonly ringColor: number,
  ) {
    this.lastHp = state.hp;
    this.lastMaxHp = state.maxHp;
    this.bodyId = `soldier_${state.def.id}`;
    this.gunId = `gun_${state.def.id}`;
    this.body = sprites.add(scene, this.bodyId, state.x, state.y);
    this.gun = sprites.add(scene, this.gunId, state.x, state.y);
    this.hasGun = !sprites.get(this.gunId).hidden;
    this.animated = sprites.hasAnim(this.bodyId, 'walk') || sprites.hasAnim(this.bodyId, 'idle');
  }

  /**
   * À appeler chaque frame : vrai quand il faut émettre une particule de soin sur ce soldat. Dès que ses PV montent (soin de toute
   * origine : soigneur, globe, recrue…) à PV max constants, les particules le suivent pendant `HEAL_FX_TIME` s.
   */
  healTick(dt: number): boolean {
    const s = this.state;
    if (s.maxHp === this.lastMaxHp && s.hp > this.lastHp + 0.01) this.healT = HEAL_FX_TIME;
    this.lastHp = s.hp;
    this.lastMaxHp = s.maxHp;
    if (this.healT <= 0 || !s.alive) return false;
    this.healT -= dt;
    this.healAcc += dt;
    if (this.healAcc < HEAL_FX_EVERY) return false;
    this.healAcc = 0;
    return true;
  }

  sync(alpha: number, dt: number, time: number): void {
    const s = this.state;
    this.rx = lerp(s.px, s.x, alpha);
    this.ry = lerp(s.py, s.y, alpha);
    const moving = Math.hypot(s.vx, s.vy) > 20;
    const depth = DEPTH.actors + this.ry;

    let facing = s.facing;
    if (!s.target && Math.abs(s.vx) > 15) facing = s.vx > 0 ? 1 : -1;

    // Animation : planche si dispo (tir vers la cible > marche orientée > idle), sinon rebond procédural.
    let bob = 0;
    if (this.animated) {
      const id = this.bodyId;
      const b = this.body;
      // Avec une cible, le sprite regarde toujours vers elle (même en marchant dans l'autre sens) : direction du tir, pas du déplacement.
      const dirX = s.target ? Math.cos(s.aim) : s.vx;
      const dirY = s.target ? 0 : s.vy;
      const played =
        (s.target && sprites.playDirectional(b, id, 'shoot', Math.cos(s.aim), 0)) ||
        (moving && sprites.playDirectional(b, id, 'walk', dirX, dirY)) ||
        sprites.playDirectional(b, id, 'idle', facing, 0);
      if (!played) b.setFlipX(sprites.flipFor(id, facing));
    } else {
      this.walk += dt * (moving ? 14 : 0);
      bob = moving ? -Math.abs(Math.sin(this.walk)) * 3 : Math.sin(time * 2.2 + this.phase) * 0.8;
      this.body.setFlipX(sprites.flipFor(this.bodyId, facing));
    }
    sprites.place(this.body, this.bodyId); // ancrage propre à la séquence / direction (si défini)
    this.body.setPosition(this.rx, this.ry + bob).setDepth(depth).setScale(sprites.scaleOf(this.bodyId));

    if (this.hasGun) {
      const aim = s.target ? s.aim : facing > 0 ? 0 : Math.PI;
      this.gun
        .setPosition(this.rx + facing * 4, this.ry - 17 * (s.def.id === 'bruiser' ? 1.15 : 1) + bob)
        .setRotation(aim)
        .setFlipY(Math.cos(aim) < 0)
        .setDepth(depth + 0.5);
    }

    if (this.flash > 0) {
      this.flash -= dt;
      this.body.setTint(0xff6a6a).setTintMode(Phaser.TintModes.FILL);
    } else if (s.capturedBy) {
      this.body.setTint(0xa8f0b8).setTintMode(Phaser.TintModes.MULTIPLY); // en cours de digestion
    } else {
      this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    }
    const blink = s.invulnerable > 0 && Math.sin(time * 30) > 0;
    this.body.setAlpha(blink ? 0.45 : 1);
    this.gun.setAlpha(blink ? 0.45 : 1);
  }

  /** Bouche du canon en monde (planche : point de la frame en cours, comme dans la visionneuse), sinon null. */
  muzzlePoint(): { x: number; y: number } | null {
    const b = this.body;
    const anims = (b as Partial<Phaser.GameObjects.Sprite>).anims;
    if (!anims) return null; // visuel statique (dessin procédural / image) : pas de bouche par frame
    const key = anims.currentAnim?.key;
    const anim = key?.startsWith(this.bodyId + ':') ? key.slice(this.bodyId.length + 1) : 'shoot';
    const frame = anims.currentFrame ? anims.currentFrame.index - 1 : 0;
    const m = sprites.muzzleFor(this.bodyId, anim, frame);
    if (!m) return null;
    const fx = b.flipX ? 1 - m[0] : m[0];
    return { x: b.x + (fx - b.originX) * b.displayWidth, y: b.y + (m[1] - b.originY) * b.displayHeight };
  }

  /** Orientation affichée (pour l'animation de mort). */
  get flipX(): boolean {
    return this.body.flipX;
  }

  destroy(): void {
    this.body.destroy();
    this.gun.destroy();
  }
}

export class AlienView {
  /** La séquence « attack » de l'action en cours a déjà été lancée (elle n'est pas relancée en boucle). */
  private attackStarted = false;
  rx = 0;
  ry = 0;
  flash = 0;
  seen = true;
  private facing = 1;
  private spawnT = 0;
  private readonly phase = Math.random() * Math.PI * 2;
  private readonly id: string;
  private readonly animated: boolean;
  readonly body: Phaser.GameObjects.Sprite;

  /** Enragé (ressuscité par un chaman) : flammes rouges qui montent du corps. */
  private zombieFx?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly state: AlienState,
  ) {
    this.id = `alien_${state.def.id}`;
    this.body = sprites.add(scene, this.id, state.x, state.y);
    this.animated = sprites.hasAnim(this.id, 'walk') || sprites.hasAnim(this.id, 'idle');
    this.body.setScale(0.01);
  }

  sync(alpha: number, dt: number, time: number): void {
    const a = this.state;
    this.rx = lerp(a.px, a.x, alpha);
    this.ry = lerp(a.py, a.y, alpha);
    if (Math.abs(a.vx) > 8) this.facing = a.vx > 0 ? 1 : -1;

    // Squash / lévitation procéduraux seulement sans planche animée.
    const t = time * 7 + this.phase;
    const squash = this.animated || a.def.floats ? 0 : Math.sin(t) * 0.06;
    const lift = a.def.floats ? Math.sin(time * 3 + this.phase) * 5 : 0;
    const wind = a.slamWind > 0 ? 1 - a.slamWind * 1.2 : 0;
    if (this.animated) {
      // attaque (slam, charge, saut) : la séquence « attack » est lancée UNE fois puis reste sur sa dernière frame jusqu'à la fin de l'action
      const attackNow = a.slamWind > 0 || a.leapT > 0;
      if (!attackNow) this.attackStarted = false;
      else if (!this.attackStarted) this.attackStarted = sprites.play(this.body, this.id, 'attack');
      if (!(attackNow && this.attackStarted)) sprites.play(this.body, this.id, 'walk') || sprites.play(this.body, this.id, 'idle'); // pas d'idle dédié : toujours la marche (l'idle n'est qu'un repli)
    }
    this.spawnT = Math.min(1, this.spawnT + dt * 4);
    const pop = Phaser.Math.Easing.Back.Out(this.spawnT) * sprites.scaleOf(this.id); // relue chaque frame : réglable dans la visionneuse
    this.body.setScale(pop * (1 + squash + wind * 0.12), pop * (1 - squash - wind * 0.1));
    // Procédural : seule la bête a un côté ; une planche fournie se retourne toujours.
    const flips = this.animated || a.def.id === 'charger' || a.def.id === 'boss_rhino';
    this.body
      .setPosition(this.rx, this.ry + lift)
      .setFlipX(flips ? sprites.flipFor(this.id, this.facing) : false)
      .setDepth(DEPTH.actors + this.ry);
    sprites.place(this.body, this.id);
    if (a.def.lurk) {
      // lurker : s'enfonce dans son trou (phase 1), invisible enterré (2-4), ressort (5)
      const L = a.def.lurk;
      const vis = a.lurkPhase === 1 ? a.lurkT / L.digTime : a.lurkPhase >= 2 && a.lurkPhase <= 4 ? 0 : a.lurkPhase === 5 ? 1 - a.lurkT / L.rise : 1;
      this.body
        .setVisible(vis > 0.03)
        .setAlpha(Math.max(0, Math.min(1, vis * 1.4)))
        .setScale(this.body.scaleX, this.body.scaleY * (0.45 + 0.55 * vis))
        .setY(this.body.y + (1 - vis) * a.radius * 0.7);
    }
    if (a.def.capture) {
      // bulle : au-dessus du soldat qu'elle porte (qu'on voit à travers), elle palpite quand elle digère
      this.body.setDepth(DEPTH.actors + this.ry + 1).setAlpha(a.captive ? 0.85 : 0.95);
      if (a.captive) this.body.setScale(this.body.scaleX * (1 + Math.sin(time * 8) * 0.05), this.body.scaleY * (1 + Math.sin(time * 8 + 1) * 0.05));
    }

    if (a.revived) this.syncZombieFx();

    if (this.flash > 0) {
      this.flash -= dt;
      this.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    } else if (a.rushWind > 0) {
      this.body.setTint(0xffb0a0).setTintMode(Phaser.TintModes.MULTIPLY);
    } else if (a.revived) {
      this.body.setTint(ENRAGED_TINT).setTintMode(Phaser.TintModes.MULTIPLY); // teinte rouge de l'enragé
    } else {
      this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    }
  }

  /** Flammes d'enragé qui suivent l'alien ; créé à la première frame où il est ressuscité. */
  private syncZombieFx(): void {
    const a = this.state;
    if (!this.zombieFx) {
      this.zombieFx = createEnragedFlames(this.scene, a.radius);
    }
    this.zombieFx.setPosition(this.rx, this.ry - a.radius * 0.4);
  }

  destroy(): void {
    this.body.destroy();
    this.zombieFx?.destroy();
  }
}

export class RecruitView {
  seen = true;
  private readonly img: Phaser.GameObjects.Sprite;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly stars?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(
    scene: Phaser.Scene,
    readonly state: RecruitState,
    color: number,
  ) {
    this.glow = scene.add
      .image(state.x, state.y, 'fx_glow')
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.7)
      .setScale(1.1, 0.6)
      .setDepth(DEPTH.groundFx);
    const id = `recruit_${state.cls}`;
    this.img = sprites.add(scene, id, state.x, state.y);
    sprites.play(this.img, id, 'idle');
    // Étoiles qui scintillent autour d'une recrue composée : apparaissent, grossissent puis s'éteignent en tournant (FX.recruit).
    if (hasComposedRecruit(scene, state.cls) && scene.textures.exists(RECRUIT_STAR)) {
      const f = FX.recruit;
      const r = f.starRadius;
      this.stars = scene.add
        .particles(state.x, state.y, RECRUIT_STAR, {
          x: { min: -r, max: r },
          y: { min: -r * 1.2, max: r * 0.6 },
          speedY: { min: -f.starRise * 1.5, max: -f.starRise * 0.5 },
          scale: { values: [0, f.starScale, f.starScale * 0.6, 0], interpolation: 'catmull' }, // pop puis extinction
          alpha: { values: [0.4, 1, 1, 0], interpolation: 'linear' },
          rotate: { start: 0, end: 90 },
          lifespan: { min: f.starLifeMin, max: Math.max(f.starLifeMin, f.starLifeMax) },
          frequency: f.starEvery,
          blendMode: 'ADD',
        })
        .setDepth(DEPTH.actors + state.y + 1);
    }
  }

  sync(alpha: number, time: number): void {
    const r = this.state;
    const x = lerp(r.px, r.x, alpha);
    const y = lerp(r.py, r.y, alpha);
    const bob = Math.sin(time * 5 + r.id) * 4;
    const blink = r.life < 4 && Math.sin(time * 20) > 0;
    this.img.setPosition(x, y + bob).setDepth(DEPTH.actors + y).setAlpha(blink ? 0.3 : 1);
    this.glow.setPosition(x, y).setScale(1.1 + Math.sin(time * 6) * 0.1, 0.6);
    // centre du globe : l'image est ancrée vers son bas (originY 0.82)
    // centre du globe : l'image est ancrée sous lui (ses pieds)
    this.stars?.setPosition(x, y + bob - this.img.displayHeight * (this.img.originY - 0.5) + FX.recruit.starY).setDepth(DEPTH.actors + y + 1);
  }

  destroy(): void {
    this.img.destroy();
    this.glow.destroy();
    this.stars?.destroy();
  }
}
