import type Phaser from 'phaser';
import { log } from '@xiao/engine';
import { UPGRADES, UPGRADE_IDS, type UpgradeId } from '../data/progression';
import { holoCard, holoSlot, recolorCard, recolorSlot } from './cardPixels';

/**
 * Fonds des cartes d'upgrade et slots vides fabriqués à partir de deux images rouges (`ui_card_base`, `ui_slot_empty`) : par upgrade, une
 * texture `ui_card_<id>` et `ui_slot_empty_<id>` à la couleur `UPGRADES[id].color`, et `ui_card_prism` (hologramme, pour les niveaux
 * prismatiques). Les formules sont dans `cardPixels.ts` ; les images de base sont produites par `node tools/slice-upgrade-cards.mjs` et
 * `node tools/slice-upgrade-slots.mjs`.
 *
 * Chaque texture coûte quelques ms : on ne bloque pas le chargement, on les fabrique une par une juste après le lancement
 * (`startUpgradeCardTextures`) ; l'écran de choix d'upgrade rattrape ce qui manque encore (`finishUpgradeCardTextures`). La visionneuse
 * d'upgrades (dev) refait celles d'une upgrade quand on change sa couleur (`repaintUpgradeTextures`).
 */
const SPACING_MS = 50;

interface Base {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}
interface Item {
  key: string;
  base: 'card' | 'slot' | 'slotFull';
  paint: (data: Uint8ClampedArray, w: number) => void;
}
interface Job {
  scene: Phaser.Scene;
  bases: Record<'card' | 'slot' | 'slotFull', Base>;
  queue: Item[];
  timer: number;
  busy: number; // ms passées à peindre
}
let job: Job | null = null;

/** Pixels d'une texture déjà chargée. */
function readBase(scene: Phaser.Scene, key: string): Base | null {
  if (!scene.textures.exists(key)) return null;
  const src = scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0);
  return { w: canvas.width, h: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}

/** Peint une texture `item` depuis sa base et la (re)crée dans le gestionnaire de textures. */
function paintItem(j: Job, item: Item): void {
  const t = performance.now();
  const b = j.bases[item.base];
  const img = new ImageData(new Uint8ClampedArray(b.data), b.w, b.h);
  item.paint(img.data, b.w);
  const canvas = document.createElement('canvas');
  canvas.width = b.w;
  canvas.height = b.h;
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  if (j.scene.textures.exists(item.key)) j.scene.textures.remove(item.key);
  j.scene.textures.addCanvas(item.key, canvas);
  j.busy += performance.now() - t;
}

function step(j: Job): void {
  const next = j.queue.shift();
  if (!next) return;
  if (!j.scene.textures.exists(next.key)) paintItem(j, next);
  if (j.queue.length === 0) log.info(`[cartes] fonds et slots d'upgrade fabriqués (${Math.round(j.busy)} ms de calcul)`);
}

const cardItem = (id: UpgradeId): Item => ({ key: `ui_card_${id}`, base: 'card', paint: (d, w) => recolorCard(d, w, UPGRADES[id].color) });
const slotItem = (id: UpgradeId): Item => ({ key: `ui_slot_empty_${id}`, base: 'slot', paint: (d) => recolorSlot(d, UPGRADES[id].color) });

/** Prépare la fabrication des textures (rien n'est dessiné tout de suite) et la lance en tâche de fond, une toutes les `SPACING_MS` ms. */
export function startUpgradeCardTextures(scene: Phaser.Scene): void {
  if (job) return;
  const card = readBase(scene, 'ui_card_base');
  const slot = readBase(scene, 'ui_slot_empty');
  const slotFull = readBase(scene, 'ui_slot_full');
  if (!card || !slot || !slotFull) return;
  const j: Job = {
    scene,
    bases: { card, slot, slotFull },
    queue: [...UPGRADE_IDS.flatMap((id) => [cardItem(id), slotItem(id)]), { key: 'ui_card_prism', base: 'card', paint: holoCard }, { key: 'ui_slot_prism', base: 'slotFull', paint: holoSlot }],
    timer: 0,
    busy: 0,
  };
  job = j;
  const tick = (): void => {
    step(j);
    if (j.queue.length > 0) j.timer = window.setTimeout(tick, SPACING_MS);
  };
  j.timer = window.setTimeout(tick, SPACING_MS);
}

/** Fabrique tout de suite les textures qui manquent (à appeler avant d'afficher une carte). Sans effet quand tout est prêt. */
export function finishUpgradeCardTextures(): void {
  if (!job) return;
  window.clearTimeout(job.timer);
  while (job.queue.length > 0) step(job);
}

/** Dev : refait le fond et le slot d'une upgrade avec sa couleur courante (`UPGRADES[id].color`). */
export function repaintUpgradeTextures(id: UpgradeId): void {
  finishUpgradeCardTextures();
  if (!job) return;
  paintItem(job, cardItem(id));
  paintItem(job, slotItem(id));
}
