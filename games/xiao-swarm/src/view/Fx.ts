import Phaser from 'phaser';
import { Pool, theme } from '@xiao/engine';
import { DEPTH } from '../config';
import { FX } from '../fxParams';

/**
 * Effets visuels déclenchés par les événements de la simulation :
 * éclaboussures, explosions, ondes de choc, textes flottants, soins.
 * Tous les réglages viennent de `fxParams.ts` (éditables dans la visionneuse de particules).
 */
export class Fx {
  private splat!: Phaser.GameObjects.Particles.ParticleEmitter;
  private gloopBig!: Phaser.GameObjects.Particles.ParticleEmitter;
  private gloopSmall!: Phaser.GameObjects.Particles.ParticleEmitter;
  private spark!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fire!: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly texts: Pool<Phaser.GameObjects.Text>;

  constructor(private readonly scene: Phaser.Scene) {
    this.build();
    this.texts = new Pool(
      () =>
        scene.add
          .text(0, 0, '', { fontFamily: theme.font, fontSize: '22px', fontStyle: 'bold', color: '#fff', stroke: '#2a1d2e', strokeThickness: 5 })
          .setOrigin(0.5)
          .setDepth(DEPTH.bars + 1),
      (t) => t.setVisible(true).setAlpha(1),
      (t) => t.setVisible(false),
    );
  }

  /** (Re)crée les émetteurs de particules depuis `FX` : à rappeler après un changement de réglage. */
  build(): void {
    this.splat?.destroy();
    this.spark?.destroy();
    this.gloopBig?.destroy();
    this.gloopSmall?.destroy();
    this.fire?.destroy();
    const b = FX.burst;
    this.splat = this.scene.add
      .particles(0, 0, 'fx_dot', {
        speed: { min: b.speedMin, max: b.speedMax },
        scale: { start: b.scaleStart, end: b.scaleEnd },
        lifespan: { min: b.lifeMin, max: b.lifeMax },
        emitting: false,
      })
      .setDepth(DEPTH.fx);
    const q = FX.gloop;
    this.gloopBig = this.scene.add
      .particles(0, 0, 'fx_dot', {
        speed: { min: q.speedMin, max: q.speedMax },
        scale: { start: q.scaleStart, end: q.scaleEnd },
        lifespan: { min: q.lifeMin, max: q.lifeMax },
        gravityY: q.gravity,
        emitting: false,
      })
      .setDepth(DEPTH.fx);
    this.gloopSmall = this.scene.add
      .particles(0, 0, 'fx_dot', {
        speed: { min: q.speedMax * 0.6, max: q.speedMax * 1.5 },
        scale: { start: q.scaleStart * 0.45, end: 0 },
        lifespan: { min: q.lifeMin * 0.6, max: q.lifeMax * 0.8 },
        gravityY: q.gravity * 0.5,
        emitting: false,
      })
      .setDepth(DEPTH.fx);
    const i = FX.impact;
    this.spark = this.scene.add
      .particles(0, 0, 'fx_dot', {
        speed: { min: i.speedMin, max: i.speedMax },
        scale: { start: i.scaleStart, end: i.scaleEnd },
        lifespan: { min: i.lifeMin, max: i.lifeMax },
        emitting: false,
      })
      .setDepth(DEPTH.fx);
    const e = FX.explosion;
    this.fire =this.scene.add
      .particles(0, 0, 'fx_flame', {
        speed: { min: e.speedMin, max: e.speedMax },
        scale: { start: e.scaleStart, end: e.scaleEnd },
        alpha: { start: e.alphaStart, end: e.alphaEnd },
        lifespan: { min: e.lifeMin, max: e.lifeMax },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(DEPTH.fx);
  }

  burst(x: number, y: number, color: number, count = 10): void {
    this.splat.setParticleTint(color);
    this.splat.explode(Math.max(1, Math.round(count * FX.burst.countMul)), x, y);
  }

  impact(x: number, y: number, color: number): void {
    this.spark.setParticleTint(color);
    this.spark.explode(FX.impact.count, x, y);
  }

  /** Flash de tir ; l'appelant le repositionne à chaque frame tant qu'il est actif (il se détruit seul). */
  /** Quelques flaques au sol (nombre, position, taille, orientation et durée aléatoires) qui rétrécissent et s'effacent lentement. */
  puddles(x: number, y: number, color: number, size = 1): void {
    const p = FX.puddle;
    const n = Phaser.Math.Between(p.countMin, p.countMax);
    for (let i = 0; i < n; i++) {
      const scale = Phaser.Math.FloatBetween(p.scaleMin, p.scaleMax) * size;
      const img = this.scene.add
        .image(x + Phaser.Math.FloatBetween(-p.spread, p.spread), y + Phaser.Math.FloatBetween(-p.spread, p.spread) * 0.5, 'fx_puddle')
        .setTint(color)
        .setDepth(DEPTH.groundFx - 0.4)
        .setFlipX(Math.random() < 0.5)
        .setScale(scale, scale * Phaser.Math.FloatBetween(0.55, 0.75))
        .setAlpha(p.alpha * Phaser.Math.FloatBetween(0.7, 1));
      this.scene.tweens.add({
        targets: img,
        alpha: 0,
        scaleX: scale * p.endScale,
        scaleY: img.scaleY * p.endScale,
        delay: Phaser.Math.Between(300, 900),
        duration: Phaser.Math.Between(p.lifeMinMs, p.lifeMaxMs),
        ease: 'Sine.In',
        onComplete: () => img.destroy(),
      });
    }
  }

  /** Éclatement de gelée : grosses gouttes qui retombent (gravité) + fines gouttelettes, teintes `color` et `colorLight`. */
  gloop(x: number, y: number, color: number, colorLight: number, size = 1): void {
    const g = FX.gloop;
    this.gloopBig.setParticleTint(color);
    this.gloopBig.explode(Math.max(1, Math.round(g.count * size)), x, y);
    this.gloopSmall.setParticleTint(colorLight);
    this.gloopSmall.explode(Math.max(1, Math.round(g.count * 1.5 * size)), x, y);
  }

  muzzleFlash(x: number, y: number): Phaser.GameObjects.Image {
    const m = FX.muzzle;
    const img = this.scene.add.image(x, y, 'fx_glow').setBlendMode(Phaser.BlendModes.ADD).setTint(m.color).setDepth(DEPTH.fx).setScale(m.scale);
    this.scene.tweens.add({ targets: img, alpha: 0, scale: m.scale * 0.6, duration: m.durationMs, onComplete: () => img.destroy() });
    return img;
  }

  explosion(x: number, y: number, radius: number, shake: boolean): void {
    const e = FX.explosion;
    this.fire.explode(e.count, x, y);
    this.ring(x, y, radius, e.ringColor);
    if (shake && e.shakeAmount > 0) this.scene.cameras.main.shake(e.shakeMs, e.shakeAmount);
  }

  ring(x: number, y: number, radius: number, color: number): void {
    const r = FX.ring;
    const img = this.scene.add.image(x, y, 'fx_ring').setTint(color).setDepth(DEPTH.fx).setScale(r.startScaleX, r.startScaleY).setAlpha(r.alpha);
    this.scene.tweens.add({
      targets: img,
      scaleX: (radius * 2) / 128,
      scaleY: (radius * 2 * r.squash) / 128,
      alpha: 0,
      duration: r.durationMs,
      ease: 'Cubic.Out',
      onComplete: () => img.destroy(),
    });
  }

  text(x: number, y: number, value: string, color = '#ffffff', size = 22): void {
    const f = FX.text;
    const t = this.texts.acquire();
    t.setText(value).setColor(color).setFontSize(size).setPosition(x, y).setScale(f.popFrom);
    this.scene.tweens.add({ targets: t, scale: 1, duration: f.popMs, ease: 'Back.Out' });
    this.scene.tweens.add({
      targets: t,
      y: y - f.rise,
      alpha: 0,
      delay: f.holdMs,
      duration: f.fadeMs,
      onComplete: () => this.texts.release(t),
    });
  }

  heal(x: number, y: number): void {
    const h = FX.heal;
    const img = this.scene.add.image(x + Phaser.Math.Between(-h.jitter, h.jitter), y, 'fx_plus').setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: img, y: y - h.rise, alpha: 0, duration: h.durationMs, onComplete: () => img.destroy() });
  }

  destroy(): void {
    this.splat.destroy();
    this.spark.destroy();
    this.gloopBig.destroy();
    this.gloopSmall.destroy();
    this.fire.destroy();
  }
}
