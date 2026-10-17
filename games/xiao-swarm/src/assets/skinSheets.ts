import { devLog, sprites } from '@xiao/engine';
import { textureScene } from '../art/playerHue';
import type { SkinId } from '../data/skins';

/**
 * Planches de sprites des skins, **chargées à la demande** (jamais au démarrage : 12 planches en mémoire pèseraient lourd). Une planche n'est téléchargée que
 * quand un skin doit être affiché à l'écran : l'aperçu d'un skin dans la boutique, ou la squad d'un joueur (le sien, ou celui d'un autre en ligne). Quand plus
 * personne ne l'affiche, `retainSkinSheets` la décharge.
 *
 * Format d'une planche : celui de `soldiers/gunner.png` (cases de 67 × 52, pieds alignés, idle 0-15 puis walk 16-31, personnage tourné vers la droite) ; mêmes
 * réglages d'ancrage / animations que `soldier_trooper`. Seul le Trooper (la classe jouable) est concerné. Déposer le fichier dans `public/assets/skins/<id>.png`
 * puis l'ajouter à `SKIN_SHEETS` : tant que le skin n'y figure pas, ou que sa planche n'est pas arrivée, le soldat est la copie recolorée de la planche de base
 * (`art/playerVariants.ts`), donc rien n'est jamais invisible.
 */
export const SKIN_SHEETS: Partial<Record<SkinId, string>> = {
  // cyan: 'skins/cyan.png',
};

const FRAME = { frameWidth: 67, frameHeight: 52 };
const textureKey = (id: SkinId): string => `skin_sheet_${id}`;
const spriteKey = (id: SkinId): string => `soldier_trooper#k${id}`;

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
  const url = SKIN_SHEETS[id];
  const scene = textureScene();
  if (!url || !scene || state.has(id)) return;
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
    sprites.define(spriteKey(id), { ...base, texture: key, anims: base.anims ? anims : undefined });
    animKeys.set(id, made);
    state.set(id, 'ready');
    devLog(`skin ${id} : planche chargée à la demande`, 'warn');
    for (const fn of listeners) fn();
  });
  scene.load.once(`loaderror`, () => undefined);
  scene.load.spritesheet(key, `assets/${url}`, FRAME);
  scene.load.start();
}

/** Décharge les planches de skins dont l'id n'est pas dans `keep` (plus affichées nulle part) : la mémoire est rendue. */
export function retainSkinSheets(keep: ReadonlySet<string>): void {
  const scene = textureScene();
  if (!scene) return;
  for (const [id, s] of [...state]) {
    if (keep.has(id) || s !== 'ready') continue;
    state.delete(id);
    const key = textureKey(id);
    for (const a of animKeys.get(id) ?? []) scene.anims.remove(a);
    animKeys.delete(id);
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }
}
