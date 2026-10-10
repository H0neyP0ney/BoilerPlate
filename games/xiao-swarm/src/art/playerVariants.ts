import type Phaser from 'phaser';
import { recolorPixels, recolorTexture, sprites } from '@xiao/engine';
import { PLAYER_HUE_SHIFT } from '../config';
import { CLASSES } from '../data/classes';
import type { SoldierClassId } from '../data/classes';

/**
 * Couleur de chaque joueur : les soldats sont bleus ; pour les emplacements 1, 2… de `PLAYER_HUE_SHIFT`, on fabrique au chargement une copie
 * de leur texture dont les bleus sont décalés vers la couleur du joueur (peau, arme et reste ne bougent pas ; `recolorTexture` de l'engine), avec ses animations. Le visuel
 * d'un joueur est alors `soldier_<classe>#s<emplacement>` (voir `soldierSpriteId`) ; l'emplacement 0 reste le soldat bleu d'origine.
 */
const slotKey = (id: string, slot: number): string => `${id}#s${slot}`;

/** Id de visuel d'un soldat pour un emplacement de joueur (repli : le soldat bleu d'origine). */
export function soldierSpriteId(cls: SoldierClassId, slot: number): string {
  const s = slot % PLAYER_HUE_SHIFT.length;
  const id = `soldier_${cls}`;
  return s > 0 && sprites.has(slotKey(id, s)) ? slotKey(id, s) : id;
}

/** Plage des bleus du soldat recolorée pour chaque joueur (185°-250°, fondu de 15° de chaque côté). */
const BLUES = { hueMin: 185, hueMax: 250, feather: 15 };

/** Décale de `shift` degrés la teinte des pixels bleus (soldat, tête de recrue). */
export function shiftBlues(data: Uint8ClampedArray, shift: number): void {
  recolorPixels(data, { ...BLUES, shift });
}

/** Crée, pour chaque classe et chaque emplacement de joueur autre que le 0, la texture recolorée, ses animations et sa définition de visuel. */
export function makePlayerVariants(scene: Phaser.Scene): void {
  for (const cls of Object.keys(CLASSES) as SoldierClassId[]) {
    const id = `soldier_${cls}`;
    const def = sprites.get(id);
    for (let slot = 1; slot < PLAYER_HUE_SHIFT.length; slot++) {
      const key = slotKey(def.texture, slot);
      if (!recolorTexture(scene, def.texture, key, { ...BLUES, shift: PLAYER_HUE_SHIFT[slot] })) break;
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
