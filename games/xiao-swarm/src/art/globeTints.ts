import type { RecolorSpec } from '@xiao/engine';

/**
 * Teintes des globes au sol : le globe et l'étoile de chaque sorte sont l'or de la recrue (`recruit/globe.webp`, `ring.webp`, `star.webp`, paquet 1)
 * recoloré au lancement (`art/upgradeOrbs.ts`), comme les fonds des cartes d'upgrade ; aucune image par sorte. Une couleur par sorte : c'est aussi celle du
 * rond posé au sol, de l'onde et des éclats du ramassage (`POWERUP_INFO` de `view/PickupViews.ts`). Réglées dans la visionneuse de bonus (Save écrit ce fichier).
 * La relance (loot) prend la teinte `upgrade`.
 */
export const GLOBE_KINDS = ['stim', 'magnet', 'heal', 'stasis', 'rockets', 'turrets', 'prism', 'upgrade'] as const;
export type GlobeKind = (typeof GLOBE_KINDS)[number];

export const GLOBE_TINTS: Record<GlobeKind, number> = {
  stim: 0xff5a2a, // rouge orangé
  magnet: 0xcfe6ff, // blanc légèrement bleuté
  heal: 0x4cff7a, // vert
  stasis: 0x4aa8ff, // bleu
  rockets: 0xffb02a, // jaune orangé
  turrets: 0xa86bff, // violet
  prism: 0xffd24a, // booster prismatique : l'or d'origine de la recrue
  upgrade: 0xffa8e6, // rose clair (globes d'upgrade des œufs de boss, relance)
};

/** Teintes du code (dernière sauvegarde) : le Reset de la visionneuse y revient. */
export const GLOBE_TINT_DEFAULTS: Record<GlobeKind, number> = { ...GLOBE_TINTS };

/** Teinte (degrés) et clarté de l'or d'origine des pièces de la recrue : la recoloration est relative à eux (l'or lui-même ne bouge pas). */
const GOLD_HUE = 45;
const GOLD_LIGHT = 0.65;

function hslOf(color: number): [number, number, number] {
  const r = ((color >> 16) & 255) / 255;
  const g = ((color >> 8) & 255) / 255;
  const b = (color & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

/** Recoloration de l'or vers `color` : la teinte se décale, la saturation suit celle de la couleur, une couleur plus claire que l'or est éclaircie vers le blanc. */
export function globeRecolorSpec(color: number): RecolorSpec {
  const [h, s, l] = hslOf(color);
  return { shift: h - GOLD_HUE, saturation: s, lighten: Math.max(0, (l - GOLD_LIGHT) / (1 - GOLD_LIGHT)) };
}
