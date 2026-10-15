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

/** Araignée : corps rond violet-rose, tête avec deux yeux, 8 pattes articulées (4 de chaque côté). Canvas 56 × 56. */
function spider(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const k = i - 1.5;
      const x0 = 28 + side * 7;
      const y0 = 31 + k * 4;
      const knee = { x: 28 + side * (17 + (i % 2) * 2), y: y0 + k * 6 - 7 };
      const foot = { x: 28 + side * 25, y: y0 + k * 9 + 3 };
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(knee.x, knee.y);
      ctx.lineTo(foot.x, foot.y);
      ctx.lineWidth = 5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#7a2a5a';
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.ellipse(28, 35, 11, 13, 0, 0, Math.PI * 2);
  outlined(ctx, radial(ctx, 28, 33, 12, '#e8a0e0', '#7a2a8a'));
  ctx.beginPath();
  ctx.ellipse(28, 20, 8, 7, 0, 0, Math.PI * 2);
  outlined(ctx, radial(ctx, 28, 19, 8, '#f0b8e8', '#8a3a9a'), 2.5);
  eye(ctx, 24.5, 19, 3);
  eye(ctx, 31.5, 19, 3);
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

/**
 * Largeur visible du corps (px de texture) de chaque dessin procédural d'alien : sert à le mettre à l'échelle de la hitbox
 * (`proceduralScale`). Un dessin absent d'ici garde l'échelle 1.
 */
const PROCEDURAL_BODY_WIDTH: Record<string, number> = {
  alien_slime: 36,
  alien_gling: 36,
  alien_kamikaze: 36,
  alien_toad: 36,
  alien_burner: 36,
  alien_shaman: 36,
  alien_wall: 36,
  alien_spitter: 36,
  alien_iceballer: 36,
  alien_shooter: 54,
  alien_charger: 56,
  alien_spider: 50,
  alien_bubble: 52,
  alien_lurker: 46,
  alien_fire_orb: 34,
  alien_ice_orb: 34,
  alien_boss_egg: 46,
  alien_boss_gling: 97,
  alien_boss_rhino: 108,
  alien_boss_rhino_fire: 108,
  alien_boss_rhino_ice: 108,
  alien_boss_scarab: 150,
  alien_boss_crab: 120,
};

/** Diamètre affiché du dessin procédural, en rayons de hitbox (la hitbox est le cercle de collision : le corps la déborde un peu). */
const PROCEDURAL_DIAMETERS = 2.4;

/**
 * Clé de texture du dessin procédural d'un visuel d'alien. L'œuf est une image du manifeste sous le même id (`alien_boss_egg`) : son dessin
 * procédural a donc une clé à part, sinon l'image qui arrive avec le paquet 2a trouverait la clé déjà prise et ne remplacerait rien.
 */
export const proceduralKey = (spriteId: string): string => (spriteId === 'alien_boss_egg' ? 'alien_boss_egg_proc' : spriteId);

/** Échelle d'affichage du dessin procédural d'un alien (`alien_<id>`) pour que son corps suive la taille de sa hitbox. */
export function proceduralScale(spriteId: string, radius: number): number {
  const body = PROCEDURAL_BODY_WIDTH[spriteId];
  return body ? (radius * PROCEDURAL_DIAMETERS) / body : 1;
}

/** Œuf de boss : œuf vert pâle moucheté de taches sombres, reflet et contour (replis du paquet 2a). Canvas 64 × 80. */
function egg(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(32, 5);
  ctx.bezierCurveTo(52, 5, 59, 38, 59, 50);
  ctx.bezierCurveTo(59, 66, 47, 76, 32, 76);
  ctx.bezierCurveTo(17, 76, 5, 66, 5, 50);
  ctx.bezierCurveTo(5, 38, 12, 5, 32, 5);
  ctx.closePath();
  outlined(ctx, radial(ctx, 32, 40, 32, '#eaf8a8', '#7fae2a'), 3.5);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(70,110,20,0.55)';
  for (const [x, y, rx, ry] of [[22, 28, 6, 4.5], [41, 36, 5, 4], [30, 52, 7, 5], [46, 58, 4.5, 3.5], [16, 56, 4, 3.5], [36, 18, 3.5, 3]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(21, 26, 4.5, 11, 0.35, 0, Math.PI * 2);
  ctx.fill();
}

export function makeAlienTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, proceduralKey('alien_boss_egg'), 64, 80, egg);
  canvasTexture(scene, 'alien_slime', 48, 48, (ctx) => slime(ctx));
  canvasTexture(scene, 'alien_shooter', 72, 72, (ctx) => {
    ctx.scale(1.5, 1.5);
    slime(ctx, '#b8dcff', '#3a78d8');
  });
  canvasTexture(scene, 'alien_iceballer', 48, 48, (ctx) => slime(ctx, '#e4f8ff', '#3fb0ee'));
  // Orbe de glace (projectile destructible du slime de glace) : sphère bleu glacier, reflet, éclats de givre, contour foncé.
  // Orbe de feu (projectile destructible des rhinos jumeaux) : boule orange incandescente, cœur jaune, langues de flamme, contour brun.
  canvasTexture(scene, 'alien_fire_orb', 40, 40, (ctx) => {
    const g = ctx.createRadialGradient(17, 16, 2, 20, 20, 17);
    g.addColorStop(0, '#fff6b0');
    g.addColorStop(0.4, '#ffb02e');
    g.addColorStop(1, '#e4421a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(20, 20, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd24a'; // petites langues de flamme sur le dessus
    for (let k = 0; k < 5; k++) {
      const t = -Math.PI / 2 + (k - 2) * 0.5;
      ctx.beginPath();
      ctx.moveTo(20 + Math.cos(t - 0.18) * 13, 20 + Math.sin(t - 0.18) * 13);
      ctx.lineTo(20 + Math.cos(t) * 20, 20 + Math.sin(t) * 20);
      ctx.lineTo(20 + Math.cos(t + 0.18) * 13, 20 + Math.sin(t + 0.18) * 13);
      ctx.fill();
    }
    ctx.strokeStyle = '#5c1d0c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(20, 20, 16, 0, Math.PI * 2);
    ctx.stroke();
  });
  canvasTexture(scene, 'alien_ice_orb', 40, 40, (ctx) => {
    const g = ctx.createRadialGradient(15, 14, 2, 20, 20, 17);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, '#bdeeff');
    g.addColorStop(1, '#3f9fdc');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(20, 20, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e8fbff'; // givre : petites branches de flocon
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      const t = (k / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(20 + Math.cos(t) * 4, 20 + Math.sin(t) * 4);
      ctx.lineTo(20 + Math.cos(t) * 11, 20 + Math.sin(t) * 11);
      ctx.stroke();
    }
    ctx.strokeStyle = '#1d3d5c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(20, 20, 16, 0, Math.PI * 2);
    ctx.stroke();
  });
  // Fissures du glaçon, par étage (1 à 3, cumulatives : l'étage 2 contient celles de l'étage 1) : traits bleu sombre doublés d'un reflet blanc, sur la même grille 64×64 que le glaçon.
  for (let stage = 1; stage <= 3; stage++) {
    canvasTexture(scene, `alien_iceblock_cracks_${stage}`, 64, 64, (ctx) => {
      let seed = 0x3c6ef372;
      const rnd = (): number => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const count = [0, 3, 6, 10][stage];
      for (let i = 0; i < 10; i++) {
        // tous les traits sont tirés dans le même ordre : seuls les `count` premiers sont dessinés (étages cumulatifs)
        const a = (i / 10) * Math.PI * 2 + rnd() * 0.5;
        const pts: [number, number][] = [];
        let r = 27 - rnd() * 4;
        for (let s = 0; s < 4; s++) {
          const jitter = (rnd() - 0.5) * 0.5;
          pts.push([32 + Math.cos(a + jitter) * r, 32 + Math.sin(a + jitter) * r]);
          r -= 4 + rnd() * 5;
        }
        if (i >= count) continue;
        for (const [color, width, dx] of [['rgba(30,80,140,0.9)', 2, 0], ['rgba(255,255,255,0.85)', 1, 1]] as const) {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.beginPath();
          pts.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x + dx, y) : ctx.lineTo(x + dx, y)));
          ctx.stroke();
        }
      }
    });
  }
  // Glaçon : cube de glace translucide (le soldat gelé se voit à travers), facettes claires et reflets.
  canvasTexture(scene, 'alien_iceblock', 64, 64, (ctx) => {
    const g = ctx.createLinearGradient(8, 6, 56, 58);
    g.addColorStop(0, 'rgba(235,250,255,0.78)');
    g.addColorStop(0.5, 'rgba(150,215,255,0.52)');
    g.addColorStop(1, 'rgba(90,170,240,0.7)');
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(225,246,255,0.95)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(14, 8);
    ctx.lineTo(50, 6);
    ctx.lineTo(58, 20);
    ctx.lineTo(56, 52);
    ctx.lineTo(44, 60);
    ctx.lineTo(12, 58);
    ctx.lineTo(5, 44);
    ctx.lineTo(7, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 14);
    ctx.lineTo(24, 12);
    ctx.moveTo(12, 24);
    ctx.lineTo(12, 36);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(46, 18, 4, 9, 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  canvasTexture(scene, 'alien_gling', 48, 48, (ctx) => slime(ctx, '#ffc4e0', '#e0559a'));
  canvasTexture(scene, 'alien_charger', 66, 52, (ctx) => beast(ctx, '#e09a9a', '#a33030', '#7a2020'));
  canvasTexture(scene, 'alien_kamikaze', 48, 48, (ctx) => slime(ctx, '#ffd9a8', '#e0702a'));
  canvasTexture(scene, 'alien_toad', 48, 48, (ctx) => slime(ctx, '#c0f5e4', '#2aa88a'));
  // Repli du paquet 2a : araignée (invoquée par la Gling Mère, le chaman et le Giant Crab) et Gling Mère, affichées d'ici l'arrivée de leur planche.
  canvasTexture(scene, 'alien_spider', 56, 56, spider);
  canvasTexture(scene, 'alien_boss_gling', 130, 130, (ctx) => {
    ctx.scale(2.7, 2.7);
    slime(ctx, '#ffb0c0', '#c0203a');
    // couronne de reine sur la tête
    ctx.beginPath();
    ctx.moveTo(13, 9);
    ctx.lineTo(15, 1);
    ctx.lineTo(19, 6);
    ctx.lineTo(24, 0);
    ctx.lineTo(29, 6);
    ctx.lineTo(33, 1);
    ctx.lineTo(35, 9);
    ctx.closePath();
    outlined(ctx, '#ffd84a', 1.6);
  });
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
  canvasTexture(scene, 'alien_boss_rhino', 119, 94, (ctx) => {
    ctx.scale(1.8, 1.8);
    beast(ctx, '#d98a8a', '#8c1f1f', '#5a1414');
  });
  // Rhinos jumeaux : le rhinocéros recoloré, braise (feu) et givre (glace).
  canvasTexture(scene, 'alien_boss_rhino_fire', 119, 94, (ctx) => {
    ctx.scale(1.8, 1.8);
    beast(ctx, '#ffc27a', '#e0400f', '#8a2208');
  });
  canvasTexture(scene, 'alien_boss_rhino_ice', 119, 94, (ctx) => {
    ctx.scale(1.8, 1.8);
    beast(ctx, '#e0f6ff', '#3a9be0', '#1f5f9a');
  });
  canvasTexture(scene, 'alien_boss_scarab', 182, 157, (ctx) => {
    ctx.scale(1.4, 1.4);
    crab(ctx);
  });
  canvasTexture(scene, 'alien_burner', 48, 48, (ctx) => slime(ctx, '#ffd9a0', '#e04a10'));
  canvasTexture(scene, 'alien_shaman', 48, 48, (ctx) => slime(ctx, '#fff6b0', '#d8a020'));
  // Lurker : carapace violette hérissée de pics d'os, un oeil.
  canvasTexture(scene, 'alien_lurker', 56, 48, (ctx) => {
    for (let i = 0; i < 6; i++) {
      const x = 10 + i * 7.2;
      ctx.beginPath();
      ctx.moveTo(x - 4, 22);
      ctx.lineTo(x, 2 + (i % 2) * 4);
      ctx.lineTo(x + 4, 22);
      ctx.closePath();
      outlined(ctx, '#efe3c4', 2);
    }
    ctx.beginPath();
    ctx.ellipse(28, 30, 22, 14, 0, 0, Math.PI * 2);
    outlined(ctx, radial(ctx, 28, 28, 18, '#b08ad8', '#5a3a86'));
    for (const x of [14, 24, 34, 44]) {
      ctx.beginPath();
      ctx.ellipse(x, 42, 4, 3.5, 0, 0, Math.PI * 2);
      outlined(ctx, '#4a2f70', 2);
    }
    eye(ctx, 37, 28, 6);
  });
  canvasTexture(scene, 'alien_wall', 48, 48, (ctx) => slime(ctx, '#d8c8b0', '#8a6a48'));
  canvasTexture(scene, 'alien_spitter', 48, 48, (ctx) => slime(ctx, '#e3c8ff', '#8a3fd0'));
  canvasTexture(scene, 'alien_boss_crab', 130, 112, crab);
}
