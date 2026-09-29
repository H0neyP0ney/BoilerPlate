import { Rng } from '@xiao/engine';
import type { MapDef } from '../data/maps';

/**
 * Sol procédural en deux temps, pour supporter les grandes cartes (battle royale) :
 *  1. `buildGround` génère une fois la liste des éléments (taches de sable,
 *     herbe, fleurs, cailloux, étangs) avec toute leur part d'aléatoire figée ;
 *  2. `drawGroundChunk` dessine un carré de carte en ne traçant que les éléments
 *     qui le touchent. L'affichage crée/détruit les morceaux autour de la caméra.
 */
const OUTLINE_SOFT = 'rgba(42,29,46,0.6)';

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type Blob = { x: number; y: number; rx: number; ry: number; k: number[] };

export type GroundFeature = Box &
  (
    | { kind: 'blob'; blob: Blob; fill: string }
    | { kind: 'tuft'; x: number; y: number; h: number[]; color: string }
    | { kind: 'flower'; x: number; y: number; color: string }
    | { kind: 'pebble'; x: number; y: number; r: number }
    | { kind: 'pond'; grass: Blob; shore: Blob; water: Blob; lilies: { x: number; y: number; r: number }[] }
  );

function makeBlob(rng: Rng, x: number, y: number, rx: number, ry: number, bumps: number): Blob {
  const k: number[] = [];
  for (let i = 0; i < bumps; i++) k.push(0.82 + rng.next() * 0.3);
  return { x, y, rx, ry, k };
}

function blobBox(b: Blob): Box {
  return { minX: b.x - b.rx * 1.15, maxX: b.x + b.rx * 1.15, minY: b.y - b.ry * 1.15, maxY: b.y + b.ry * 1.15 };
}

function tracePath(ctx: CanvasRenderingContext2D, b: Blob): void {
  ctx.beginPath();
  const n = b.k.length;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = b.k[i % n];
    const px = b.x + Math.cos(a) * b.rx * k;
    const py = b.y + Math.sin(a) * b.ry * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function buildGround(map: MapDef): GroundFeature[] {
  const { width: W, height: H, border: B } = map;
  const rng = new Rng(map.seed);
  const area = (W * H) / (2400 * 1800);
  const out: GroundFeature[] = [];
  const blob = (x: number, y: number, rx: number, ry: number, fill: string, bumps = 12) => {
    const b = makeBlob(rng, x, y, rx, ry, bumps);
    out.push({ kind: 'blob', blob: b, fill, ...blobBox(b) });
  };

  // variations du sable
  for (let i = 0; i < 260 * area; i++) {
    blob(rng.range(0, W), rng.range(0, H), rng.range(30, 110), rng.range(20, 70), rng.chance(0.5) ? 'rgba(214,170,92,0.35)' : 'rgba(240,210,140,0.35)', 10);
  }
  // herbe : bordure dense + taches dans l'arène
  const grass = (x: number, y: number, rx: number, ry: number) => {
    blob(x, y, rx + 8, ry + 8, '#6ea83c', 16);
    blob(x, y, rx, ry, '#88c04a', 16);
  };
  const perimeter = (2 * (W + H)) / (2 * (2400 + 1800));
  for (let i = 0; i < 90 * perimeter; i++) {
    const side = i % 4;
    const t = rng.next();
    const x = side === 0 ? rng.range(-40, B + 60) : side === 1 ? rng.range(W - B - 60, W + 40) : t * W;
    const y = side === 2 ? rng.range(-40, B + 60) : side === 3 ? rng.range(H - B - 60, H + 40) : t * H;
    grass(x, y, rng.range(90, 180), rng.range(70, 140));
  }
  for (let i = 0; i < 22 * area; i++) grass(rng.range(B, W - B), rng.range(B, H - B), rng.range(50, 140), rng.range(35, 90));

  for (let i = 0; i < 900 * area; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    out.push({
      kind: 'tuft',
      x,
      y,
      h: [7 + rng.next() * 3, 7 + rng.next() * 3, 7 + rng.next() * 3],
      color: rng.chance(0.5) ? 'rgba(80,140,50,0.8)' : 'rgba(110,160,60,0.7)',
      minX: x - 6,
      maxX: x + 6,
      minY: y - 12,
      maxY: y + 2,
    });
  }
  for (let i = 0; i < 160 * area; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    out.push({ kind: 'flower', x, y, color: rng.pick(['#ff8c3a', '#fff3c4', '#ff5a7a', '#ffd84a']), minX: x - 8, maxX: x + 8, minY: y - 8, maxY: y + 8 });
  }
  for (let i = 0; i < 260 * area; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    const r = rng.range(3, 8);
    out.push({ kind: 'pebble', x, y, r, minX: x - r * 1.4, maxX: x + r * 1.4, minY: y - r - 1, maxY: y + r + 1 });
  }
  for (const p of map.ponds) {
    const grassB = makeBlob(rng, p.x, p.y + 6, p.rx + 22, p.ry + 20, 18);
    const lilies = [];
    for (let i = 0; i < 6; i++) {
      lilies.push({ x: p.x + rng.range(-p.rx * 0.6, p.rx * 0.6), y: p.y + rng.range(-p.ry * 0.6, p.ry * 0.6), r: rng.range(8, 13) });
    }
    out.push({
      kind: 'pond',
      grass: grassB,
      shore: makeBlob(rng, p.x, p.y, p.rx + 8, p.ry + 8, 18),
      water: makeBlob(rng, p.x, p.y, p.rx, p.ry, 18),
      lilies,
      ...blobBox(grassB),
    });
  }
  return out;
}

/** Dessine la zone [x0, x0+size] × [y0, y0+size] de la carte dans `ctx` (coordonnées locales). */
export function drawGroundChunk(ctx: CanvasRenderingContext2D, features: GroundFeature[], x0: number, y0: number, size: number): void {
  ctx.fillStyle = '#e2bf72';
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(-x0, -y0);
  const x1 = x0 + size;
  const y1 = y0 + size;
  for (const f of features) {
    if (f.maxX < x0 || f.minX > x1 || f.maxY < y0 || f.minY > y1) continue;
    switch (f.kind) {
      case 'blob':
        tracePath(ctx, f.blob);
        ctx.fillStyle = f.fill;
        ctx.fill();
        break;
      case 'tuft':
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = -1; k <= 1; k++) {
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x + k * 4, f.y - f.h[k + 1]);
        }
        ctx.stroke();
        break;
      case 'flower':
        ctx.fillStyle = f.color;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a) * 3.5, f.y + Math.sin(a) * 3.5, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#ffd23a';
        ctx.beginPath();
        ctx.arc(f.x, f.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'pebble':
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, f.r * 1.3, f.r, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#8f8a96';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = OUTLINE_SOFT;
        ctx.stroke();
        break;
      case 'pond': {
        tracePath(ctx, f.grass);
        ctx.fillStyle = '#6ea83c';
        ctx.fill();
        tracePath(ctx, f.shore);
        ctx.fillStyle = '#c9e7d0';
        ctx.fill();
        const w = f.water;
        const g = ctx.createRadialGradient(w.x, w.y, 10, w.x, w.y, Math.max(w.rx, w.ry));
        g.addColorStop(0, '#2fb3c4');
        g.addColorStop(1, '#4fd6d6');
        tracePath(ctx, w);
        ctx.fillStyle = g;
        ctx.fill();
        for (const l of f.lilies) {
          ctx.beginPath();
          ctx.arc(l.x, l.y, l.r, 0.3, Math.PI * 2);
          ctx.lineTo(l.x, l.y);
          ctx.fillStyle = '#6fc04a';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#3f7a2a';
          ctx.stroke();
        }
        break;
      }
    }
  }
  ctx.restore();
}
