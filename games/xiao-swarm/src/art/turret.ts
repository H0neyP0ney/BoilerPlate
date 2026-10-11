import type Phaser from 'phaser';
import { canvasTexture } from '@xiao/engine';

/** Tourelle automatique (power-up `turrets`) : socle rond violet et canon dessiné pointant à droite (il tourne autour de son pivot, `TurretViews`). */
export const TURRET_BASE = 'turret_base';
export const TURRET_GUN = 'turret_gun';
/** Pivot du canon dans sa texture (fraction de la largeur / hauteur). */
export const TURRET_GUN_ORIGIN = { x: 0.22, y: 0.5 };

const OUTLINE = '#2a1d2e';

export function makeTurretTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, TURRET_BASE, 56, 48, (ctx) => {
    ctx.lineJoin = 'round';
    // embase
    ctx.beginPath();
    ctx.ellipse(28, 30, 22, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#5b4a7a';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    // dôme
    const g = ctx.createRadialGradient(24, 20, 2, 28, 24, 18);
    g.addColorStop(0, '#d9c2ff');
    g.addColorStop(1, '#8a5fd6');
    ctx.beginPath();
    ctx.ellipse(28, 24, 16, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.stroke();
    // rivets
    ctx.fillStyle = '#2a1d2e';
    for (const x of [10, 46]) {
      ctx.beginPath();
      ctx.arc(x, 33, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  canvasTexture(scene, TURRET_GUN, 40, 18, (ctx) => {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.roundRect(3, 4, 32, 10, 3);
    ctx.fillStyle = '#4a3a66';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(28, 2, 10, 14, 3); // bouche
    ctx.fillStyle = '#ffb02a';
    ctx.fill();
    ctx.stroke();
  });
}
