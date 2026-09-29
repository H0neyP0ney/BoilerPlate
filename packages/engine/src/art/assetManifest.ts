import type Phaser from 'phaser';
import { sprites, type SpriteDef } from './SpriteCatalog';

/**
 * Manifeste d'assets : décrit les planches de sprites fournies par les artistes.
 * Tous les fichiers sont dans /public/assets (aucune requête externe, règle Poki).
 *
 * Formats supportés :
 *  - 'image'    : un PNG = un visuel (clé de texture = id, remplace aussi les textures d'effets).
 *  - 'sheet'    : planche en grille (cases de taille fixe), frames numérotées 0,1,2… ligne par ligne.
 *  - 'atlas'    : PNG + JSON (TexturePacker, Free Texture Packer, Aseprite "hash"/"array"), frames nommées.
 *  - 'aseprite' : export Aseprite (PNG + JSON avec tags) : les tags deviennent les animations.
 */
export interface AnimSpec {
  /** Indices (sheet) ou noms de frames (atlas). */
  frames: (number | string)[];
  fps?: number;
  /** -1 = boucle (défaut), 0 = une fois. */
  repeat?: number;
}

type Placement = Pick<SpriteDef, 'originX' | 'originY' | 'scale' | 'facesLeft' | 'crop' | 'hidden'>;

export interface SheetSprite extends Placement {
  /** Frame affichée par défaut (sinon première frame de 'idle'). */
  frame?: number | string;
  anims?: Record<string, AnimSpec>;
}

export interface AsepriteSprite extends Placement {
  frame?: number | string;
  /** Nom logique ('idle', 'walk'…) → nom du tag dans Aseprite. */
  tags?: Record<string, string>;
}

export type AssetEntry =
  | ({ type: 'image'; id: string; url: string } & Placement)
  | { type: 'sheet'; url: string; frameWidth: number; frameHeight: number; margin?: number; spacing?: number; sprites: Record<string, SheetSprite> }
  | { type: 'atlas'; url: string; json: string; sprites: Record<string, SheetSprite> }
  | { type: 'aseprite'; url: string; json: string; sprites: Record<string, AsepriteSprite> };

/** `range(0, 3)` → [0, 1, 2, 3] ; pratique pour les frames de planche. */
export function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

const textureKey = (e: Exclude<AssetEntry, { type: 'image' }>) => `asset:${e.url}`;

/** À appeler dans `preload()` : met les fichiers en file de chargement. */
export function loadAssets(scene: Phaser.Scene, entries: readonly AssetEntry[], basePath = 'assets/'): void {
  scene.load.setPath(basePath);
  for (const e of entries) {
    switch (e.type) {
      case 'image':
        scene.load.image(e.id, e.url);
        break;
      case 'sheet':
        scene.load.spritesheet(textureKey(e), e.url, {
          frameWidth: e.frameWidth,
          frameHeight: e.frameHeight,
          margin: e.margin,
          spacing: e.spacing,
        });
        break;
      case 'atlas':
        scene.load.atlas(textureKey(e), e.url, e.json);
        break;
      case 'aseprite':
        scene.load.aseprite(textureKey(e), e.url, e.json);
        break;
    }
  }
  scene.load.setPath('');
}

/**
 * À appeler dans `create()` après le chargement : crée les animations et
 * déclare les visuels dans le catalogue. Un fichier manquant est ignoré
 * (le visuel procédural par défaut reste utilisé).
 */
export function applyAssets(scene: Phaser.Scene, entries: readonly AssetEntry[]): string[] {
  const applied: string[] = [];
  for (const e of entries) {
    if (e.type === 'image') {
      if (!scene.textures.exists(e.id)) continue;
      const { type: _t, id, url: _u, ...placement } = e;
      sprites.define(id, { texture: id, ...placement });
      applied.push(id);
      continue;
    }
    const key = textureKey(e);
    if (!scene.textures.exists(key)) continue;

    if (e.type === 'aseprite') {
      scene.anims.createFromAseprite(key);
      for (const [id, s] of Object.entries(e.sprites)) {
        const anims: Record<string, string> = {};
        for (const [name, tag] of Object.entries(s.tags ?? {})) anims[name] = tag;
        const { tags: _tags, frame, ...placement } = s;
        const idle = anims.idle ? scene.anims.get(anims.idle) : undefined;
        sprites.define(id, { texture: key, frame: frame ?? idle?.frames[0]?.frame.name, anims, ...placement });
        applied.push(id);
      }
      continue;
    }

    for (const [id, s] of Object.entries(e.sprites)) {
      const anims: Record<string, string> = {};
      for (const [name, spec] of Object.entries(s.anims ?? {})) {
        const animKey = `${id}:${name}`;
        if (!scene.anims.exists(animKey)) {
          scene.anims.create({
            key: animKey,
            frames: spec.frames.map((f) => ({ key, frame: f })),
            frameRate: spec.fps ?? 10,
            repeat: spec.repeat ?? -1,
          });
        }
        anims[name] = animKey;
      }
      const { anims: _a, frame, ...placement } = s;
      sprites.define(id, { texture: key, frame: frame ?? s.anims?.idle?.frames[0] ?? 0, anims, ...placement });
      applied.push(id);
    }
  }
  return applied;
}
