import type Phaser from 'phaser';
import { canvasTexture } from '@xiao/engine';
import type { SoldierClassId } from '../data/classes';

/**
 * Soldats chibi dessinés en Canvas 2D (placeholder DA, cf. docs/xiao-swarm-da-ref.png).
 * Corps et arme sont séparés : l'arme pivote vers la cible indépendamment du déplacement (GDD §9).
 * Tout est dessiné face à droite ; flipX pour regarder à gauche.
 */
const OUTLINE = '#2a1d2e';
const SKIN = '#f5c9a0';

interface Look {
  helmet: string;
  helmetDark: string;
  uniform: string;
  uniformDark: string;
  decal?: (ctx: CanvasRenderingContext2D) => void;
  visor?: boolean;
  headset?: boolean;
  goggles?: boolean;
  backpack?: 'medkit' | 'fueltank' | 'grenades';
}

const LOOKS: Record<SoldierClassId, Look> = {
  trooper: { helmet: '#3d7fe0', helmetDark: '#2a5cb0', uniform: '#4b6fb8', uniformDark: '#33508a' },
  medic: {
    helmet: '#f4f4f4',
    helmetDark: '#c9ccd6',
    uniform: '#e8e4e0',
    uniformDark: '#b8b2ad',
    backpack: 'medkit',
    decal: (ctx) => redCross(ctx, 30, 17, 9),
  },
  flammer: {
    helmet: '#e0413d',
    helmetDark: '#a82b2b',
    uniform: '#b8453a',
    uniformDark: '#86302a',
    goggles: true,
    backpack: 'fueltank',
  },
  sniper: {
    helmet: '#5aa84a',
    helmetDark: '#3d7a33',
    uniform: '#5c8a4a',
    uniformDark: '#3f6533',
    headset: true,
  },
  bruiser: { helmet: '#8a96a8', helmetDark: '#5f6a7a', uniform: '#6c7686', uniformDark: '#4a5260', visor: true },
  bomber: { helmet: '#9a5ad8', helmetDark: '#6f3fa8', uniform: '#7c58b4', uniformDark: '#573d86', backpack: 'grenades' },
};

function redCross(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#e23b3b';
  ctx.fillRect(x - s / 6, y - s / 2, s / 3, s);
  ctx.fillRect(x - s / 2, y - s / 6, s, s / 3);
}

function outlined(ctx: CanvasRenderingContext2D, fill: string, width = 3): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = OUTLINE;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawBody(ctx: CanvasRenderingContext2D, look: Look, big: boolean): void {
  const s = big ? 1.18 : 1;
  ctx.save();
  // pieds au bas du canvas (64×72), centré en x = 32
  ctx.translate(32, 70);
  ctx.scale(s, s);
  ctx.translate(-32, -70);

  // Sac à dos (derrière, côté gauche car on regarde à droite)
  if (look.backpack === 'medkit') {
    ctx.beginPath();
    ctx.roundRect(8, 38, 16, 18, 4);
    outlined(ctx, '#f4f4f4');
    redCross(ctx, 16, 47, 9);
  } else if (look.backpack === 'fueltank') {
    ctx.beginPath();
    ctx.roundRect(10, 34, 12, 24, 6);
    outlined(ctx, '#d6a93a');
    ctx.fillStyle = '#9a7420';
    ctx.fillRect(12, 42, 8, 3);
  } else if (look.backpack === 'grenades') {
    // besace violette + deux grenades accrochées
    ctx.beginPath();
    ctx.roundRect(8, 38, 16, 18, 4);
    outlined(ctx, '#6f3fa8');
    for (const y of [43, 51]) {
      ctx.beginPath();
      ctx.arc(16, y, 4, 0, Math.PI * 2);
      outlined(ctx, '#3d2b52', 2);
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(15, y - 6, 2, 2);
    }
  }

  // Jambes / bottes
  ctx.beginPath();
  ctx.roundRect(22, 56, 9, 12, 3);
  outlined(ctx, look.uniformDark);
  ctx.beginPath();
  ctx.roundRect(33, 56, 9, 12, 3);
  outlined(ctx, look.uniformDark);
  ctx.beginPath();
  ctx.roundRect(21, 63, 11, 6, 3);
  outlined(ctx, '#3b3140', 2.5);
  ctx.beginPath();
  ctx.roundRect(33, 63, 11, 6, 3);
  outlined(ctx, '#3b3140', 2.5);

  // Torse
  ctx.beginPath();
  ctx.roundRect(19, 38, 26, 22, 8);
  outlined(ctx, look.uniform);
  ctx.fillStyle = look.uniformDark;
  ctx.fillRect(21, 53, 22, 4); // ceinture
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(23, 41, 8, 8);

  // Tête (visage)
  ctx.beginPath();
  ctx.arc(34, 28, 13, 0, Math.PI * 2);
  outlined(ctx, SKIN);
  // joue
  ctx.fillStyle = 'rgba(240,120,110,0.45)';
  ctx.beginPath();
  ctx.ellipse(38, 33, 3.5, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Casque
  ctx.beginPath();
  ctx.arc(32, 25, 17, Math.PI * 0.98, Math.PI * 2.05);
  ctx.lineTo(50, 28);
  ctx.lineTo(14, 28);
  ctx.closePath();
  outlined(ctx, look.helmet);
  // rebord
  ctx.beginPath();
  ctx.roundRect(13, 24, 38, 6, 3);
  outlined(ctx, look.helmetDark, 2.5);
  // reflet
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(25, 15, 6, 3.2, -0.5, 0, Math.PI * 2);
  ctx.fill();
  look.decal?.(ctx);

  if (look.visor) {
    ctx.beginPath();
    ctx.roundRect(28, 29, 20, 8, 3);
    outlined(ctx, '#2b3340', 2.5);
    ctx.fillStyle = '#6fd0ff';
    ctx.fillRect(33, 31, 11, 3);
  } else {
    // oeil
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.ellipse(40, 31, 2.4, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(40.8, 30, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  if (look.goggles) {
    ctx.beginPath();
    ctx.roundRect(26, 14, 16, 7, 3);
    outlined(ctx, '#3b3140', 2);
    ctx.fillStyle = '#ffcf5a';
    ctx.beginPath();
    ctx.arc(30, 17.5, 2.4, 0, Math.PI * 2);
    ctx.arc(38, 17.5, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (look.headset) {
    ctx.beginPath();
    ctx.ellipse(27, 28, 5, 6, 0, 0, Math.PI * 2);
    outlined(ctx, '#3b4a33', 2.5);
    ctx.strokeStyle = '#3b4a33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(29, 33);
    ctx.quadraticCurveTo(36, 40, 42, 36);
    ctx.stroke();
  }
  ctx.restore();
}

type GunDraw = (ctx: CanvasRenderingContext2D) => void;

/** Armes dessinées pointant à droite, poignée vers x≈12. Canvas 64×20. */
const GUNS: Record<SoldierClassId, GunDraw> = {
  trooper: (ctx) => {
    ctx.beginPath();
    ctx.roundRect(6, 6, 34, 8, 2);
    outlined(ctx, '#4a4f5c', 2.5);
    ctx.beginPath();
    ctx.roundRect(38, 8, 16, 4, 1);
    outlined(ctx, '#2f333d', 2);
    ctx.beginPath();
    ctx.roundRect(20, 12, 6, 7, 1);
    outlined(ctx, '#2f333d', 2);
    ctx.fillStyle = '#8a91a3';
    ctx.fillRect(10, 7, 14, 2);
  },
  medic: (ctx) => {
    ctx.beginPath();
    ctx.roundRect(8, 6, 26, 8, 3);
    outlined(ctx, '#e8ecef', 2.5);
    ctx.beginPath();
    ctx.roundRect(32, 8, 12, 4, 1);
    outlined(ctx, '#3a8f5a', 2);
    ctx.fillStyle = '#5fe08a';
    ctx.fillRect(14, 8, 10, 3);
  },
  flammer: (ctx) => {
    ctx.beginPath();
    ctx.roundRect(6, 5, 30, 10, 4);
    outlined(ctx, '#c9453a', 2.5);
    ctx.beginPath();
    ctx.roundRect(34, 7, 18, 6, 2);
    outlined(ctx, '#3b3140', 2);
    ctx.beginPath();
    ctx.roundRect(50, 5, 6, 10, 2);
    outlined(ctx, '#2a2530', 2);
    ctx.fillStyle = '#ffcf5a';
    ctx.fillRect(12, 7, 14, 2);
  },
  sniper: (ctx) => {
    ctx.beginPath();
    ctx.roundRect(4, 8, 40, 7, 2);
    outlined(ctx, '#5a4a3a', 2.5);
    ctx.beginPath();
    ctx.roundRect(42, 10, 20, 3, 1);
    outlined(ctx, '#2f333d', 1.5);
    ctx.beginPath();
    ctx.roundRect(18, 2, 16, 6, 3);
    outlined(ctx, '#2f333d', 2);
    ctx.fillStyle = '#7cf0a0';
    ctx.fillRect(31, 4, 2, 2);
  },
  bruiser: (ctx) => {
    ctx.beginPath();
    ctx.roundRect(6, 4, 36, 12, 3);
    outlined(ctx, '#5f6a7a', 2.5);
    ctx.beginPath();
    ctx.roundRect(40, 5, 16, 10, 2);
    outlined(ctx, '#3b4250', 2);
    ctx.fillStyle = '#2a2e38';
    ctx.fillRect(52, 7, 3, 2);
    ctx.fillRect(52, 11, 3, 2);
    ctx.fillStyle = '#ffc83d';
    ctx.fillRect(12, 6, 10, 3);
  },
  // Lance-grenades : gros tube + barillet, bouche évasée.
  bomber: (ctx) => {
    ctx.beginPath();
    ctx.roundRect(6, 5, 40, 10, 4);
    outlined(ctx, '#5b4a78', 2.5);
    ctx.beginPath();
    ctx.roundRect(44, 3, 14, 14, 3);
    outlined(ctx, '#2f2540', 2);
    ctx.beginPath();
    ctx.arc(24, 14, 6, 0, Math.PI * 2);
    outlined(ctx, '#3d2b52', 2);
    ctx.fillStyle = '#c79bff';
    ctx.fillRect(12, 7, 16, 2);
  },
};

export function makeSoldierTextures(scene: Phaser.Scene): void {
  for (const id of Object.keys(LOOKS) as SoldierClassId[]) {
    canvasTexture(scene, `soldier_${id}`, 64, 72, (ctx) => drawBody(ctx, LOOKS[id], id === 'bruiser'));
    canvasTexture(scene, `gun_${id}`, 64, 20, GUNS[id]);
    // Recrue au sol : casque de la classe + badge "+"
    canvasTexture(scene, `recruit_${id}`, 56, 60, (ctx) => {
      ctx.save();
      ctx.translate(-4, -8);
      drawBody(ctx, LOOKS[id], false);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(44, 14, 10, 0, Math.PI * 2);
      outlined(ctx, '#ffc83d', 2.5);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(42.5, 8, 3, 12);
      ctx.fillRect(38, 12.5, 12, 3);
    });
  }
}
