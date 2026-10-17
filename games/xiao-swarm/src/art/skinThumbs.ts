import type Phaser from 'phaser';
import { sprites } from '@xiao/engine';
import { requestSkinSheet, SKIN_SHEETS } from '../assets/skinSheets';
import type { SkinDef } from '../data/skins';
import { shiftBlues } from './playerHue';

/**
 * Vignettes des skins pour la boutique : UNE seule image par skin (la première frame de l'animation « idle »), au lieu de charger toute la planche animée (et de fabriquer un soldat
 * recoloré par classe) pour 12 aperçus : la mémoire reste minuscule. Une planche dédiée (`assets/skinSheets.ts`) n'est téléchargée que le temps de copier sa frame 0 ; la libération
 * périodique de `WorldView` la décharge ensuite (sauf si le skin est équipé). Un skin sans planche est la frame 0 du Trooper dont les bleus sont décalés (`shiftBlues`).
 */
const key = (id: string): string => `skin_thumb_${id}`;

/** Une vignette : clé de texture, taille de la case et ancrage des pieds (pour la poser au sol). */
export interface SkinThumb {
  key: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
  /** Échelle d'affichage en jeu du skin (1,25 pour le Trooper) : les vignettes gardent ainsi les tailles relatives réelles. */
  scale: number;
}

const made = new Map<string, SkinThumb>();

/** Copie la frame `frame` de la texture `textureKey` dans un canvas (décalé en teinte si `shift` ≠ 0). */
function frameToTexture(scene: Phaser.Scene, textureKey: string, frame: string | number, out: string, shift: number): { width: number; height: number } | null {
  if (!scene.textures.exists(textureKey)) return null;
  const fr = scene.textures.get(textureKey).get(frame);
  const canvas = document.createElement('canvas');
  canvas.width = fr.cutWidth;
  canvas.height = fr.cutHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
  if (shift !== 0) {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    shiftBlues(data.data, shift);
    ctx.putImageData(data, 0, 0);
  }
  if (scene.textures.exists(out)) scene.textures.remove(out);
  scene.textures.addCanvas(out, canvas);
  return { width: canvas.width, height: canvas.height };
}

/**
 * Vignette du skin `skin` (null : le soldat d'origine). Renvoie undefined tant que la planche dédiée n'est pas arrivée (elle est demandée ici ; `onSkinSheetReady` prévient
 * l'écran, qui redemande).
 */
export function skinThumb(scene: Phaser.Scene, skin: SkinDef | null): SkinThumb | undefined {
  const id = skin ? skin.id : 'classic';
  const done = made.get(id);
  if (done && scene.textures.exists(done.key)) return done;
  let thumb: SkinThumb | undefined;
  const sheet = skin ? SKIN_SHEETS[skin.id] : undefined;
  if (skin && sheet) {
    const sheetKey = `skin_sheet_${skin.id}`;
    if (!scene.textures.exists(sheetKey)) {
      requestSkinSheet(skin.id);
      return undefined;
    }
    const size = frameToTexture(scene, sheetKey, 0, key(id), 0);
    if (size) thumb = { key: key(id), ...size, originX: sheet.sprite.originX ?? 0.5, originY: sheet.sprite.originY ?? 0.9, scale: sheet.sprite.scale ?? 1 };
  } else {
    const base = sprites.get('soldier_trooper');
    const idle = base.anims?.idle ? scene.anims.get(base.anims.idle) : undefined;
    const frame = idle?.frames[0]?.textureFrame ?? base.frame ?? 0;
    const size = frameToTexture(scene, base.texture, frame, key(id), skin ? skin.shift : 0);
    if (size) thumb = { key: key(id), ...size, originX: base.originX ?? 0.5, originY: base.originY ?? 0.9, scale: base.scale ?? 1 };
  }
  if (thumb) made.set(id, thumb);
  return thumb;
}
