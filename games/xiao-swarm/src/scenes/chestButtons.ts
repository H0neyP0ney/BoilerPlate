import type Phaser from 'phaser';
import { Button } from '@xiao/engine';
import { t } from '../i18n';

/** Les deux boutons à coffre des menus : Armory (arsenal, à gauche) et Wardrobe (vestiaire, à droite). Images : `art-src/armory_outfits.png` (`node tools/slice-armory-buttons.mjs`). */
export type ChestKind = 'armory' | 'skins';

const KEYS: Record<ChestKind, string> = { armory: 'ui_btn_armory', skins: 'ui_btn_skins' };
const LABELS = { armory: 'armoryBtn', skins: 'skinsBtn' } as const;
const FALLBACK_FILLS: Record<ChestKind, number> = { armory: 0x8a5a05, skins: 0x1f7a4d }; // repli (image pas encore arrivée) : l'ancien fond dessiné

/** Largeur d'affichage d'un coffre pour un écran de largeur `screenW` (la hauteur suit le ratio de l'image : `chestSize`). */
export function chestWidth(screenW: number): number {
  return Math.min(190, Math.max(110, screenW * 0.26)) * 0.72;
}

/** Ligne Solo / Multiplayer de l'écran titre : sa hauteur et sa position (fraction de la hauteur de l'écran). Les coffres s'y calent : même Y sur tous les écrans. */
export const TITLE_ROW = { h: 151, y: 0.8, gap: 100 };

/** Y du centre d'un coffre, identique sur tous les écrans : à `TITLE_ROW.gap` px (bas du coffre → haut de Solo / Multiplayer) au-dessus de la ligne de l'écran titre. */
export function chestY(scene: Phaser.Scene, kind: ChestKind, screenW: number, screenH: number): number {
  return screenH * TITLE_ROW.y - TITLE_ROW.h / 2 - TITLE_ROW.gap - chestSize(scene, kind, screenW).h / 2;
}

/** Largeur et hauteur d'affichage d'un coffre. */
export function chestSize(scene: Phaser.Scene, kind: ChestKind, screenW: number): { w: number; h: number } {
  const w = chestWidth(screenW);
  const src = scene.textures.exists(KEYS[kind]) ? scene.textures.get(KEYS[kind]).getSourceImage() : null;
  return { w, h: src ? (w * src.height) / src.width : 128 };
}

/** Bouton à coffre centré en x, à la hauteur commune `chestY` : image, libellé sur la plaque du bas (contour noir), halo blanc au survol. */
export function chestButton(scene: Phaser.Scene, x: number, kind: ChestKind, screenW: number, screenH: number, onClick: () => void): Button {
  const { w, h } = chestSize(scene, kind, screenW);
  return new Button(scene, x, chestY(scene, kind, screenW, screenH), {
    label: t(LABELS[kind]),
    variant: 'secondary',
    fill: FALLBACK_FILLS[kind],
    textColor: '#ffffff',
    width: w,
    height: h,
    sprite: { key: KEYS[kind], labelY: 0.32 + 5 / h, labelWidth: 0.62, labelSize: 15 },
    onClick,
  });
}
