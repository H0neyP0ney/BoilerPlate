import Phaser from 'phaser';
import { DEPTH } from '../config';
import { FX } from '../fxParams';

/**
 * Effet du stimpack : du sang chaud qui jaillit du soldat (gouttes rouges OPAQUES projetées vers le haut, qui retombent sous la gravité) et une légère vapeur rouge.
 * Remplace les flammes rouges d'enragé (celles-ci restent pour les aliens ressuscités). Réglages : `FX.stimBlood` (visionneuse de particules).
 */
export class StimBloodFx {
  private readonly drops: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly mist: Phaser.GameObjects.Particles.ParticleEmitter;

  /** `radius` : rayon de l'unité (px) ; `every` : ms entre deux gouttes (plus espacées sur une escouade entière). */
  constructor(scene: Phaser.Scene, radius: number, every = 45) {
    const f = FX.stimBlood;
    this.mist = scene.add
      .particles(0, 0, 'fx_smoke', {
        x: { min: -radius * f.spreadX, max: radius * f.spreadX },
        y: { min: -radius * 0.2, max: radius * 0.4 },
        speedY: { min: -f.mistRise, max: -f.mistRise * 0.5 },
        speedX: { min: -8, max: 8 },
        scale: { start: f.mistScale * 0.4, end: f.mistScale },
        alpha: { start: f.mistAlpha, end: 0 },
        lifespan: f.mistLife,
        frequency: every * 2,
        tint: f.mistColor,
      })
      .setDepth(DEPTH.actors + 4999);
    this.drops = scene.add
      .particles(0, 0, 'fx_dot', {
        x: { min: -radius * f.spreadX, max: radius * f.spreadX },
        y: { min: -radius * 0.3, max: radius * 0.4 },
        speedY: { min: -f.speedYMax, max: -f.speedYMin },
        speedX: { min: -f.speedX, max: f.speedX },
        gravityY: f.gravity,
        scale: { start: f.scaleStart, end: f.scaleEnd },
        alpha: { start: 1, end: 0.15 },
        lifespan: { min: f.lifeMin, max: Math.max(f.lifeMin, f.lifeMax) },
        frequency: every,
        tint: [f.bloodColor, f.bloodDark, f.bloodLight],
      })
      .setDepth(DEPTH.actors + 5000);
  }

  setPosition(x: number, y: number): this {
    this.mist.setPosition(x, y);
    this.drops.setPosition(x, y);
    return this;
  }

  setVisible(v: boolean): this {
    this.mist.setVisible(v);
    this.drops.setVisible(v);
    return this;
  }

  /** Arrête l'émission ; les gouttes en l'air finissent leur vie. */
  stop(): this {
    this.mist.stop();
    this.drops.stop();
    return this;
  }

  destroy(): void {
    this.mist.destroy();
    this.drops.destroy();
  }
}
