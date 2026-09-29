import Phaser from 'phaser';
import { theme } from './theme';

export type ButtonVariant = 'primary' | 'rewarded' | 'secondary';

export interface ButtonOptions {
  label: string;
  variant?: ButtonVariant;
  width?: number;
  height?: number;
  onClick: () => void;
}

/**
 * Bouton simple (souris + tactile), fond arrondi dessiné en Graphics.
 * La variante `rewarded` ajoute l'icône vidéo exigée par Poki (couleur non verte via le thème).
 */
export class Button extends Phaser.GameObjects.Container {
  private readonly onClick: () => void;
  private enabled = true;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOptions) {
    super(scene, x, y);
    this.onClick = opts.onClick;
    const variant = opts.variant ?? 'primary';
    const width = opts.width ?? 320;
    const height = opts.height ?? 80;
    const fill = variant === 'primary' ? theme.primary : variant === 'rewarded' ? theme.rewarded : theme.secondary;
    const textColor =
      variant === 'primary' ? theme.primaryText : variant === 'rewarded' ? theme.rewardedText : theme.secondaryText;

    const r = Math.min(theme.radius, height / 2);
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.35);
    bg.fillRoundedRect(-width / 2, -height / 2 + 5, width, height, r);
    bg.fillStyle(fill, 1);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, r);
    bg.fillStyle(0xffffff, 0.18);
    bg.fillRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height * 0.4, { tl: r - 2, tr: r - 2, bl: 4, br: 4 });
    bg.lineStyle(3, theme.panelBorder, 0.6);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, r);
    this.add(bg);

    const label = scene.add
      .text(0, 0, opts.label, {
        fontFamily: theme.font,
        fontSize: `${Math.round(height * 0.4)}px`,
        color: textColor,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add(label);

    if (variant === 'rewarded') {
      const iconSize = height * 0.42;
      const iconWidth = iconSize * 1.65;
      const icon = videoIcon(scene, iconSize);
      const gap = 14;
      const total = iconWidth + gap + label.width;
      icon.setPosition(-total / 2 + iconWidth / 2, 0);
      label.setX(-total / 2 + iconWidth + gap + label.width / 2);
      this.add(icon);
    }

    this.setSize(width, height);
    const hit = scene.add.zone(0, 0, width, height).setInteractive({ useHandCursor: true });
    this.add(hit);
    hit
      .on('pointerover', () => this.enabled && this.setScale(1.04))
      .on('pointerout', () => this.setScale(1))
      .on('pointerdown', () => this.enabled && this.setScale(0.96))
      .on('pointerup', () => this.trigger());

    scene.add.existing(this);
  }

  trigger(): void {
    if (!this.enabled) return;
    this.setScale(1);
    this.onClick();
  }

  setEnabled(value: boolean): this {
    this.enabled = value;
    this.setAlpha(value ? 1 : 0.5);
    return this;
  }
}

/** Icône "caméra vidéo" standard pour les boutons rewarded. */
function videoIcon(scene: Phaser.Scene, size: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const w = size * 1.1;
  const h = size * 0.8;
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(-w / 2 - size * 0.2, -h / 2, w, h, size * 0.15);
  g.fillTriangle(w / 2 - size * 0.2, 0, w / 2 + size * 0.35, -h / 2, w / 2 + size * 0.35, h / 2);
  return g;
}
