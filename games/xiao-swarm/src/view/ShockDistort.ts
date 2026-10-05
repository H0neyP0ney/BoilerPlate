import Phaser from 'phaser';
import { settings } from '../settings';

/** Clés des textures (globales au jeu) : anneau de déformation pré-calculé, carte de déformation redessinée à chaque image. */
const RING_KEY = 'fx_shock_ring';
const MAP_KEY = 'fx_shock_map';
/** Côté (px) de la texture d'anneau ; son disque touche les bords. */
const RING_SIZE = 256;
/** Réduction de la carte de déformation par rapport à l'écran (1/4 : largement suffisant, c'est une carte lisse). */
const MAP_DIV = 4;
/** Force de la déformation (part de l'écran déplacée au maximum, voir le filtre Displacement de Phaser). */
const STRENGTH = 0.07;
/** Masque qui annule la déformation sur les bords de l'écran (recréé quand la taille change). */
const EDGE_KEY = 'fx_shock_edge';
/** Largeur (part de l'écran) de la zone de bord où la déformation s'éteint : au moins `STRENGTH`, sinon le décalage dépasse la distance au bord. */
const EDGE_FADE = 0.12;

interface Pulse {
  /** Centre dans le monde. */
  x: number;
  y: number;
  /** Début (ms de `scene.time.now`) et durée (ms) de l'onde. */
  start: number;
  dur: number;
  /** Rayon (px monde) atteint en fin de vie. */
  radius: number;
  /** Aplatissement vertical (< 1 : ellipse, comme les anneaux de la vue inclinée). */
  squash: number;
  /** Centre mobile : si fourni, l'onde est recentrée chaque image (elle suit la squad qui bouge). */
  follow?: () => { x: number; y: number } | null;
}

/**
 * Déformation de l'écran par une onde de choc (shader de déformation, comme une explosion) : le filtre `Displacement` de Phaser
 * décale les pixels de la caméra selon une carte dont le rouge / vert encodent la direction ; la carte est un anneau qui
 * grossit (redessiné chaque image dans une petite texture dynamique). Plusieurs ondes peuvent se superposer.
 * Le filtre n'est posé sur la caméra que pendant l'effet. WebGL seulement ; sans filtres, l'effet est simplement ignoré.
 */
export class ShockDistort {
  private readonly pulses: Pulse[] = [];
  private map?: Phaser.Textures.DynamicTexture;
  private mapW = 0;
  private mapH = 0;
  private filter?: Phaser.Filters.Displacement;
  private ok = true;

  constructor(private readonly scene: Phaser.Scene) {
    scene.events.once('shutdown', () => this.dispose());
  }

  /** Lance `count` ondes successives (une toutes les `gapMs`) depuis un point du monde. */
  start(x: number, y: number, radius: number, durMs: number, count: number, gapMs: number, squash = 1, follow?: () => { x: number; y: number } | null): void {
    if (!this.ok || !settings.shockwave) return;
    const now = this.scene.time.now;
    for (let i = 0; i < count; i++) this.pulses.push({ x, y, start: now + i * gapMs, dur: durMs, radius, squash, follow });
  }

  update(): void {
    if (!this.ok) return;
    const now = this.scene.time.now;
    for (let i = this.pulses.length - 1; i >= 0; i--) if (now > this.pulses[i].start + this.pulses[i].dur) this.pulses.splice(i, 1);
    if (this.pulses.length === 0) {
      this.detach();
      return;
    }
    try {
      this.draw(now);
    } catch {
      this.ok = false; // pas de filtres (pas de WebGL, version de Phaser sans) : on abandonne l'effet sans gêner le jeu
      this.pulses.length = 0;
      this.detach();
    }
  }

  private draw(now: number): void {
    const cam = this.scene.cameras.main;
    const w = Math.max(16, Math.round(cam.width / MAP_DIV));
    const h = Math.max(16, Math.round(cam.height / MAP_DIV));
    this.ensureTextures(w, h);
    const map = this.map!;
    if (!this.filter) this.filter = cam.filters.external.addDisplacement(MAP_KEY, STRENGTH, STRENGTH);
    map.clear();
    map.fill(0x808000); // neutre : (0,5 ; 0,5) = aucun déplacement
    const wv = cam.worldView;
    for (const p of this.pulses) {
      const age = now - p.start;
      if (age < 0) continue;
      const c = p.follow?.();
      if (c) {
        p.x = c.x;
        p.y = c.y;
      }
      const k = age / p.dur;
      const sx = ((p.x - wv.x) / wv.width) * w;
      const sy = ((p.y - wv.y) / wv.height) * h;
      const grow = 1 - (1 - k) ** 3; // même courbe (Cubic.Out) que les anneaux dessinés
      const r = (p.radius * grow * w) / wv.width; // rayon en px de carte
      const sc = (2 * r) / RING_SIZE;
      map.stamp(RING_KEY, undefined, sx, sy, { scaleX: sc, scaleY: sc * p.squash, alpha: (1 - k) ** 1.5 });
    }
    map.stamp(EDGE_KEY, undefined, w / 2, h / 2); // bords neutres : sinon le filtre va chercher des pixels hors de l'écran (noir)
    map.render();
  }

  /** Masque des bords (taille de la carte) : couleur neutre, opaque au bord de l'écran et transparent à `EDGE_FADE` du bord. */
  private buildEdgeMask(w: number, h: number): void {
    const tm = this.scene.textures;
    if (tm.exists(EDGE_KEY)) tm.remove(EDGE_KEY);
    const tex = tm.createCanvas(EDGE_KEY, w, h);
    if (!tex) throw new Error('canvas indisponible');
    const ctx = tex.getContext();
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const d = Math.min((x + 0.5) / w, (w - x - 0.5) / w, (y + 0.5) / h, (h - y - 0.5) / h); // distance au bord, en part de l'écran
        const a = 1 - Math.min(1, d / EDGE_FADE);
        const i = (y * w + x) * 4;
        img.data[i] = 128;
        img.data[i + 1] = 128;
        img.data[i + 2] = 0;
        img.data[i + 3] = Math.round(255 * a * a * (3 - 2 * a));
      }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }

  private ensureTextures(w: number, h: number): void {
    const tm = this.scene.textures;
    if (!tm.exists(RING_KEY)) {
      const tex = tm.createCanvas(RING_KEY, RING_SIZE, RING_SIZE);
      if (!tex) throw new Error('canvas indisponible');
      const ctx = tex.getContext();
      const img = ctx.createImageData(RING_SIZE, RING_SIZE);
      const c = RING_SIZE / 2;
      for (let y = 0; y < RING_SIZE; y++)
        for (let x = 0; x < RING_SIZE; x++) {
          const dx = x + 0.5 - c;
          const dy = y + 0.5 - c;
          const d = Math.hypot(dx, dy) / c; // 0 au centre, 1 au bord du disque
          const i = (y * RING_SIZE + x) * 4;
          if (d > 1) continue; // hors du disque : transparent
          // front d'onde : bosse étroite près du bord (la carte est neutre au centre et au bord, pas de coupure visible)
          const band = Math.max(0, 1 - Math.abs(d - 0.82) / 0.16);
          const wgt = band * band * (3 - 2 * band);
          const ux = d > 0 ? dx / (d * c) : 0;
          const uy = d > 0 ? dy / (d * c) : 0;
          img.data[i] = Math.round(128 + 127 * wgt * ux);
          img.data[i + 1] = Math.round(128 + 127 * wgt * uy);
          img.data[i + 2] = 0;
          img.data[i + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
      tex.refresh();
    }
    if (!this.map || this.mapW !== w || this.mapH !== h) {
      if (this.filter) this.detach();
      if (tm.exists(MAP_KEY)) tm.remove(MAP_KEY);
      this.map = tm.addDynamicTexture(MAP_KEY, w, h) ?? undefined;
      if (!this.map) throw new Error('texture dynamique indisponible');
      this.mapW = w;
      this.mapH = h;
      this.buildEdgeMask(w, h);
    }
  }

  /** Retire le filtre de la caméra (la carte reste en mémoire pour la prochaine onde). */
  private detach(): void {
    if (!this.filter) return;
    this.scene.cameras.main.filters.external.remove(this.filter);
    this.filter = undefined;
  }

  private dispose(): void {
    this.pulses.length = 0;
    try {
      this.detach();
    } catch {
      // caméra déjà détruite
    }
  }
}
