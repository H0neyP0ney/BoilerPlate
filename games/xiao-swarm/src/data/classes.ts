/**
 * Classes de soldats (GDD §8). Valeurs de design, à équilibrer.
 * Ajouter une classe = une entrée ici + ses textures dans art/soldiers.ts.
 */
export type SoldierClassId = 'gunner' | 'medic' | 'flammer' | 'sniper' | 'tank';

export type WeaponKind = 'bullet' | 'flame' | 'beam';

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

export const CLASSES: Record<SoldierClassId, SoldierClassDef> = {
  gunner: {
    id: 'gunner',
    hp: 100,
    radius: 14,
    mass: 3,
    color: 0x3d7fe0,
    weapon: { kind: 'bullet', range: 290, cooldown: 0.32, damage: 10, projectileSpeed: 760, spread: 0.06, texture: 'fx_bullet' },
  },
  medic: {
    id: 'medic',
    hp: 80,
    radius: 14,
    mass: 3,
    color: 0xf2f2f2,
    weapon: { kind: 'bullet', range: 240, cooldown: 0.7, damage: 6, projectileSpeed: 620, spread: 0.05, texture: 'fx_bolt_green' },
    heal: { radius: 230, perSecond: 7 },
  },
  flammer: {
    id: 'flammer',
    hp: 95,
    radius: 14,
    mass: 3,
    color: 0xe0413d,
    weapon: {
      kind: 'flame',
      range: 160,
      cooldown: 0.06,
      damage: 3.2,
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
    hp: 70,
    radius: 14,
    mass: 3,
    color: 0x5aa84a,
    weapon: { kind: 'beam', range: 520, cooldown: 1.3, damage: 55, texture: 'fx_beam' },
  },
  tank: {
    id: 'tank',
    hp: 230,
    radius: 18,
    mass: 8,
    color: 0x8a96a8,
    weapon: {
      kind: 'bullet',
      range: 200,
      cooldown: 0.95,
      damage: 9,
      projectileSpeed: 640,
      pellets: 4,
      spread: 0.4,
      life: 0.4,
      texture: 'fx_bullet',
    },
  },
};

/**
 * Compositions de départ viables (GDD §7) : randomisation contrainte.
 */
export const START_SQUADS: SoldierClassId[][] = [
  ['medic', 'gunner', 'flammer', 'gunner'],
  ['medic', 'gunner', 'gunner', 'sniper'],
  ['medic', 'gunner', 'flammer', 'tank'],
  ['medic', 'gunner', 'sniper', 'flammer'],
];

/**
 * Composition "idéale" visée par le recrutement : le type de recrue droppée
 * compense ce qui manque par rapport à ces proportions (GDD §13).
 */
export const TARGET_MIX: Record<SoldierClassId, number> = {
  gunner: 0.38,
  medic: 0.14,
  flammer: 0.18,
  sniper: 0.16,
  tank: 0.14,
};
