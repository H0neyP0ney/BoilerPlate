import type Phaser from 'phaser';
import type { TextureFactory } from '@xiao/engine';
import { UPGRADES, UPGRADE_IDS, type UpgradeId } from '../data/progression';
import { CARD_BASE, holoCard, recolorCard, recolorSlot } from './cardPixels';

/**
 * Fonds des cartes d'upgrade et slots vides fabriqués à partir de deux images rouges (`ui_card_base`, `ui_slot_empty`) : par upgrade, une
 * texture `ui_card_<id>` et `ui_slot_empty_<id>` à la couleur `UPGRADES[id].color`, et `ui_card_prism` (hologramme, pour les niveaux
 * prismatiques). Les formules sont dans `cardPixels.ts` ; les images de base sont produites par `node tools/slice-upgrade-cards.mjs` et
 * `node tools/slice-upgrade-slots.mjs`.
 *
 * Depuis le 15/10 ces textures sont déclarées à l'atelier de textures (`declareUpgradeCardTextures`, `art/textureWorkshop.ts`) : fabriquées en tâche de fond une
 * fois le jeu affiché, selon le paquet choisi dans la vue Paquets. Une carte pas encore fabriquée s'affiche avec `ui_card_base` (et un slot avec `ui_slot_empty`), puis prend
 * son fond à sa fabrication (`view/upgradeCards.ts`). Les pixels des
 * deux images de base ne sont lus qu'à la première fabrication. La visionneuse d'upgrades (dev) refait celles d'une upgrade quand on change sa couleur
 * (`repaintUpgradeTextures`).
 */
const SLOT_SIZE = { w: 54, h: 53 };

interface Base {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}
interface Item {
  key: string;
  base: 'card' | 'slot';
  paint: (data: Uint8ClampedArray, w: number) => void;
}
interface Job {
  scene: Phaser.Scene;
  bases: Record<'card' | 'slot', Base>;
}
let job: Job | null = null;
let workshop: TextureFactory | null = null;
let sceneRef: Phaser.Scene | null = null;

const cardItem = (id: UpgradeId): Item => ({ key: `ui_card_${id}`, base: 'card', paint: (d, w) => recolorCard(d, w, UPGRADES[id].color) });
const slotItem = (id: UpgradeId): Item => ({ key: `ui_slot_empty_${id}`, base: 'slot', paint: (d) => recolorSlot(d, UPGRADES[id].color) });
const ALL: Item[] = [...UPGRADE_IDS.flatMap((id) => [cardItem(id), slotItem(id)]), { key: 'ui_card_prism', base: 'card', paint: holoCard }];

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

/** Les deux images de base, lues à la première fabrication (ou relues par `rebuildUpgradeCardTextures`). Null si l'une n'est pas là. */
function getJob(scene: Phaser.Scene): Job | null {
  if (job) return job;
  const card = readBase(scene, 'ui_card_base');
  const slot = readBase(scene, 'ui_slot_empty');
  if (!card || !slot) return null;
  job = { scene, bases: { card, slot } };
  return job;
}

/** Peint une texture `item` depuis sa base et la (re)crée dans le gestionnaire de textures. */
function paintItem(j: Job, item: Item, inPlace = false): void {
  const b = j.bases[item.base];
  const img = new ImageData(new Uint8ClampedArray(b.data), b.w, b.h);
  item.paint(img.data, b.w);
  if (inPlace && j.scene.textures.exists(item.key)) {
    // même texture, même canvas : les cartes déjà affichées changent sans être recréées
    const tex = j.scene.textures.get(item.key) as Phaser.Textures.CanvasTexture;
    tex.getContext().putImageData(img, 0, 0);
    tex.refresh();
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = b.w;
  canvas.height = b.h;
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  if (j.scene.textures.exists(item.key)) j.scene.textures.remove(item.key);
  j.scene.textures.addCanvas(item.key, canvas);
}

/** Déclare à l'atelier de textures tous les fonds de cartes et slots vides (rien n'est dessiné ici). */
export function declareUpgradeCardTextures(f: TextureFactory, scene: Phaser.Scene, priority: (key: string) => number): void {
  workshop = f;
  sceneRef = scene;
  for (const item of ALL) {
    const w = item.base === 'card' ? CARD_BASE.W : SLOT_SIZE.w;
    const h = item.base === 'card' ? CARD_BASE.H : SLOT_SIZE.h;
    f.declareLazy(
      item.key,
      w,
      h,
      () => {
        const j = getJob(scene);
        if (j) paintItem(j, item);
      },
      priority(item.key),
    );
  }
}

/** Cette texture de fond de carte ou de slot est-elle déclarée mais pas encore fabriquée ? (sans la fabriquer : ne passe pas par `textures.exists`) */
export const cardTexturePending = (key: string): boolean => !!workshop?.isPending(key);

/** Fabrique tout de suite ce qui manque encore (à appeler avant d'afficher une carte). Sans effet quand tout est prêt. */
export function finishUpgradeCardTextures(): void {
  if (!workshop) return;
  for (const item of ALL) workshop.ensure(item.key);
}

/**
 * Une des deux images de base (`ui_card_base`, `ui_slot_empty`) vient d'arriver à la place de son repli dessiné : on relit les bases et on refait sur
 * place tous les fonds et slots déjà fabriqués (ceux qui ne le sont pas encore partiront des vraies images).
 */
export function rebuildUpgradeCardTextures(scene: Phaser.Scene): void {
  job = null;
  const j = getJob(scene);
  if (!j) return;
  for (const item of ALL) if (!workshop?.isPending(item.key) && scene.textures.exists(item.key)) paintItem(j, item, true);
}

/** Dev : refait le fond et le slot d'une upgrade avec sa couleur courante (`UPGRADES[id].color`). */
export function repaintUpgradeTextures(id: UpgradeId): void {
  finishUpgradeCardTextures();
  const j = sceneRef ? getJob(sceneRef) : null;
  if (!j) return;
  paintItem(j, cardItem(id));
  paintItem(j, slotItem(id));
}
