import type Phaser from 'phaser';
import { canvasTexture } from '@xiao/engine';
import { makeAlienFallbacks } from './alienFallbacks';

/** Aliens cartoon "kawaii" (GDD §10, §23) : dessins procéduraux de repli (`alienFallbacks.ts`), orbes-projectiles et glaçon. */

/**
 * Largeur visible du corps (px de texture) de chaque dessin procédural d'alien : sert à le mettre à l'échelle de la hitbox
 * (`proceduralScale`). Un dessin absent d'ici garde l'échelle 1.
 */
const PROCEDURAL_BODY_WIDTH: Record<string, number> = {
  alien_slime: 66,
  alien_golden: 66,
  alien_gling: 46,
  alien_kamikaze: 52,
  alien_toad: 54,
  alien_spitter: 52,
  alien_shooter: 58,
  alien_iceballer: 52,
  alien_burner: 50,
  alien_shaman: 50,
  alien_wall: 50,
  alien_lurker: 46,
  alien_bubble: 52,
  alien_charger: 100,
  alien_spider: 56,
  alien_fire_orb: 34,
  alien_ice_orb: 34,
  alien_boss_gling: 106,
  alien_boss_rhino: 104,
  alien_boss_rhino_fire: 104,
  alien_boss_rhino_ice: 104,
  alien_boss_scarab: 108,
  alien_boss_crab: 190,
};

/** Diamètre affiché du dessin procédural, en rayons de hitbox (la hitbox est le cercle de collision : le corps la déborde un peu). */
const PROCEDURAL_DIAMETERS = 2.4;

/**
 * Clé de texture du dessin procédural d'un visuel d'alien (la même que l'id du visuel).
 */
export const proceduralKey = (spriteId: string): string => spriteId;

/** Échelle d'affichage du dessin procédural d'un alien (`alien_<id>`) pour que son corps suive la taille de sa hitbox. */
export function proceduralScale(spriteId: string, radius: number): number {
  const body = PROCEDURAL_BODY_WIDTH[spriteId];
  return body ? (radius * PROCEDURAL_DIAMETERS) / body : 1;
}

export function makeAlienTextures(scene: Phaser.Scene): void {
  makeAlienFallbacks(scene, proceduralKey);
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
}
