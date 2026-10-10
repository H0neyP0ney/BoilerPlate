import type Phaser from 'phaser';
import { canvasTexture } from '@xiao/engine';
import { DAMAGE_TIERS } from '../data/damageTiers';

/** Rangée de 3 pics du lurker : nombre de directions pré-dessinées par demi-tour, écart (px) entre deux pics, hauteur d'un pic, taille de la texture et ordonnée de la base du pic central. */
export const SPIKE_BINS = 12;
export const SPIKE3 = { spread: 44 / 3, height: 36, w: 48, h: 72, baseY: 53 } as const;

/** Fissures noires au sol après une explosion (`fx_cracks_<n>`) : nombre de variantes dessinées et côté (px) de chaque texture carrée. Les fissures touchent presque le bord. */
export const CRACK_VARIANTS = 3;
export const CRACK_SIZE = 256;
/** Traces de brûlure noir / gris sous les fissures (`fx_scorch_<n>`, même côté que les fissures). */
export const SCORCH_VARIANTS = 2;

/** Trace de brûlure : taches de suie superposées (centre noir, bord gris qui se dissout) et quelques éclaboussures ; seedée comme les fissures. */
function drawScorch(ctx: CanvasRenderingContext2D, variant: number): void {
  let seed = 0x7f4a7c15 ^ (variant * 0x27d4eb2f);
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const c = CRACK_SIZE / 2;
  const R = c - 4;
  const blob = (x: number, y: number, r: number, core: number, mid: number): void => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(8,8,8,${core})`);
    g.addColorStop(0.55, `rgba(42,40,40,${mid})`);
    g.addColorStop(1, 'rgba(60,58,58,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(c, c, R * 0.72, 0.8, 0.45); // le gros de la tache, centré
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * R * 0.5;
    blob(c + Math.cos(a) * d, c + Math.sin(a) * d, R * (0.3 + rnd() * 0.4), 0.5, 0.3); // lobes irréguliers
  }
  ctx.fillStyle = 'rgba(20,20,20,0.55)';
  for (let i = 0; i < 14; i++) { // 14 éclaboussures (46 avant), plus grosses
    const a = rnd() * Math.PI * 2;
    const d = R * (0.45 + rnd() * 0.5);
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 2.5 + rnd() * 6, 0, Math.PI * 2);
    ctx.fill(); // éclaboussures de suie autour
  }
}

/**
 * Fissures noires qui partent du centre : un halo brûlé très léger, puis des failles en zigzag qui s'amincissent vers leur bout, avec quelques
 * branches. Dessin déterministe par variante (générateur seedé) : pas de `Math.random`, mêmes textures à chaque lancement.
 */
function drawCracks(ctx: CanvasRenderingContext2D, variant: number): void {
  let seed = 0x9e3779b1 ^ (variant * 0x85ebca6b);
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const c = CRACK_SIZE / 2;
  const R = c - 6; // longueur maximale d'une faille
  const halo = ctx.createRadialGradient(c, c, 0, c, c, R * 0.55);
  halo.addColorStop(0, 'rgba(0,0,0,0.55)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, CRACK_SIZE, CRACK_SIZE);
  ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  /** Une faille en zigzag de (x, y) vers l'angle `a` sur `len` px : épaisseur `w0` au départ, 1 px au bout ; `branches` : sous-failles possibles. */
  const crack = (x: number, y: number, a: number, len: number, w0: number, branches: number): void => {
    const steps = Math.max(3, Math.round(len / 24)); // peu de segments : failles plus nettes, moins découpées
    let px = x;
    let py = y;
    for (let i = 1; i <= steps; i++) {
      a += (rnd() - 0.5) * 0.6; // le zigzag, plus doux
      const step = len / steps;
      const nx = px + Math.cos(a) * step;
      const ny = py + Math.sin(a) * step;
      ctx.lineWidth = Math.max(1, w0 * (1 - (i - 1) / steps));
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      px = nx;
      py = ny;
      if (branches > 0 && i > 1 && i < steps - 1 && rnd() < 0.12) crack(px, py, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), len * (0.25 + rnd() * 0.3) * (1 - i / steps) * 1.6, ctx.lineWidth * 0.7, branches - 1);
    }
  };
  const n = 5 + Math.floor(rnd() * 2); // 5 ou 6 failles (8 à 10 avant), une seule génération de branches
  for (let k = 0; k < n; k++) crack(c, c, ((k + rnd() * 0.6) / n) * Math.PI * 2, R * (0.55 + rnd() * 0.45), 6 + rnd() * 3, 1);
}

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
  // Tir de blaster : traînée qui s'éclaircit vers la tête, cœur blanc. Dessiné pointant à droite (tête à droite).
  // Une texture par palier de dégâts (data/damageTiers.ts) : bleu d'origine, puis vert, jaune, orangé, violet, rouge.
  for (const tier of DAMAGE_TIERS) {
    const [gr, gg, gb] = tier.glow;
    const [hr, hg, hb] = tier.head;
    canvasTexture(scene, tier.texture, 42, 16, (ctx) => {
      const glow = ctx.createLinearGradient(0, 0, 42, 0);
      glow.addColorStop(0, `rgba(${gr},${gg},${gb},0)`);
      glow.addColorStop(0.65, `rgba(${gr},${gg},${gb},0.8)`);
      glow.addColorStop(1, `rgba(${hr},${hg},${hb},0.95)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(21, 8, 21, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      const core = ctx.createLinearGradient(6, 0, 40, 0);
      core.addColorStop(0, `rgba(${hr},${hg},${hb},0)`);
      core.addColorStop(1, '#ffffff');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.ellipse(23, 8, 18, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  canvasTexture(scene, 'fx_bolt_green', 20, 10, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 20, 0);
    g.addColorStop(0, 'rgba(90,255,140,0)');
    g.addColorStop(1, '#e8ffe8');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(10, 5, 10, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  canvasTexture(scene, 'fx_rocket', 34, 14, (ctx) => {
    // fusée du power-up, pointe vers la DROITE (tournée selon sa vitesse) : ailerons, corps clair, bande, ogive rouge, tuyère
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2a1d2e';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#d23a3a'; // ailerons
    ctx.beginPath();
    ctx.moveTo(4, 1.5);
    ctx.lineTo(11, 5);
    ctx.lineTo(11, 9);
    ctx.lineTo(4, 12.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f2f2f5'; // corps
    ctx.beginPath();
    ctx.roundRect(6, 4, 19, 6, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffb938'; // bande
    ctx.fillRect(14, 4.5, 3, 5);
    ctx.fillStyle = '#d23a3a'; // ogive
    ctx.beginPath();
    ctx.moveTo(24, 3.5);
    ctx.quadraticCurveTo(33, 7, 24, 10.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe066'; // flamme de la tuyère
    ctx.beginPath();
    ctx.moveTo(6, 5);
    ctx.lineTo(0, 7);
    ctx.lineTo(6, 9);
    ctx.closePath();
    ctx.fill();
  });
  canvasTexture(scene, 'fx_smoke', 32, 32, (ctx) => {
    // bouffée de fumée : disque blanc opaque au bord à peine adouci
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.75, '#f4f4f4');
    g.addColorStop(1, 'rgba(240,240,240,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
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
  // Colonne de lumière verticale (arrivée d'une recrue) : claire au pied, transparente en haut, fondue sur les côtés.
  canvasTexture(scene, 'fx_column', 48, 220, (ctx) => {
    const v = ctx.createLinearGradient(0, 0, 0, 220);
    v.addColorStop(0, 'rgba(255,255,255,0)');
    v.addColorStop(0.7, 'rgba(255,255,255,0.55)');
    v.addColorStop(1, 'rgba(255,255,255,0.95)');
    const h = ctx.createLinearGradient(0, 0, 48, 0);
    h.addColorStop(0, 'rgba(255,255,255,0)');
    h.addColorStop(0.5, 'rgba(255,255,255,1)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 48, 220);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 48, 220);
  });
  canvasTexture(scene, 'fx_dot', 12, 12, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(6, 6, 5.5, 0, Math.PI * 2);
    ctx.fill();
  });
  // Caillou posé au sol (obstacle temporaire) et son petit modèle en vol.
  const rock = (ctx: CanvasRenderingContext2D, s: number): void => {
    const c = s / 2;
    ctx.beginPath();
    ctx.moveTo(c - s * 0.42, c + s * 0.15);
    ctx.lineTo(c - s * 0.3, c - s * 0.3);
    ctx.lineTo(c + s * 0.05, c - s * 0.44);
    ctx.lineTo(c + s * 0.4, c - s * 0.2);
    ctx.lineTo(c + s * 0.44, c + s * 0.22);
    ctx.lineTo(c + s * 0.05, c + s * 0.4);
    ctx.closePath();
    ctx.fillStyle = '#8a7d74';
    ctx.strokeStyle = '#2a2220';
    ctx.lineWidth = Math.max(2, s / 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#b5a89c';
    ctx.beginPath();
    ctx.moveTo(c - s * 0.3, c - s * 0.3);
    ctx.lineTo(c + s * 0.05, c - s * 0.44);
    ctx.lineTo(c + s * 0.1, c - s * 0.12);
    ctx.lineTo(c - s * 0.25, c - s * 0.05);
    ctx.closePath();
    ctx.fill();
  };
  canvasTexture(scene, 'fx_rock', 48, 48, (ctx) => rock(ctx, 48));
  canvasTexture(scene, 'fx_rock_small', 20, 20, (ctx) => rock(ctx, 20));
  // Petite boule de crachat (cracheur) : vert lumineux (violet avant le 07/10 : le violet est réservé à son nuage ralentissant).
  canvasTexture(scene, 'fx_spit', 14, 14, (ctx) => {
    const g = ctx.createRadialGradient(5, 5, 1, 7, 7, 7);
    g.addColorStop(0, '#e6ffd0');
    g.addColorStop(0.5, '#62d04a');
    g.addColorStop(1, '#2a8a2a');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#0f3a12';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(7, 7, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  // Globe d'XP : orbe bleu lumineux à reflet clair (taille réglée à l'affichage selon sa valeur).
  canvasTexture(scene, 'fx_xp', 28, 28, (ctx) => {
    const g = ctx.createRadialGradient(11, 10, 1, 14, 14, 13);
    g.addColorStop(0, '#d8f2ff');
    g.addColorStop(0.25, '#3fa8ff');
    g.addColorStop(1, '#0b3fd0');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#06227a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(14, 14, 11.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  // Boule de gelée bleue lancée par le gros slime : blob sombre cerclé, reflet clair.
  // Blob de gelée verte (crabe géant) : plus gros que la boule bleue, vert acide, reflet clair.
  // Flocon du slime bleu ciel (projectile de glace) : six branches à embranchements, contour bleu sombre, cœur clair.
  canvasTexture(scene, 'fx_ice_ball', 40, 40, (ctx) => {
    ctx.translate(20, 20);
    ctx.lineCap = 'round';
    const arms = (width: number, color: string): void => {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -17);
        ctx.moveTo(0, -9);
        ctx.lineTo(-5, -14);
        ctx.moveTo(0, -9);
        ctx.lineTo(5, -14);
        ctx.stroke();
        ctx.restore();
      }
    };
    arms(6, '#1c5a9a'); // contour
    arms(3, '#e8f8ff'); // branches
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1c5a9a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  canvasTexture(scene, 'fx_blob_green', 34, 34, (ctx) => {
    const g = ctx.createRadialGradient(13, 12, 1, 17, 17, 16);
    g.addColorStop(0, '#f0ffd0');
    g.addColorStop(0.35, '#7be23a');
    g.addColorStop(1, '#2f8a1a');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#17420d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(17, 18, 13.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(12, 12, 4, 2.6, -0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  canvasTexture(scene, 'fx_blob_red', 34, 34, (ctx) => {
    const g = ctx.createRadialGradient(13, 12, 1, 17, 17, 16);
    g.addColorStop(0, '#ffd6d6');
    g.addColorStop(0.35, '#e0383a');
    g.addColorStop(1, '#8a1218');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#420a0d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(17, 18, 13.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(12, 12, 4, 2.6, -0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  canvasTexture(scene, 'fx_slime_ball', 26, 26, (ctx) => {
    const g = ctx.createRadialGradient(10, 9, 1, 13, 13, 12);
    g.addColorStop(0, '#ffc0cc');
    g.addColorStop(0.35, '#b02a4a');
    g.addColorStop(1, '#6e1230');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#3a0818';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(13, 14, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(9.5, 9.5, 3, 2, -0.6, 0, Math.PI * 2);
    ctx.fill();
  });
  // Petit bloc de glace (éclat d'un glaçon touché) : losange bleu clair facetté, reflet blanc, contour foncé.
  canvasTexture(scene, 'fx_ice_chunk', 14, 14, (ctx) => {
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(7, 1.5);
    ctx.lineTo(12.5, 6);
    ctx.lineTo(8.5, 12.5);
    ctx.lineTo(2, 9.5);
    ctx.lineTo(2.5, 4);
    ctx.closePath();
    ctx.fillStyle = '#9fe3ff';
    ctx.fill();
    ctx.fillStyle = '#e8f8ff'; // face éclairée
    ctx.beginPath();
    ctx.moveTo(7, 1.5);
    ctx.lineTo(12.5, 6);
    ctx.lineTo(7.5, 7);
    ctx.lineTo(2.5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1d3d5c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(7, 1.5);
    ctx.lineTo(12.5, 6);
    ctx.lineTo(8.5, 12.5);
    ctx.lineTo(2, 9.5);
    ctx.lineTo(2.5, 4);
    ctx.closePath();
    ctx.stroke();
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
  for (let v = 0; v < CRACK_VARIANTS; v++) canvasTexture(scene, `fx_cracks_${v}`, CRACK_SIZE, CRACK_SIZE, (ctx) => drawCracks(ctx, v));
  for (let v = 0; v < SCORCH_VARIANTS; v++) canvasTexture(scene, `fx_scorch_${v}`, CRACK_SIZE, CRACK_SIZE, (ctx) => drawScorch(ctx, v));
  // Rangée de 3 pics du lurker (une texture par direction, `SPIKE_BINS` par demi-tour) : les 3 pointes sont alignées sur la perpendiculaire à la ligne de pics,
  // le tout dessiné une fois ; le jeu pose un sprite par colonne au lieu de redessiner des triangles à chaque frame.
  for (let k = 0; k < SPIKE_BINS; k++) {
    const th = (k * Math.PI) / SPIKE_BINS;
    canvasTexture(scene, `fx_spike3_${k}`, SPIKE3.w, SPIKE3.h, (ctx) => {
      ctx.fillStyle = '#e8dcc0';
      ctx.strokeStyle = '#2a1d14'; // contour foncé : les pics se détachent du sol
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      // du plus éloigné (haut de l'image) au plus proche : le contour d'un pic de devant passe sur celui de derrière
      const bases = [-SPIKE3.spread, 0, SPIKE3.spread]
        .map((o) => ({ bx: SPIKE3.w / 2 - Math.sin(th) * o, by: SPIKE3.baseY + Math.cos(th) * o }))
        .sort((p, q) => p.by - q.by);
      for (const { bx, by } of bases) {
        ctx.beginPath();
        ctx.moveTo(bx - 6, by);
        ctx.lineTo(bx + 6, by);
        ctx.lineTo(bx, by - SPIKE3.height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });
  }
  // Tourbillon d'étourdissement : spirale jaune à contour sombre, qui tourne au-dessus de la tête.
  canvasTexture(scene, 'fx_stun', 32, 32, (ctx) => {
    const spiral = (): void => {
      ctx.beginPath();
      for (let t = 0; t <= 4.2 * Math.PI; t += 0.15) {
        const r = 1.5 + t * 1.8;
        const x = 16 + Math.cos(t) * r;
        const y = 16 + Math.sin(t) * r;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3a2a08';
    ctx.lineWidth = 6.5;
    spiral();
    ctx.strokeStyle = '#ffe14a';
    ctx.lineWidth = 3.2;
    spiral();
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
