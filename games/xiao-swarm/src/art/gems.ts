import type Phaser from 'phaser';

/** Vert des diamants (rond au sol, éclats, gerbe du coffre, compteur du HUD). */
export const GEM_GREEN = 0x3ddc84;

export const GEM_KEY = 'gem_green';
export const GEM_CHEST_KEY = 'gem_chest';
export const COIN_KEY = 'coin_gold';
/** Or des pièces (rond au sol, compteur du HUD). */
export const COIN_GOLD = 0xffc83d;

function make(scene: Phaser.Scene, key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  paint(tex.getContext());
  tex.refresh();
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string | CanvasGradient): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Diamant taillé dans `ctx`, centré en (cx, cy), de largeur `s` (facettes : couronne claire, pavillon sombre). */
function paintGem(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const k = s / 64;
  const P = (x: number, y: number): [number, number] => [cx + (x - 32) * k, cy + (y - 32) * k];
  const outline = [P(16, 8), P(48, 8), P(60, 26), P(32, 58), P(4, 26)];
  poly(ctx, outline, '#1c8f55');
  poly(ctx, [P(16, 8), P(48, 8), P(42, 26), P(22, 26)], '#8ff5bd'); // table
  poly(ctx, [P(16, 8), P(22, 26), P(4, 26)], '#4fe39a'); // couronne gauche
  poly(ctx, [P(48, 8), P(60, 26), P(42, 26)], '#3ac985'); // couronne droite
  poly(ctx, [P(4, 26), P(22, 26), P(32, 58)], '#23a865'); // pavillon gauche
  poly(ctx, [P(22, 26), P(42, 26), P(32, 58)], '#2fbd78'); // pavillon centre
  poly(ctx, [P(42, 26), P(60, 26), P(32, 58)], '#168a4f'); // pavillon droit
  ctx.strokeStyle = '#0b4f2c';
  ctx.lineWidth = Math.max(1.5, 2.2 * k);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; // éclat
  ctx.beginPath();
  ctx.ellipse(...P(24, 15), 4 * k, 2.2 * k, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Fabrique (une fois) les textures du diamant vert et du coffre à diamants (dessinées par le code : aucun fichier). */
export function ensureGemTextures(scene: Phaser.Scene): void {
  make(scene, GEM_KEY, 64, 64, (ctx) => paintGem(ctx, 32, 32, 60));
  make(scene, COIN_KEY, 64, 64, (ctx) => {
    // pièce d'or : disque doré cerclé, reflet et petite étoile gravée
    const g = ctx.createRadialGradient(24, 22, 4, 32, 32, 30);
    g.addColorStop(0, '#fff3a0');
    g.addColorStop(0.55, '#ffc83d');
    g.addColorStop(1, '#d98e0a');
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#8a5a05';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(32, 32, 20, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(138,90,5,0.7)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(138,90,5,0.75)';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 11 : 4.5;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(21, 17, 6, 3, -0.6, 0, Math.PI * 2);
    ctx.fill();
  });
  make(scene, GEM_CHEST_KEY, 128, 112, (ctx) => {
    // corps du coffre
    ctx.lineJoin = 'round';
    const body = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke = '#3a2210'): void => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    };
    body(12, 52, 104, 52, 8, '#8a5a2b'); // caisse
    body(12, 30, 104, 30, 14, '#a56b32'); // couvercle
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(18, 34, 92, 6);
    for (const x of [30, 90]) body(x - 7, 30, 14, 74, 3, '#e6b422', '#7a5a0a'); // ferrures dorées
    body(54, 54, 20, 22, 4, '#f3cf55', '#7a5a0a'); // serrure
    ctx.fillStyle = '#3a2210';
    ctx.beginPath();
    ctx.arc(64, 62, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(62.5, 62, 3, 8);
    paintGem(ctx, 64, 24, 40); // diamant posé sur le couvercle
  });
}
