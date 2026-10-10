/**
 * Classes de soldats (GDD §8). Valeurs de design, à équilibrer.
 * Ajouter une classe = une entrée ici + ses textures dans art/soldiers.ts.
 */
export type SoldierClassId = 'trooper' | 'medic' | 'flammer' | 'sniper' | 'bruiser' | 'bomber';

export type WeaponKind = 'bullet' | 'flame' | 'beam' | 'grenade';

export interface WeaponDef {
  kind: WeaponKind;
  range: number;
  /** Secondes entre deux tirs. */
  cooldown: number;
  damage: number;
  projectileSpeed?: number;
  /** Nombre de projectiles par tir (shotgun). */
  pellets?: number;
  spread?: number;
  /** Nombre d'ennemis traversés (Infinity = flamme). */
  pierce?: number;
  /** Durée de vie du projectile (s). */
  life?: number;
  /** Grenade : rayon de l'explosion à l'impact (px). Le projectile part en cloche et explose au sol. */
  aoe?: number;
  texture: string;
}

export interface SoldierClassDef {
  id: SoldierClassId;
  hp: number;
  radius: number;
  /** Poids pour les collisions (le tank ne se laisse pas pousser). */
  mass: number;
  weapon: WeaponDef;
  /** Soin de la squad à l'arrêt (Medic). PV/s par soldat dans le rayon. */
  heal?: { radius: number; perSecond: number };
  /** Explosion à la mort (Flammeur). */
  deathBlast?: { radius: number; damage: number };
  /** Couleur d'identification (HUD, textes). */
  color: number;
}

/**
 * Stats de base : les anciens multiplicateurs globaux de squad (dégâts ×1,2, cadence ×1,15, PV ×0,91 ; vitesse ×1,08 dans `CROWD.speed`, recrues ×1,3 dans
 * `recruitChance` des aliens) sont intégrés ici depuis le 09/10 ; les curseurs correspondants du panneau Difficulté ont été supprimés.
 */
export const CLASSES: Record<SoldierClassId, SoldierClassDef> = {
  trooper: {
    id: 'trooper',
    hp: 91,
    radius: 14,
    mass: 3,
    color: 0x3d7fe0,
    // Blaster bleu : tir quasi rectiligne vers la cible (très faible dispersion).
    weapon: { kind: 'bullet', range: 290, cooldown: 0.2783, damage: 12, projectileSpeed: 760, spread: 0.015, texture: 'fx_blaster_blue' },
  },
  medic: {
    id: 'medic',
    hp: 72.8,
    radius: 14,
    mass: 3,
    color: 0xf2f2f2,
    weapon: { kind: 'bullet', range: 240, cooldown: 0.6087, damage: 7.2, projectileSpeed: 620, spread: 0.05, texture: 'fx_bolt_green' },
    heal: { radius: 230, perSecond: 7 },
  },
  flammer: {
    id: 'flammer',
    hp: 86.45,
    radius: 14,
    mass: 3,
    color: 0xe0413d,
    weapon: {
      kind: 'flame',
      range: 160,
      cooldown: 0.0522,
      damage: 3.84,
      projectileSpeed: 420,
      spread: 0.28,
      pierce: Infinity,
      life: 0.38,
      texture: 'fx_flame',
    },
    deathBlast: { radius: 120, damage: 80 },
  },
  sniper: {
    id: 'sniper',
    hp: 63.7,
    radius: 14,
    mass: 3,
    color: 0x5aa84a,
    weapon: { kind: 'beam', range: 520, cooldown: 1.1304, damage: 66, texture: 'fx_beam' },
  },
  bruiser: {
    id: 'bruiser',
    hp: 209.3,
    radius: 18,
    mass: 8,
    color: 0x8a96a8,
    weapon: {
      kind: 'bullet',
      range: 200,
      cooldown: 0.8261,
      damage: 10.8,
      projectileSpeed: 640,
      pellets: 4,
      spread: 0.4,
      life: 0.4,
      texture: 'fx_bullet',
    },
  },
  bomber: {
    id: 'bomber',
    hp: 77.35,
    radius: 14,
    mass: 3,
    color: 0x9a5ad8,
    // Tir lent, en cloche : dégâts de zone (petit rayon) à l'atterrissage, pas de collision en vol.
    weapon: { kind: 'grenade', range: 340, cooldown: 1.6522, damage: 45.6, projectileSpeed: 300, aoe: 70, texture: 'fx_grenade' },
  },
};

/**
 * Classes réellement en jeu pour l'instant : les autres restent définies (données, textures, réseau)
 * mais ne sont ni dans les squads de départ ni recrutées. Pour en réactiver une : l'ajouter ici et
 * dans START_SQUADS.
 */
export const ACTIVE_CLASSES: SoldierClassId[] = ['trooper'];

/**
 * Compositions de départ viables (GDD §7) : randomisation contrainte.
 * Pour l'instant : 4 Gunners (les autres classes sont désactivées, voir ACTIVE_CLASSES).
 */
export const START_SQUADS: SoldierClassId[][] = [['trooper', 'trooper', 'trooper', 'trooper']];

/**
 * Composition "idéale" visée par le recrutement : le type de recrue droppée
 * compense ce qui manque par rapport à ces proportions (GDD §13).
 */
export const TARGET_MIX: Record<SoldierClassId, number> = {
  trooper: 0.75,
  medic: 0.05,
  flammer: 0.05,
  sniper: 0.05,
  bruiser: 0.05,
  bomber: 0.05,
};
