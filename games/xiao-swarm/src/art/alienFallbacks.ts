import type Phaser from 'phaser';
import { canvasTexture } from '@xiao/engine';

/**
 * Dessins procéduraux de repli des aliens (affichés tant que la planche du paquet 2 n'est pas arrivée), calés sur les vraies textures :
 * forme, couleurs et proportions. Un seul générateur (`creature`) et une fiche par alien, tournés vers la DROITE comme tout dessin procédural.
 * Pour un nouvel alien : ajouter une fiche dans `SPECS` et sa largeur de corps dans `PROCEDURAL_BODY_WIDTH` (aliens.ts).
 */
const OUTLINE = '#2a1d2e';
type Pt = [number, number];
type Blob = [number, number, number]; // x, y, rayon

interface Spec {
  w: number;
  h: number;
  /** Corps : ellipse en dégradé (clair en haut à gauche). */
  body: { x: number; y: number; rx: number; ry: number; light: string; dark: string };
  /** Pattes, dessinées derrière le corps : `line` (articulées, n par côté) ou `stub` (n pieds ronds sous le corps). */
  legs?: { style: 'line' | 'stub'; n: number; color: string; rootY: number; half: number; len: number; thick: number };
  /** Taches à plat sur le corps. */
  spots?: { color: string; pts: Blob[] };
  /** Boules en relief (contour + reflet). */
  bumps?: { light: string; dark: string; pts: Blob[] };
  /** Yeux : `white` = œil blanc à pupille, sinon bille noire brillante ; couleur de l'iris optionnelle. */
  eyes?: { pts: Blob[]; white?: boolean; iris?: string };
  /** Cornes / piquants (polygones crème ou colorés), dessinés par-dessus le corps. */
  horns?: { color: string; polys: Pt[][] };
  /** Détails propres à l'alien, dessinés en dernier. */
  extra?: (ctx: CanvasRenderingContext2D) => void;
}

function outlined(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient, width = 3): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = OUTLINE;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function shade(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, dark: string): CanvasGradient {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  return g;
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry = rx): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function drawLegs(ctx: CanvasRenderingContext2D, s: Spec): void {
  const l = s.legs;
  if (!l) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (l.style === 'stub') {
    for (let i = 0; i < l.n; i++) {
      disc(ctx, s.body.x + (i / (l.n - 1) - 0.5) * 2 * l.half, l.rootY, l.thick / 2, l.len / 2 + l.thick / 4);
      outlined(ctx, l.color, 2.5);
    }
    return;
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < l.n; i++) {
      const k = i - (l.n - 1) / 2;
      const x0 = s.body.x + side * l.half * 0.25;
      const y0 = l.rootY + k * 2;
      const knee: Pt = [s.body.x + side * l.half * (0.75 + 0.12 * (i % 2)), y0 + k * 3 - l.len * 0.5];
      const foot: Pt = [s.body.x + side * l.half * (1 + 0.1 * Math.abs(k)), y0 + k * 4 + l.len * 0.35];
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(knee[0], knee[1]);
      ctx.lineTo(foot[0], foot[1]);
      ctx.lineWidth = l.thick + 2.5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.lineWidth = l.thick;
      ctx.strokeStyle = l.color;
      ctx.stroke();
    }
  }
}

function drawBlobs(ctx: CanvasRenderingContext2D, pts: Blob[], light: string, dark: string): void {
  for (const [x, y, r] of pts) {
    disc(ctx, x, y, r);
    outlined(ctx, shade(ctx, x, y, r, light, dark), 2);
  }
}

function creature(ctx: CanvasRenderingContext2D, s: Spec): void {
  drawLegs(ctx, s);
  const b = s.body;
  disc(ctx, b.x, b.y, b.rx, b.ry);
  outlined(ctx, shade(ctx, b.x, b.y, Math.max(b.rx, b.ry), b.light, b.dark), 3);
  if (s.spots) {
    ctx.save();
    disc(ctx, b.x, b.y, b.rx, b.ry);
    ctx.clip();
    ctx.fillStyle = s.spots.color;
    for (const [x, y, r] of s.spots.pts) {
      disc(ctx, x, y, r, r * 0.8);
      ctx.fill();
    }
    ctx.restore();
  }
  if (s.bumps) drawBlobs(ctx, s.bumps.pts, s.bumps.light, s.bumps.dark);
  if (s.horns) {
    for (const poly of s.horns.polys) {
      ctx.beginPath();
      poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      outlined(ctx, s.horns.color, 2.5);
    }
  }
  if (s.eyes) {
    for (const [x, y, r] of s.eyes.pts) {
      disc(ctx, x, y, r);
      outlined(ctx, s.eyes.white ? '#ffffff' : '#15101a', 2);
      if (s.eyes.white) {
        ctx.fillStyle = s.eyes.iris ?? '#15101a';
        disc(ctx, x + r * 0.25, y + r * 0.1, r * 0.58);
        ctx.fill();
        ctx.fillStyle = '#15101a';
        disc(ctx, x + r * 0.3, y + r * 0.1, r * 0.3);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      disc(ctx, x + r * 0.15, y - r * 0.3, r * 0.2);
      ctx.fill();
    }
  }
  s.extra?.(ctx);
}

/** Tentacule : trait épais courbe de (x0, y0) à (x1, y1) passant près de (cx, cy). */
function tentacle(ctx: CanvasRenderingContext2D, color: string, width: number, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): void {
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.lineWidth = width + 3;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** Cornes de rhinocéros d'un boss : une grande corne crème à droite. */
const rhinoHorn = (ctx: CanvasRenderingContext2D): void => {
  ctx.beginPath();
  ctx.moveTo(104, 40);
  ctx.quadraticCurveTo(122, 36, 124, 22);
  ctx.quadraticCurveTo(128, 46, 108, 58);
  ctx.closePath();
  outlined(ctx, '#f4e6c8', 2.5);
};

const rhino = (light: string, dark: string, bump: string, bumpDark: string, leg: string): Spec => ({
  w: 128,
  h: 83,
  legs: { style: 'stub', n: 4, color: leg, rootY: 68, half: 40, len: 12, thick: 16 },
  body: { x: 64, y: 44, rx: 50, ry: 28, light, dark },
  bumps: { light: bump, dark: bumpDark, pts: [[36, 24, 11], [58, 18, 12], [82, 22, 10], [46, 42, 9], [72, 40, 9]] },
  eyes: { pts: [[100, 40, 3.5]] },
  extra: rhinoHorn,
});

const SPECS: Record<string, Spec> = {
  alien_golden: {
    w: 82,
    h: 78,
    legs: { style: 'stub', n: 4, color: '#c9980a', rootY: 66, half: 24, len: 10, thick: 9 },
    body: { x: 41, y: 38, rx: 32, ry: 30, light: '#ffe98a', dark: '#c98f0a' },
    spots: { color: 'rgba(160,110,0,0.5)', pts: [[22, 20, 7], [50, 14, 6], [62, 38, 7], [42, 58, 6], [14, 44, 5]] },
    eyes: { pts: [[52, 34, 14]], white: true },
  },
  alien_slime: {
    w: 82,
    h: 78,
    legs: { style: 'stub', n: 4, color: '#56b83a', rootY: 66, half: 24, len: 10, thick: 9 },
    body: { x: 41, y: 38, rx: 32, ry: 30, light: '#a6ef6a', dark: '#2f8f2a' },
    spots: { color: 'rgba(30,110,30,0.5)', pts: [[22, 20, 7], [50, 14, 6], [62, 38, 7], [42, 58, 6], [14, 44, 5]] },
    eyes: { pts: [[52, 34, 14]], white: true },
  },
  alien_gling: {
    w: 64,
    h: 48,
    legs: { style: 'stub', n: 4, color: '#d85af0', rootY: 40, half: 18, len: 8, thick: 6 },
    body: { x: 30, y: 24, rx: 22, ry: 15, light: '#c260f4', dark: '#6a1fb0' },
    spots: { color: 'rgba(230,150,255,0.7)', pts: [[18, 16, 4], [30, 12, 4], [40, 18, 3.5], [24, 28, 3]] },
    eyes: { pts: [[48, 22, 6], [42, 29, 4.5]] },
    extra: (ctx) => {
      tentacle(ctx, '#d85af0', 2.5, 46, 14, 50, 6, 54, 6);
      tentacle(ctx, '#d85af0', 2.5, 40, 12, 42, 4, 47, 3);
    },
  },
  alien_kamikaze: {
    w: 65,
    h: 51,
    legs: { style: 'line', n: 3, color: '#e2561a', rootY: 36, half: 22, len: 14, thick: 3 },
    body: { x: 32, y: 28, rx: 25, ry: 16, light: '#fbd24a', dark: '#d98a1c' },
    bumps: { light: '#ffb040', dark: '#d9561a', pts: [[30, 12, 8], [44, 14, 6], [20, 18, 5.5]] },
    eyes: { pts: [[50, 30, 5]] },
  },
  alien_toad: {
    w: 66,
    h: 49,
    legs: { style: 'stub', n: 4, color: '#c42a68', rootY: 40, half: 20, len: 9, thick: 8 },
    body: { x: 30, y: 26, rx: 24, ry: 17, light: '#f0508a', dark: '#a81a58' },
    bumps: { light: '#f9a0b8', dark: '#d0407a', pts: [[18, 16, 4.5], [30, 12, 4], [40, 18, 4]] },
    extra: (ctx) => {
      disc(ctx, 50, 26, 11);
      outlined(ctx, shade(ctx, 50, 26, 11, '#ffd860', '#c8900c'), 2.5);
      disc(ctx, 52, 26, 6.5);
      outlined(ctx, '#3a2008', 1.5);
    },
  },
  alien_spitter: {
    w: 63,
    h: 54,
    legs: { style: 'line', n: 3, color: '#b02a80', rootY: 40, half: 18, len: 12, thick: 3 },
    body: { x: 30, y: 34, rx: 19, ry: 11, light: '#e04aa8', dark: '#8a1a6a' },
    eyes: { pts: [[42, 32, 2.5]] },
    extra: (ctx) => {
      tentacle(ctx, '#d03a9a', 7, 18, 34, 2, 28, 12, 8); // queue de scorpion qui se recourbe
      tentacle(ctx, '#d03a9a', 6, 12, 8, 22, 0, 32, 10);
      ctx.beginPath();
      ctx.moveTo(30, 8);
      ctx.lineTo(40, 16);
      ctx.lineTo(33, 14);
      ctx.closePath();
      outlined(ctx, '#f4e6c8', 2);
      tentacle(ctx, '#d03a9a', 6, 46, 34, 58, 32, 58, 44); // pince
    },
  },
  alien_shooter: {
    w: 66,
    h: 59,
    legs: { style: 'stub', n: 4, color: '#3a62d8', rootY: 50, half: 20, len: 10, thick: 9 },
    body: { x: 28, y: 32, rx: 22, ry: 19, light: '#4a78f0', dark: '#1f3aa0' },
    bumps: { light: '#6a98ff', dark: '#2a4cc0', pts: [[22, 14, 7], [36, 16, 5.5]] },
    eyes: { pts: [[40, 38, 2.5]] },
    extra: (ctx) => {
      ctx.beginPath();
      ctx.roundRect(36, 20, 28, 28, 8); // canon
      outlined(ctx, shade(ctx, 50, 34, 16, '#3a62d8', '#1a2c90'), 3);
      disc(ctx, 60, 34, 6, 10);
      outlined(ctx, '#0a1250', 2);
    },
  },
  alien_iceballer: {
    w: 68,
    h: 105,
    body: { x: 34, y: 32, rx: 26, ry: 26, light: '#8ae4f8', dark: '#1f98c8' },
    eyes: { pts: [[34, 32, 17]], white: true, iris: '#c0183a' },
    extra: (ctx) => {
      tentacle(ctx, '#3ab0d8', 6, 26, 54, 8, 76, 18, 98);
      tentacle(ctx, '#3ab0d8', 6, 38, 56, 52, 78, 46, 100);
      tentacle(ctx, '#3ab0d8', 5, 46, 52, 66, 66, 62, 88);
    },
  },
  alien_burner: {
    w: 65,
    h: 47,
    legs: { style: 'line', n: 4, color: '#f06a22', rootY: 32, half: 22, len: 14, thick: 3 },
    body: { x: 32, y: 24, rx: 24, ry: 15, light: '#f0601a', dark: '#8a1808' },
    spots: { color: 'rgba(60,10,6,0.6)', pts: [[20, 18, 6], [34, 14, 7], [44, 26, 5]] },
    eyes: { pts: [[48, 24, 3]] },
  },
  alien_shaman: {
    w: 64,
    h: 49,
    legs: { style: 'stub', n: 3, color: '#7a2ab0', rootY: 42, half: 14, len: 8, thick: 8 },
    body: { x: 30, y: 24, rx: 24, ry: 20, light: '#b04ae0', dark: '#5a1a90' },
    spots: { color: 'rgba(220,150,255,0.45)', pts: [[18, 14, 4], [28, 10, 3.5], [14, 24, 3]] },
    extra: (ctx) => {
      disc(ctx, 42, 28, 11, 10);
      outlined(ctx, '#2a0a3a', 2.5);
      ctx.fillStyle = '#ffe030';
      disc(ctx, 38, 28, 2.5);
      ctx.fill();
      disc(ctx, 46, 28, 2.5);
      ctx.fill();
      for (const x of [46, 54]) {
        ctx.beginPath(); // pinces crème
        ctx.moveTo(x, 36);
        ctx.quadraticCurveTo(x + 8, 40, x + 4, 48);
        ctx.quadraticCurveTo(x + 2, 42, x - 4, 40);
        ctx.closePath();
        outlined(ctx, '#f0d8a8', 2);
      }
    },
  },
  alien_wall: {
    w: 61,
    h: 45,
    legs: { style: 'line', n: 3, color: '#6a5e54', rootY: 32, half: 22, len: 12, thick: 4 },
    body: { x: 30, y: 25, rx: 24, ry: 15, light: '#b0a090', dark: '#5a4e44' },
    spots: { color: 'rgba(60,50,44,0.5)', pts: [[18, 20, 6], [40, 16, 7], [28, 30, 5]] },
    horns: { color: '#8a7a6a', polys: [[[12, 18], [16, 4], [22, 16]], [[26, 14], [32, 0], [38, 14]], [[40, 16], [48, 6], [50, 20]]] },
    extra: (ctx) => {
      disc(ctx, 34, 24, 5);
      outlined(ctx, shade(ctx, 34, 24, 5, '#ffd060', '#e08a10'), 2);
    },
  },
  alien_lurker: {
    w: 61,
    h: 43,
    legs: { style: 'line', n: 3, color: '#c02a5a', rootY: 30, half: 20, len: 12, thick: 3 },
    body: { x: 30, y: 26, rx: 22, ry: 13, light: '#e04a7a', dark: '#8a1a4a' },
    horns: { color: '#f4e6c8', polys: [[[14, 18], [18, 2], [24, 16]], [[26, 14], [32, 0], [38, 14]], [[38, 16], [46, 4], [48, 20]]] },
    eyes: { pts: [[44, 28, 3]] },
  },
  alien_bubble: {
    w: 64,
    h: 69,
    body: { x: 32, y: 24, rx: 25, ry: 21, light: '#b0ecff', dark: '#2ab0f0' },
    extra: (ctx) => {
      for (const [x0, x1] of [[16, 12], [26, 24], [38, 40], [48, 52]] as const) tentacle(ctx, '#3ac0f4', 6, x0, 38, x0 + (x1 - x0) * 0.2, 54, x1, 64);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      disc(ctx, 22, 14, 6, 4);
      ctx.fill();
    },
  },
  alien_charger: {
    w: 126,
    h: 97,
    legs: { style: 'line', n: 3, color: '#f0902a', rootY: 66, half: 44, len: 24, thick: 7 },
    body: { x: 62, y: 50, rx: 46, ry: 30, light: '#fbe450', dark: '#e0a010' },
    spots: { color: 'rgba(240,160,30,0.5)', pts: [[40, 56, 8], [76, 62, 7], [58, 36, 6]] },
    horns: { color: '#f0902a', polys: [[[28, 28], [22, 6], [42, 22]], [[52, 20], [56, 2], [68, 20]], [[78, 22], [88, 6], [92, 28]], [[96, 38], [116, 10], [112, 50]]] },
    eyes: { pts: [[88, 44, 6]] },
    extra: (ctx) => {
      ctx.strokeStyle = OUTLINE; // sourcil en colère
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(78, 36);
      ctx.lineTo(96, 42);
      ctx.stroke();
    },
  },
  alien_spider: {
    w: 64,
    h: 55,
    legs: { style: 'line', n: 4, color: '#d02828', rootY: 34, half: 24, len: 16, thick: 3 },
    body: { x: 30, y: 30, rx: 20, ry: 15, light: '#f05050', dark: '#a01818' },
    spots: { color: 'rgba(120,10,10,0.6)', pts: [[22, 24, 5], [34, 22, 5], [28, 36, 5]] },
    extra: (ctx) => {
      disc(ctx, 50, 32, 8, 7);
      outlined(ctx, shade(ctx, 50, 32, 8, '#f05050', '#a01818'), 2.5);
      ctx.fillStyle = '#15101a';
      disc(ctx, 53, 30, 2.5);
      ctx.fill();
    },
  },
  alien_boss_gling: {
    w: 135,
    h: 113,
    legs: { style: 'line', n: 4, color: '#d84860', rootY: 80, half: 54, len: 30, thick: 6 },
    body: { x: 66, y: 56, rx: 52, ry: 42, light: '#f0506a', dark: '#a01838' },
    bumps: { light: '#ffe0b0', dark: '#f0a060', pts: [[38, 24, 13], [62, 16, 14], [88, 22, 12], [50, 36, 10], [76, 36, 11], [100, 38, 8]] },
    eyes: { pts: [[82, 62, 17]], white: true, iris: '#e0a020' },
    extra: (ctx) => {
      disc(ctx, 84, 88, 14, 7);
      outlined(ctx, '#5a0820', 2.5);
    },
  },
  alien_boss_rhino: rhino('#5aa0f4', '#1f50b8', '#80c0ff', '#2f6ad0', '#2f6ad0'),
  alien_boss_rhino_fire: rhino('#ff6a4a', '#b81a14', '#ff9a6a', '#d83a20', '#d83a20'),
  alien_boss_rhino_ice: rhino('#e4f4fc', '#8ab4cc', '#f4fbff', '#a8cce0', '#a8cce0'),
  alien_boss_scarab: {
    w: 138,
    h: 114,
    legs: { style: 'line', n: 3, color: '#b85a1a', rootY: 84, half: 46, len: 30, thick: 8 },
    body: { x: 58, y: 54, rx: 46, ry: 42, light: '#e08a30', dark: '#7a3010' },
    horns: { color: '#e8963a', polys: [[[84, 40], [112, 14], [108, 58]]] },
    extra: (ctx) => {
      disc(ctx, 98, 72, 26, 28);
      outlined(ctx, shade(ctx, 98, 72, 28, '#e89a3c', '#8a3a14'), 3);
      ctx.fillStyle = '#15101a';
      ctx.beginPath();
      ctx.ellipse(108, 76, 9, 6, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      disc(ctx, 111, 74, 2);
      ctx.fill();
    },
  },
  alien_boss_crab: {
    w: 255,
    h: 208,
    legs: { style: 'line', n: 4, color: '#f0607a', rootY: 150, half: 100, len: 56, thick: 14 },
    body: { x: 128, y: 98, rx: 90, ry: 78, light: '#f05a70', dark: '#a01a3a' },
    bumps: { light: '#ffc8b0', dark: '#f09090', pts: [[84, 52, 12], [120, 36, 11], [160, 44, 12], [196, 70, 10], [68, 96, 9]] },
    horns: { color: '#f4e6c8', polys: [[[96, 40], [86, 10], [114, 34]], [[154, 36], [170, 8], [178, 42]]] },
    extra: (ctx) => {
      disc(ctx, 134, 126, 46, 32);
      outlined(ctx, '#3a0a18', 4);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        const x = 100 + i * 13;
        ctx.beginPath();
        ctx.moveTo(x, 100);
        ctx.lineTo(x + 6, 114);
        ctx.lineTo(x + 12, 100);
        ctx.fill();
      }
      ctx.fillStyle = '#f0788a';
      disc(ctx, 134, 142, 20, 8);
      ctx.fill();
    },
  },
};

/** Crée tous les dessins procéduraux d'aliens calés sur les textures. (l'œuf de boss n'en a pas : rien n'est affiché avant l'arrivée de son image). */
export function makeAlienFallbacks(scene: Phaser.Scene, keyOf: (spriteId: string) => string): void {
  for (const [id, spec] of Object.entries(SPECS)) canvasTexture(scene, keyOf(id), spec.w, spec.h, (ctx) => creature(ctx, spec));
}
