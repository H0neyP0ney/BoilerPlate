import { PLAYER_HUE_SHIFT } from '../config';

/**
 * Skins de la squad (boutique de l'écran Solo, payés en diamants verts). Un skin décale la teinte des bleus des soldats et des têtes de recrue
 * (`shiftBlues`, comme la couleur des joueurs) : peau, arme et reste ne bougent pas. Hors ligne seulement : en ligne la couleur est celle de l'emplacement.
 * Trois rangs de prix (`SKIN_PRICES`), quatre skins par rang.
 */
export type SkinTier = 0 | 1 | 2;

/** Prix (diamants) de chaque rang. Un boss tué rapporte ~3 diamants au sol, et ~22 de plus avec la vidéo du coffre. */
export const SKIN_PRICES: Record<SkinTier, number> = { 0: 50, 1: 125, 2: 250 };

export type SkinId = 'ninja' | 'indigo' | 'mint' | 'lime' | 'violet' | 'jade' | 'rose' | 'emerald' | 'crimson' | 'ember' | 'gold' | 'magenta';

export interface SkinDef {
  id: SkinId;
  /** Décalage de teinte (degrés) appliqué aux bleus (≈ 215°) : la teinte obtenue donne le nom. */
  shift: number;
  tier: SkinTier;
}

export const SKINS: readonly SkinDef[] = [
  // rang 0
  { id: 'ninja', shift: 0, tier: 0 }, // planche dédiée (`assets/skinSheets.ts`) ; en attendant son chargement, le soldat bleu d'origine
  { id: 'indigo', shift: 28, tier: 0 },
  { id: 'mint', shift: 308, tier: 0 },
  { id: 'lime', shift: 224, tier: 0 },
  // rang 1
  { id: 'violet', shift: 56, tier: 1 },
  { id: 'jade', shift: 280, tier: 1 },
  { id: 'rose', shift: 112, tier: 1 },
  { id: 'emerald', shift: 252, tier: 1 },
  // rang 2
  { id: 'crimson', shift: 140, tier: 2 },
  { id: 'ember', shift: 168, tier: 2 },
  { id: 'gold', shift: 196, tier: 2 },
  { id: 'magenta', shift: 84, tier: 2 },
];

export const skinPrice = (s: SkinDef): number => SKIN_PRICES[s.tier];

export const skinById = (id: string | null | undefined): SkinDef | undefined => SKINS.find((s) => s.id === id);

/**
 * « Emplacement » visuel d'un skin : au-dessus de ces numéros, `soldierSpriteId` / `recruitSpriteId` fabriquent la variante du skin au lieu de celle
 * d'un emplacement de joueur (les mêmes fabriques à la demande de `art/playerHue.ts`).
 */
export const SKIN_SLOT_BASE = 100;

export const skinSlot = (s: SkinDef): number => SKIN_SLOT_BASE + SKINS.indexOf(s);

/** Décalage de teinte d'un emplacement visuel (joueur ou skin). */
export function slotShift(slot: number): number {
  if (slot >= SKIN_SLOT_BASE) return SKINS[slot - SKIN_SLOT_BASE]?.shift ?? 0;
  return PLAYER_HUE_SHIFT[slot % PLAYER_HUE_SHIFT.length];
}

/** Index réseau d'un skin : 0 = aucun, sinon rang dans `SKINS` + 1 (un octet par squad dans le snapshot). */
export const skinIndex = (id: string | null | undefined): number => SKINS.findIndex((s) => s.id === id) + 1;

/** Skin d'un index réseau ('' : aucun ou index inconnu). */
export const skinFromIndex = (i: number): string => SKINS[i - 1]?.id ?? '';
