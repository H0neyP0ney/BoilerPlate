import type Phaser from 'phaser';
import { recolorPixels, type TextureFactory } from '@xiao/engine';
import { UPGRADE_IDS, type UpgradeId } from '../data/progression';
import { upgradeIconKey } from '../view/upgradeIcons';
import { GLOBE_KINDS, GLOBE_TINTS, globeRecolorSpec, type GlobeKind } from './globeTints';

/**
 * Globes au sol (power-ups, globe d'upgrade des œufs de boss) et leurs étoiles : l'or de la recrue (pièces `recruit_part_globe` (globe + anneau) et
 * `recruit_part_star` du paquet 1) recoloré au premier besoin à la teinte de la sorte (`GLOBE_TINTS`, `art/globeTints.ts`), comme les fonds des
 * cartes d'upgrade : aucune image par sorte. Un globe d'upgrade = le globe `upgrade` + l'icône de la carte d'upgrade au centre (une texture par upgrade).
 */
const SIZE = 220; // côté des textures de globe (le globe de 160 px est centré dedans)
const GLOBE = 160;
/** Taille de l'icône par rapport au globe (la tête d'une recrue est à `FX.recruit.headScale`, l'icône de carte est plus chargée : un peu plus grande). */
const ICON_SCALE = 0.7;

export { GLOBE_KINDS };
export type { GlobeKind };

/** Image du globe d'une sorte (power-up ou `upgrade`). */
export const globeKey = (kind: GlobeKind): string => `globe_${kind}`;
/** Image de l'étoile qui scintille autour d'un globe de cette sorte (`view/GlobeGlitter.ts`). */
export const starKey = (kind: GlobeKind): string => `star_${kind}`;
export const upgradeOrbKey = (id: UpgradeId): string => `upgrade_orb_${id}`;

function img(scene: Phaser.Scene, key: string): HTMLImageElement | null {
  return scene.textures.exists(key) ? (scene.textures.get(key).getSourceImage() as HTMLImageElement) : null;
}

/** Crée la texture `key` (`w` × `h`) : `draw` la dessine, puis `color` la recolore. Faux si une pièce manque. */
function paint(scene: Phaser.Scene, key: string, w: number, h: number, color: number, draw: (ctx: CanvasRenderingContext2D) => boolean): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !draw(ctx)) return false;
  const data = ctx.getImageData(0, 0, w, h);
  recolorPixels(data.data, globeRecolorSpec(color));
  ctx.putImageData(data, 0, 0);
  scene.textures.addCanvas(key, canvas);
  return true;
}

/** Clé du globe de cette sorte, fabriqué au premier besoin ; null si les pièces de la recrue ne sont pas chargées. */
export function globeTexture(scene: Phaser.Scene, kind: GlobeKind): string | null {
  const key = globeKey(kind);
  if (scene.textures.exists(key)) return key;
  const globe = img(scene, 'recruit_part_globe'); // globe et anneau, fusionnés en une image
  if (!globe) return null;
  const ok = paint(scene, key, SIZE, SIZE, GLOBE_TINTS[kind], (ctx) => {
    ctx.drawImage(globe, (SIZE - globe.width) / 2, (SIZE - globe.height) / 2);
    return true;
  });
  return ok ? key : null;
}

/** Clé de l'étoile de cette sorte (l'étoile de la recrue recolorée), fabriquée au premier besoin ; null si elle n'est pas chargée. */
export function starTexture(scene: Phaser.Scene, kind: GlobeKind): string | null {
  const key = starKey(kind);
  if (scene.textures.exists(key)) return key;
  const star = img(scene, 'recruit_part_star');
  if (!star) return null;
  const ok = paint(scene, key, star.width, star.height, GLOBE_TINTS[kind], (ctx) => {
    ctx.drawImage(star, 0, 0);
    return true;
  });
  return ok ? key : null;
}

/** Déclare à l'atelier de textures les globes, les étoiles et les globes d'upgrade : ils sont fabriqués en tâche de fond (ou à la demande), plus au premier usage. */
export function declareGlobeTextures(f: TextureFactory, scene: Phaser.Scene, priority: (key: string) => number): void {
  for (const kind of GLOBE_KINDS) {
    f.declareLazy(globeKey(kind), SIZE, SIZE, () => void globeTexture(scene, kind), priority(globeKey(kind)));
    f.declareLazy(starKey(kind), 48, 48, () => void starTexture(scene, kind), priority(starKey(kind)));
  }
  for (const id of UPGRADE_IDS) f.declareLazy(upgradeOrbKey(id), SIZE, SIZE, () => void ensureUpgradeOrbTexture(scene, id), priority(upgradeOrbKey(id)));
}

/** Supprime les globes d'upgrade déjà assemblés (visionneuse : ils sont refaits au prochain besoin). */
export function clearGlobeTextures(scene: Phaser.Scene): void {
  for (const k of scene.textures.getTextureKeys()) if (k.startsWith('upgrade_orb_')) scene.textures.remove(k);
}

/** Dev : défait le globe et l'étoile d'une sorte (teinte modifiée) ainsi que les globes d'upgrade qui en dérivent ; ils sont refaits au prochain besoin. */
export function clearGlobeKind(scene: Phaser.Scene, kind: GlobeKind): void {
  for (const k of [globeKey(kind), starKey(kind)]) if (scene.textures.exists(k)) scene.textures.remove(k);
  if (kind === 'upgrade') clearGlobeTextures(scene);
}

/** Globe d'upgrade : le globe rose avec l'icône de la carte d'upgrade au centre (texture créée une fois par upgrade). */
export function ensureUpgradeOrbTexture(scene: Phaser.Scene, id: UpgradeId): string | null {
  const key = upgradeOrbKey(id);
  if (scene.textures.exists(key)) return key;
  const globeTex = globeTexture(scene, 'upgrade');
  const globe = globeTex ? img(scene, globeTex) : null;
  const icon = img(scene, upgradeIconKey(id));
  if (!globe || !icon) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(globe, 0, 0, SIZE, SIZE);
  const w = GLOBE * ICON_SCALE;
  const h = (w * icon.height) / icon.width;
  ctx.drawImage(icon, SIZE / 2 - w / 2, SIZE / 2 - h / 2, w, h);
  scene.textures.addCanvas(key, canvas);
  return key;
}
