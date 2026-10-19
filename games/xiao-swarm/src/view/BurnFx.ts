import Phaser from 'phaser';
import { FX } from '../fxParams';

/**
 * Effet d'une unité enflammée : 3 petites flammes qui vacillent (`fx_flame`, additif, par-dessus le sprite) et 3 volutes de fumée grise
 * (`fx_smoke`) qui montent en grossissant et s'effacent, décalées d'un tiers de cycle. Réglages : `FX.burn` (visionneuse de particules).
 * Partagé par `SoldierView` (en jeu) et la visionneuse.
 */
export class BurnFx {
  private readonly flames: Phaser.GameObjects.Image[];
  private readonly smokes: Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene) {
    this.flames = [0, 1, 2].map(() => scene.add.image(0, 0, 'fx_flame').setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    this.smokes = [0, 1, 2].map(() => scene.add.image(0, 0, 'fx_smoke').setVisible(false));
  }

  /** `x`, `y` : pied de l'unité (bob et décalage du sprite compris) ; `time` en s ; `phase` : déphasage propre à l'unité ; `depth` : profondeur de l'unité (flammes à +4, fumée à +5). */
  update(x: number, y: number, time: number, phase: number, depth: number): void {
    const k = FX.burn;
    this.flames.forEach((f, i) => {
      const mid = i === 1;
      const w = Math.sin(time * 17 + i * 2.3 + phase);
      f.setVisible(true)
        .setPosition(x + (i - 1) * k.spacing + w * 1.5, y + k.baseY - Math.abs(Math.sin(time * 9 + i * 1.7)) * k.hop - (mid ? k.hop * 0.8 : 0))
        .setScale((k.flameScale + k.flicker * Math.sin(time * 21 + i)) * (mid ? 1.1 : 0.9), (k.flameHeight + k.flicker * 1.3 * Math.sin(time * 13 + i * 1.7)) * (mid ? 1.1 : 0.9))
        .setAlpha(k.alpha)
        .setTint(mid ? k.flameColorMid : k.flameColor)
        .setDepth(depth + 4);
    });
    this.smokes.forEach((m, i) => {
      const u = (time * k.smokeSpeed + i / 3 + phase * 0.1) % 1; // chaque volute monte, grossit et s'efface en boucle
      m.setVisible(true)
        .setPosition(x + (i - 1) * k.smokeSpread + Math.sin(time * 3 + i * 2 + phase) * (k.smokeSpread * 0.66), y + k.smokeY - u * k.smokeRise)
        .setScale(k.smokeScale + u * k.smokeGrow)
        .setAlpha(k.smokeAlpha * Math.sin(u * Math.PI))
        .setTint(k.smokeColor)
        .setDepth(depth + 5);
    });
  }

  hide(): void {
    this.flames.forEach((f) => f.setVisible(false));
    this.smokes.forEach((m) => m.setVisible(false));
  }

  destroy(): void {
    this.flames.forEach((f) => f.destroy());
    this.smokes.forEach((m) => m.destroy());
  }
}
