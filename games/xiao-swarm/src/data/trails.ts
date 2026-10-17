/**
 * Trails (traînées) : un ruban coloré qui suit chaque soldat de la squad du joueur, visible par tous les joueurs (envoyé comme le skin, voir `Squad.trail`).
 * Boutique : onglet « Trails » de l'écran de skins, payées en diamants verts comme les skins (trois rangs de prix). Couleurs PROVISOIRES, à retravailler.
 */
import type { SkinTier } from './skins';

export type TrailId = 'red' | 'blue' | 'green' | 'pink' | 'cyan' | 'gold' | 'fire' | 'rainbow';

/** Prix (diamants) de chaque rang de trail (un peu moins cher qu'un skin du même rang). */
export const TRAIL_PRICES: Record<SkinTier, number> = { 0: 40, 1: 100, 2: 200 };

export interface TrailDef {
  id: TrailId;
  tier: SkinTier;
  /** Couleur(s) du ruban : de la tête (près du soldat) à la queue ; une seule = unie. */
  colors: number[];
  /** `rainbow` : la teinte tourne avec le temps et le long du ruban (`colors` ignoré). */
  rainbow?: boolean;
}

export const TRAILS: readonly TrailDef[] = [
  { id: 'red', tier: 0, colors: [0xff5a5a] },
  { id: 'blue', tier: 0, colors: [0x4aa8ff] },
  { id: 'green', tier: 0, colors: [0x5dff8a] },
  { id: 'pink', tier: 1, colors: [0xff7ad9, 0xc77dff] },
  { id: 'cyan', tier: 1, colors: [0x7dfff0, 0x4aa8ff] },
  { id: 'gold', tier: 1, colors: [0xffe14a, 0xffa21f] },
  { id: 'fire', tier: 2, colors: [0xffe14a, 0xff7a1f, 0xd0301f] },
  { id: 'rainbow', tier: 2, colors: [0xffffff], rainbow: true },
];

export const trailPrice = (t: TrailDef): number => TRAIL_PRICES[t.tier];
export const trailById = (id: string | null | undefined): TrailDef | undefined => TRAILS.find((t) => t.id === id);

/** Index réseau d'une trail : 0 = aucune, sinon rang dans `TRAILS` + 1. */
export const trailIndex = (id: string | null | undefined): number => TRAILS.findIndex((t) => t.id === id) + 1;
export const trailFromIndex = (i: number): string => TRAILS[i - 1]?.id ?? '';
