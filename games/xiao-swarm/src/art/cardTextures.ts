import type Phaser from 'phaser';
import { log } from '@xiao/engine';
import { UPGRADES, UPGRADE_IDS } from '../data/progression';
import { holoCard, recolorCard } from './cardPixels';

/**
 * Fonds des cartes d'upgrade fabriqués à partir d'une seule image (`ui_card_base`, `ui/cards/card_base.png`, carte rouge) : une texture
 * `ui_card_<id>` par upgrade, à la couleur `UPGRADES[id].color`, et `ui_card_prism` (hologramme, pour les niveaux prismatiques).
 * Les formules sont dans `cardPixels.ts` ; l'image de base est produite par `node tools/slice-upgrade-cards.mjs`.
 *
 * Chaque fond coûte quelques ms : on ne bloque pas le chargement, on les fabrique un par un juste après le lancement
 * (`startUpgradeCardTextures`) ; l'écran de choix d'upgrade rattrape ce qui manque encore (`finishUpgradeCardTextures`).
 */
const SPACING_MS = 50;

interface Job {
  scene: Phaser.Scene;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  base: ImageData;
  queue: { key: string; paint: (data: Uint8ClampedArray, w: number) => void }[];
  timer: number;
  t0: number;
  busy: number; // ms passées à peindre
}
let job: Job | null = null;

function step(j: Job): void {
  const next = j.queue.shift();
  if (!next) return;
  const t = performance.now();
  const { width: w, height: h } = j.canvas;
  if (!j.scene.textures.exists(next.key)) {
    const img = new ImageData(new Uint8ClampedArray(j.base.data), w, h);
    next.paint(img.data, w);
    j.ctx.putImageData(img, 0, 0);
    const copy = document.createElement('canvas');
    copy.width = w;
    copy.height = h;
    copy.getContext('2d')!.drawImage(j.canvas, 0, 0);
    j.scene.textures.addCanvas(next.key, copy);
  }
  j.busy += performance.now() - t;
  if (j.queue.length === 0) log.info(`[cartes] fonds d'upgrade fabriqués (${Math.round(j.busy)} ms de calcul)`);
}

/** Prépare la fabrication des fonds (rien n'est dessiné tout de suite) et la lance en tâche de fond, un fond toutes les `SPACING_MS` ms. */
export function startUpgradeCardTextures(scene: Phaser.Scene): void {
  if (job || !scene.textures.exists('ui_card_base')) return;
  const src = scene.textures.get('ui_card_base').getSourceImage() as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(src, 0, 0);
  const j: Job = {
    scene,
    canvas,
    ctx,
    base: ctx.getImageData(0, 0, canvas.width, canvas.height),
    queue: [
      ...UPGRADE_IDS.map((id) => ({ key: `ui_card_${id}`, paint: (d: Uint8ClampedArray, w: number) => recolorCard(d, w, UPGRADES[id].color) })),
      { key: 'ui_card_prism', paint: holoCard },
    ],
    timer: 0,
    t0: performance.now(),
    busy: 0,
  };
  job = j;
  const tick = (): void => {
    step(j);
    if (j.queue.length > 0) j.timer = window.setTimeout(tick, SPACING_MS);
  };
  j.timer = window.setTimeout(tick, SPACING_MS);
}

/** Fabrique tout de suite les fonds qui manquent (à appeler avant d'afficher une carte). Sans effet quand tout est prêt. */
export function finishUpgradeCardTextures(): void {
  if (!job) return;
  window.clearTimeout(job.timer);
  while (job.queue.length > 0) step(job);
}
