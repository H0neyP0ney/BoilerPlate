import type Phaser from 'phaser';

/** Une texture dessinée en canvas dont la fabrication est reportée (voir `captureCanvasTextures`, `TextureFactory`). */
export interface LazyCanvasTexture {
  key: string;
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

let sink: ((t: LazyCanvasTexture) => void) | null = null;

/** Exécute `fn` en mode « déclaration » : chaque `canvasTexture` appelé pendant `fn` est mémorisé (clé, taille, dessin) au lieu d'être dessiné. */
export function captureCanvasTextures(fn: () => void): LazyCanvasTexture[] {
  const out: LazyCanvasTexture[] = [];
  const previous = sink;
  sink = (t) => out.push(t);
  try {
    fn();
  } finally {
    sink = previous;
  }
  return out;
}

/**
 * Crée une texture Phaser dessinée en Canvas 2D (formes, dégradés, courbes).
 * Idéal pour des placeholders propres sans aucun fichier à télécharger.
 * `scale` permet de dessiner en haute résolution (retina) puis d'afficher à 1/scale.
 */
export function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): void {
  if (sink) {
    sink({ key, width, height, draw }); // déclaration seulement : fabriquée plus tard par la `TextureFactory`
    return;
  }
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext('2d')!;
  draw(ctx, canvas.width, canvas.height);
  scene.textures.addCanvas(key, canvas);
}

/** Rectangle arrondi (path seulement, à remplir / stroker ensuite). */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Remplit + contour épais sombre : le look "cartoon outline". */
export function fillOutlined(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient, outline = '#2a1d2e', lineWidth = 3): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = outline;
  ctx.lineJoin = 'round';
  ctx.stroke();
}
