import type Phaser from 'phaser';
import { canvasTexture } from '@xiao/engine';
import { FX } from '../fxParams';
import type { UpgradeId } from '../data/progression';
import { upgradeIconKey } from '../view/upgradeIcons';
import { RECRUIT_STAR } from './recruits';

/**
 * Globe d'upgrade d'un coffre de boss : même assemblage que le bonus recrue (`art/recruits.ts` : globe doré + anneau lumineux, mêmes pièces
 * `recruit_part_*` et mêmes réglages `FX.recruit`), avec l'ICÔNE DE LA CARTE D'UPGRADE à la place de la tête et sans « +1 ». Une texture par
 * upgrade, créée au premier besoin ; le globe et l'anneau sont décalés de `FX.upgradeOrb.hue` degrés (rose clair par défaut : `FX.upgradeOrb.hue` / `light`). Renvoie null si une pièce manque (le globe procédural de `LootViews` sert alors de repli).
 */
const GLOBE = 160;
const SIZE = 220;
/** Taille de l'icône par rapport au globe (la tête d'une recrue est à `FX.recruit.headScale`, l'icône de carte est plus chargée : un peu plus grande). */
const ICON_SCALE = 0.7;

export const upgradeOrbKey = (id: UpgradeId): string => `upgrade_orb_${id}`;
/** Texture du globe vert des power-ups (icône dessinée par-dessus). */
/** Clé de la texture du globe d'un power-up (une par sorte : chacun a sa teinte, `POWERUP_INFO`). */
export const powerUpGlobeKey = (kind: string): string => `powerup_globe_${kind}`;

/** Éclaircit tous les pixels de `data` (RGBA) vers le blanc de `amount` (0 à 1), transparence conservée. */
export function lightenPixels(data: Uint8ClampedArray, amount: number): void {
  if (amount <= 0) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] + (255 - data[i + c]) * amount);
  }
}

/** Décale la teinte (°) de tous les pixels de `data` (RGBA), en gardant luminosité, saturation et transparence. */
export function shiftHue(data: Uint8ClampedArray, degrees: number): void {
  const shift = (((degrees % 360) + 360) % 360) / 360;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    let sat = 0;
    if (d > 1e-6) {
      sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    h = (h + shift) % 1;
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const hue = (t: number): number => {
      t = (t + 1) % 1;
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    };
    data[i] = Math.round((sat === 0 ? l : hue(h + 1 / 3)) * 255);
    data[i + 1] = Math.round((sat === 0 ? l : hue(h)) * 255);
    data[i + 2] = Math.round((sat === 0 ? l : hue(h - 1 / 3)) * 255);
  }
}

/**
 * Globe doré du bonus recrue (pièces `recruit_part_globe` + `recruit_part_ring`) dont la teinte est décalée de `hue` degrés (0 = doré), avec
 * éventuellement une icône (image) au centre ; texture `key` de 220 px créée une fois. Renvoie false si une pièce manque. Partagé par les globes
 * d'upgrade (rose, icône de la carte) et les power-ups (vert, icône dessinée à part).
 */
export function ensureGlobeTexture(scene: Phaser.Scene, key: string, hue: number, iconKey?: string, light = 0): boolean {
  if (scene.textures.exists(key)) return true;
  const img = (k: string): HTMLImageElement | null => (scene.textures.exists(k) ? (scene.textures.get(k).getSourceImage() as HTMLImageElement) : null);
  const globe = img('recruit_part_globe');
  const ring = img('recruit_part_ring');
  const icon = iconKey ? img(iconKey) : null;
  if (!globe || !ring || (iconKey && !icon)) return false;
  const r = FX.recruit;
  canvasTexture(scene, key, SIZE, SIZE, (ctx) => {
    const c = SIZE / 2;
    const draw = (source: HTMLImageElement, scale: number, alpha = 1): void => {
      const w = GLOBE * scale;
      const h = (w * source.height) / source.width;
      ctx.globalAlpha = alpha;
      ctx.drawImage(source, c - w / 2, c - h / 2, w, h);
      ctx.globalAlpha = 1;
    };
    draw(globe, r.globeScale, r.globeAlpha);
    draw(ring, r.ringScale, r.ringAlpha);
    // globe et anneau changent de teinte ; l'icône garde ses couleurs
    if (hue % 360 !== 0 || light > 0) {
      const pixels = ctx.getImageData(0, 0, SIZE, SIZE);
      if (hue % 360 !== 0) shiftHue(pixels.data, hue);
      lightenPixels(pixels.data, light);
      ctx.putImageData(pixels, 0, 0);
    }
    if (icon) draw(icon, ICON_SCALE);
  });
  return true;
}

/**
 * Étoile des recrues (`RECRUIT_STAR`) à la teinte `hue` (° de décalage depuis son doré d'origine : 75 = vert, 285 = rose), créée une fois : les étoiles qui
 * scintillent autour des power-ups et des globes d'upgrade sont celles de la recrue, seule la couleur change. Renvoie la clé de texture, ou null si l'étoile manque.
 */
export function ensureStarTexture(scene: Phaser.Scene, hue: number, light = 0): string | null {
  const key = `bonus_star_${hue}_${light}`;
  if (scene.textures.exists(key)) return key;
  if (!scene.textures.exists(RECRUIT_STAR)) return null;
  const src = scene.textures.get(RECRUIT_STAR).getSourceImage() as HTMLImageElement;
  canvasTexture(scene, key, src.width, src.height, (ctx) => {
    ctx.drawImage(src, 0, 0);
    const pixels = ctx.getImageData(0, 0, src.width, src.height);
    shiftHue(pixels.data, hue);
    lightenPixels(pixels.data, light);
    ctx.putImageData(pixels, 0, 0);
  });
  return key;
}

/** Supprime les textures de globes déjà créées (visionneuse : une teinte `FX` a changé, elles sont refaites au prochain besoin). */
export function clearGlobeTextures(scene: Phaser.Scene): void {
  for (const k of scene.textures.getTextureKeys()) if (k.startsWith('upgrade_orb_') || k.startsWith('bonus_star_') || k.startsWith('powerup_globe_')) scene.textures.remove(k);
}

export function ensureUpgradeOrbTexture(scene: Phaser.Scene, id: UpgradeId): string | null {
  const key = upgradeOrbKey(id);
  return ensureGlobeTexture(scene, key, FX.upgradeOrb.hue, upgradeIconKey(id), FX.upgradeOrb.light) ? key : null;
}
