import Phaser from 'phaser';
import { sprites } from '@xiao/engine';

const KEY = 'xiao-scale-ref';
const ID = 'soldier_trooper';

/**
 * Trooper de référence des visionneuses (dev) : un soldat posé à droite de l'écran, à l'échelle de la caméra, pour juger la taille des
 * unités, bonus et effets. Un petit bouton à côté permet de le masquer / l'afficher (état mémorisé, partagé par toutes les vues).
 * À appeler : `place()` à chaque frame (la caméra bouge, défile ou change de zoom), `destroy()` à la fermeture de la scène.
 */
export class ScaleRef {
  private readonly sprite?: Phaser.GameObjects.Sprite;
  private readonly button: HTMLButtonElement;
  private on: boolean;
  /** Vue où la référence est proposée (faux : ni le Trooper ni le bouton). */
  private enabled = true;

  constructor(private readonly scene: Phaser.Scene) {
    try {
      this.on = localStorage.getItem(KEY) !== '0';
    } catch {
      this.on = true;
    }
    if (scene.textures.exists(ID)) {
      this.sprite = sprites.add(scene, ID, 0, 0).setDepth(5000).setScale(sprites.scaleOf(ID));
      sprites.play(this.sprite, ID, 'idle');
    }
    const b = document.createElement('button');
    b.style.cssText =
      'position:fixed;z-index:99998;width:26px;height:26px;padding:0;cursor:pointer;font:15px system-ui,sans-serif;line-height:1;' +
      'background:rgba(0,0,0,0.78);color:#dfe;border:1px solid #444;border-radius:6px';
    b.addEventListener('click', () => {
      this.on = !this.on;
      try {
        localStorage.setItem(KEY, this.on ? '1' : '0');
      } catch {
        // stockage indisponible : l'état ne survit simplement pas au rechargement
      }
      b.blur();
      this.apply();
    });
    document.body.append(b);
    this.button = b;
    this.apply();
  }

  private apply(): void {
    this.sprite?.setVisible(this.enabled && this.on);
    this.button.style.display = this.enabled ? 'block' : 'none';
    this.button.textContent = this.on ? '👁' : '🚫';
    this.button.title = this.on ? 'Masquer le Trooper de référence' : 'Afficher le Trooper de référence';
  }

  /** Active / désactive la référence selon la vue (ex. : masquée sur la vue d'ensemble de la visionneuse d'unités). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.apply();
  }

  /** Recale le Trooper à droite de l'écran (à `inset` px du bord, milieu de la hauteur) et le bouton juste en dessous. */
  place(inset = 70): void {
    const { width, height } = this.scene.scale;
    const cam = this.scene.cameras.main;
    const sx = width - inset;
    const sy = height / 2;
    if (this.sprite) {
      const p = cam.getWorldPoint(sx, sy);
      this.sprite.setPosition(p.x, p.y);
    }
    // le canvas peut être redimensionné par CSS : conversion des pixels du jeu en pixels de l'écran
    const { x: cx, y: cy } = this.scene.scale.canvasBounds;
    const k = this.scene.scale.displayScale;
    this.button.style.left = `${cx + sx / k.x - 13}px`;
    this.button.style.top = `${cy + sy / k.y + 24}px`;
  }

  destroy(): void {
    this.button.remove();
    this.sprite?.destroy();
  }
}
