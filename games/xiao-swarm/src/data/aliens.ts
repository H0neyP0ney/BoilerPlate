/**
 * Archétypes d'aliens (GDD §10-11) : mêmes systèmes, paramètres différents.
 */
export type AlienId = 'slime' | 'boss_crab' | 'gling' | 'shooter' | 'kamikaze' | 'toad' | 'charger' | 'spitter' | 'shaman' | 'wall' | 'bubble' | 'burner' | 'lurker' | 'boss_rhino' | 'boss_scarab' | 'boss_gling' | 'iceballer' | 'iceblock';

/** Qui l'alien préfère attaquer (GDD §11). */
export type TargetPref = 'nearest' | 'center' | 'specialist';

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
  /** Slam de zone : knockback + dégâts autour de lui. */
  slam?: { radius: number; damage: number; cooldown: number; knockback: number; /** Étourdit les soldats touchés (s) : ils ne bougent ni ne tirent. */ stun?: number };
  /** Tir en cloche (comme la grenade) : s'arrête à `range × 0.8` de sa cible (sauf `keepMoving`) et lance `count` (1 par défaut) boules qui explosent au sol (zone `aoe`). */
  lob?: { range: number; cooldown: number; flight: number; damage: number; aoe: number; texture: string; count?: number; keepMoving?: boolean };
  /**
   * Murs : quand une squad est à portée (`range`), télégraphe jaune pendant `windup` s puis fait surgir `count` murs allongés (`length` px,
   * faits de rochers de rayon `rock.radius`, durée `rock.ttl` s) en arc, à `ring` px du centre de la squad, côté opposé au lanceur :
   * ils gênent sa fuite. Le lanceur reste à `range × 0.8` de sa cible.
   */
  wall?: { range: number; cooldown: number; windup: number; count: number; ring: number; spread: number; length: number; rock: { radius: number; ttl: number } };
  /**
   * Lurker : anticipe où ira la squad (centre + vitesse × `lead` s), s'y rend puis s'ENTERRE (`digTime` s ; un trou reste visible).
   * Enterré et immobile, il attend jusqu'à `wait` s qu'un soldat entre à `trigger` px : il vise (`aim` s, ligne rouge) puis lance
   * une ligne de pics (`length` × `width` px) qui s'étend progressivement en `sweep` s et blesse (`damage`) chaque soldat une fois
   * quand le front le traverse. Entre deux lignes : `cooldown` s. Enterré, il subit `buriedDmg` × les dégâts. Sans proie au bout
   * de `wait` s, il ressort (`rise` s) et repart.
   */
  lurk?: { lead: number; digRange: number; digTime: number; rise: number; wait: number; trigger: number; aim: number; length: number; width: number; sweep: number; damage: number; cooldown: number; buriedDmg: number };
  /**
   * Téléportation sous terre (Scarab) : toutes les `every` s il s'enterre (`dig` s, un trou se creuse sous lui), reste invisible et très protégé
   * (`buriedDmg` × les dégâts), pendant que un trou se forme DERRIÈRE la squad (côté opposé au boss, à `behind` px de son centre ; la position
   * se verrouille pour les 40 % de `wait` restants, la zone rouge se remplit), puis il en ressort (`rise` s) : onde de choc de rayon `radius`
   * (dégâts `damage`, recul `knockback`) au moment où il surgit.
   */
  burrow?: { every: number; dig: number; wait: number; rise: number; behind: number; radius: number; damage: number; knockback: number; buriedDmg: number };
  /**
   * Essaim (boss Gling) : toutes les `every` s de marche, il s'arrête `duration` s et fait apparaître `count` aliens `spawn` en continu
   * (régulièrement répartis sur la durée), autour de lui.
   */
  swarm?: { every: number; duration: number; count: number; spawn: AlienId };
  /**
   * Slime de glace : tire en LIGNE DROITE une boucle de glace (vitesse `speed` px/s) vers la position de la squad au moment du tir, avec une anticipation partielle (`lead` × le déplacement de la squad pendant le trajet), à moins de
   * `range` px de sa cible. Au contact d'un soldat, elle lui inflige de faibles dégâts (`damage`) et GÈLE CE SEUL SOLDAT (pas de zone ; `zone` = rayon de l'onde visuelle) : chacun est pris dans un glaçon
   * (`iceBlock`, `blockHpMul` × les PV d'un soldat de base) qui ne fond jamais : il faut le détruire. Le soldat gelé reste attaquable par les aliens.
   */
  ice?: { range: number; cooldown: number; speed: number; zone: number; damage: number; lead: number; blockHpMul: number; texture: string };
  /** Plafond d'aliens de cette espèce dans UNE vague (par squad), invités et mise à l'échelle comprises (slime de glace : 2). */
  maxPerWave?: number;
  /** Glaçon : alien immobile et inoffensif qui retient un soldat gelé (`captive`) ; le détruire le libère. Pas de kill, ni XP, ni recrue. */
  iceBlock?: boolean;
  /** Teinte multiplicative du visuel (ex. gling géant rose). */
  tint?: number;
  /** Boss : annoncé à l'écran (bandeau, flèche, barre de vie). Le boss `final` doit être tué pour gagner la partie. */
  boss?: { kind: 'mini' | 'final' };
  /** Traînée de feu : laisse au sol, toutes les `every` s, une flaque de flammes (`radius` px) qui dure `ttl` s et brûle les soldats qui y marchent (`dps` PV/s). */
  trail?: { every: number; radius: number; ttl: number; dps: number };
  /**
   * Bouclier : barre en plus des PV (`pct` × PV max), consommée avant eux. Régénérée en `regenTime` s une fois qu'aucun dégât n'a été
   * reçu depuis `regenDelay` s (tout coup, même sur un bouclier vide, relance le délai).
   */
  shield?: { pct: number; regenDelay: number; regenTime: number };
  /** Accélération d'approche : à moins de `range` px de sa cible, sa vitesse est multipliée par `speedMul` (pour rattraper une squad qui court). */
  dash?: { range: number; speedMul: number };
  /** Son attaque de contact tue un soldat d'un coup (les quatre boss). */
  oneShot?: boolean;
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
  /** Échelle d'affichage (1 par défaut) ; le rayon de collision (`radius`) est à régler en conséquence. */
  scale?: number;
  /** Probabilité de base de lâcher une recrue. */
  recruitChance: number;
  color: number;
  hpBarWidth: number;
}

export const ALIENS: Record<AlienId, AlienDef> = {
  /** Petit cafard (id historique `gling`, ex-petit slime rose) : rapide, fragile, arrive en essaims. */
  gling: {
    id: 'gling',
    hp: 12.6, // -10 %
    speed: 180, // +40 %
    radius: 11,
    mass: 0.6,
    damage: 2.5,
    attackCooldown: 0.3,
    target: 'nearest',
    revivable: true,
    xp: 1,
    recruitChance: 0.02,
    color: 0xa982e8, // violet du cafard (éclaboussure à la mort)
    hpBarWidth: 22,
  },
  /** Slime de base (vert). */
  slime: {
    id: 'slime',
    hp: 55,
    speed: 72,
    radius: 16,
    mass: 1,
    damage: 6,
    attackCooldown: 0.4,
    target: 'nearest',
    revivable: true,
    xp: 2,
    recruitChance: 0.05,
    color: 0x8fd14f,
    hpBarWidth: 30,
  },
  /** Slime bombardier (gros, bleu) : lent et costaud, lance des boules de gelée en cloche (zone au sol, télégraphiée en rouge). */
  shooter: {
    id: 'shooter',
    hp: 90,
    speed: 55,
    radius: 24,
    mass: 3,
    damage: 5,
    attackCooldown: 0.5,
    target: 'nearest',
    lob: { range: 240, cooldown: 2.6, flight: 1.1, damage: 22, aoe: 75, texture: 'fx_slime_ball' }, // portée -20 %
    revivable: true,
    xp: 6,
    recruitChance: 0.1,
    color: 0x9b1c3c, // rouge bordeaux (boule lobée, éclats et flaque de mort)
    hpBarWidth: 40,
  },
  /** Kamikaze : fonce sur les soldats ; le tuer déclenche une explosion retardée (il faut le tuer de loin). */
  kamikaze: {
    id: 'kamikaze',
    hp: 26,
    speed: 105,
    radius: 15,
    mass: 1,
    damage: 2,
    attackCooldown: 0.4,
    target: 'nearest',
    deathBlast: { delay: 1, radius: 95, damage: 60, knockback: 560 },
    xp: 3,
    recruitChance: 0.03,
    color: 0xe8333a, // rouge de l'araignée (éclaboussure à la mort)
    hpBarWidth: 28,
  },
  /** Grenouille : reste à distance, tire la langue sur un soldat et le tire vers elle. */
  toad: {
    id: 'toad',
    hp: 40,
    speed: 70,
    radius: 16,
    mass: 1.4,
    damage: 3,
    attackCooldown: 0.45,
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
    hp: 390, // ×3
    speed: 40,
    radius: 24,
    mass: 5,
    damage: 5,
    attackCooldown: 0.5,
    target: 'nearest',
    rush: { cooldown: 5, windup: 0.675, length: 416, width: 80, speed: 720, damage: 35, knockback: 700 },
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
    damage: 2,
    attackCooldown: 0.45,
    target: 'nearest',
    spray: { range: 462, cooldown: 3, pellets: 3, scatter: 60, flight: 1.07, lead: 0.3, damage: 14, aoe: 38, puddle: { radius: 46, ttl: 6, slow: 0.45 }, texture: 'fx_spit' },
    xp: 4,
    recruitChance: 0.04,
    color: 0xb060e0,
    hpBarWidth: 30,
  },
  /** Chaman : slime magique qui reste en retrait et ressuscite les slimes morts depuis leur flaque (une fois chacun). */
  shaman: {
    id: 'shaman',
    hp: 60,
    speed: 60,
    radius: 18,
    mass: 1.5,
    damage: 1.5,
    attackCooldown: 0.5,
    target: 'nearest',
    revive: { range: 330, cooldown: 3.5, cast: 1.3, hpFrac: 1 }, // le ressuscité est un ZOMBIE (5 exemplaires, ×3 PV, cadence ×3 : voir config.ZOMBIE_*)
    xp: 8,
    recruitChance: 0.1,
    color: 0xffd84a,
    hpBarWidth: 34,
  },
  /** Bâtisseur de murs : de très loin, fait surgir (après un télégraphe jaune) des murs allongés autour de la squad pour gêner sa fuite. */
  wall: {
    id: 'wall',
    hp: 50,
    speed: 60,
    radius: 17,
    mass: 1.3,
    damage: 2,
    attackCooldown: 0.5,
    target: 'nearest',
    wall: { range: 640, cooldown: 6, windup: 1.1, count: 2, ring: 190, spread: 0.9, length: 134, rock: { radius: 22, ttl: 8 } },
    xp: 4,
    recruitChance: 0.04,
    color: 0x9a8066,
    hpBarWidth: 30,
  },
  /** Lurker : s'enterre sur le trajet anticipé de la squad et la frappe d'une ligne de pics (comme les lurkers de StarCraft). */
  lurker: {
    id: 'lurker',
    hp: 360, // ×3
    speed: 120,
    radius: 18,
    mass: 2,
    damage: 0,
    attackCooldown: 1,
    target: 'nearest',
    lurk: { lead: 2.4, digRange: 140, digTime: 0.7, rise: 0.6, wait: 7, trigger: 360, aim: 0.6, length: 380, width: 44, sweep: 0.5, damage: 60, cooldown: 1.6, buriedDmg: 0.2 },
    xp: 8,
    recruitChance: 0.08,
    color: 0x7a5a9a,
    hpBarWidth: 36,
  },
  /** Bulle flottante : rapide et très résistante ; elle avale un soldat et le digère sur place tant qu'on ne l'a pas détruite. */
  bubble: {
    id: 'bubble',
    hp: 2160, // ×3
    speed: 210,
    radius: 22,
    mass: 3,
    damage: 0,
    attackCooldown: 1,
    target: 'specialist',
    floats: true,
    dash: { range: 380, speedMul: 1.6 }, // la squad court à 210 : sans élan, la bulle ne la rattrape jamais
    capture: { dps: 25 },
    xp: 12,
    recruitChance: 0,
    color: 0x8fe0ff,
    hpBarWidth: 46,
  },
  /** Slime de feu : laisse derrière lui une traînée de flammes qui brûle les soldats qui marchent dedans. */
  burner: {
    id: 'burner',
    hp: 80, // x2
    speed: 85,
    radius: 16,
    mass: 1,
    damage: 3,
    attackCooldown: 0.4,
    target: 'nearest',
    trail: { every: 0.22, radius: 24, ttl: 11.25, dps: 31.2 },
    xp: 4,
    recruitChance: 0.03,
    color: 0xff5a1a,
    hpBarWidth: 30,
  },
  /** Mini-boss (2:00) : énorme rhinocéros, charge tous les 4,5 s dans un couloir large signalé en rouge. */
  boss_rhino: {
    id: 'boss_rhino',
    hp: 900,
    speed: 71.5, // 55 + 30 %
    radius: 38,
    mass: 14,
    damage: 7,
    attackCooldown: 1,
    target: 'nearest',
    oneShot: true,
    rush: { cooldown: 3.6, windup: 0.63, length: 430, width: 120, speed: 1300, damage: 45, knockback: 850 },
    boss: { kind: 'mini' },
    xp: 150,
    recruitChance: 1,
    color: 0xb03a3a,
    hpBarWidth: 100,
  },
  /** Mini-boss (5:00) : Scarab, slam de zone dévastateur. */
  boss_scarab: {
    id: 'boss_scarab',
    hp: 3200,
    speed: 150, // ×3
    radius: 68,
    mass: 50,
    damage: 15,
    attackCooldown: 1.2,
    oneShot: true,
    target: 'center',
    slam: { radius: 190, damage: 30, cooldown: 2, knockback: 650, stun: 1.2 }, // grosse onde de choc : étourdit les soldats
    shield: { pct: 0.05, regenDelay: 5, regenTime: 4 },
    burrow: { every: 5, dig: 0.6, wait: 1.6, rise: 0.47, behind: 300, radius: 180, damage: 30, knockback: 600, buriedDmg: 0.1 }, // s'enterre plus souvent (8 → 5 s)
    boss: { kind: 'mini' },
    xp: 400,
    recruitChance: 1,
    color: 0xc01c40,
    hpBarWidth: 140,
  },
  /** Mini-boss (1:00) : énorme gling rose, s'arrête toutes les 3 s pour faire apparaître 30 glings en 1,07 s. */
  boss_gling: {
    id: 'boss_gling',
    hp: 500,
    speed: 85,
    radius: 38,
    mass: 14,
    damage: 5,
    attackCooldown: 0.6,
    oneShot: true,
    target: 'nearest',
    swarm: { every: 4, duration: 1.07, count: 22, spawn: 'gling' },
    boss: { kind: 'mini' },
    xp: 100,
    recruitChance: 1,
    color: 0xff5aa8,
    hpBarWidth: 100,
  },
  /** Slime bleu ciel (difficulté 3/10, dès 45 s) : lance une boucle de glace qui gèle les soldats touchés dans un glaçon. */
  iceballer: {
    id: 'iceballer',
    hp: 70,
    speed: 62,
    radius: 17,
    mass: 1.1,
    damage: 4,
    attackCooldown: 0.5,
    target: 'nearest',
    maxPerWave: 2,
    ice: { range: 420, cooldown: 4.5, speed: 403, zone: 44, damage: 6, lead: 0.5, blockHpMul: 12, texture: 'fx_ice_ball' },
    revivable: true,
    xp: 5,
    recruitChance: 0.07,
    color: 0x7fd8ff,
    hpBarWidth: 30,
  },
  /** Glaçon : retient un soldat gelé. PV fixés à la création (`blockHpMul` × un soldat de base, `Horde.freezeSoldier`). */
  iceblock: {
    id: 'iceblock',
    hp: 1,
    speed: 0,
    radius: 26,
    mass: 1000,
    damage: 0,
    attackCooldown: 99,
    target: 'nearest',
    iceBlock: true,
    xp: 0,
    recruitChance: 0,
    color: 0x9fe3ff,
    hpBarWidth: 44,
  },
  /** Boss final (10:00) : Giant Crab, saut écrasant et jets de gelée. Le tuer gagne la partie. */
  boss_crab: {
    id: 'boss_crab',
    hp: 900, // comme le Rhinocéros Alpha (× bossHpMul en jeu)
    speed: 48,
    radius: 150, // 3× plus gros (affichage et collision)
    scale: 3,
    mass: 30,
    damage: 12.5,
    attackCooldown: 1.2,
    oneShot: true,
    target: 'center',
    leap: { every: 10, windup: 0.6, flight: 0.9, recover: 0.7, radius: 150, maxDist: 900 },
    lob: { range: 620, cooldown: 3, flight: 1.15, damage: 22, aoe: 85, texture: 'fx_blob_green', count: 3, keepMoving: true },
    boss: { kind: 'final' },
    xp: 300,
    recruitChance: 1,
    color: 0xd9435a,
    hpBarWidth: 200,
  },
};

/**
 * Ennemis réellement en jeu pour l'instant : les autres restent définis (données, textures, réseau) mais
 * ils ne figurent pas dans le script de vagues par défaut (data/waves.ts), mais le Gestionnaire de vagues peut les utiliser.
 */
export const ACTIVE_ALIENS: AlienId[] = ['slime', 'gling', 'shooter', 'kamikaze', 'toad', 'charger', 'spitter', 'shaman', 'wall', 'bubble', 'burner', 'lurker', 'iceballer'];
