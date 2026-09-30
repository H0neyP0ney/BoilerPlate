import Phaser from 'phaser';
import { Rng, sprites } from '@xiao/engine';
import { DEPTH, VISUAL } from '../config';
import type { MapDef, PlacedObstacle } from '../data/maps';
import { OBSTACLES } from '../data/obstacles';
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

/** Texture de sol qui se raccorde (assets/manifest.ts) ; son échelle d'affichage est `VISUAL.groundScale` (config.ts). */
const GROUND_TEXTURE = 'ground_tile';

/**
 * Affichage de la carte : sol en texture répétée sur la zone jouable (un seul TileSprite, quelle que soit
 * la taille), entouré de lave animée (la bordure infranchissable) ; à défaut de texture fournie, repli sur le sol
 * procédural découpé en morceaux de 2048 px créés/détruits autour de la caméra. Décor haut (obstacles
 * éventuels) en sprites triés en profondeur.
 */
export class ArenaView {
  private readonly features: GroundFeature[];
  private readonly chunks = new Map<string, Phaser.GameObjects.Image>();
  private readonly tiled: boolean;
  private first = true;
  private lava?: Phaser.GameObjects.TileSprite;
  private ground?: Phaser.GameObjects.TileSprite;
  /** Taches sombres et leur échelle (largeur et échelle Y de la variante, vue Obstacles) ; opacité : VISUAL.stainAlpha (config.ts). */
  private readonly stains: { img: Phaser.GameObjects.Image }[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapDef,
  ) {
    this.tiled = scene.textures.exists(GROUND_TEXTURE);
    if (this.tiled) {
      // Lave partout, sol seulement dans la zone jouable (bords = `Arena.bounds`), avec un liseré incandescent.
      const b = { x: map.border, y: map.border, w: map.width - 2 * map.border, h: map.height - 2 * map.border };
      this.lava = scene.add.tileSprite(0, 0, map.width, map.height, 'lava').setOrigin(0).setDepth(DEPTH.ground - 1);
      this.ground = scene.add.tileSprite(b.x, b.y, b.w, b.h, GROUND_TEXTURE).setOrigin(0).setDepth(DEPTH.ground);
      scene.add
        .graphics()
        .setDepth(DEPTH.ground + 0.5)
        .lineStyle(18, 0xffb030, 0.3)
        .strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8)
        .lineStyle(5, 0x3a140e, 0.85)
        .strokeRect(b.x, b.y, b.w, b.h);
    }
    this.features = this.tiled ? [] : buildGround(map);
    this.addDecor();
  }

  /** À appeler chaque frame avec la zone visible de la caméra. */
  update(view: Phaser.Geom.Rectangle): void {
    this.ground?.setTileScale(VISUAL.groundScale);
    for (const s of this.stains) s.img.setAlpha(VISUAL.stainAlpha);
    if (this.lava) {
      // la lave glisse doucement
      const t = this.scene.time.now;
      this.lava.setTilePosition(t * 0.008, t * 0.004);
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
    // Taches d'abord (sous les obstacles). Rng à part : le tirage des taches ne change pas le reste du décor.
    const stainRng = new Rng(this.map.seed + 2);
    for (const o of this.map.obstacles) this.stain(o, stainRng);
    for (const o of this.map.obstacles) this.decor(o.x, o.y, o.kind, o.size ?? 1);
    for (const l of this.map.logs) this.decor(l.x, l.y, 'log', 0.95);

    // Bordure : plus de jungle, c'est de la lave (voir le constructeur). Le sol procédural de repli, lui, garde ses bords.
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

  /**
   * Tache sombre sous un obstacle : une variante du jeu de taches de l'obstacle (data/obstacles.ts, éditable dans la
   * visionneuse d'obstacles), tirée au hasard avec la seed de la carte — identique chez tous les joueurs. Image,
   * position, largeur, échelle Y et sens viennent de la variante ; seule l'opacité est un réglage global (menu Réglages).
   */
  private stain(o: PlacedObstacle, rng: Rng): void {
    const variants = OBSTACLES[o.kind].stains;
    const roll = rng.next(); // toujours tiré : le reste du décor ne dépend pas du nombre de variantes
    const v = variants[Math.floor(roll * variants.length)];
    if (!v || !this.scene.textures.exists(v.tex)) return;
    const k = o.size ?? 1; // la tache suit la taille de l'instance
    const img = this.scene.add.image(o.x + v.x * k, o.y + v.y * k, v.tex).setFlipX(v.flip).setDepth(DEPTH.ground + 0.2);
    const base = (v.w * k) / img.width;
    img.setScale(base, base * v.sy).setAlpha(VISUAL.stainAlpha);
    this.stains.push({ img });
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
