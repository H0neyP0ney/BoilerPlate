import Phaser from 'phaser';
import { Pool, theme } from '@xiao/engine';
import { DEPTH } from '../config';

/**
 * Effets visuels déclenchés par les événements de la simulation :
 * éclaboussures, explosions, ondes de choc, textes flottants, soins.
 */
export class Fx {
  private readonly splat: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly fire: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly texts: Pool<Phaser.GameObjects.Text>;

  constructor(private readonly scene: Phaser.Scene) {
    this.splat = scene.add
      .particles(0, 0, 'fx_dot', {
        speed: { min: 60, max: 240 },
        scale: { start: 0.9, end: 0 },
        lifespan: { min: 250, max: 500 },
        emitting: false,
      })
      .setDepth(DEPTH.fx);
    this.fire = scene.add
      .particles(0, 0, 'fx_flame', {
        speed: { min: 40, max: 260 },
        scale: { start: 1.6, end: 0.2 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 300, max: 600 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(DEPTH.fx);
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

  burst(x: number, y: number, color: number, count = 10): void {
    this.splat.setParticleTint(color);
    this.splat.explode(count, x, y);
  }

  explosion(x: number, y: number, radius: number, shake: boolean): void {
    this.fire.explode(22, x, y);
    this.ring(x, y, radius, 0xffb040);
    if (shake) this.scene.cameras.main.shake(180, 0.008);
  }

  ring(x: number, y: number, radius: number, color: number): void {
    const img = this.scene.add.image(x, y, 'fx_ring').setTint(color).setDepth(DEPTH.fx).setScale(0.1, 0.07).setAlpha(0.9);
    this.scene.tweens.add({
      targets: img,
      scaleX: (radius * 2) / 128,
      scaleY: (radius * 2 * 0.7) / 128,
      alpha: 0,
      duration: 350,
      ease: 'Cubic.Out',
      onComplete: () => img.destroy(),
    });
  }

  text(x: number, y: number, value: string, color = '#ffffff', size = 22): void {
    const t = this.texts.acquire();
    t.setText(value).setColor(color).setFontSize(size).setPosition(x, y).setScale(0.6);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.Out' });
    this.scene.tweens.add({
      targets: t,
      y: y - 46,
      alpha: 0,
      delay: 450,
      duration: 500,
      onComplete: () => this.texts.release(t),
    });
  }

  heal(x: number, y: number): void {
    const img = this.scene.add.image(x + Phaser.Math.Between(-10, 10), y, 'fx_plus').setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: img, y: y - 34, alpha: 0, duration: 700, onComplete: () => img.destroy() });
  }
}
