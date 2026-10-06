import { FX } from '../fxParams';

/** Étages de fissures dessinés (`alien_iceblock_cracks_1` à `_3`, art/aliens.ts). */
export const ICE_CRACK_STAGES = 3;

/**
 * Aspect d'un glaçon d'après sa part de PV restante (0 → 1) : il rétrécit jusqu'à `FX.ice.minScale` et se fissure par étages
 * (0 = intact, 1 à 3 = de plus en plus fissuré). Partagé par le jeu (`AlienView`) et la visionneuse de particules.
 */
export function iceLook(hpFrac: number): { scale: number; stage: number } {
  const f = FX.ice;
  const k = Math.max(0, Math.min(1, hpFrac));
  return { scale: f.minScale + (1 - f.minScale) * k, stage: k <= f.crack3 ? 3 : k <= f.crack2 ? 2 : k <= f.crack1 ? 1 : 0 };
}
