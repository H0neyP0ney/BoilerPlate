import Phaser from 'phaser';
import { theme } from './theme';

/** Texture de l'icône « pub vidéo » des boutons `rewarded` (à charger par le jeu ; sans elle, une caméra vidéo est dessinée). */
export const REWARDED_ICON = 'ui_rewarded';

export type ButtonVariant = 'primary' | 'rewarded' | 'secondary';

export interface ButtonOptions {
  label: string;
  variant?: ButtonVariant;
  width?: number;
  height?: number;
  /** Remplace la couleur de fond de la variante (ex. bouton « rejouer » vert) ; jamais sur un bouton `rewarded` (Poki : pas de vert). */
  fill?: number;
  /** Remplace la couleur du texte de la variante. */
  textColor?: string;
  /** Pulse : un contour de la forme du bouton (rectangle arrondi) s'étend en s'effaçant, en boucle, derrière lui (gros boutons d'action : Solo, Quick Play, Play). */
  pulse?: boolean;
  /** Clé d'une texture de bouton (3-slice horizontale : coins gardés, milieu étiré) qui remplace le fond dessiné ; sans elle (pas encore chargée) le fond dessiné sert. Texte blanc à contour sombre. */
  image?: string;
  /** Clé d'une texture affichée telle quelle à la place du fond (coffre avec une plaque en bas, etc.) ; `width` / `height` = taille d'affichage (garder le ratio de l'image). Le libellé se pose à `labelY` (fraction de la hauteur depuis le centre, ex. 0,32 = plaque du bas) dans `width × labelWidth` ; sans la texture, le fond dessiné sert. */
  sprite?: { key: string; labelY: number; labelWidth?: number; labelSize?: number };
  onClick: () => void;
}

/**
 * Bouton simple (souris + tactile), fond arrondi dessiné en Graphics.
 * La variante `rewarded` ajoute l'icône vidéo exigée par Poki (couleur non verte via le thème).
 */
export class Button extends Phaser.GameObjects.Container {
  /** Appelé à chaque clic validé d'un bouton (le jeu y joue son bruitage de clic) : `scene` = la scène du bouton. */
  static clickHook: ((scene: Phaser.Scene) => void) | null = null;
  private readonly onClick: () => void;
  private enabled = true;
  /** Bouton enfoncé SUR ce bouton : le clic ne compte qu'à l'appui puis au relâchement dessus (un clic déjà enfoncé quand l'écran s'ouvre ne déclenche rien). */
  private pressed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOptions) {
    super(scene, x, y);
    this.onClick = opts.onClick;
    const variant = opts.variant ?? 'primary';
    const width = opts.width ?? 320;
    const height = opts.height ?? 80;
    const fill = (variant !== 'rewarded' ? opts.fill : undefined) ?? (variant === 'primary' ? theme.primary : variant === 'rewarded' ? theme.rewarded : theme.secondary);
    const textColor =
      (variant !== 'rewarded' ? opts.textColor : undefined) ?? (opts.image || opts.sprite ? '#ffffff' : variant === 'primary' ? theme.primaryText : variant === 'rewarded' ? theme.rewardedText : theme.secondaryText);

    const r = Math.min(theme.radius, height / 2);
    const imgKey = opts.image && scene.textures.exists(opts.image) ? opts.image : undefined;
    const spriteKey = opts.sprite && scene.textures.exists(opts.sprite.key) ? opts.sprite : undefined;
    let slice: { key: string; k: number; h: number; cap: number } | undefined; // bouton à image : le pulse devient un halo jaune (copies de la silhouette)
    const bg = scene.add.graphics();
    if (spriteKey) {
      this.add(scene.add.image(0, 0, spriteKey.key).setDisplaySize(width, height));
    } else if (imgKey) {
      // l'image garde ses proportions en hauteur (échelle k), seul le milieu s'étire en largeur
      const src = scene.textures.get(imgKey).getSourceImage();
      const k = height / src.height;
      const cap = Math.round(src.width * 0.26);
      slice = { key: imgKey, k, h: src.height, cap };
      this.add(scene.add.nineslice(0, 0, imgKey, undefined, width / k, src.height, cap, cap, 0, 0).setScale(k));
    } else {
      bg.fillStyle(0x000000, 0.35);
    bg.fillRoundedRect(-width / 2, -height / 2 + 5, width, height, r);
    bg.fillStyle(fill, 1);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, r);
    bg.fillStyle(0xffffff, 0.18);
    bg.fillRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height * 0.4, { tl: r - 2, tr: r - 2, bl: 4, br: 4 });
    bg.lineStyle(3, theme.panelBorder, 0.6);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, r);
    }
    this.add(bg);

    const label = scene.add
      .text(0, 0, opts.label, {
        fontFamily: theme.font,
        fontSize: `${spriteKey?.labelSize ?? Math.round(height * 0.4)}px`,
        color: textColor,
        fontStyle: 'bold',
        align: 'center', // libellé sur plusieurs lignes : centré
        ...(imgKey || spriteKey ? { stroke: '#000000', strokeThickness: spriteKey ? 5 : Math.max(4, Math.round(height * 0.09)) } : {}),
      })
      .setOrigin(0.5);
    this.add(label);
    if (variant !== 'rewarded') {
      // texte trop long (ou sur plusieurs lignes) : réduit pour rentrer dans le bouton, en largeur comme en hauteur
      const fit = Math.min(1, ((spriteKey ? width * (spriteKey.labelWidth ?? 0.6) : width - 24)) / label.width, (height - 8) / label.height);
      if (fit < 1) label.setScale(fit);
      if (spriteKey) label.setY(spriteKey.labelY * height);
    }

    if (variant === 'rewarded') {
      // icône du jeu (texture `REWARDED_ICON`, si elle est chargée) ; sinon la caméra vidéo dessinée par défaut
      const art = scene.textures.exists(REWARDED_ICON) ? scene.add.image(0, 0, REWARDED_ICON) : null;
      const iconSize = height * 0.42;
      if (art) art.setScale((height * 0.55) / art.height).setTint(Phaser.Display.Color.HexStringToColor(textColor).color); // icône blanche d'origine, à la couleur du texte du bouton
      const iconWidth = art ? art.displayWidth : iconSize * 1.65;
      const icon = art ?? videoIcon(scene, iconSize);
      const gap = 14;
      const total = iconWidth + gap + label.width;
      icon.setPosition(-total / 2 + iconWidth / 2, 0);
      label.setX(-total / 2 + iconWidth + gap + label.width / 2);
      this.add(icon);
    }

    if (opts.pulse && slice) {
      // bouton à image : sprite blanc de la forme du bouton, DERRIÈRE lui, qui grandit de ~19 px de chaque côté en s'effaçant, en boucle (seul ce qui dépasse du bouton se voit)
      const { key, k, h, cap } = slice;
      const halo = scene.add.nineslice(0, 0, key, undefined, width / k, h, cap, cap, 0, 0).setScale(k).setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      this.addAt(halo, 0);
      const tween = scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 1100,
        repeat: -1,
        onUpdate: (tw) => {
          const p = tw.getValue() ?? 0;
          const e = (p * 19.2) / k; // 24 px -20 %
          halo.setSize(width / k + 2 * e, h).setScale(k, k * (1 + (2 * e) / h)).setAlpha((1 - p) * 0.8); // largeur : 3-slice ; hauteur : échelle verticale (le 3-slice n'a pas de rangées haut / bas à étirer)
        },
      });
      this.once(Phaser.GameObjects.Events.DESTROY, () => tween.remove());
    } else if (opts.pulse) {
      // pulse « carré » : le contour du bouton grandit de 24 px de chaque côté en s'effaçant, puis repart aussitôt (aucune pause entre deux pulsations).
      // Dessiné en dehors du bouton, à une profondeur très haute : il passe PAR-DESSUS tout l'écran (le bouton lui-même, ses voisins, les têtes…).
      const ring = scene.add.graphics().setDepth(100000);
      const tween = scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 1100,
        repeat: -1,
        onUpdate: (tw) => {
          const p = tw.getValue() ?? 0;
          const k = this.scaleX; // le contour suit l'échelle du bouton (agrandi au survol, réduit à l'appui)
          const w = width * k;
          const h = height * k;
          const e = p * 24;
          ring.setVisible(this.visible);
          ring.clear().lineStyle(5, 0xffffff, (1 - p) * 0.75).strokeRoundedRect(this.x - w / 2 - e, this.y - h / 2 - e, w + 2 * e, h + 2 * e, r * k + e);
        },
      });
      this.once(Phaser.GameObjects.Events.DESTROY, () => {
        tween.remove();
        ring.destroy();
      });
    }

    // bouton à `sprite` : halo blanc au survol, image `<clé>_glow` (contour blanc net + flou extérieur, plus grande que le sprite) posée DERRIÈRE lui ; fondu à l'entrée et à la sortie du curseur
    let setHalo: ((on: boolean) => void) | undefined;
    if (spriteKey && scene.textures.exists(`${spriteKey.key}_glow`)) {
      const base = scene.textures.get(spriteKey.key).getSourceImage();
      const glowSrc = scene.textures.get(`${spriteKey.key}_glow`).getSourceImage();
      const img = scene.add.image(0, 0, `${spriteKey.key}_glow`).setDisplaySize((width * glowSrc.width) / base.width, (height * glowSrc.height) / base.height).setAlpha(0);
      this.addAt(img, 0);
      const layers = [{ img, alpha: 1 }];
      let fade: Phaser.Tweens.Tween | undefined;
      setHalo = (on) => {
        fade?.remove();
        fade = scene.tweens.addCounter({
          from: on ? 0 : 1,
          to: on ? 1 : 0,
          duration: 160,
          onUpdate: (tw) => layers.forEach(({ img, alpha }) => img.setAlpha(alpha * (tw.getValue() ?? 0))),
        });
      };
      this.once(Phaser.GameObjects.Events.DESTROY, () => fade?.remove());
    }

    this.setSize(width, height);
    const hit = scene.add.zone(0, 0, width, height).setInteractive({ useHandCursor: true });
    this.add(hit);
    hit
      .on('pointerover', () => {
        if (!this.enabled) return;
        this.setScale(1.04);
        setHalo?.(true);
      })
      .on('pointerout', () => {
        this.pressed = false;
        this.setScale(1);
        setHalo?.(false);
      })
      .on('pointerdown', () => {
        if (!this.enabled) return;
        this.pressed = true;
        this.setScale(0.96);
      })
      .on('pointerup', () => {
        const wasPressed = this.pressed;
        this.pressed = false;
        if (wasPressed) this.trigger();
      });

    scene.add.existing(this);
  }

  trigger(): void {
    if (!this.enabled) return;
    this.setScale(1);
    Button.clickHook?.(this.scene);
    this.onClick();
  }

  /** `dim` faux : un bouton désactivé garde son opacité pleine (ex. niveaux de difficulté verrouillés, déjà marqués d'un cadenas). */
  setEnabled(value: boolean, dim = true): this {
    this.enabled = value;
    this.setAlpha(value || !dim ? 1 : 0.5);
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
