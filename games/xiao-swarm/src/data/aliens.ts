/**
 * Archétypes d'aliens (GDD §10-11) : mêmes systèmes, paramètres différents.
 */
export type AlienId = 'slime_basic' | 'spider' | 'squid' | 'beast' | 'crab' | 'slime_pink' | 'slime_bombardier' | 'kamikaze' | 'frog' | 'charger' | 'spitter' | 'shaman' | 'thrower' | 'bubble' | 'fire' | 'healer' | 'rhino_boss' | 'crab_king';

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
  /** Tir en cloche (comme la grenade) : s'arrête à `range × 0.8` de sa cible (sauf `keepMoving`) et lance `count` (1 par défaut) boules qui explosent au sol (zone `aoe`). */
  lob?: { range: number; cooldown: number; flight: number; damage: number; aoe: number; texture: string; rock?: { radius: number; ttl: number }; count?: number; keepMoving?: boolean };
  /** Boss : annoncé à l'écran (bandeau, flèche, barre de vie). Le boss `final` doit être tué pour gagner la partie. */
  boss?: { kind: 'mini' | 'final' };
  /** Traînée de feu : laisse au sol, toutes les `every` s, une flaque de flammes (`radius` px) qui dure `ttl` s et brûle les soldats qui y marchent (`dps` PV/s). */
  trail?: { every: number; radius: number; ttl: number; dps: number };
  /** Bulle : au contact d'un soldat, le capture et le dévore (`dps` PV par seconde) en restant immobile ; la détruire le libère. */
  capture?: { dps: number };
  /** Sa flaque reste au sol à sa mort (une seule fois par alien) : un chaman peut le ressusciter. */
  revivable?: boolean;
  /** Chaman : à portée d'une flaque de slime mort, incante `cast` s puis ressuscite le slime avec `hpFrac` de ses PV. */
  revive?: { range: number; cooldown: number; cast: number; hpFrac: number };
  /** XP laissée à la mort, en globes bleus (voir data/progression.ts). */
  xp: number;
  /** Kamikaze : à sa mort le corps reste sur place, clignote `delay` s (zone rouge) puis explose : dégâts + recul aux soldats. */
  deathBlast?: { delay: number; radius: number; damage: number; knockback: number };
  /** Langue : attrape un soldat à portée et le tire d'une fraction `pull` de la distance qui les sépare (jamais jusqu'à lui). */
  tongue?: { range: number; cooldown: number; pull: number; damage: number };
  /** Charge télégraphiée : s'arrête `windup` s (zone rouge devant lui) puis fonce sur `length` px ; les soldats dans la zone sont repoussés et blessés. */
  rush?: { cooldown: number; windup: number; length: number; width: number; speed: number; damage: number; knockback: number };
  /**
   * Saut écrasant : toutes les `every` s, vise l'endroit où la squad ciblée SERA à l'impact (centre + vitesse × durée), à `maxDist` px
   * au plus. Préparation `windup` (télégraphe rouge au sol), vol `flight`, écrasement (tout soldat sous la zone de rayon `radius`
   * meurt), puis récupération `recover` sur place.
   */
  leap?: { every: number; windup: number; flight: number; recover: number; radius: number; maxDist: number };
  /** Crachat : quelques boules en cloche (chacune télégraphiée) qui blessent et laissent une flaque ralentissante. */
  spray?: {
    range: number;
    cooldown: number;
    /** Nombre de boules (peu, mais chacune est télégraphiée). */
    pellets: number;
    /** Dispersion (px) autour du point visé. */
    scatter: number;
    /** Durée du vol (s). */
    flight: number;
    /** Part du déplacement de la cible anticipée (0 = vise où elle est, 1 = anticipation complète). */
    lead: number;
    damage: number;
    /** Rayon de l'impact (px). Aucun recul : l'impact laisse une flaque qui ralentit. */
    aoe: number;
    puddle: { radius: number; ttl: number; slow: number };
    texture: string;
  };
  /** Soigneur : rayons de soin vers les `targets` alliés les plus blessés à portée (`pct` de leurs PV max par seconde) ; reste à `hold` px des soldats. */
  healBeam?: { range: number; targets: number; pct: number; hold: number };
  /** Échelle d'affichage (1 par défaut) ; le rayon de collision (`radius`) est à régler en conséquence. */
  scale?: number;
  /** Probabilité de base de lâcher une recrue. */
  recruitChance: number;
  color: number;
  hpBarWidth: number;
}

export const ALIENS: Record<AlienId, AlienDef> = {
  /** Slime de base (vert). */
  slime_basic: {
    id: 'slime_basic',
    hp: 55,
    speed: 72,
    radius: 16,
    mass: 1,
    damage: 12,
    attackCooldown: 0.8,
    target: 'nearest',
    revivable: true,
    xp: 2,
    recruitChance: 0.05,
    color: 0x8fd14f,
    hpBarWidth: 30,
  },
  /** Petit cafard (id historique `slime_pink`, ex-petit slime rose) : rapide, fragile, arrive en essaims. */
  slime_pink: {
    id: 'slime_pink',
    hp: 14,
    speed: 180, // +40 %
    radius: 11,
    mass: 0.6,
    damage: 5,
    attackCooldown: 0.6,
    target: 'nearest',
    revivable: true,
    xp: 1,
    recruitChance: 0.02,
    color: 0xa982e8, // violet du cafard (éclaboussure à la mort)
    hpBarWidth: 22,
  },
  /** Slime bombardier (gros, bleu) : lent et costaud, lance des boules de gelée en cloche (zone au sol, télégraphiée en rouge). */
  slime_bombardier: {
    id: 'slime_bombardier',
    hp: 90,
    speed: 55,
    radius: 24,
    mass: 3,
    damage: 10,
    attackCooldown: 1,
    target: 'nearest',
    lob: { range: 240, cooldown: 2.6, flight: 1.1, damage: 22, aoe: 75, texture: 'fx_slime_ball' }, // portée -20 %
    revivable: true,
    xp: 6,
    recruitChance: 0.1,
    color: 0x4aa8ff,
    hpBarWidth: 40,
  },
  /** Kamikaze : fonce sur les soldats ; le tuer déclenche une explosion retardée (il faut le tuer de loin). */
  kamikaze: {
    id: 'kamikaze',
    hp: 26,
    speed: 105,
    radius: 15,
    mass: 1,
    damage: 4,
    attackCooldown: 0.8,
    target: 'nearest',
    deathBlast: { delay: 1, radius: 95, damage: 60, knockback: 560 },
    xp: 3,
    recruitChance: 0.03,
    color: 0xe8333a, // rouge de l'araignée (éclaboussure à la mort)
    hpBarWidth: 28,
  },
  /** Grenouille : reste à distance, tire la langue sur un soldat et le tire vers elle. */
  frog: {
    id: 'frog',
    hp: 40,
    speed: 70,
    radius: 16,
    mass: 1.4,
    damage: 6,
    attackCooldown: 0.9,
    target: 'nearest',
    tongue: { range: 270, cooldown: 3.2, pull: 0.4, damage: 4 },
    xp: 4,
    recruitChance: 0.04,
    color: 0x3fd0a0,
    hpBarWidth: 30,
  },
  /** Rhinocéros : lent à quatre pattes, mais charge toutes les 5 s dans une zone signalée en rouge. */
  charger: {
    id: 'charger',
    hp: 130,
    speed: 40,
    radius: 24,
    mass: 5,
    damage: 10,
    attackCooldown: 1,
    target: 'nearest',
    rush: { cooldown: 5, windup: 0.9, length: 320, width: 80, speed: 720, damage: 35, knockback: 700 },
    xp: 10,
    recruitChance: 0.15,
    color: 0xb03a3a,
    hpBarWidth: 44,
  },
  /** Cracheur : crache quelques boules violettes en cloche qui laissent une flaque ralentissante. */
  spitter: {
    id: 'spitter',
    hp: 34,
    speed: 62,
    radius: 17,
    mass: 1.2,
    damage: 4,
    attackCooldown: 0.9,
    target: 'nearest',
    spray: { range: 462, cooldown: 3, pellets: 3, scatter: 60, flight: 1.07, lead: 0.3, damage: 14, aoe: 38, puddle: { radius: 46, ttl: 6, slow: 0.45 }, texture: 'fx_spit' },
    xp: 4,
    recruitChance: 0.04,
    color: 0xb060e0,
    hpBarWidth: 30,
  },
  /** Slime jaune soigneur : reste en retrait et soigne ses alliés blessés avec des rayons de soin (tuez-le en priorité). */
  healer: {
    id: 'healer',
    hp: 45,
    speed: 70,
    radius: 17,
    mass: 1.1,
    damage: 3,
    attackCooldown: 1,
    target: 'nearest',
    healBeam: { range: 270, targets: 2, pct: 0.12, hold: 320 },
    xp: 6,
    recruitChance: 0.06,
    color: 0xf2e24a,
    hpBarWidth: 30,
  },
  /** Chaman : slime magique qui reste en retrait et ressuscite les slimes morts depuis leur flaque (une fois chacun). */
  shaman: {
    id: 'shaman',
    hp: 60,
    speed: 60,
    radius: 18,
    mass: 1.5,
    damage: 3,
    attackCooldown: 1,
    target: 'nearest',
    revive: { range: 330, cooldown: 3.5, cast: 1.3, hpFrac: 1 }, // le ressuscité est un ZOMBIE (×3 PV et dégâts, voir config.ZOMBIE_MUL)
    xp: 8,
    recruitChance: 0.1,
    color: 0xffd84a,
    hpBarWidth: 34,
  },
  /** Lanceur de cailloux : ses cailloux restent au sol un moment et bloquent les soldats. */
  thrower: {
    id: 'thrower',
    hp: 50,
    speed: 60,
    radius: 17,
    mass: 1.3,
    damage: 4,
    attackCooldown: 1,
    target: 'nearest',
    lob: { range: 330, cooldown: 2.8, flight: 1, damage: 8, aoe: 38, texture: 'fx_rock_small', rock: { radius: 24, ttl: 14 } },
    xp: 4,
    recruitChance: 0.04,
    color: 0x9a8066,
    hpBarWidth: 30,
  },
  /** Bulle flottante : rapide et très résistante ; elle avale un soldat et le digère sur place tant qu'on ne l'a pas détruite. */
  bubble: {
    id: 'bubble',
    hp: 720,
    speed: 210,
    radius: 22,
    mass: 3,
    damage: 0,
    attackCooldown: 1,
    target: 'nearest',
    floats: true,
    capture: { dps: 14 },
    xp: 12,
    recruitChance: 0,
    color: 0x8fe0ff,
    hpBarWidth: 46,
  },
  /** Slime de feu : laisse derrière lui une traînée de flammes qui brûle les soldats qui marchent dedans. */
  fire: {
    id: 'fire',
    hp: 40,
    speed: 85,
    radius: 16,
    mass: 1,
    damage: 6,
    attackCooldown: 0.8,
    target: 'nearest',
    trail: { every: 0.22, radius: 24, ttl: 9, dps: 24 },
    xp: 4,
    recruitChance: 0.03,
    color: 0xff5a1a,
    hpBarWidth: 30,
  },
  /** Mini-boss (2:00) : énorme rhinocéros, charge tous les 4,5 s dans un couloir large signalé en rouge. */
  rhino_boss: {
    id: 'rhino_boss',
    hp: 900,
    speed: 55,
    radius: 38,
    mass: 14,
    damage: 14,
    attackCooldown: 1,
    target: 'nearest',
    rush: { cooldown: 4.5, windup: 0.63, length: 430, width: 120, speed: 1300, damage: 45, knockback: 850 },
    boss: { kind: 'mini' },
    xp: 70,
    recruitChance: 1,
    color: 0xb03a3a,
    hpBarWidth: 100,
  },
  /** Boss final (10:00) : Roi Crabe, slam de zone dévastateur. Le tuer gagne la partie. */
  crab_king: {
    id: 'crab_king',
    hp: 3200,
    speed: 50,
    radius: 68,
    mass: 50,
    damage: 30,
    attackCooldown: 1.2,
    target: 'center',
    slam: { radius: 190, damage: 30, cooldown: 3, knockback: 650 },
    boss: { kind: 'final' },
    xp: 220,
    recruitChance: 1,
    color: 0xc01c40,
    hpBarWidth: 140,
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
    xp: 1,
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
    xp: 3,
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
    xp: 8,
    recruitChance: 0.2,
    color: 0xf08a2c,
    hpBarWidth: 40,
  },
  crab: {
    id: 'crab',
    hp: 900, // comme le Rhinocéros Alpha (× bossHpMul en jeu)
    speed: 48,
    radius: 150, // 3× plus gros (affichage et collision)
    scale: 3,
    mass: 30,
    damage: 25,
    attackCooldown: 1.2,
    target: 'center',
    leap: { every: 10, windup: 0.6, flight: 0.9, recover: 0.7, radius: 150, maxDist: 900 },
    lob: { range: 620, cooldown: 3, flight: 1.15, damage: 22, aoe: 85, texture: 'fx_blob_green', count: 3, keepMoving: true },
    boss: { kind: 'mini' },
    xp: 60,
    recruitChance: 1,
    color: 0xd9435a,
    hpBarWidth: 200,
  },
};

/**
 * Ennemis réellement en jeu pour l'instant : les autres restent définis (données, textures, réseau) mais
 * ils ne figurent pas dans le script de vagues par défaut (data/waves.ts), mais le Gestionnaire de vagues peut les utiliser.
 */
export const ACTIVE_ALIENS: AlienId[] = ['slime_basic', 'slime_pink', 'slime_bombardier', 'kamikaze', 'frog', 'charger', 'spitter', 'shaman', 'healer', 'thrower', 'bubble', 'fire'];
