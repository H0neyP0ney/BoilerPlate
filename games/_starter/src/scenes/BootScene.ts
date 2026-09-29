import Phaser from 'phaser';
import { COLORS, SCENES } from '../config';

/**
 * Boot : le strict minimum (textures générées, assets de l'écran de chargement).
 * Rien de lourd ici, le joueur ne voit encore rien.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  create(): void {
    this.makeCircleTexture('player', 26, COLORS.player);
    this.makeCircleTexture('coin', 14, COLORS.coin);
    this.makeCircleTexture('enemy', 20, COLORS.enemy);
    this.scene.start(SCENES.preload);
  }

  /** Placeholders générés : zéro fichier à télécharger pour le prototype. */
  private makeCircleTexture(key: string, radius: number, color: number): void {
    const g = this.make.graphics({}, false);
    g.fillStyle(color, 1);
    g.fillCircle(radius, radius, radius);
    g.lineStyle(3, 0xffffff, 0.6);
    g.strokeCircle(radius, radius, radius - 1.5);
    g.generateTexture(key, radius * 2, radius * 2);
    g.destroy();
  }
}
