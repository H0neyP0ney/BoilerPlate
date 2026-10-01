import Phaser from 'phaser';
import { DEPTH } from '../config';

/**
 * Effet « enragé » : flammes rouges qui montent du corps. Partagé par les aliens ressuscités par un chaman
 * et par les soldats sous stimpack. `radius` : rayon de l'unité (px) ; `every` : ms entre deux particules.
 */
export function createEnragedFlames(scene: Phaser.Scene, radius: number, every = 28): Phaser.GameObjects.Particles.ParticleEmitter {
  return scene.add
    .particles(0, 0, 'fx_flame', {
      x: { min: -radius * 0.7, max: radius * 0.7 },
      y: { min: -radius * 0.3, max: radius * 0.5 },
      speedY: { min: -100, max: -45 },
      speedX: { min: -14, max: 14 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.95, end: 0 },
      lifespan: { min: 380, max: 650 },
      frequency: every,
      tint: [0xff1408, 0xff2a0a, 0xd01008, 0x8c0000],
      blendMode: 'ADD',
    })
    .setDepth(DEPTH.actors + 5000);
}

/** Teinte rouge appliquée au corps d'une unité enragée (multiplicative). */
export const ENRAGED_TINT = 0xff6a6a;
