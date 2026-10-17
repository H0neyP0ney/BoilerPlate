import type Phaser from 'phaser';
import { recolorTexture, sprites } from '@xiao/engine';
import { PLAYER_HUE_SHIFT } from '../config';
import { CLASSES } from '../data/classes';
import { requestSkinSheet, skinSpriteId } from '../assets/skinSheets';
import { SKINS, SKIN_SLOT_BASE, slotShift } from '../data/skins';
import type { SoldierClassId } from '../data/classes';
import { BLUES, ensurePlayerSlot, registerSlotMaker } from './playerHue';

/**
 * Couleur de chaque joueur : les soldats sont bleus ; pour les emplacements 1, 2… de `PLAYER_HUE_SHIFT`, on fabrique **à la première demande**
 * (`playerHue.ts`) une copie de leur texture dont les bleus sont décalés vers la couleur du joueur (peau, arme et reste ne bougent pas ;
 * `recolorTexture` de l'engine), avec ses animations. Le visuel d'un joueur est alors `soldier_<classe>#s<emplacement>` (voir `soldierSpriteId`) ;
 * l'emplacement 0 reste le soldat bleu d'origine (aucune fabrication en solo).
 */
const slotKey = (id: string, slot: number): string => `${id}#s${slot}`;

/** Id de visuel d'un soldat pour un emplacement de joueur (fabriqué à la première demande ; repli : le soldat bleu d'origine). */
export function soldierSpriteId(cls: SoldierClassId, slot: number): string {
  const s = slot >= SKIN_SLOT_BASE ? slot : slot % PLAYER_HUE_SHIFT.length; // emplacement de skin (boutique) : tel quel
  if (s >= SKIN_SLOT_BASE) {
    // skin à planche dédiée (`assets/skinSheets.ts`) : chargée à la demande ; en attendant (ou sans planche), la copie recolorée ci-dessous
    const skin = SKINS[s - SKIN_SLOT_BASE];
    if (skin) {
      const sheet = skinSpriteId(cls, skin.id);
      if (sheet) return sheet;
      requestSkinSheet(skin.id);
    }
  }
  if (s > 0) ensurePlayerSlot(s);
  const id = `soldier_${cls}`;
  return s > 0 && sprites.has(slotKey(id, s)) ? slotKey(id, s) : id;
}

/** Crée, pour chaque classe, la texture recolorée de cet emplacement de joueur, ses animations et sa définition de visuel. */
function makeSoldierSlot(scene: Phaser.Scene, slot: number): void {
  for (const cls of Object.keys(CLASSES) as SoldierClassId[]) {
    const id = `soldier_${cls}`;
    const def = sprites.get(id);
    const key = slotKey(def.texture, slot);
    if (!recolorTexture(scene, def.texture, key, { ...BLUES, shift: slotShift(slot) })) continue;
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
registerSlotMaker(makeSoldierSlot);
