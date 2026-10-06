import Phaser from 'phaser';
import { DEPTH } from '../config';
import { FX } from '../fxParams';

/**
 * Effet « enragé » : flammes rouges qui montent du corps. Partagé par les aliens ressuscités par un chaman
 * et par les soldats sous stimpack. `radius` : rayon de l'unité (px) ; `every` : ms entre deux particules.
 */
export function createEnragedFlames(scene: Phaser.Scene, radius: number, every = 28): Phaser.GameObjects.Particles.ParticleEmitter {
  const f = FX.enraged; // réglages de la visionneuse de particules
  return scene.add
    .particles(0, 0, 'fx_flame', {
      x: { min: -radius * f.spreadX, max: radius * f.spreadX },
      y: { min: -radius * 0.3, max: radius * 0.5 },
      speedY: { min: -f.speedYMax, max: -f.speedYMin },
      speedX: { min: -f.speedX, max: f.speedX },
      scale: { start: f.scaleStart, end: 0 },
      alpha: { start: f.alpha, end: 0 },
      lifespan: { min: f.lifeMin, max: Math.max(f.lifeMin, f.lifeMax) },
      frequency: every,
      tint: [0xff1408, 0xff2a0a, 0xd01008, 0x8c0000],
      blendMode: 'ADD',
    })
    .setDepth(DEPTH.actors + 5000);
}

/** Teinte rouge appliquée au corps d'une unité enragée (multiplicative). */
export const ENRAGED_TINT = 0xff6a6a;
