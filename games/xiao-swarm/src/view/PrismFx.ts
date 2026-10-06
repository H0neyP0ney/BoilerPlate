import Phaser from 'phaser';
import { FX } from '../fxParams';

/**
 * Pluie de particules arc-en-ciel des cartes d'upgrade prismatiques (fx_star, additif) : elles montent sur toute la carte. Partagée par la
 * fenêtre de choix (`LevelUpScene`) et la visionneuse de particules ; réglages dans `FX.prism`. Le rectangle d'émission est posé par
 * `setPrismZone` (la carte change de taille et de place avec l'écran).
 */
export function createPrismRain(scene: Phaser.Scene): Phaser.GameObjects.Particles.ParticleEmitter {
  const p = FX.prism;
  return scene.add.particles(0, 0, 'fx_star', {
    speedY: { min: -p.speedYMax, max: -p.speedYMin },
    speedX: { min: -p.speedX, max: p.speedX },
    scale: { start: p.scaleStart, end: 0 },
    rotate: { start: 0, end: 160 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: p.lifeMin, max: Math.max(p.lifeMin, p.lifeMax) },
    frequency: p.every,
    quantity: 1,
    tint: [0xff3a3a, 0xffb43a, 0xfff03a, 0x3aff6a, 0x3ac8ff, 0x8a3aff, 0xff3aff],
    blendMode: 'ADD',
  });
}

/** Centre l'émetteur en (x, y) et fait naître les particules sur un rectangle `w` × `h` autour de ce point. */
export function setPrismZone(fx: Phaser.GameObjects.Particles.ParticleEmitter, x: number, y: number, w: number, h: number): void {
  fx.setPosition(x, y);
  fx.clearEmitZones();
  fx.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData);
}
