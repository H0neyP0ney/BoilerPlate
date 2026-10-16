import Phaser from 'phaser';
import { PALETTE } from '../config';
import { playSfx } from '../playSfx';

/** Ids des images de `art-src/bouton pause sound musique.png` (découpées par `node tools/slice-hud-buttons.mjs`, déclarées dans `assets/manifest.ts`). */
export const HUD_ART = { button: 'ui_hud_button', pause: 'ui_hud_pause', sound: 'ui_hud_sound', music: 'ui_hud_music' } as const;

/** Hauteur affichée du cadre par rapport au côté « utile » du bouton (le cadre déborde un peu : voyants latéraux). */
const FRAME_OVER = 1.08;

/** Roue crantée « réglages » (crème, comme les autres icônes du HUD) : huit dents autour d'un disque percé. */
export function drawGear(g: Phaser.GameObjects.Graphics, size: number): void {
  const r = size * 0.27; // disque
  const tooth = { w: size * 0.14, h: size * 0.11 };
  g.fillStyle(0xfff3d6, 1);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const cx = Math.cos(a) * (r + tooth.h / 2 - 1);
    const cy = Math.sin(a) * (r + tooth.h / 2 - 1);
    const c = Math.cos(a + Math.PI / 2);
    const s = Math.sin(a + Math.PI / 2);
    const hw = tooth.w / 2;
    const hh = tooth.h / 2 + 1;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const p0 = { x: cx - c * hw - ux * hh, y: cy - s * hw - uy * hh };
    const p1 = { x: cx + c * hw - ux * hh, y: cy + s * hw - uy * hh };
    const p2 = { x: cx + c * hw + ux * hh, y: cy + s * hw + uy * hh };
    const p3 = { x: cx - c * hw + ux * hh, y: cy - s * hw + uy * hh };
    g.fillTriangle(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y);
    g.fillTriangle(p0.x, p0.y, p2.x, p2.y, p3.x, p3.y); // dent = rectangle (deux triangles)
  }
  g.fillCircle(0, 0, r);
  g.fillStyle(PALETTE.panel, 1).fillCircle(0, 0, size * 0.115); // trou central
}

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
export function makeHudButton(scene: Phaser.Scene, size: number, icon: string | ((g: Phaser.GameObjects.Graphics, size: number) => void), onClick: () => void): HudButton {
  const frame = scene.add.image(0, 0, HUD_ART.button);
  const k = (size * FRAME_OVER) / frame.height; // les images sont exportées à la même échelle : cadre et icône se mettent à l'échelle ensemble
  frame.setScale(k);
  // icône : une image de la planche, ou un dessin du code (ex. la roue crantée des réglages)
  let glyph: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  if (typeof icon === 'string') glyph = scene.add.image(0, 0, icon).setScale(k);
  else icon(((glyph = scene.add.graphics()) as Phaser.GameObjects.Graphics), size);
  // barre diagonale à bouts arrondis : trait crème (comme l'icône) cerclé de sombre, dessiné à plat puis tourné de 45°
  const slash = scene.add.graphics().setVisible(false).setRotation(Math.PI / 4);
  const len = size * SLASH.length;
  const core = size * SLASH.core;
  const full = size * SLASH.outline;
  slash.fillStyle(PALETTE.panel, 1).fillRoundedRect(-(len + full - core) / 2, -full / 2, len + full - core, full, full / 2); // contour sombre
  slash.fillStyle(0xfff3d6, 1).fillRoundedRect(-len / 2, -core / 2, len, core, core / 2);
  const hit = scene.add.zone(0, 0, size, size).setInteractive({ useHandCursor: true });
  // un clic ne compte qu'appui + relâchement SUR le bouton : sur mobile, un glissement qui finit (doigt relâché) au-dessus du bouton le déclenchait,
  // et coupait le son sans que le joueur s'en rende compte (le réglage est mémorisé)
  let pressed = false;
  hit.on('pointerdown', () => (pressed = true));
  hit.on('pointerout', () => (pressed = false));
  hit.on('pointerup', () => {
    if (!pressed) return;
    pressed = false;
    playSfx(scene, 'ui_click');
    onClick();
  });
  const container = scene.add.container(0, 0, [frame, glyph, slash, hit]);
  return { container, slash };
}
