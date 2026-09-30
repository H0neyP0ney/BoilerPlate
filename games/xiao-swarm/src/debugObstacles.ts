import { OBSTACLES, STAIN_IDS, type HitCircle, type ObstacleId, type StainDef } from './data/obstacles';

/**
 * Réglages des obstacles édités dans la visionneuse d'obstacles (dev uniquement) : échelle d'affichage, hitbox et
 * jeu de taches. Mémorisés dans le navigateur et réappliqués au démarrage (BootScene, avant la création de la partie)
 * pour tester en jeu. Seul `data/obstacles.ts` est livré : « Copier le code » donne l'entrée à y coller.
 * Attention en ligne : deux pavés avec des hitbox différentes n'ont pas la même carte (réglages de dev seulement).
 */
const STORAGE_KEY = 'xiao-debug-obstacles';

interface Tuning {
  scale: number;
  hitbox: HitCircle[];
  stains: StainDef[];
}

const overrides: Partial<Record<ObstacleId, Tuning>> = {};
/** Valeurs d'origine (data/obstacles.ts) des obstacles modifiés, pour « Réinitialiser ». */
const base = new Map<ObstacleId, Tuning>();

const clone = (t: Tuning): Tuning => ({ scale: t.scale, hitbox: t.hitbox.map((c) => ({ ...c })), stains: t.stains.map((s) => ({ ...s })) });
const snapshot = (id: ObstacleId): Tuning => clone(OBSTACLES[id]);

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // stockage indisponible : les réglages ne survivent simplement pas au rechargement
  }
}

function apply(id: ObstacleId, t: Tuning): void {
  if (!base.has(id)) base.set(id, snapshot(id));
  const c = clone(t);
  OBSTACLES[id].scale = c.scale;
  OBSTACLES[id].hitbox = c.hitbox;
  OBSTACLES[id].stains = c.stains;
}

/** À appeler au démarrage, avant l'enregistrement des sprites et la création de la partie. */
export function loadObstacleOverrides(): void {
  if (!import.meta.env.DEV) return;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Record<ObstacleId, Partial<Tuning>>>;
    for (const id of Object.keys(saved) as ObstacleId[]) {
      const t = saved[id];
      if (!OBSTACLES[id] || !t || !Array.isArray(t.hitbox)) continue;
      // anciennes sauvegardes sans taches : on garde celles du fichier de données
      const stains = (Array.isArray(t.stains) ? t.stains : OBSTACLES[id].stains)
        .filter((s) => STAIN_IDS.includes(s.tex))
        .map((s) => ({ ...s, sy: typeof s.sy === 'number' ? s.sy : 1 })); // anciennes sauvegardes sans échelle Y
      const tuning: Tuning = { scale: t.scale ?? OBSTACLES[id].scale, hitbox: t.hitbox, stains };
      overrides[id] = tuning;
      apply(id, tuning);
    }
  } catch {
    // réglages illisibles : valeurs du fichier de données
  }
}

export function setObstacle(id: ObstacleId, patch: Partial<Tuning>): void {
  const next: Tuning = {
    scale: patch.scale ?? OBSTACLES[id].scale,
    hitbox: patch.hitbox ?? OBSTACLES[id].hitbox,
    stains: patch.stains ?? OBSTACLES[id].stains,
  };
  apply(id, next);
  overrides[id] = clone(next);
  persist();
}

export function resetObstacle(id: ObstacleId): void {
  const b = base.get(id);
  if (b) apply(id, b);
  delete overrides[id];
  persist();
}

const n = (v: number): number => Math.round(v * 10) / 10;

/** Entrée à coller dans OBSTACLES (data/obstacles.ts), hitbox et taches comprises. */
export function obstacleSnippet(id: ObstacleId): string {
  const d = OBSTACLES[id];
  const circles = d.hitbox.map((c) => `{ x: ${n(c.x)}, y: ${n(c.y)}, r: ${n(c.r)} }`);
  const lines = [
    `${id}: {`,
    `  id: '${id}',`,
    `  scale: ${Math.round(d.scale * 1000) / 1000},`,
    `  originX: ${d.originX},`,
    `  originY: ${d.originY},`,
    `  hitbox: [${circles.join(', ')}],`,
    '  stains: [',
  ];
  for (const s of d.stains) lines.push(`    { tex: '${s.tex}', x: ${n(s.x)}, y: ${n(s.y)}, w: ${n(s.w)}, sy: ${Math.round(s.sy * 100) / 100}, flip: ${s.flip} },`);
  lines.push('  ],', '},');
  return lines.join('\n');
}
