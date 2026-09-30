import { sprites } from '@xiao/engine';

/**
 * Réglages de placement des sprites édités dans la visionneuse d'unités (dev uniquement) :
 * ancrage de l'unité, ancrages par séquence / direction (`anchors`), taille de l'ombre (`shadow`), bouche du canon de l'unité (`muzzle`)
 * et par frame (`muzzles`). Mémorisés dans le navigateur et réappliqués au démarrage (BootScene) pour voir
 * le résultat en jeu. Une fois satisfait, « Copier le code » donne les lignes à coller dans
 * assets/manifest.ts (seule source livrée).
 */
const STORAGE_KEY = 'xiao-debug-sprites';

type Point = [number, number];

export interface Placement {
  originX?: number;
  originY?: number;
  muzzle?: Point;
  anchors?: Record<string, Point>;
  muzzles?: Record<string, (Point | null)[]>;
  /** Taille de l'ombre portée (1 = défaut). */
  shadow?: number;
}

let overrides: Record<string, Placement> = {};
/** Valeurs d'origine (manifeste) des sprites modifiés, pour « Réinitialiser ». */
const base = new Map<string, Placement>();

const read = (id: string): Placement => {
  const d = sprites.get(id);
  return { originX: d.originX, originY: d.originY, muzzle: d.muzzle, anchors: d.anchors, muzzles: d.muzzles, shadow: d.shadow };
};

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // stockage indisponible : les réglages ne survivent simplement pas au rechargement
  }
}

function apply(id: string, p: Placement): void {
  if (!base.has(id)) base.set(id, read(id));
  sprites.define(id, { ...sprites.get(id), ...p });
}

/** À appeler après l'enregistrement des sprites : réapplique les réglages mémorisés. */
export function loadSpriteOverrides(): void {
  if (!import.meta.env.DEV) return;
  try {
    overrides = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, Placement>;
  } catch {
    overrides = {};
  }
  for (const [id, p] of Object.entries(overrides)) if (sprites.has(id)) apply(id, p);
}

export function setPlacement(id: string, patch: Placement): void {
  apply(id, patch);
  overrides[id] = { ...overrides[id], ...patch };
  persist();
}

export function resetPlacement(id: string): void {
  const b = base.get(id);
  if (b) sprites.define(id, { ...sprites.get(id), ...b });
  delete overrides[id];
  persist();
}

/** Ancrage d'une séquence / direction (`walk`, `walk:left`) ; `null` l'efface (retour à l'ancrage hérité). */
export function setAnchor(id: string, key: string, value: Point | null): void {
  const anchors = { ...sprites.get(id).anchors };
  if (value) anchors[key] = value;
  else delete anchors[key];
  setPlacement(id, { anchors });
}

/** Bouche du canon d'une frame (`null` = retour au canon de l'unité). `frames` = nombre de frames de la séquence. */
export function setMuzzleFrame(id: string, anim: string, frame: number, value: Point | null, frames: number): void {
  const list: (Point | null)[] = Array.from({ length: frames }, (_, i) => sprites.get(id).muzzles?.[anim]?.[i] ?? null);
  list[frame] = value;
  commitMuzzles(id, anim, list);
}

/** Même bouche du canon sur toutes les frames de la séquence. */
export function fillMuzzle(id: string, anim: string, value: Point, frames: number): void {
  commitMuzzles(id, anim, Array.from({ length: frames }, () => value));
}

function commitMuzzles(id: string, anim: string, list: (Point | null)[]): void {
  while (list.length && list[list.length - 1] === null) list.pop();
  const muzzles = { ...sprites.get(id).muzzles };
  if (list.length) muzzles[anim] = list;
  else delete muzzles[anim];
  setPlacement(id, { muzzles });
}

const n = (v: number): number => Math.round(v * 1000) / 1000;
const pt = (p: Point): string => `[${n(p[0])}, ${n(p[1])}]`;

/** Lignes à coller dans l'entrée du sprite de assets/manifest.ts. */
export function placementSnippet(id: string): string {
  const d = sprites.get(id);
  const lines = [`originX: ${n(d.originX ?? 0.5)}, originY: ${n(d.originY ?? 0.5)},`];
  if (d.shadow !== undefined && d.shadow !== 1) lines.push(`shadow: ${n(d.shadow)},`);
  const anchors = Object.entries(d.anchors ?? {});
  if (anchors.length) lines.push(`anchors: { ${anchors.map(([k, v]) => `'${k}': ${pt(v)}`).join(', ')} },`);
  if (d.muzzle) lines.push(`muzzle: ${pt(d.muzzle)},`);
  const muzzles = Object.entries(d.muzzles ?? {});
  if (muzzles.length) {
    lines.push('muzzles: {');
    for (const [k, list] of muzzles) lines.push(`  ${k}: [${list.map((p) => (p ? pt(p) : 'null')).join(', ')}],`);
    lines.push('},');
  }
  return lines.join('\n');
}
