import Phaser from 'phaser';
import { FX } from '../fxParams';

/**
 * Effet d'un soldat empoisonné (mêlée de l'araignée) : une lueur verte douce sous les pieds du buste et 4 bulles vertes qui montent en grossissant puis éclatent
 * (s'effacent), décalées dans le temps. Réglages : `FX.venom`. Partagé par `SoldierView`.
 */
export class VenomFx {
  private readonly glow: Phaser.GameObjects.Image;
  private readonly bubbles: Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene) {
    this.glow = scene.add.image(0, 0, 'fx_glow').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.bubbles = [0, 1, 2, 3].map(() => scene.add.image(0, 0, 'fx_dot').setVisible(false));
  }

  /** `x`, `y` : pied de l'unité (bob et décalage compris) ; `time` en s ; `phase` : déphasage propre à l'unité ; `depth` : profondeur de l'unité. */
  update(x: number, y: number, time: number, phase: number, depth: number): void {
    const k = FX.venom;
    this.glow.setVisible(true).setPosition(x, y + k.baseY).setScale(k.glowScale).setAlpha(k.glowAlpha * (0.8 + 0.2 * Math.sin(time * 6 + phase))).setTint(k.color).setDepth(depth + 3);
    this.bubbles.forEach((b, i) => {
      const u = (time * k.speed + i / this.bubbles.length + phase * 0.1) % 1; // chaque bulle monte, grossit et s'efface en boucle
      b.setVisible(true)
        .setPosition(x + (i - 1.5) * k.spacing + Math.sin(time * 4 + i * 2 + phase) * 3, y + k.baseY - u * k.rise)
        .setScale(k.bubbleScale + u * k.bubbleGrow)
        .setAlpha(k.alpha * Math.sin(u * Math.PI))
        .setTint(i % 2 ? k.colorLight : k.color)
        .setDepth(depth + 5);
    });
  }

  hide(): void {
    this.glow.setVisible(false);
    this.bubbles.forEach((b) => b.setVisible(false));
  }

  destroy(): void {
    this.glow.destroy();
    this.bubbles.forEach((b) => b.destroy());
  }
}
