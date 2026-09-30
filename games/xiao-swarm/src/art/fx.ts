import type Phaser from 'phaser';
import { canvasTexture } from '@xiao/engine';

/** Projectiles, particules et icônes d'effets. */
export function makeFxTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, 'fx_bullet', 22, 10, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 22, 0);
    g.addColorStop(0, 'rgba(255,200,60,0)');
    g.addColorStop(0.6, 'rgba(255,220,90,0.9)');
    g.addColorStop(1, '#fffbe0');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(11, 5, 11, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  // Tir de blaster bleu : traînée qui s'éclaircit vers la tête, cœur blanc. Dessiné pointant à droite (tête à droite).
  canvasTexture(scene, 'fx_blaster_blue', 42, 16, (ctx) => {
    const glow = ctx.createLinearGradient(0, 0, 42, 0);
    glow.addColorStop(0, 'rgba(40,120,255,0)');
    glow.addColorStop(0.65, 'rgba(60,150,255,0.8)');
    glow.addColorStop(1, 'rgba(130,205,255,0.95)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(21, 8, 21, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    const core = ctx.createLinearGradient(6, 0, 40, 0);
    core.addColorStop(0, 'rgba(180,225,255,0)');
    core.addColorStop(1, '#ffffff');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(23, 8, 18, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  canvasTexture(scene, 'fx_bolt_green', 20, 10, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 20, 0);
    g.addColorStop(0, 'rgba(90,255,140,0)');
    g.addColorStop(1, '#e8ffe8');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(10, 5, 10, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  canvasTexture(scene, 'fx_grenade', 18, 18, (ctx) => {
    // petite grenade violette : corps rond, reflet, goupille
    ctx.fillStyle = '#2a1d2e';
    ctx.beginPath();
    ctx.arc(9, 10, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a4fd0';
    ctx.beginPath();
    ctx.arc(9, 10, 5.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(7, 8, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(8, 1, 3, 3);
  });
  canvasTexture(scene, 'fx_flame', 40, 40, (ctx) => {
    const g = ctx.createRadialGradient(20, 20, 2, 20, 20, 20);
    g.addColorStop(0, 'rgba(255,250,200,1)');
    g.addColorStop(0.35, 'rgba(255,190,60,0.95)');
    g.addColorStop(0.7, 'rgba(240,90,30,0.6)');
    g.addColorStop(1, 'rgba(200,40,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 40, 40);
  });
  canvasTexture(scene, 'fx_glow', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  canvasTexture(scene, 'fx_dot', 12, 12, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(6, 6, 5.5, 0, Math.PI * 2);
    ctx.fill();
  });
  // Flaque irrégulière (blanche, teintée à l'affichage) : quelques lobes autour d'un centre.
  canvasTexture(scene, 'fx_puddle', 64, 64, (ctx) => {
    ctx.fillStyle = '#fff';
    const lobes: [number, number, number][] = [
      [32, 32, 19],
      [19, 28, 11],
      [45, 35, 12],
      [30, 46, 9],
      [38, 19, 8],
      [12, 40, 5],
    ];
    for (const [x, y, r] of lobes) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  canvasTexture(scene, 'fx_ring', 128, 128, (ctx) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.stroke();
  });
  canvasTexture(scene, 'fx_plus', 18, 18, (ctx) => {
    ctx.fillStyle = '#2a6a3a';
    ctx.fillRect(6, 1, 6, 16);
    ctx.fillRect(1, 6, 16, 6);
    ctx.fillStyle = '#7dff9a';
    ctx.fillRect(7, 2, 4, 14);
    ctx.fillRect(2, 7, 14, 4);
  });
  // Main pour le tuto "glisse"
  canvasTexture(scene, 'hand', 64, 72, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2a1d2e';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(22, 8);
    ctx.quadraticCurveTo(22, 2, 28, 2);
    ctx.quadraticCurveTo(34, 2, 34, 8);
    ctx.lineTo(34, 30);
    ctx.lineTo(44, 30);
    ctx.quadraticCurveTo(58, 32, 56, 46);
    ctx.lineTo(52, 62);
    ctx.quadraticCurveTo(50, 70, 40, 70);
    ctx.lineTo(26, 70);
    ctx.quadraticCurveTo(18, 70, 14, 60);
    ctx.lineTo(8, 44);
    ctx.quadraticCurveTo(6, 36, 14, 38);
    ctx.lineTo(22, 46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}
