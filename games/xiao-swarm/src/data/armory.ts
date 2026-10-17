import type { SoldierClassId } from './classes';

/**
 * Armurerie (écran « Armory » de l'accueil) : on y dépense les **pièces d'or** (`settings.coins`, lâchées par les aliens comme les globes d'XP ; les diamants verts
 * servent aux skins et aux trails). Deux sortes d'achats, tous **permanents** (« tu l'as ou tu l'as pas », pas de paliers) et valables en multi pour le joueur qui les a
 * achetés (envoyés à l'hôte dans le `hello`, rangés dans `Squad.unlocked` / `Squad.perks`) :
 *  - **débloquer une unité** : elle entre dans le tirage des recrues de ce joueur (le Gunner / Trooper est là d'office) ;
 *  - **upgrades** : bonus propres à une unité (voir `PERKS`).
 * Idées et tableau complet : `docs/IDEES_UNITES.md`.
 */

/** Unités à débloquer (toutes sauf le Trooper) avec leur prix en pièces d'or. */
export const UNIT_UNLOCKS: readonly { id: SoldierClassId; price: number }[] = [
  { id: 'medic', price: 300 },
  { id: 'bruiser', price: 400 },
  { id: 'flammer', price: 500 },
  { id: 'bomber', price: 500 },
  { id: 'sniper', price: 600 },
];

export type PerkId = 'critGlasses' | 'medicRange' | 'sniperPower';

export interface PerkDef {
  id: PerkId;
  /** Unité concernée : l'upgrade ne s'achète qu'une fois cette unité débloquée (le Trooper l'est d'office). */
  unit: SoldierClassId;
  price: number;
}

export const PERKS: readonly PerkDef[] = [
  { id: 'critGlasses', unit: 'trooper', price: 250 },
  { id: 'medicRange', unit: 'medic', price: 250 },
  { id: 'sniperPower', unit: 'sniper', price: 400 },
];

/** Lunettes de précision : multiplicateur des dégâts de coup critique de la squad (+25 %, appliqué à `CRIT_MUL`). */
export const CRIT_GLASSES_MUL = 1.25;
/** Portée de l'aura de soins du Medic : + autant de « cases de formation » (`CROWD.spacing`) autour de lui. */
export const MEDIC_RANGE_UNITS = 2;
/** Sniper : multiplicateur de ses dégâts. */
export const SNIPER_POWER_MUL = 1.25;

export const perkById = (id: string): PerkDef | undefined => PERKS.find((p) => p.id === id);
export const unitUnlockById = (id: string): { id: SoldierClassId; price: number } | undefined => UNIT_UNLOCKS.find((u) => u.id === id);
