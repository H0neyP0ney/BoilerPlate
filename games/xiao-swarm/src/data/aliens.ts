import type { WaveEvent } from '@xiao/engine/sim';

/**
 * Archétypes d'aliens (GDD §10-11) : mêmes systèmes, paramètres différents.
 */
export type AlienId = 'slime' | 'spider' | 'squid' | 'beast' | 'crab';

/** Qui l'alien préfère attaquer (GDD §11). */
export type TargetPref = 'nearest' | 'medic' | 'weakest' | 'center' | 'tank';

export interface AlienDef {
  id: AlienId;
  hp: number;
  speed: number;
  radius: number;
  mass: number;
  damage: number;
  attackCooldown: number;
  target: TargetPref;
  /** Flotte (ombre décollée, rebond plus ample). */
  floats?: boolean;
  /** Charge : accélère vers la cible quand elle est proche, knockback à l'impact. */
  charge?: { trigger: number; speedMul: number; duration: number; cooldown: number; knockback: number };
  /** Slam de zone : knockback + dégâts autour de lui. */
  slam?: { radius: number; damage: number; cooldown: number; knockback: number };
  /** Probabilité de base de lâcher une recrue. */
  recruitChance: number;
  color: number;
  hpBarWidth: number;
}

export const ALIENS: Record<AlienId, AlienDef> = {
  slime: {
    id: 'slime',
    hp: 30,
    speed: 72,
    radius: 16,
    mass: 1,
    damage: 7,
    attackCooldown: 0.8,
    target: 'nearest',
    recruitChance: 0.05,
    color: 0x8fd14f,
    hpBarWidth: 30,
  },
  spider: {
    id: 'spider',
    hp: 14,
    speed: 150,
    radius: 11,
    mass: 0.6,
    damage: 4,
    attackCooldown: 0.55,
    target: 'weakest',
    recruitChance: 0.03,
    color: 0xd9304a,
    hpBarWidth: 22,
  },
  squid: {
    id: 'squid',
    hp: 38,
    speed: 95,
    radius: 16,
    mass: 1,
    damage: 8,
    attackCooldown: 0.8,
    target: 'medic',
    floats: true,
    recruitChance: 0.06,
    color: 0xb35ad8,
    hpBarWidth: 30,
  },
  beast: {
    id: 'beast',
    hp: 110,
    speed: 95,
    radius: 22,
    mass: 4,
    damage: 14,
    attackCooldown: 1,
    target: 'nearest',
    charge: { trigger: 240, speedMul: 3.2, duration: 0.55, cooldown: 3.5, knockback: 420 },
    recruitChance: 0.2,
    color: 0xf08a2c,
    hpBarWidth: 40,
  },
  crab: {
    id: 'crab',
    hp: 900,
    speed: 48,
    radius: 50,
    mass: 30,
    damage: 25,
    attackCooldown: 1.2,
    target: 'center',
    slam: { radius: 140, damage: 20, cooldown: 3.2, knockback: 520 },
    recruitChance: 1,
    color: 0xd9435a,
    hpBarWidth: 90,
  },
};

/**
 * Vagues scriptées sur 5 minutes (GDD §18, §28) : début très doux pour
 * comprendre le contrôle, voir les tirs, recruter, puis montée progressive.
 */
export const WAVE_SCRIPT: WaveEvent<AlienId>[] = [
  { from: 1, to: 30, every: 1.8, type: 'slime', count: 2, label: '1' },
  { from: 30, to: 300, every: 1.3, type: 'slime', count: 3, label: '2' },
  { from: 45, to: 300, every: 5, type: 'spider', count: 5, label: '2' },
  { from: 75, to: 300, every: 6, type: 'squid', count: 3, label: '3' },
  { from: 100, to: 300, every: 9, type: 'beast', count: 1, label: '3' },
  { at: 130, type: 'crab', count: 1, label: '4' },
  { from: 150, to: 300, every: 0.9, type: 'slime', count: 3, label: '4' },
  { from: 170, to: 300, every: 3, type: 'spider', count: 7, label: '5' },
  { from: 200, to: 300, every: 5, type: 'beast', count: 2, label: '5' },
  { at: 220, type: 'crab', count: 1, label: '6' },
  { at: 265, type: 'crab', count: 2, label: '6' },
];

/**
 * Ennemis réellement en jeu pour l'instant : les autres restent définis (données, textures, réseau) mais
 * leurs vagues sont retirées. Pour en réactiver un : l'ajouter ici (le script WAVE_SCRIPT le fait réapparaître).
 */
export const ACTIVE_ALIENS: AlienId[] = ['slime'];

/** Garde uniquement les vagues des ennemis actifs. */
export const onlyActive = (waves: WaveEvent<AlienId>[]): WaveEvent<AlienId>[] => waves.filter((w) => ACTIVE_ALIENS.includes(w.type));

/** Vagues jouées : le script complet, filtré sur les ennemis actifs. */
export const WAVES: WaveEvent<AlienId>[] = onlyActive(WAVE_SCRIPT);

/** Numéro de vague affiché en fonction du temps. */
export const WAVE_MARKS = [0, 30, 75, 130, 170, 220];
