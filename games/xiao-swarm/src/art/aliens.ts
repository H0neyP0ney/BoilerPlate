import type Phaser from 'phaser';
import { canvasTexture } from '@xiao/engine';

/** Aliens cartoon "kawaii" (GDD §10, §23). Dessinés face caméra, symétriques. */
const OUTLINE = '#2a1d2e';

function outlined(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient, width = 3): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = OUTLINE;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, lookX = 0.25): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  outlined(ctx, '#ffffff', 2.5);
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(x + r * lookX, y + r * 0.1, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + r * lookX + r * 0.2, y - r * 0.15, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, dark: string): CanvasGradient {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  return g;
}

/** Slime/poulpe vert à un oeil. */
function slime(ctx: CanvasRenderingContext2D, light = '#c4f07a', dark = '#6fb03a'): void {
  // tentacules
  for (let i = 0; i < 5; i++) {
    const x = 11 + i * 6.5;
    ctx.beginPath();
    ctx.ellipse(x, 38, 4, 7, (i - 2) * 0.25, 0, Math.PI * 2);
    outlined(ctx, dark, 2.5);
  }
  ctx.beginPath();
  ctx.moveTo(6, 36);
  ctx.bezierCurveTo(4, 4, 44, 4, 42, 36);
  ctx.closePath();
  outlined(ctx, radial(ctx, 24, 22, 20, light, dark));
  eye(ctx, 24, 21, 8);
}

/** Calmar violet flottant. */
function squid(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 4; i++) {
    const x = 13 + i * 7;
    ctx.beginPath();
    ctx.moveTo(x - 3, 34);
    ctx.quadraticCurveTo(x + (i % 2 ? 5 : -5), 46, x, 54);
    ctx.quadraticCurveTo(x + 4, 46, x + 3, 34);
    outlined(ctx, '#8c3fb0', 2.5);
  }
  ctx.beginPath();
  ctx.moveTo(6, 34);
  ctx.bezierCurveTo(2, 2, 46, 2, 42, 34);
  ctx.closePath();
  outlined(ctx, radial(ctx, 24, 20, 20, '#e7a6ff', '#9a45c4'));
  // antenne
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(32, 8);
  ctx.quadraticCurveTo(38, 0, 42, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(42, 3, 3, 0, Math.PI * 2);
  outlined(ctx, '#ff9ff5', 2);
  eye(ctx, 24, 20, 8);
}

/** Petite araignée rouge (runner). */
function spider(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const y = 16 + i * 4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.quadraticCurveTo(18 + side * 12, y - 8, 18 + side * (15 + i), y + 8);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = '#a82035';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const y = 16 + i * 4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.quadraticCurveTo(18 + side * 12, y - 8, 18 + side * (15 + i), y + 8);
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.ellipse(18, 18, 11, 9, 0, 0, Math.PI * 2);
  outlined(ctx, radial(ctx, 18, 18, 11, '#ff7a8a', '#c21f3a'));
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(14, 16, 2.6, 0, Math.PI * 2);
  ctx.arc(22, 16, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(14.6, 16.4, 1.4, 0, Math.PI * 2);
  ctx.arc(22.6, 16.4, 1.4, 0, Math.PI * 2);
  ctx.fill();
}

/** Bête orange à cornes (charge). */
function beast(ctx: CanvasRenderingContext2D, light = '#ffc27a', dark = '#e0741f', legs = '#c0621a'): void {
  // pattes
  for (const x of [14, 24, 40, 50]) {
    ctx.beginPath();
    ctx.roundRect(x - 4, 38, 8, 12, 3);
    outlined(ctx, legs, 2.5);
  }
  // corps
  ctx.beginPath();
  ctx.ellipse(32, 30, 26, 16, 0, 0, Math.PI * 2);
  outlined(ctx, radial(ctx, 32, 30, 26, light, dark));
  // piquants dos
  for (let i = 0; i < 4; i++) {
    const x = 16 + i * 9;
    ctx.beginPath();
    ctx.moveTo(x, 17);
    ctx.lineTo(x + 4, 6 + (i % 2) * 3);
    ctx.lineTo(x + 8, 17);
    outlined(ctx, '#ffe0a8', 2);
  }
  // cornes
  ctx.beginPath();
  ctx.moveTo(48, 20);
  ctx.quadraticCurveTo(58, 8, 54, 2);
  ctx.quadraticCurveTo(62, 10, 54, 24);
  outlined(ctx, '#fff1d6', 2);
  // museau + dents
  ctx.beginPath();
  ctx.ellipse(52, 34, 9, 7, 0, 0, Math.PI * 2);
  outlined(ctx, '#f09a4a', 2.5);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(47, 38);
  ctx.lineTo(49, 43);
  ctx.lineTo(51, 38);
  ctx.moveTo(53, 38);
  ctx.lineTo(55, 43);
  ctx.lineTo(57, 38);
  ctx.fill();
  eye(ctx, 44, 25, 5, 0.4);
}

/** Crabe géant (brute / mini-boss). */
function crab(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const bx = 65 + side * 34;
      const by = 58 + i * 9;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + side * 26, by - 22, bx + side * (30 + i * 2), by + 18);
      ctx.stroke();
      ctx.strokeStyle = '#e0556a';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }
  // corps
  ctx.beginPath();
  ctx.ellipse(65, 55, 46, 40, 0, 0, Math.PI * 2);
  outlined(ctx, radial(ctx, 65, 55, 46, '#ff8a8a', '#c2304a'), 4);
  // taches
  ctx.fillStyle = 'rgba(255,200,170,0.55)';
  for (const [x, y, r] of [
    [45, 30, 6],
    [80, 26, 5],
    [96, 48, 6],
    [36, 58, 4],
    [62, 22, 3],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // bouche
  ctx.beginPath();
  ctx.ellipse(65, 64, 24, 17, 0, 0, Math.PI * 2);
  outlined(ctx, '#3a1020', 3);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) {
    const x = 47 + i * 9;
    ctx.beginPath();
    ctx.moveTo(x, 50);
    ctx.lineTo(x + 4, 58);
    ctx.lineTo(x + 8, 50);
    ctx.fill();
  }
  ctx.fillStyle = '#e06a8a';
  ctx.beginPath();
  ctx.ellipse(65, 72, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  eye(ctx, 50, 36, 6, 0);
  eye(ctx, 80, 36, 6, 0);
}

export function makeAlienTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, 'alien_slime_basic', 48, 48, (ctx) => slime(ctx));
  canvasTexture(scene, 'alien_slime_bombardier', 72, 72, (ctx) => {
    ctx.scale(1.5, 1.5);
    slime(ctx, '#b8dcff', '#3a78d8');
  });
  canvasTexture(scene, 'alien_slime_pink', 48, 48, (ctx) => slime(ctx, '#ffc4e0', '#e0559a'));
  canvasTexture(scene, 'alien_squid', 48, 58, squid);
  canvasTexture(scene, 'alien_spider', 36, 32, spider);
  canvasTexture(scene, 'alien_beast', 66, 52, (ctx) => beast(ctx));
  canvasTexture(scene, 'alien_charger', 66, 52, (ctx) => beast(ctx, '#e09a9a', '#a33030', '#7a2020'));
  canvasTexture(scene, 'alien_kamikaze', 48, 48, (ctx) => slime(ctx, '#ffd9a8', '#e0702a'));
  canvasTexture(scene, 'alien_frog', 48, 48, (ctx) => slime(ctx, '#c0f5e4', '#2aa88a'));
  // Bulle flottante : sphère translucide à reflets (le soldat avalé se voit à travers).
  canvasTexture(scene, 'alien_bubble', 60, 60, (ctx) => {
    const g = ctx.createRadialGradient(24, 22, 4, 30, 30, 29);
    g.addColorStop(0, 'rgba(230,250,255,0.55)');
    g.addColorStop(0.65, 'rgba(120,210,255,0.28)');
    g.addColorStop(1, 'rgba(70,170,255,0.5)');
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(210,245,255,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(30, 30, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(30, 30, 19, Math.PI * 1.05, Math.PI * 1.4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(40, 41, 3.5, 2.2, -0.6, 0, Math.PI * 2);
    ctx.fill();
  });
  // Boss : le rhinocéros et le crabe agrandis (le sprite suit le rayon de l'alien).
  canvasTexture(scene, 'alien_rhino_boss', 119, 94, (ctx) => {
    ctx.scale(1.8, 1.8);
    beast(ctx, '#d98a8a', '#8c1f1f', '#5a1414');
  });
  canvasTexture(scene, 'alien_crab_king', 182, 157, (ctx) => {
    ctx.scale(1.4, 1.4);
    crab(ctx);
  });
  canvasTexture(scene, 'alien_fire', 48, 48, (ctx) => slime(ctx, '#ffd9a0', '#e04a10'));
  canvasTexture(scene, 'alien_shaman', 48, 48, (ctx) => slime(ctx, '#fff6b0', '#d8a020'));
  canvasTexture(scene, 'alien_healer', 48, 48, (ctx) => slime(ctx, '#fffbd0', '#e8d030'));
  canvasTexture(scene, 'alien_thrower', 48, 48, (ctx) => slime(ctx, '#d8c8b0', '#8a6a48'));
  canvasTexture(scene, 'alien_spitter', 48, 48, (ctx) => slime(ctx, '#e3c8ff', '#8a3fd0'));
  canvasTexture(scene, 'alien_crab', 130, 112, crab);
}
