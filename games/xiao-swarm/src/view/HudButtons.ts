import Phaser from 'phaser';
import { PALETTE } from '../config';

/** Ids des images de `art-src/bouton pause sound musique.png` (découpées par `node tools/slice-hud-buttons.mjs`, déclarées dans `assets/manifest.ts`). */
export const HUD_ART = { button: 'ui_hud_button', pause: 'ui_hud_pause', sound: 'ui_hud_sound', music: 'ui_hud_music' } as const;

/** Hauteur affichée du cadre par rapport au côté « utile » du bouton (le cadre déborde un peu : voyants latéraux). */
const FRAME_OVER = 1.08;

/** Barre de mute, en part du côté du bouton (réduite de 20 % : longueur, épaisseur du trait crème et du contour sombre). */
const SLASH = { length: 0.77, core: 0.06, outline: 0.136 };

export interface HudButton {
  container: Phaser.GameObjects.Container;
  /** Barre diagonale « coupé » sur l'icône (boutons son / musique) : à afficher quand le son est coupé. */
  slash: Phaser.GameObjects.Graphics;
}

/**
 * Bouton rond-carré du HUD : cadre vide + icône centrée, avec une barre diagonale optionnelle pour l'état « coupé ». `size` = côté utile (px) ;
 * la zone cliquable est un carré de ce côté.
 */
export function makeHudButton(scene: Phaser.Scene, size: number, icon: string, onClick: () => void): HudButton {
  const frame = scene.add.image(0, 0, HUD_ART.button);
  const k = (size * FRAME_OVER) / frame.height; // les images sont exportées à la même échelle : cadre et icône se mettent à l'échelle ensemble
  frame.setScale(k);
  const glyph = scene.add.image(0, 0, icon).setScale(k);
  // barre diagonale à bouts arrondis : trait crème (comme l'icône) cerclé de sombre, dessiné à plat puis tourné de 45°
  const slash = scene.add.graphics().setVisible(false).setRotation(Math.PI / 4);
  const len = size * SLASH.length;
  const core = size * SLASH.core;
  const full = size * SLASH.outline;
  slash.fillStyle(PALETTE.panel, 1).fillRoundedRect(-(len + full - core) / 2, -full / 2, len + full - core, full, full / 2); // contour sombre
  slash.fillStyle(0xfff3d6, 1).fillRoundedRect(-len / 2, -core / 2, len, core, core / 2);
  const hit = scene.add.zone(0, 0, size, size).setInteractive({ useHandCursor: true });
  hit.on('pointerup', onClick);
  const container = scene.add.container(0, 0, [frame, glyph, slash, hit]);
  return { container, slash };
}
