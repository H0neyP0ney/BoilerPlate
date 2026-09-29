import { sprites } from '@xiao/engine';
import type { AlienId } from '../data/aliens';
import { ALIENS } from '../data/aliens';
import type { SoldierClassId } from '../data/classes';
import { CLASSES } from '../data/classes';

/**
 * Réglages par défaut de tous les visuels (valables pour le dessin procédural).
 * Une planche déclarée dans assets/manifest.ts les remplace ; ceux qu'elle ne
 * précise pas (ancrage) sont complétés d'ici.
 *
 * C'est aussi la liste de référence des ids de visuels du jeu.
 */
export function registerDefaultSprites(): void {
  for (const id of Object.keys(CLASSES) as SoldierClassId[]) {
    sprites.defaults(`soldier_${id}`, { texture: `soldier_${id}`, originX: 0.5, originY: 0.95, scale: 0.8 });
    sprites.defaults(`gun_${id}`, { texture: `gun_${id}`, originX: 0.2, originY: 0.55, scale: 0.8 });
    sprites.defaults(`recruit_${id}`, { texture: `recruit_${id}`, originX: 0.5, originY: 0.9, scale: 0.75 });
    // Portrait du HUD : par défaut, le haut du corps du soldat.
    if (!sprites.has(`portrait_${id}`)) {
      const body = sprites.get(`soldier_${id}`);
      const procedural = body.texture === `soldier_${id}`;
      sprites.define(`portrait_${id}`, {
        ...body,
        originX: 0.5,
        originY: 1,
        scale: procedural ? 0.85 : (body.scale ?? 1) * 1.1,
        crop: procedural ? [0, 0, 64, 48] : undefined,
        hidden: false,
      });
    }
  }
  for (const id of Object.keys(ALIENS) as AlienId[]) {
    sprites.defaults(`alien_${id}`, { texture: `alien_${id}`, originX: 0.5, originY: ALIENS[id].floats ? 1.3 : 0.92, scale: 1 });
  }
  for (const id of ['palm', 'bush', 'bush_flowers', 'log']) sprites.defaults(id, { texture: id, originX: 0.5, originY: 0.92, scale: 1 });
  for (const id of ['rock_big', 'rock_small']) sprites.defaults(id, { texture: id, originX: 0.5, originY: 0.82, scale: 1 });
}
