import type Phaser from 'phaser';
import { devLog, sprites, type SpriteDef } from '@xiao/engine';
import { applySavedPlacement } from '../debugSprites';
import { textureScene } from '../art/playerHue';
import type { SkinId } from '../data/skins';

/**
 * Planches de sprites des skins, **chargées à la demande** (jamais au démarrage : 12 planches en mémoire pèseraient lourd). Une planche n'est téléchargée que
 * quand un skin doit être affiché à l'écran : l'aperçu d'un skin dans la boutique, ou la squad d'un joueur (le sien, ou celui d'un autre en ligne). Quand plus
 * personne ne l'affiche, `retainSkinSheets` la décharge.
 *
 * Format d'une planche : celui de `soldiers/gunner.png` (grille de 4 colonnes, pieds alignés, idle 0-15 puis walk 16-31, personnage tourné vers la droite ; taille de case, ancrage,
 * échelle et bouche du canon donnés par `SkinSheet`) ; mêmes animations que `soldier_trooper`. Seul le Trooper (la classe jouable) est concerné. Déposer le fichier dans `public/assets/skins/<id>.png`
 * puis l'ajouter à `SKIN_SHEETS` : tant que le skin n'y figure pas, ou que sa planche n'est pas arrivée, le soldat est la copie recolorée de la planche de base
 * (`art/playerVariants.ts`), donc rien n'est jamais invisible.
 */
export interface SkinSheet {
  /** Fichier sous `public/assets/`. */
  url: string;
  /** Taille d'une case de la planche. */
  frameWidth: number;
  frameHeight: number;
  /**
   * Placement du sprite : MÊMES champs que les entrées du manifeste d'assets (`originX` / `originY` = pieds dans la case, `scale`, `shadow`, `offsetY`, `anchors` par séquence et direction,
   * `muzzle` = bouche du canon, `muzzles` par frame…). Réglable dans la **visionneuse d'unités** (le skin y apparaît à côté des soldats, avec les mêmes outils) ; son bouton Save réécrit
   * ce bloc `sprite` dans ce fichier (dev-save.ts, `saveSkinSprite`). Le `.json` écrit par `tools/pack-grids.mjs` donne l'ancrage de départ.
   */
  sprite: Partial<SpriteDef>;
}

export const SKIN_SHEETS: Partial<Record<SkinId, SkinSheet>> = {
  // ninja : `art-src/skins/ninja_{idle,walk}.png` assemblés par `node tools/pack-grids.mjs games/xiao-swarm/art-src/skins/ninja.pack.json` (cases de 135 × 129 : double de résolution, `scale` 0,268 ; les ancrages et la bouche du canon sont des ratios, inchangés)
  ninja: {
    url: 'skins/ninja.png',
    frameWidth: 135,
    frameHeight: 129,
    sprite: {
      originX: 0.41,
      originY: 0.913,
      scale: 0.55, // 1,1 (réglé dans la visionneuse) × 0,5 : planche assemblée au double de résolution, même taille à l'écran
      muzzleFlash: true,
      muzzle: [0.9, 0.42],
      anchors: { 'walk:left': [0.6113, 0.8912], 'walk:right': [0.4311, 0.8912], 'idle:left': [0.6113, 0.9021], 'idle:right': [0.4311, 0.9021] },
    },
  },
};
const textureKey = (id: SkinId): string => `skin_sheet_${id}`;
/** Id de visuel d'un skin (`soldier_trooper#k<skin>` : le Trooper à la planche du skin) ; aussi l'id de la visionneuse d'unités. */
export const skinSpriteKey = (id: SkinId): string => `soldier_trooper#k${id}`;
const spriteKey = skinSpriteKey;

/** Scène qui télécharge les planches (la scène de jeu, toujours active : le chargeur d'une scène arrêtée, comme `BootScene`, ne démarre jamais). */
let loader: Phaser.Scene | null = null;
export function setSkinLoader(scene: Phaser.Scene): void {
  loader = scene;
}

const state = new Map<SkinId, 'loading' | 'ready'>();
const listeners = new Set<() => void>();
/** Animations créées pour chaque planche (retirées au déchargement). */
const animKeys = new Map<SkinId, string[]>();

/** Appelé à chaque planche qui vient d'arriver (les vues recréent alors leurs soldats avec le vrai visuel). */
export function onSkinSheetReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Id de visuel de la planche du skin pour une classe, si elle est chargée (sinon undefined : le repli recoloré sert). */
export function skinSpriteId(cls: string, id: SkinId): string | undefined {
  return cls === 'trooper' && state.get(id) === 'ready' ? spriteKey(id) : undefined;
}

/** Demande la planche d'un skin (sans effet si elle n'existe pas, est déjà là ou en route). */
export function requestSkinSheet(id: SkinId): void {
  const sheet = SKIN_SHEETS[id];
  const scene = loader ?? textureScene();
  if (!sheet || !scene || state.has(id)) return;
  state.set(id, 'loading');
  const key = textureKey(id);
  scene.load.once(`filecomplete-spritesheet-${key}`, () => {
    const base = sprites.get('soldier_trooper');
    const anims: Record<string, string> = {};
    const made: string[] = [];
    for (const [name, animKey] of Object.entries(base.anims ?? {})) {
      const a = scene.anims.get(animKey);
      const newAnim = `${animKey}#k${id}`;
      if (a && !scene.anims.exists(newAnim)) made.push(newAnim);
      if (a && !scene.anims.exists(newAnim)) scene.anims.create({ key: newAnim, frames: a.frames.map((f) => ({ key, frame: f.textureFrame })), frameRate: a.frameRate, repeat: a.repeat });
      anims[name] = newAnim;
    }
    // réglages propres à la planche (bloc `sprite` de `SKIN_SHEETS`) : les ancrages par séquence et les bouches par frame du Trooper ne valent pas pour une autre planche
    const { anchors: _a, muzzles: _m, ...rest } = base;
    sprites.define(spriteKey(id), { ...rest, ...sheet.sprite, texture: key, anims: base.anims ? anims : undefined });
    applySavedPlacement(spriteKey(id)); // dev : réglages de la visionneuse mémorisés dans le navigateur, repris à chaque chargement de la planche
    animKeys.set(id, made);
    state.set(id, 'ready');
    devLog(`skin ${id} : planche chargée à la demande`, 'warn');
    for (const fn of listeners) fn();
  });
  scene.load.once(`loaderror`, () => undefined);
  scene.load.spritesheet(key, `assets/${sheet.url}`, { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
  scene.load.start();
}

/**
 * Planches épinglées : affichées par un écran ouvert (aperçus de la boutique, visionneuse d'unités) ; `retainSkinSheets` ne les décharge pas (sinon, au prochain passage de
 * `WorldView.releaseSkinSheets`, une texture encore dessinée disparaîtrait : plantage).
 */
const pins = new Set<string>();
export function pinSkinSheets(ids: Iterable<string>): void {
  pins.clear();
  for (const id of ids) pins.add(id);
}

/** Décharge les planches de skins dont l'id n'est pas dans `keep` (plus affichées nulle part) ni épinglées : la mémoire est rendue. */
export function retainSkinSheets(keep: ReadonlySet<string>): void {
  const scene = textureScene();
  if (!scene) return;
  for (const [id, s] of [...state]) {
    if (keep.has(id) || pins.has(id) || s !== 'ready') continue;
    state.delete(id);
    const key = textureKey(id);
    for (const a of animKeys.get(id) ?? []) scene.anims.remove(a);
    animKeys.delete(id);
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }
}
