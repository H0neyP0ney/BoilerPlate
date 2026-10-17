import type Phaser from 'phaser';

/** Vert des diamants (rond au sol, éclats, gerbe du coffre, compteur du HUD). */
export const GEM_GREEN = 0x3ddc84;

export const GEM_KEY = 'gem_green';
export const GEM_CHEST_KEY = 'gem_chest';
export const COIN_KEY = 'coin_gold';
/** Boîte de power-up et caisse de pièces : visuels des « aliens » `powerup_box` / `coin_crate` (`alien_<id>`, la clé de texture procédurale par défaut). */
export const BOX_KEY = 'alien_powerup_box';
export const CRATE_KEY = 'alien_coin_crate';
/** Caisse de TNT (`tnt_crate`). */
export const TNT_KEY = 'alien_tnt_crate';
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
  // boîte de power-up : coffret bleu fermé, bandes claires et gros « ? » (contenu inconnu)
  make(scene, BOX_KEY, 72, 72, (ctx) => {
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.roundRect(8, 14, 56, 52, 8);
    const g = ctx.createLinearGradient(0, 14, 0, 66);
    g.addColorStop(0, '#6cc1ff');
    g.addColorStop(1, '#2a74d8');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#143c7a';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(12, 18, 48, 8);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#143c7a';
    ctx.lineWidth = 4;
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('?', 36, 42);
    ctx.fillText('?', 36, 42);
  });
  // caisse de pièces : caisse de bois cerclée de fer, pièce d'or sur la façade
  make(scene, CRATE_KEY, 72, 72, (ctx) => {
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.roundRect(8, 14, 56, 52, 5);
    ctx.fillStyle = '#b9772f';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#4a2a0c';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(74,42,12,0.55)'; // planches
    ctx.lineWidth = 2;
    for (const y of [27, 40, 53]) {
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(62, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#6b6f78'; // cerclage
    ctx.fillRect(12, 14, 6, 52);
    ctx.fillRect(54, 14, 6, 52);
    ctx.beginPath();
    ctx.arc(36, 40, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#ffc83d';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#8a5a05';
    ctx.stroke();
    ctx.fillStyle = '#8a5a05';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', 36, 41);
  });
  // caisse de TNT : caisse rouge, bâtons de dynamite liés et lettres « TNT »
  make(scene, TNT_KEY, 72, 72, (ctx) => {
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.roundRect(8, 14, 56, 52, 5);
    const g = ctx.createLinearGradient(0, 14, 0, 66);
    g.addColorStop(0, '#f0644a');
    g.addColorStop(1, '#b32a1a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#4a1008';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(12, 18, 48, 6);
    ctx.fillStyle = '#ffe9b0'; // plaque
    ctx.fillRect(14, 31, 44, 22);
    ctx.strokeStyle = '#4a1008';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 31, 44, 22);
    ctx.fillStyle = '#b32a1a';
    ctx.font = 'bold 19px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TNT', 36, 43);
    ctx.strokeStyle = '#3a2a10'; // mèche
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(36, 14);
    ctx.quadraticCurveTo(40, 6, 48, 8);
    ctx.stroke();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(49, 8, 3, 0, Math.PI * 2);
    ctx.fill();
  });
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
