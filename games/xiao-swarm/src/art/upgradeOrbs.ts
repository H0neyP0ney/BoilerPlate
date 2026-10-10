import type Phaser from 'phaser';
import { canvasTexture } from '@xiao/engine';
import type { UpgradeId } from '../data/progression';
import { upgradeIconKey } from '../view/upgradeIcons';

/**
 * Globes au sol (power-ups, globe d'upgrade des œufs de boss) et leurs étoiles : des IMAGES (public/assets/globes/, à retoucher à la main),
 * plus de recoloration au lancement. Elles ont été générées une fois depuis les pièces dorées de la recrue par `python tools/bake-globes.py`
 * (le relancer avec --force écrase les retouches). Un globe d'upgrade = l'image `globe_upgrade` + l'icône de la carte d'upgrade au centre,
 * assemblés au premier besoin (une texture par upgrade). Clés absentes (image non chargée) : null, chaque vue a son repli dessiné.
 */
const SIZE = 220; // côté des images de globe (le globe de 160 px est centré dedans)
const GLOBE = 160;
/** Taille de l'icône par rapport au globe (la tête d'une recrue est à `FX.recruit.headScale`, l'icône de carte est plus chargée : un peu plus grande). */
const ICON_SCALE = 0.7;

/** Sortes de globes au sol : une image de globe et une d'étoile chacune (`globe_<sorte>`, `star_<sorte>`). */
export const GLOBE_KINDS = ['stim', 'magnet', 'heal', 'stasis', 'rockets', 'reroll', 'upgrade'] as const;
export type GlobeKind = (typeof GLOBE_KINDS)[number];

/** Image du globe d'une sorte (power-up ou `upgrade`). */
export const globeKey = (kind: GlobeKind): string => `globe_${kind}`;
/** Image de l'étoile qui scintille autour d'un globe de cette sorte (`view/GlobeGlitter.ts`). */
export const starKey = (kind: GlobeKind): string => `star_${kind}`;
export const upgradeOrbKey = (id: UpgradeId): string => `upgrade_orb_${id}`;

/** Clé de l'image si elle est chargée, sinon null. */
export function loadedKey(scene: Phaser.Scene, key: string): string | null {
  return scene.textures.exists(key) ? key : null;
}

/** Supprime les globes d'upgrade déjà assemblés (visionneuse : ils sont refaits au prochain besoin). */
export function clearGlobeTextures(scene: Phaser.Scene): void {
  for (const k of scene.textures.getTextureKeys()) if (k.startsWith('upgrade_orb_')) scene.textures.remove(k);
}

/** Globe d'upgrade : l'image du globe rose avec l'icône de la carte d'upgrade au centre (texture créée une fois par upgrade). */
export function ensureUpgradeOrbTexture(scene: Phaser.Scene, id: UpgradeId): string | null {
  const key = upgradeOrbKey(id);
  if (scene.textures.exists(key)) return key;
  const img = (k: string): HTMLImageElement | null => (scene.textures.exists(k) ? (scene.textures.get(k).getSourceImage() as HTMLImageElement) : null);
  const globe = img(globeKey('upgrade'));
  const icon = img(upgradeIconKey(id));
  if (!globe || !icon) return null;
  canvasTexture(scene, key, SIZE, SIZE, (ctx) => {
    ctx.drawImage(globe, 0, 0, SIZE, SIZE);
    const w = GLOBE * ICON_SCALE;
    const h = (w * icon.height) / icon.width;
    ctx.drawImage(icon, SIZE / 2 - w / 2, SIZE / 2 - h / 2, w, h);
  });
  return key;
}
