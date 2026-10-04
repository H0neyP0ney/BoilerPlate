import type Phaser from 'phaser';
import { sprites } from '@xiao/engine';
import { PLAYER_HUE_SHIFT } from '../config';
import { CLASSES } from '../data/classes';
import type { SoldierClassId } from '../data/classes';

/**
 * Couleur de chaque joueur : les soldats sont bleus ; pour les emplacements 1, 2… de `PLAYER_HUE_SHIFT`, on fabrique au chargement une copie
 * de leur texture dont les bleus sont décalés vers la couleur du joueur (peau, arme et reste ne bougent pas), avec ses animations. Le visuel
 * d'un joueur est alors `soldier_<classe>#s<emplacement>` (voir `soldierSpriteId`) ; l'emplacement 0 reste le soldat bleu d'origine.
 */
const slotKey = (id: string, slot: number): string => `${id}#s${slot}`;

/** Id de visuel d'un soldat pour un emplacement de joueur (repli : le soldat bleu d'origine). */
export function soldierSpriteId(cls: SoldierClassId, slot: number): string {
  const s = slot % PLAYER_HUE_SHIFT.length;
  const id = `soldier_${cls}`;
  return s > 0 && sprites.has(slotKey(id, s)) ? slotKey(id, s) : id;
}

/** Décale la teinte des pixels bleus (185°-250°, fondu de 15° de chaque côté) de `shift` degrés. */
function shiftBlues(data: Uint8ClampedArray, shift: number): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d < 0.12 || max < 0.1) continue; // gris : pas de teinte à décaler
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const w = h >= 185 && h <= 250 ? 1 : h >= 170 && h < 185 ? (h - 170) / 15 : h > 250 && h <= 265 ? (265 - h) / 15 : 0;
    if (w === 0) continue;
    const nh = (((h + shift * w) % 360) + 360) % 360;
    const c = d;
    const x = c * (1 - Math.abs(((nh / 60) % 2) - 1));
    const m = min;
    const [rr, gg, bb] = nh < 60 ? [c, x, 0] : nh < 120 ? [x, c, 0] : nh < 180 ? [0, c, x] : nh < 240 ? [0, x, c] : nh < 300 ? [x, 0, c] : [c, 0, x];
    data[i] = Math.round((rr + m) * 255);
    data[i + 1] = Math.round((gg + m) * 255);
    data[i + 2] = Math.round((bb + m) * 255);
  }
}

/** Crée, pour chaque classe et chaque emplacement de joueur autre que le 0, la texture recolorée, ses animations et sa définition de visuel. */
export function makePlayerVariants(scene: Phaser.Scene): void {
  for (const cls of Object.keys(CLASSES) as SoldierClassId[]) {
    const id = `soldier_${cls}`;
    const def = sprites.get(id);
    const tex = scene.textures.exists(def.texture) ? scene.textures.get(def.texture) : undefined;
    const src = tex?.getSourceImage() as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (!tex || !src || !src.width) continue;
    for (let slot = 1; slot < PLAYER_HUE_SHIFT.length; slot++) {
      const key = slotKey(def.texture, slot);
      if (!scene.textures.exists(key)) {
        const canvas = document.createElement('canvas');
        canvas.width = src.width;
        canvas.height = src.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(src, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        shiftBlues(img.data, PLAYER_HUE_SHIFT[slot]);
        ctx.putImageData(img, 0, 0);
        const nt = scene.textures.addCanvas(key, canvas);
        if (!nt) continue;
        for (const name of tex.getFrameNames()) {
          const f = tex.get(name);
          nt.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
        }
      }
      // mêmes animations, sur la texture recolorée
      const anims: Record<string, string> = {};
      for (const [name, animKey] of Object.entries(def.anims ?? {})) {
        const a = scene.anims.get(animKey);
        const newAnim = slotKey(animKey, slot);
        if (a && !scene.anims.exists(newAnim)) {
          scene.anims.create({ key: newAnim, frames: a.frames.map((f) => ({ key, frame: f.textureFrame })), frameRate: a.frameRate, repeat: a.repeat });
        }
        anims[name] = newAnim;
      }
      sprites.define(slotKey(id, slot), { ...def, texture: key, anims: def.anims ? anims : undefined });
    }
  }
}
