import Phaser from 'phaser';
import { Rng, sprites } from '@xiao/engine';
import { DEPTH } from '../config';
import type { MapDef } from '../data/maps';
import { buildGround, drawGroundChunk, type GroundFeature } from '../art/ground';

/**
 * 2048 px : au plus 2×2 morceaux visibles à l'écran. Important : au-delà de ~5
 * grandes textures distinctes dans un même lot WebGL, Phaser 4 (Chromium) en
 * affiche certaines en noir. On garde donc peu de morceaux et on masque ceux hors caméra.
 */
const CHUNK = 2048;
/** Marge autour de la caméra où les morceaux de sol sont préparés à l'avance. */
const PRELOAD = 512;
/** Au-delà de cette marge, les morceaux sont libérés (mémoire GPU sur mobile). */
const UNLOAD = 1024;

/** Texture de sol qui se raccorde (assets/manifest.ts) et son échelle d'affichage (1024 px → ~750 px à l'écran). */
const GROUND_TEXTURE = 'ground_tile';
const GROUND_SCALE = 0.73;

/**
 * Affichage de la carte : sol en texture répétée sur la zone jouable (un seul TileSprite, quelle que soit
 * la taille), entouré d'eau animée (la bordure infranchissable) ; à défaut de texture fournie, repli sur le sol
 * procédural découpé en morceaux de 2048 px créés/détruits autour de la caméra. Décor haut (obstacles
 * éventuels) en sprites triés en profondeur.
 */
export class ArenaView {
  private readonly features: GroundFeature[];
  private readonly chunks = new Map<string, Phaser.GameObjects.Image>();
  private readonly tiled: boolean;
  private first = true;
  private water?: Phaser.GameObjects.TileSprite;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapDef,
  ) {
    this.tiled = scene.textures.exists(GROUND_TEXTURE);
    if (this.tiled) {
      // Eau partout, sol seulement dans la zone jouable (bords = `Arena.bounds`), avec une frange d'écume.
      const b = { x: map.border, y: map.border, w: map.width - 2 * map.border, h: map.height - 2 * map.border };
      this.water = scene.add.tileSprite(0, 0, map.width, map.height, 'water').setOrigin(0).setDepth(DEPTH.ground - 1);
      scene.add.tileSprite(b.x, b.y, b.w, b.h, GROUND_TEXTURE).setOrigin(0).setTileScale(GROUND_SCALE).setDepth(DEPTH.ground);
      scene.add
        .graphics()
        .setDepth(DEPTH.ground + 0.5)
        .lineStyle(16, 0xd8f3ff, 0.22)
        .strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8)
        .lineStyle(5, 0xffffff, 0.75)
        .strokeRect(b.x, b.y, b.w, b.h);
    }
    this.features = this.tiled ? [] : buildGround(map);
    this.addDecor();
  }

  /** À appeler chaque frame avec la zone visible de la caméra. */
  update(view: Phaser.Geom.Rectangle): void {
    if (this.water) {
      // l'eau glisse doucement
      const t = this.scene.time.now;
      this.water.setTilePosition(t * 0.012, t * 0.006);
    }
    if (this.tiled) return;
    const x0 = Math.max(0, Math.floor((view.x - PRELOAD) / CHUNK));
    const y0 = Math.max(0, Math.floor((view.y - PRELOAD) / CHUNK));
    const x1 = Math.min(Math.ceil(this.map.width / CHUNK) - 1, Math.floor((view.right + PRELOAD) / CHUNK));
    const y1 = Math.min(Math.ceil(this.map.height / CHUNK) - 1, Math.floor((view.bottom + PRELOAD) / CHUNK));

    // Au premier appel on crée tout le visible ; ensuite 1 morceau par frame max (évite les saccades).
    let budget = this.first ? Infinity : 1;
    this.first = false;
    for (let cy = y0; cy <= y1 && budget > 0; cy++) {
      for (let cx = x0; cx <= x1 && budget > 0; cx++) {
        const key = `${cx},${cy}`;
        if (this.chunks.has(key)) continue;
        this.chunks.set(key, this.createChunk(cx, cy));
        budget--;
      }
    }

    for (const [key, img] of this.chunks) {
      const r = img.getBounds();
      // Seuls les morceaux réellement à l'écran sont dessinés (voir CHUNK).
      img.setVisible(r.right > view.x && r.x < view.right && r.bottom > view.y && r.y < view.bottom);
      const far =
        r.right < view.x - UNLOAD || r.x > view.right + UNLOAD || r.bottom < view.y - UNLOAD || r.y > view.bottom + UNLOAD;
      if (!far) continue;
      const tex = img.texture.key;
      img.destroy();
      this.scene.textures.remove(tex);
      this.chunks.delete(key);
    }
  }

  private createChunk(cx: number, cy: number): Phaser.GameObjects.Image {
    const key = `ground:${this.map.id}:${cx},${cy}`;
    if (!this.scene.textures.exists(key)) {
      const tex = this.scene.textures.createCanvas(key, CHUNK, CHUNK)!;
      drawGroundChunk(tex.getContext(), this.features, cx * CHUNK, cy * CHUNK, CHUNK);
      tex.refresh(); // upload GPU
    }
    return this.scene.add.image(cx * CHUNK, cy * CHUNK, key).setOrigin(0).setDepth(DEPTH.ground);
  }

  private addDecor(): void {
    const { width: W, height: H, border: B } = this.map;
    const rng = new Rng(this.map.seed + 1);
    for (const r of this.map.rocks) {
      this.decor(r.x, r.y, r.size === 'big' ? 'rock_big' : 'rock_small');
    }
    for (const l of this.map.logs) this.decor(l.x, l.y, 'log', 0.95);

    // Bordure : plus de jungle, c'est de l'eau (voir le constructeur). Le sol procédural de repli, lui, garde ses bords.
    if (!this.tiled) {
      const edge = (x: number, y: number) => {
        const r = rng.next();
        const key = r < 0.35 ? 'palm' : r < 0.7 ? 'bush' : 'bush_flowers';
        this.decor(x + rng.range(-25, 25), y + rng.range(-25, 25), key, rng.range(0.85, 1.25), rng.chance(0.5));
      };
      for (let x = 0; x <= W; x += 95) {
        edge(x, B * 0.35);
        edge(x, B * 0.8);
        edge(x, H - B * 0.25);
        edge(x, H - B * 0.7 + 40);
      }
      for (let y = B; y <= H - B; y += 95) {
        edge(B * 0.3, y);
        edge(B * 0.75, y);
        edge(W - B * 0.3, y);
        edge(W - B * 0.75, y);
      }
    }
  }

  /** Élément de décor via le catalogue (planche fournie ou dessin procédural). */
  private decor(x: number, y: number, id: string, scale = 1, flip = false): void {
    const s = sprites.add(this.scene, id, x, y);
    s.setScale(s.scaleX * scale).setFlipX(flip).setDepth(DEPTH.actors + y);
    sprites.play(s, id, 'idle');
  }

  destroy(): void {
    for (const img of this.chunks.values()) {
      const tex = img.texture.key;
      img.destroy();
      this.scene.textures.remove(tex);
    }
    this.chunks.clear();
  }
}
