import Phaser from 'phaser';
import { lerp, sprites } from '@xiao/engine';
import { DEPTH } from '../config';
import type { AlienState, RecruitState, SoldierState } from '../sim/entities';

/**
 * Représentations visuelles des entités de la simulation. Elles lisent l'état
 * (jamais l'inverse), interpolent entre deux ticks (`alpha`) et gèrent
 * l'animation purement cosmétique.
 *
 * Les visuels viennent du catalogue `sprites` : planche fournie (avec ses
 * animations idle / walk / shoot) ou dessin procédural (bob, squash).
 */
export class SoldierView {
  /** Position affichée (interpolée), utilisée par l'overlay et la caméra. */
  rx = 0;
  ry = 0;
  flash = 0;
  seen = true;
  private walk = 0;
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
    this.bodyId = `soldier_${state.def.id}`;
    this.gunId = `gun_${state.def.id}`;
    this.body = sprites.add(scene, this.bodyId, state.x, state.y);
    this.gun = sprites.add(scene, this.gunId, state.x, state.y);
    this.hasGun = !sprites.get(this.gunId).hidden;
    this.animated = sprites.hasAnim(this.bodyId, 'walk') || sprites.hasAnim(this.bodyId, 'idle');
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
        .setPosition(this.rx + facing * 4, this.ry - 17 * (s.def.id === 'tank' ? 1.15 : 1) + bob)
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

  /** Zombie (ressuscité par un chaman) : flammes rouges qui montent du corps. */
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
    const moving = Math.hypot(a.vx, a.vy) > 8;
    if (Math.abs(a.vx) > 8) this.facing = a.vx > 0 ? 1 : -1;

    // Squash / lévitation procéduraux seulement sans planche animée.
    const t = time * (a.def.id === 'spider' ? 18 : 7) + this.phase;
    const squash = this.animated || a.def.floats ? 0 : Math.sin(t) * 0.06;
    const lift = a.def.floats ? Math.sin(time * 3 + this.phase) * 5 : 0;
    const wind = a.slamWind > 0 ? 1 - a.slamWind * 1.2 : 0;
    if (this.animated) {
      const attacking = (a.slamWind > 0 || a.chargeT > 0) && sprites.play(this.body, this.id, 'attack');
      if (!attacking) sprites.play(this.body, this.id, moving ? 'walk' : 'idle') || sprites.play(this.body, this.id, 'idle');
    }
    this.spawnT = Math.min(1, this.spawnT + dt * 4);
    const pop = Phaser.Math.Easing.Back.Out(this.spawnT) * sprites.scaleOf(this.id); // relue chaque frame : réglable dans la visionneuse
    this.body.setScale(pop * (1 + squash + wind * 0.12), pop * (1 - squash - wind * 0.1));
    // Procédural : seule la bête a un côté ; une planche fournie se retourne toujours.
    const flips = this.animated || a.def.id === 'beast' || a.def.id === 'charger' || a.def.id === 'rhino_boss';
    this.body
      .setPosition(this.rx, this.ry + lift)
      .setFlipX(flips ? sprites.flipFor(this.id, this.facing) : false)
      .setDepth(DEPTH.actors + this.ry);
    sprites.place(this.body, this.id);
    if (a.def.capture) {
      // bulle : au-dessus du soldat qu'elle porte (qu'on voit à travers), elle palpite quand elle digère
      this.body.setDepth(DEPTH.actors + this.ry + 1).setAlpha(a.captive ? 0.85 : 0.95);
      if (a.captive) this.body.setScale(this.body.scaleX * (1 + Math.sin(time * 8) * 0.05), this.body.scaleY * (1 + Math.sin(time * 8 + 1) * 0.05));
    }

    if (a.revived) this.syncZombieFx();

    if (this.flash > 0) {
      this.flash -= dt;
      this.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    } else if (a.chargeT > 0 || a.rushWind > 0) {
      this.body.setTint(0xffb0a0).setTintMode(Phaser.TintModes.MULTIPLY);
    } else if (a.revived) {
      this.body.setTint(0xff8a8a).setTintMode(Phaser.TintModes.MULTIPLY); // teinte rougeâtre du zombie
    } else {
      this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    }
  }

  /** Émetteur de flammes rouges (ADD) qui suit le zombie ; créé à la première frame où il est ressuscité. */
  private syncZombieFx(): void {
    const a = this.state;
    if (!this.zombieFx) {
      const r = a.radius;
      this.zombieFx = this.scene.add
        .particles(0, 0, 'fx_flame', {
          x: { min: -r * 0.7, max: r * 0.7 },
          y: { min: -r * 0.3, max: r * 0.5 },
          speedY: { min: -90, max: -40 },
          speedX: { min: -14, max: 14 },
          scale: { start: 0.75, end: 0 },
          alpha: { start: 0.9, end: 0 },
          lifespan: { min: 380, max: 650 },
          frequency: 28,
          tint: [0xff2a0a, 0xff5a1a, 0xc01008],
          blendMode: 'ADD',
        })
        .setDepth(DEPTH.actors + 5000);
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
  }

  sync(alpha: number, time: number): void {
    const r = this.state;
    const x = lerp(r.px, r.x, alpha);
    const y = lerp(r.py, r.y, alpha);
    const bob = Math.sin(time * 5 + r.id) * 4;
    const blink = r.life < 4 && Math.sin(time * 20) > 0;
    this.img.setPosition(x, y + bob).setDepth(DEPTH.actors + y).setAlpha(blink ? 0.3 : 1);
    this.glow.setPosition(x, y).setScale(1.1 + Math.sin(time * 6) * 0.1, 0.6);
  }

  destroy(): void {
    this.img.destroy();
    this.glow.destroy();
  }
}
