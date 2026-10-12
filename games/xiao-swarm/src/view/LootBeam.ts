import Phaser from 'phaser';
import { canvasTexture } from '@xiao/engine';

/**
 * Colonne de lumière qui monte d'un loot rare posé au sol (relance, globes d'upgrade) : la convention des objets légendaires de Diablo 3. Deux images
 * additives de la même texture (un halo large et doux, un cœur étroit et vif), teintées à la couleur du loot, qui palpitent.
 */
const TEXTURE = 'fx_loot_beam';
/** Hauteur (px monde) de la colonne et largeurs du halo et du cœur. */
const BEAM = { height: 320, wide: 62, core: 20 };
/** Durée (s) de l'apparition en fondu. */
const FADE_IN = 0.4;
/** Rose franc de la colonne (le rose clair des globes se perd sur le sol orange en additif). */
export const BEAM_PINK = 0xff4fcf;
/** Colonne (et rond au sol) du booster prismatique : doré. */
export const BEAM_PRISM = 0xffd24a;

/** Texture de la colonne : blanche, opaque en bas, qui s'estompe vers le haut, bords doux. */
function ensureBeamTexture(scene: Phaser.Scene): void {
  canvasTexture(scene, TEXTURE, 64, 256, (ctx, w, h) => {
    const gx = ctx.createLinearGradient(0, 0, w, 0);
    gx.addColorStop(0, 'rgba(255,255,255,0)');
    gx.addColorStop(0.5, 'rgba(255,255,255,1)');
    gx.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gx;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in'; // fondu vertical : le haut disparaît
    const gy = ctx.createLinearGradient(0, 0, 0, h);
    gy.addColorStop(0, 'rgba(0,0,0,0)');
    gy.addColorStop(0.5, 'rgba(0,0,0,0.45)');
    gy.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gy;
    ctx.fillRect(0, 0, w, h);
  });
}

export interface LootBeam {
  /** `x`, `y` : point au sol ; `depth` : profondeur d'affichage ; `time` : horloge de l'affichage (palpitation et fondu d'apparition). */
  setPosition(x: number, y: number, depth: number, time: number): void;
  setVisible(on: boolean): void;
  destroy(): void;
}

/** Crée la colonne de lumière de couleur `color` (0xRRGGBB) ; `seed` décale la palpitation d'un loot à l'autre. */
export function createLootBeam(scene: Phaser.Scene, color: number, seed = 0): LootBeam {
  ensureBeamTexture(scene);
  // halo en fusion normale (en additif, le rose se perd sur le sol orange) ; cœur additif, plus lumineux
  const make = (width: number, tint: number, blend: Phaser.BlendModes): Phaser.GameObjects.Image =>
    scene.add.image(0, 0, TEXTURE).setOrigin(0.5, 1).setBlendMode(blend).setTint(tint).setDisplaySize(width, BEAM.height).setVisible(false);
  const halo = make(BEAM.wide, color, Phaser.BlendModes.NORMAL);
  const core = make(BEAM.core, 0xffe6f6, Phaser.BlendModes.ADD);
  let born = -1;
  return {
    setPosition(x, y, depth, time) {
      if (born < 0) born = time;
      const fade = Math.min(1, (time - born) / FADE_IN);
      const pulse = 0.82 + 0.18 * Math.sin(time * 4 + seed);
      halo.setPosition(x, y).setDepth(depth).setAlpha(0.7 * pulse * fade).setDisplaySize(BEAM.wide * (0.9 + 0.1 * pulse), BEAM.height);
      core.setPosition(x, y).setDepth(depth + 0.01).setAlpha(0.9 * pulse * fade);
    },
    setVisible(on) {
      halo.setVisible(on);
      core.setVisible(on);
    },
    destroy() {
      halo.destroy();
      core.destroy();
    },
  };
}
