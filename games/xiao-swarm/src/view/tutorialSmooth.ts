import type { TutorialTarget } from '../sim/Tutorial';

/**
 * Lissage d'AFFICHAGE de la zone bleue des globes d'XP du tutoriel : la simulation la recalcule (centre et rayon) à chaque globe ramassé, donc le cercle et la flèche qui le
 * désigne sautaient d'un coup. Ici ils rejoignent la nouvelle valeur en douceur (approche exponentielle, `TAU` s, indépendante du nombre d'images par seconde). Partagé par
 * `WorldView` (le cercle) et `HudScene` (la flèche) : un seul état, avancé une fois par image de temps réel (un 2e appel dans la même image ne bouge plus rien). Vue seulement.
 */
const TAU = 0.15;

let state: { x: number; y: number; radius: number } | null = null;
let lastMs = 0;

/** Les cibles du tutoriel avec la zone des globes lissée (les autres cibles passent telles quelles). */
export function smoothTutorialTargets(targets: TutorialTarget[]): TutorialTarget[] {
  const zone = targets.find((t) => t.kind === 'orbs' && t.radius);
  if (!zone) {
    state = null; // plus de zone : la prochaine commence à sa vraie valeur
    return targets;
  }
  const now = performance.now();
  const dt = Math.min(0.25, Math.max(0, (now - lastMs) / 1000));
  lastMs = now;
  const goal = { x: zone.x, y: zone.y, radius: zone.radius! };
  if (!state) state = goal;
  else {
    const k = 1 - Math.exp(-dt / TAU);
    state = { x: state.x + (goal.x - state.x) * k, y: state.y + (goal.y - state.y) * k, radius: state.radius + (goal.radius - state.radius) * k };
  }
  return targets.map((t) => (t === zone ? { ...t, ...state! } : t));
}
