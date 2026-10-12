import type Phaser from 'phaser';
import { devLog, recolorPixels } from '@xiao/engine';

/**
 * Couleur de chaque joueur, **à la demande** : les visuels recolorés (soldats de `playerVariants.ts`, têtes de recrue de `recruits.ts`) d'un
 * emplacement de joueur autre que le 0 ne sont fabriqués qu'à la première fois qu'on en a besoin (`ensurePlayerSlot`, appelé par
 * `soldierSpriteId` / `recruitSpriteId`) : une partie solo n'en fabrique aucun. Chaque fabrique s'enregistre ici (`registerSlotMaker`).
 */

/** Plage des bleus du soldat recolorée pour chaque joueur (185°-250°, fondu de 15° de chaque côté). */
export const BLUES = { hueMin: 185, hueMax: 250, feather: 15 };

/** Décale de `shift` degrés la teinte des pixels bleus (soldat, tête de recrue). */
export function shiftBlues(data: Uint8ClampedArray, shift: number): void {
  recolorPixels(data, { ...BLUES, shift });
}

type SlotMaker = (scene: Phaser.Scene, slot: number) => void;
const makers: SlotMaker[] = [];
const made = new Set<number>();
let scene: Phaser.Scene | null = null;

/** Déclare une fabrique de visuels pour un emplacement de joueur (appelée une fois par emplacement, à la première demande). */
export function registerSlotMaker(fn: SlotMaker): void {
  makers.push(fn);
}

/** Scène qui sert à créer les textures (les textures et animations sont globales au jeu : n'importe quelle scène vivante convient). */
export function initPlayerHue(s: Phaser.Scene): void {
  scene = s;
}

/** Fabrique, si ce n'est pas déjà fait, les visuels recolorés de cet emplacement de joueur (sans effet pour le 0 : visuels d'origine). */
export function ensurePlayerSlot(slot: number): void {
  if (slot <= 0 || made.has(slot) || !scene) return;
  made.add(slot);
  const t0 = performance.now();
  for (const make of makers) make(scene, slot);
  devLog(`couleur du joueur ${slot} : soldats + recrues recolorés en ${Math.round(performance.now() - t0)} ms`, 'warn');
}

/** Emplacements déjà fabriqués (la visionneuse de particules redessine leurs recrues). */
export function madePlayerSlots(): ReadonlySet<number> {
  return made;
}
