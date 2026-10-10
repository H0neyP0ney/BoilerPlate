import type Phaser from 'phaser';
import { DEPTH } from '../config';
import { FX } from '../fxParams';

/** Couleur du rond posé au sol sous chaque sorte de globe : le modèle est le même pour tous, seule la couleur change. */
export const RECRUIT_COLOR = 0xffe14a;
export const POWERUP_GREEN = 0x4cff7a;
export const UPGRADE_PINK = 0xffa8e6; // rose clair
/** Hauteur (px de texture) du centre du globe au-dessus du point au sol ; × `FX.recruit.displayScale` à l'écran. Commune à tous les globes. */
export const GLOBE_LIFT = 51;

export interface GlobeGlitter {
  /** Centre du globe ; `depth` : profondeur d'affichage ; `alpha` : opacité (clignotement en fin de vie). */
  setPosition(x: number, y: number, depth: number, alpha?: number): void;
  destroy(): void;
}

/**
 * Étoiles qui scintillent autour d'un globe au sol : apparaissent, grossissent puis s'éteignent en tournant (réglages `FX.recruit.star*`). C'est l'effet
 * d'origine de la recrue, appliqué à TOUS les globes : `texture` est l'étoile dorée de la recrue (`RECRUIT_STAR`) ou l'étoile de la couleur du
 * globe (images `star_<sorte>`, public/assets/globes/ : une par power-up, rose pour les globes d'upgrade ; `art/upgradeOrbs.ts`).
 */
export function createGlobeGlitter(scene: Phaser.Scene, x: number, y: number, texture: string): GlobeGlitter | null {
  if (!scene.textures.exists(texture)) return null;
  const f = FX.recruit;
  const r = f.starRadius;
  const stars = scene.add
    .particles(x, y, texture, {
      x: { min: -r, max: r },
      y: { min: -r * 1.2, max: r * 0.6 },
      speedY: { min: -f.starRise * 1.5, max: -f.starRise * 0.5 },
      scale: { values: [0, f.starScale, f.starScale * 0.6, 0], interpolation: 'catmull' }, // pop puis extinction
      alpha: { values: [0.4, 1, 1, 0], interpolation: 'linear' },
      rotate: { start: 0, end: 90 },
      lifespan: { min: f.starLifeMin, max: Math.max(f.starLifeMin, f.starLifeMax) },
      frequency: f.starEvery,
      blendMode: 'ADD',
    })
    .setDepth(DEPTH.actors + y + 1);
  return {
    setPosition(px, py, depth, alpha = 1) {
      stars.setPosition(px, py + f.starY).setDepth(depth).setAlpha(alpha);
    },
    destroy() {
      stars.destroy();
    },
  };
}
