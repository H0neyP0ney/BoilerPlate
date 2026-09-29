import type Phaser from 'phaser';
import { canvasTexture, Rng } from '@xiao/engine';

/**
 * Éléments de décor hauts (palmiers, buissons, rochers, troncs), triés en
 * profondeur avec les unités. Le sol est dans ground.ts.
 */
const OUTLINE = '#2a1d2e';

function outlined(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient, width = 3, stroke = OUTLINE): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function palm(ctx: CanvasRenderingContext2D): void {
  // tronc
  ctx.beginPath();
  ctx.moveTo(70, 168);
  ctx.quadraticCurveTo(62, 110, 76, 62);
  ctx.lineTo(88, 64);
  ctx.quadraticCurveTo(76, 110, 86, 168);
  ctx.closePath();
  outlined(ctx, '#a8733f');
  ctx.strokeStyle = 'rgba(42,29,46,0.5)';
  ctx.lineWidth = 2;
  for (let y = 80; y < 165; y += 12) {
    ctx.beginPath();
    ctx.moveTo(68, y);
    ctx.lineTo(86, y + 3);
    ctx.stroke();
  }
  // palmes
  const leaves = [-2.6, -2.0, -1.4, -0.9, -0.3, 0.3, 0.9];
  for (const a of leaves) {
    ctx.save();
    ctx.translate(80, 62);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(34, -18, 70, 8);
    ctx.quadraticCurveTo(34, 6, 0, 0);
    outlined(ctx, a < -1.2 ? '#3f9a3a' : '#57b845', 2.5);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(80, 64, 7, 0, Math.PI * 2);
  outlined(ctx, '#7a5a2a', 2);
}

function bush(ctx: CanvasRenderingContext2D, flowers: boolean, seed: number): void {
  const rng = new Rng(seed);
  const parts = [
    [30, 50, 24],
    [58, 44, 28],
    [84, 52, 22],
    [46, 30, 22],
    [70, 26, 20],
  ];
  for (const [x, y, r] of parts) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    outlined(ctx, '#3f8f35');
  }
  for (const [x, y, r] of parts) {
    ctx.fillStyle = '#5cb546';
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.25, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  if (flowers) {
    for (let i = 0; i < 5; i++) {
      const x = rng.range(20, 95);
      const y = rng.range(18, 60);
      ctx.fillStyle = rng.pick(['#ff7a3a', '#ff4f7a', '#ffd84a']);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function rock(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.95);
  ctx.bezierCurveTo(w * 0.0, h * 0.4, w * 0.25, h * 0.05, w * 0.5, h * 0.06);
  ctx.bezierCurveTo(w * 0.8, h * 0.06, w * 1.0, h * 0.45, w * 0.92, h * 0.95);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#a9a6b3');
  g.addColorStop(1, '#6d6878');
  outlined(ctx, g, 3.5);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(w * 0.38, h * 0.25, w * 0.14, h * 0.08, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(42,29,46,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.6, h * 0.3);
  ctx.lineTo(w * 0.7, h * 0.55);
  ctx.stroke();
}

export function makeEnvironmentTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, 'palm', 160, 172, palm);
  canvasTexture(scene, 'bush', 112, 78, (ctx) => bush(ctx, false, 1));
  canvasTexture(scene, 'bush_flowers', 112, 78, (ctx) => bush(ctx, true, 2));
  canvasTexture(scene, 'rock_big', 110, 92, (ctx) => rock(ctx, 110, 92));
  canvasTexture(scene, 'rock_small', 56, 46, (ctx) => rock(ctx, 56, 46));
  canvasTexture(scene, 'log', 150, 44, (ctx) => {
    ctx.beginPath();
    ctx.roundRect(6, 8, 138, 28, 14);
    outlined(ctx, '#8a5a30');
    ctx.beginPath();
    ctx.ellipse(130, 22, 10, 13, 0, 0, Math.PI * 2);
    outlined(ctx, '#d9a86a', 2.5);
    ctx.strokeStyle = 'rgba(42,29,46,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 18);
    ctx.lineTo(100, 16);
    ctx.moveTo(30, 28);
    ctx.lineTo(110, 27);
    ctx.stroke();
  });
}
