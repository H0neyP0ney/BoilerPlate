/**
 * Archétypes d'aliens (GDD §10-11) : mêmes systèmes, paramètres différents.
 */
export type AlienId = 'slime' | 'boss_crab' | 'gling' | 'shooter' | 'kamikaze' | 'toad' | 'charger' | 'spitter' | 'shaman' | 'wall' | 'bubble' | 'burner' | 'lurker' | 'boss_rhino' | 'boss_scarab' | 'boss_gling' | 'iceballer' | 'ice_orb' | 'boss_rhino_fire' | 'boss_rhino_ice' | 'fire_orb' | 'spider' | 'boss_egg';

/** Qui l'alien préfère attaquer (GDD §11). */
export type TargetPref = 'nearest' | 'center' | 'specialist';

/** Le ressuscité est un ZOMBIE : `copies` exemplaires par incantation, et PV / dégâts / vitesse / cadence × ces facteurs par rapport à sa version de base (réglables dans la vue du chaman). */
export interface ZombieStats {
  copies: number;
  hpMul: number;
  dmgMul: number;
  speedMul: number;
  attackMul: number;
}

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
  /**
   * Alien-projectile (orbe de glace du slime de glace) : lancé en ligne droite à `speed` px/s pendant `life` s au plus, il vole au-dessus du
   * décor. Au contact d'un soldat : `damage` et gel (onde de rayon `ring`), puis il se brise ; il se brise aussi au bout de sa course. PV
   * `hp` exacts (sans multiplicateur de difficulté) : la squad peut le détruire en lui tirant dessus (barre de vie toujours affichée). Ni XP,
   * ni recrue, ni trou d'apparition, jamais recyclé. `kind` 'fire' (orbe de feu des rhinos jumeaux) : pas de gel, il laisse une traînée de flammes au sol
   * (`trail`, comme le slime de feu) et brûle (`damage` + flamme) le soldat touché.
   */
  projectile?: { life: number; ring: number; kind?: 'ice' | 'fire' };
  /** Mêlée en zone : chaque coup au contact (`damage`, toutes les `attackCooldown` s) touche tous les soldats à moins de `cleave` px de lui, pas un seul. */
  cleave?: number;
  /**
   * Nuage ralentissant : toutes les `every` s, si la squad visée est à moins de `range` px, un nuage violet apparaît sur elle, un peu
   * en avant de sa course (vitesse × `lead` s) : les soldats dedans vont à `slow` × leur vitesse pendant `ttl` s (rayon `radius`).
   */
  cloud?: { every: number; range: number; lead: number; radius: number; ttl: number; slow: number };
  /**
   * Flocons à distance : toutes les `every` s, si la squad visée est à moins de `range` px, `count` petits nuages de glace (rayon `radius`)
   * apparaissent d'un coup tout autour d'elle, à `gap` px (min-max) de son bord réel (soldat le plus éloigné du centre). Un soldat qui entre dans un nuage est gelé dans un glaçon (comme le
   * slime de glace) et le nuage disparaît ; sinon il dure `ttl` s.
   */
  frost?: { every: number; range: number; count: number; gap: [number, number]; radius: number; ttl: number };
  /** Slam de zone : knockback + dégâts autour de lui. */
  slam?: { radius: number; damage: number; cooldown: number; knockback: number; /** Étourdit les soldats touchés (s) : ils ne bougent ni ne tirent. */ stun?: number };
  /**
   * Tir en cloche (comme la grenade) : s'arrête à `range × 0.8` de sa cible (sauf `keepMoving`) et lance `count` (1 par défaut) boules qui
   * explosent au sol (zone `aoe`). Point visé : la cible + son déplacement pendant le vol × une part tirée au hasard dans `lead` (min, max ;
   * [1, 1] par défaut = anticipation complète), ± `scatter` px (22 par défaut, 70 si plusieurs boules).
   */
  lob?: { range: number; cooldown: number; flight: number; damage: number; aoe: number; texture: string; count?: number; keepMoving?: boolean; lead?: [number, number]; scatter?: number; poison?: number; spawn?: number };
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
   * quand le front le traverse. Entre deux lignes : `cooldown` s. Semi-enterré (`BURIED` : 50 % des dégâts, haut du sprite visible). Sans proie au bout
   * de `wait` s, il ressort (`rise` s) et repart ; après une ligne de pics, il n'attend plus que `rewait` s (la squad a fui : il ressort vite).
   */
  lurk?: { lead: number; digRange: number; digTime: number; rise: number; wait: number; rewait: number; trigger: number; aim: number; length: number; width: number; sweep: number; damage: number; cooldown: number };
  /**
   * Téléportation sous terre (Scarab) : toutes les `every` s il s'enterre (`dig` s, un trou se creuse sous lui), reste totalement enterré
   * (`BURIED` : invisible et intouchable) `wait` s, pendant que le télégraphe rouge vise LE CENTRE DE LA SQUAD, sans anticipation (« bouge, ça va te
   * sauter dessus ») : il la suit, puis se verrouille `lock` s avant la sortie (le temps de s'échapper, la zone rouge se remplit), puis il en
   * ressort (`rise` s) : onde de choc de rayon `radius` (dégâts `damage`, recul `knockback`) au moment où il surgit. En ressortant, il choisit
   * où sera la squad dans `lead` s (sa course) et fonce tout droit vers ce point, direction verrouillée, jusqu'à l'atteindre (`lunge` s au plus).
   */
  burrow?: { every: number; dig: number; wait: number; lock: number; rise: number; radius: number; damage: number; knockback: number; lead: number; lunge: number };
  /**
   * Pluie de stalactites (Scarab) : une fois ressorti de terre (`burrow`), il fait tomber `count` stalactites sur de petites zones autour de la
   * squad visée : `onSoldiers` sur des soldats (leur position au lancer), les autres au hasard à moins de `spread` px de son centre. Chaque
   * zone est annoncée `delay` s (télégraphe rouge, les suivantes décalées de `stagger` s), puis la stalactite tombe : dégâts `damage` et
   * recul `knockback` dans un rayon `radius`. `walk` : petite pluie en plus quand il marche vers la squad entre deux plongées (une par marche,
   * à mi-chemin du compte à rebours `burrow.every`) : `count` stalactites dont `onSoldiers` sur des soldats, mêmes zones / dégâts.
   */
  stalactites?: { count: number; onSoldiers: number; spread: number; radius: number; delay: number; stagger: number; damage: number; knockback: number; walk?: { count: number; onSoldiers: number } };
  /**
   * Essaim (boss Gling) : toutes les `every` s de marche, il s'arrête `duration` s et fait apparaître `count` aliens `spawn` en continu
   * (régulièrement répartis sur la durée), autour de lui.
   */
  swarm?: { every: number; duration: number; count: number; spawn: AlienId };
  /**
   * Slime de glace : tire en LIGNE DROITE une boucle de glace (vitesse `speed` px/s) vers la position de la squad au moment du tir, avec une anticipation partielle (`lead` × le déplacement de la squad pendant le trajet), à moins de
   * `range` px de sa cible. Au contact d'un soldat, elle lui inflige de faibles dégâts (`damage`) et GÈLE CE SEUL SOLDAT (pas de zone ; `zone` = rayon de l'onde visuelle) :
   * il est pris dans la glace (`FREEZE` de config.ts : 50 PV de gel, 1 PV par coup d'un allié) qui ne fond jamais : ses alliés doivent la briser. Il reste attaquable par les aliens.
   */
  ice?: { range: number; cooldown: number; lead: number; orb: AlienId };
  /** Plafond d'aliens de cette espèce dans UNE vague (par squad), invités et mise à l'échelle comprises (slime de glace : 2). */
  maxPerWave?: number;
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
  /** Œuf laissé par un boss tué (sauf le final) : immobile, inoffensif, PV fixes ; le détruire libère les globes d'upgrade (`UpgradeOrbs.burst`). Jamais recyclé, épargné par le clear screen d'un boss. */
  egg?: boolean;
  /** Son attaque de contact tue un soldat d'un coup (les quatre boss). */
  oneShot?: boolean;
  /** Bulle : au contact d'un soldat, le capture et le dévore (`dps` PV par seconde) en restant immobile ; la détruire le libère. */
  capture?: { dps: number };
  /** Sa flaque reste au sol à sa mort (une seule fois par alien) : un chaman peut le ressusciter. */
  revivable?: boolean;
  /** Chaman : à portée d'une flaque de slime mort, incante `cast` s puis ressuscite le slime avec `hpFrac` de ses PV. */
  /** Chaman : après `maxRevives` résurrections il ne peut plus en lancer pendant `lockout` s (puis le compte repart de zéro). */
  revive?: { range: number; cooldown: number; cast: number; hpFrac: number; maxRevives: number; lockout: number; zombie: ZombieStats };
  /** XP laissée à la mort, en globes bleus (voir data/progression.ts). */
  xp: number;
  /** Kamikaze : à sa mort le corps reste sur place, clignote `delay` s (zone rouge) puis explose : dégâts + recul aux soldats. */
  deathBlast?: { delay: number; radius: number; damage: number; knockback: number };
  /** À sa mort, `count` aliens `spawn` surgissent autour de son corps (chaman : 5 araignées). Invoqués : ni XP ni recrue ; pas pendant le clear screen d'un boss. */
  deathSpawn?: { spawn: AlienId; count: number };
  /** Langue : attrape un soldat à portée et le tire d'une fraction `pull` de la distance qui les sépare (jamais jusqu'à lui). */
  tongue?: { range: number; cooldown: number; pull: number; damage: number };
  /** Charge télégraphiée : s'arrête `windup` s (zone rouge devant lui) puis fonce sur `length` px ; les soldats dans la zone sont repoussés et blessés. */
  rush?: {
    cooldown: number;
    windup: number;
    length: number;
    width: number;
    speed: number;
    damage: number;
    knockback: number;
    /** Pendant la charge, laisse au sol toutes les `every` s une flaque de flammes (`fire`, brûle `dps` PV/s) ou un nuage de gel (`frost` : gèle le premier soldat qui y entre), de rayon `radius`, qui dure `ttl` s. */
    trail?: { kind: 'fire' | 'frost'; every: number; radius: number; ttl: number; dps: number };
    /** À la fin de la charge, lance `count` alien-projectiles `orb` régulièrement répartis dans toutes les directions (le premier dans le sens de la charge). */
    burst?: { orb: AlienId; count: number };
  };
  /**
   * Saut écrasant : toutes les `every` s, vise l'endroit où la squad ciblée SERA à l'impact (centre + vitesse × durée), à `maxDist` px
   * au plus. Préparation `windup` (télégraphe rouge au sol), vol `flight`, écrasement (tout soldat sous la zone de rayon `radius`
   * meurt), puis récupération `recover` sur place. `height` (affichage seulement) : hauteur en px du sprite au sommet de l'arc pendant le vol.
   */
  leap?: { every: number; windup: number; flight: number; recover: number; radius: number; maxDist: number; height?: number };
  /**
   * Couronne de pics (Giant Crab) : à la réception de chaque saut écrasant (`leap`, au moment de l'écrasement), il s'immobilise `aim` s (télégraphe rouge) puis fait
   * jaillir `rays` lignes de pics en étoile (angle de départ tiré au hasard), comme le lurker mais dans toutes les directions : chaque ligne s'étend en
   * `sweep` s sur `length` px (`turn` rad : pendant le télégraphe l'étoile TOURNE de cet angle au total autour de lui pour désorienter, 22,5° = un demi-écart entre deux lignes ; l'angle se fige au lâcher), `width` px de large ; un soldat est blessé (`damage`) une fois quand le front passe sur lui.
   */
  spikeRing?: { turn: number; aim: number; length: number; width: number; sweep: number; damage: number; rays: number };
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
    /** Rayon de l'impact (px). Aucun recul. */
    aoe: number;
    /** Flaque ralentissante laissée à l'impact (absent : aucune). */
    puddle?: { radius: number; ttl: number; slow: number };
    texture: string;
  };
  /** Échelle d'affichage (1 par défaut) ; le rayon de collision (`radius`) est à régler en conséquence. */
  scale?: number;
  /** Probabilité de base de lâcher une recrue. */
  recruitChance: number;
  /** Couleur de l'alien : éclair de tir, boule lobée… et, sans `goo`, de ses restes à sa mort. */
  color: number;
  /** Couleur de ses restes à sa mort (éclats, gelée, flaque au sol, flaque de cadavre) quand elle diffère de `color` (ex. shooter bleu à tir rouge). */
  goo?: number;
  hpBarWidth: number;
}

export const ALIENS: Record<AlienId, AlienDef> = {
  /** Petit cafard (id historique `gling`, ex-petit slime rose) : rapide, fragile, arrive en essaims. */
  gling: {
    id: 'gling',
    hp: 22.5, // avant : 15 (×1.5 intégré le 09/10) ; -10 %
    speed: 225, // avant : 180 (×1.25 intégré le 09/10) ; +40 %
    radius: 13,
    mass: 0.6,
    damage: 2.5,
    attackCooldown: 0.3,
    target: 'nearest',
    revivable: true,
    xp: 1,
    recruitChance: 0.026, // avant : 0.02 (×1.3 intégré le 09/10)
    color: 0xa982e8, // violet du cafard (éclaboussure à la mort)
    goo: 0xa231ce, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 22,
  },
  /** Slime de base (vert). */
  slime: {
    id: 'slime',
    hp: 82.5, // avant : 55 (×1.5 intégré le 09/10)
    speed: 90, // avant : 72 (×1.25 intégré le 09/10)
    radius: 19.5,
    mass: 1,
    damage: 6,
    attackCooldown: 0.4,
    target: 'nearest',
    revivable: true,
    xp: 2,
    recruitChance: 0.065, // avant : 0.05 (×1.3 intégré le 09/10)
    color: 0x8fd14f,
    goo: 0x52b51d, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 30,
  },
  /** Slime bombardier (gros, bleu) : lent et costaud, lance des boules de gelée en cloche (zone au sol, télégraphiée en rouge). */
  shooter: {
    id: 'shooter',
    hp: 105, // avant : 70 (×1.5 intégré le 09/10)
    speed: 68.75, // avant : 55 (×1.25 intégré le 09/10)
    radius: 24,
    mass: 3,
    damage: 5,
    attackCooldown: 0.5,
    target: 'nearest',
    lob: { range: 240, cooldown: 2.6, flight: 1.1, damage: 22, aoe: 75, texture: 'fx_slime_ball', lead: [0.2, 0.8], scatter: 45 }, // portée -20 % ; anticipation partielle au hasard + dispersion (08/10 : il anticipait trop)
    revivable: true,
    xp: 6,
    recruitChance: 0.13, // avant : 0.1 (×1.3 intégré le 09/10)
    color: 0x9b1c3c, // rouge bordeaux (boule lobée, éclair de tir)
    goo: 0x1f41a9, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 40,
  },
  /** Kamikaze : fonce sur les soldats ; le tuer déclenche une explosion retardée (il faut le tuer de loin). */
  kamikaze: {
    id: 'kamikaze',
    hp: 37.5, // avant : 25 (×1.5 intégré le 09/10)
    speed: 131.25, // avant : 105 (×1.25 intégré le 09/10)
    radius: 23.5,
    mass: 1,
    damage: 2,
    attackCooldown: 0.4,
    target: 'nearest',
    deathBlast: { delay: 1, radius: 95, damage: 60, knockback: 2200 }, // recul = impulsion / masse du soldat (3), amorti par CROWD.knockDamp : ~147 px (×2 ; 1100 ≈ 73 px, 560 d'origine ≈ 37 px)
    xp: 3,
    recruitChance: 0.039, // avant : 0.03 (×1.3 intégré le 09/10)
    color: 0xe8333a,
    goo: 0xf0a020, // jaune orangé comme son corps (éclats et flaque de mort)
    hpBarWidth: 28,
  },
  /** Grenouille : reste à distance, tire la langue sur un soldat et le tire vers elle. */
  toad: {
    id: 'toad',
    hp: 60, // avant : 40 (×1.5 intégré le 09/10)
    speed: 87.5, // avant : 70 (×1.25 intégré le 09/10)
    radius: 25,
    mass: 1.4,
    damage: 3,
    attackCooldown: 0.45,
    target: 'nearest',
    tongue: { range: 270, cooldown: 3.2, pull: 0.4, damage: 4 },
    xp: 4,
    recruitChance: 0.052, // avant : 0.04 (×1.3 intégré le 09/10)
    color: 0x3fd0a0,
    goo: 0xc20d55, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 30,
  },
  /** Rhinocéros : lent à quatre pattes, mais charge toutes les 5 s dans une zone signalée en rouge. */
  charger: {
    id: 'charger',
    hp: 700, // avant : 300 (×1.5 intégré le 09/10) ; ×3
    speed: 87.5, // avant : 70 (×1.25 intégré le 09/10) ; +30 % (40, 07/10)
    radius: 39,
    mass: 5,
    damage: 20,
    attackCooldown: 0.5,
    target: 'nearest',
    cleave: 70, // mêlée en zone (07/10)
    rush: { cooldown: 5, windup: 0.4725, length: 600, width: 80, speed: 1000, damage: 50, knockback: 5700 }, // préparation −30 % (0,675) et charge +30 % (416 px), 07/10 ; recul = impulsion / masse du soldat (3), amorti par CROWD.knockDamp (5) : ~107 px (700 ne donnait que ~47 px)
    xp: 10,
    recruitChance: 0.195, // avant : 0.15 (×1.3 intégré le 09/10)
    color: 0xb03a3a,
    goo: 0xeec830, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 44,
  },
  /** Cracheur : crache quelques boules violettes en cloche qui laissent une flaque ralentissante. */
  spitter: {
    id: 'spitter',
    hp: 150, // avant : 100 (×1.5 intégré le 09/10)
    speed: 112.5, // avant : 90 (×1.25 intégré le 09/10)
    radius: 28,
    mass: 1.2,
    damage: 2,
    attackCooldown: 0.45,
    target: 'nearest',
    spray: { range: 462, cooldown: 3, pellets: 3, scatter: 60, flight: 1.07, lead: 0.3, damage: 14, aoe: 38, texture: 'fx_spit' }, // boules vertes, plus de flaque (07/10)
    // nuage ralentissant retiré pour l'instant (08/10) ; pour le remettre : cloud: { every: 6, range: 560, lead: 0.6, radius: 66.5, ttl: 3.5, slow: 0.5 }
    xp: 4,
    recruitChance: 0.052, // avant : 0.04 (×1.3 intégré le 09/10)
    color: 0xb060e0,
    goo: 0xab1b7b, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 30,
  },
  /** Chaman : slime magique qui reste en retrait et ressuscite les slimes morts depuis leur flaque (une fois chacun). */
  shaman: {
    id: 'shaman',
    hp: 90, // avant : 60 (×1.5 intégré le 09/10)
    speed: 75, // avant : 60 (×1.25 intégré le 09/10)
    radius: 24,
    mass: 1.5,
    damage: 1.5,
    attackCooldown: 0.5,
    target: 'nearest',
    frost: { every: 9, range: 560, count: 2, gap: [103.5, 184], radius: 25.5, ttl: 10 }, // flocons à distance (07/10) : à 103,5-184 px du bord réel de la squad (+15 % le 09/10, 90-160 avant)
    revive: { range: 330, cooldown: 3.5, cast: 1.3, hpFrac: 1, maxRevives: 3, lockout: 30, zombie: { copies: 2, hpMul: 3, dmgMul: 1, speedMul: 1.35, attackMul: 3 } }, // le ressuscité est un ZOMBIE (réglages `zombie`, vue du chaman)
    deathSpawn: { spawn: 'spider', count: 5 }, // à sa mort : 5 araignées
    xp: 8,
    recruitChance: 0.13, // avant : 0.1 (×1.3 intégré le 09/10)
    color: 0xffd84a,
    goo: 0x8318a2, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 34,
  },
  /** Bâtisseur de murs : de très loin, fait surgir (après un télégraphe jaune) des murs allongés autour de la squad pour gêner sa fuite. */
  wall: {
    id: 'wall',
    hp: 225, // avant : 150 (×1.5 intégré le 09/10)
    speed: 75, // avant : 60 (×1.25 intégré le 09/10)
    radius: 32.5,
    mass: 1.3,
    damage: 2,
    attackCooldown: 0.5,
    target: 'nearest',
    wall: { range: 640, cooldown: 6, windup: 1.1, count: 2, ring: 190, spread: 0.9, length: 134, rock: { radius: 22, ttl: 5.6 } }, // −30 % (était 8 s)
    xp: 4,
    recruitChance: 0.052, // avant : 0.04 (×1.3 intégré le 09/10)
    color: 0x9a8066,
    goo: 0xd7a051, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 30,
  },
  /** Lurker : s'enterre sur le trajet anticipé de la squad et la frappe d'une ligne de pics (comme les lurkers de StarCraft). */
  lurker: {
    id: 'lurker',
    hp: 600, // avant : 350 (×1.5 intégré le 09/10) ; ×3
    speed: 200, // avant : 120 (×1.25 intégré le 09/10)
    radius: 29.5,
    mass: 2,
    damage: 0,
    attackCooldown: 1,
    target: 'nearest',
    lurk: { lead: 2.4, digRange: 168, digTime: 0.7, rise: 0.6, wait: 7, rewait: 2, trigger: 432, aim: 0.6, length: 456, width: 44, sweep: 0.456, damage: 60, cooldown: 1.6 },
    xp: 8,
    recruitChance: 0.104, // avant : 0.08 (×1.3 intégré le 09/10)
    color: 0x7a5a9a,
    goo: 0xd42d5a, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 36,
  },
  /** Bulle flottante : rapide et très résistante ; elle avale un soldat et le digère sur place tant qu'on ne l'a pas détruite. */
  bubble: {
    id: 'bubble',
    hp: 3500, // avant : 2000 (×1.5 intégré le 09/10) ; ×3
    speed: 280, // avant : 210 (×1.25 intégré le 09/10)
    radius: 22,
    mass: 3,
    damage: 0,
    attackCooldown: 1,
    target: 'specialist',
    floats: true,
    dash: { range: 380, speedMul: 1.6 }, // la squad court à 210 : sans élan, la bulle ne la rattrape jamais
    maxPerWave: 1, // trop forte en nombre (07/10) : une seule par vague et par squad, invités et ×1,5 compris
    capture: { dps: 30 }, // digestion : 25 → 50 → 40 (−20 %, 07/10)
    xp: 12,
    recruitChance: 0, // avant : 0 (×1.3 intégré le 09/10)
    color: 0x8fe0ff,
    goo: 0x35b4d8, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 46,
  },
  /** Slime de feu : laisse derrière lui une traînée de flammes qui brûle les soldats qui marchent dedans. */
  burner: {
    id: 'burner',
    hp: 120, // avant : 80 (×1.5 intégré le 09/10) ; x2
    speed: 106.25, // avant : 85 (×1.25 intégré le 09/10)
    radius: 29,
    mass: 1,
    damage: 3,
    attackCooldown: 0.4,
    target: 'nearest',
    trail: { every: 0.22, radius: 24, ttl: 11.25, dps: 31.2 },
    xp: 4,
    recruitChance: 0.039, // avant : 0.03 (×1.3 intégré le 09/10)
    color: 0xff5a1a,
    goo: 0xcb3d15, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 30,
  },
  /** Mini-boss (2:00) : énorme rhinocéros, charge tous les 4,5 s dans un couloir large signalé en rouge. */
  boss_rhino: {
    id: 'boss_rhino',
    hp: 10000, // 900 × 11 (l'ancien multiplicateur global bossHpMul, intégré aux PV de base le 09/10)
    speed: 89.375, // avant : 71.5 (×1.25 intégré le 09/10) ; 55 + 30 %
    radius: 50,
    mass: 14,
    damage: 7,
    attackCooldown: 1,
    target: 'nearest',
    oneShot: true,
    rush: { cooldown: 3.6, windup: 0.75, length: 600, width: 120, speed: 1300, damage: 45, knockback: 5700 }, // ~380 px : ×3 (1900 ≈ 127 px ; 850 d'origine ≈ 57 px)
    boss: { kind: 'mini' },
    xp: 150,
    recruitChance: 1.3, // avant : 1 (×1.3 intégré le 09/10)
    color: 0xb03a3a,
    goo: 0x22b6ed, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 100,
  },
  /**
   * Mini-boss jumeaux (7:30), calqués sur le Rhinocéros Alpha : le rhinocéros de FEU laisse une traînée de flammes pendant sa charge puis lance 8 orbes de
   * feu dans toutes les directions ; celui de GLACE laisse des nuages de gel puis 8 orbes de glace. Ils arrivent ensemble (`data/waves.ts`, niveau 9, config 5).
   */
  boss_rhino_fire: {
    id: 'boss_rhino_fire',
    hp: 15000, // chacun (1100 × 11) : 2 × 12100 = entre le Scarab (5:00) et le Giant Crab (10:00)
    speed: 89.375, // avant : 71.5 (×1.25 intégré le 09/10)
    radius: 50,
    mass: 14,
    damage: 7,
    attackCooldown: 1,
    target: 'nearest',
    oneShot: true,
    rush: { cooldown: 5.14, windup: 0.75, length: 600, width: 120, speed: 1300, damage: 45, knockback: 5700, trail: { kind: 'fire', every: 0.03, radius: 36, ttl: 9, dps: 31.2 }, burst: { orb: 'fire_orb', count: 8 } },
    boss: { kind: 'mini' },
    xp: 300,
    recruitChance: 1.3, // avant : 1 (×1.3 intégré le 09/10)
    color: 0xff5a1a,
    goo: 0xe0521a, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 100,
  },
  boss_rhino_ice: {
    id: 'boss_rhino_ice',
    hp: 15000,
    speed: 89.375, // avant : 71.5 (×1.25 intégré le 09/10)
    radius: 50,
    mass: 14,
    damage: 7,
    attackCooldown: 1,
    target: 'nearest',
    oneShot: true,
    rush: { cooldown: 5.14, windup: 0.75, length: 600, width: 120, speed: 1300, damage: 45, knockback: 5700, trail: { kind: 'frost', every: 0.03, radius: 38, ttl: 8, dps: 0 }, burst: { orb: 'ice_orb', count: 8 } },
    boss: { kind: 'mini' },
    xp: 300,
    recruitChance: 1.3, // avant : 1 (×1.3 intégré le 09/10)
    color: 0x7fd8ff,
    goo: 0x7fe3f0,
    hpBarWidth: 100,
  },
  /** Mini-boss (5:00) : Scarab, s'enterre et ressort sur la squad, puis fait tomber une pluie de stalactites. */
  boss_scarab: {
    id: 'boss_scarab',
    hp: 20000, // 1500 × 11
    speed: 187.5, // avant : 150 (×1.25 intégré le 09/10) ; ×3
    radius: 68,
    mass: 50,
    damage: 15,
    attackCooldown: 1.2,
    oneShot: true,
    target: 'center',
    shield: { pct: 0.05, regenDelay: 5, regenTime: 4 }, // plus de slam (08/10) : remplacé par la pluie de stalactites
    stalactites: { count: 8, onSoldiers: 3, spread: 260, radius: 55, delay: 0.825, stagger: 0.12, damage: 80, knockback: 300, walk: { count: 3, onSoldiers: 2 } }, // + petite pluie de 3 quand il marche (08/10)
    burrow: { every: 5, dig: 0.6, wait: 2.1, lock: 1.5, rise: 0.47, radius: 180, damage: 60, knockback: 600, lead: 1, lunge: 3 }, // s'enterre plus souvent (8 → 5 s) ; sort SUR la squad ; 1,5 s avant, la direction du télégraphe se fige mais il suit encore la squad sur cet axe (08/10)
    boss: { kind: 'mini' },
    xp: 400,
    recruitChance: 1.3, // avant : 1 (×1.3 intégré le 09/10)
    color: 0xc01c40,
    goo: 0xbe5527, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 140,
  },
  /** Mini-boss (1:00) : énorme gling rose, s'arrête toutes les 4 s pour faire apparaître 22 araignées (`spider`) en 1,07 s. */
  boss_gling: {
    id: 'boss_gling',
    hp: 6000, // 600 × 11 (600 = +30 % de 500)
    speed: 106.25, // avant : 85 (×1.25 intégré le 09/10)
    radius: 43.5,
    mass: 14,
    damage: 5,
    attackCooldown: 0.6,
    oneShot: true,
    target: 'nearest',
    swarm: { every: 4, duration: 1.07, count: 22, spawn: 'spider' },
    boss: { kind: 'mini' },
    xp: 100,
    recruitChance: 1.3, // avant : 1 (×1.3 intégré le 09/10)
    color: 0xff5aa8,
    hpBarWidth: 100,
  },
  /** Slime bleu ciel (difficulté 3/10, dès 45 s) : lance une boucle de glace qui gèle les soldats touchés dans un glaçon. */
  iceballer: {
    id: 'iceballer',
    hp: 105, // avant : 70 (×1.5 intégré le 09/10)
    speed: 77.5, // avant : 62 (×1.25 intégré le 09/10)
    radius: 17,
    mass: 1.1,
    damage: 4,
    attackCooldown: 0.5,
    target: 'nearest',
    maxPerWave: 2,
    ice: { range: 420, cooldown: 4.5, lead: 0.5, orb: 'ice_orb' }, // lance un orbe de glace destructible (08/10 ; un flocon avant)
    revivable: true,
    xp: 5,
    recruitChance: 0.091, // avant : 0.07 (×1.3 intégré le 09/10)
    color: 0x7fd8ff,
    goo: 0x2e93b4, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 30,
  },
  /** Orbe de glace lancé par le slime de glace : projectile destructible (500 PV), gèle le soldat touché. */
  ice_orb: {
    id: 'ice_orb',
    hp: 500,
    speed: 403,
    radius: 14,
    mass: 0.5,
    damage: 6,
    attackCooldown: 1,
    target: 'nearest',
    floats: true,
    projectile: { life: 1.56, ring: 44 }, // portée du lanceur × 1,5 / vitesse : il file un peu au-delà de sa cible
    xp: 0,
    recruitChance: 0, // avant : 0 (×1.3 intégré le 09/10)
    color: 0x9fe3ff,
    goo: 0x9fe3ff,
    hpBarWidth: 30,
  },
  /** Orbe de feu lancé par le rhinocéros de feu : projectile destructible (500 PV) qui laisse une traînée de flammes au sol et brûle le soldat touché. */
  fire_orb: {
    id: 'fire_orb',
    hp: 500,
    speed: 403,
    radius: 14,
    mass: 0.5,
    damage: 18,
    attackCooldown: 1,
    target: 'nearest',
    floats: true,
    projectile: { life: 1.56, ring: 44, kind: 'fire' },
    trail: { every: 0.1, radius: 22, ttl: 8, dps: 31.2 },
    xp: 0,
    recruitChance: 0, // avant : 0 (×1.3 intégré le 09/10)
    color: 0xff8a2a,
    goo: 0xff8a2a,
    hpBarWidth: 30,
  },
  /** Boss final (10:00) : Giant Crab, saut écrasant et jets de gelée. Le tuer gagne la partie. */
  boss_crab: {
    id: 'boss_crab',
    hp: 50000, // 3000 × 11
    speed: 60, // avant : 48 (×1.25 intégré le 09/10)
    radius: 75, // 3× plus gros (affichage et collision)
    scale: 3,
    mass: 30,
    damage: 12.5,
    attackCooldown: 1.2,
    oneShot: true,
    target: 'center',
    leap: { every: 10, windup: 0.6, flight: 0.9, recover: 0.7, radius: 150, maxDist: 900, height: 200 },
    spikeRing: { turn: Math.PI / 8, aim: 0.45, length: 760, width: 44, sweep: 0.76, damage: 60, rays: 8 }, // comme les pics du lurker (380 px, 0,5 s) : 8 directions, 2× plus long
    lob: { range: 620, cooldown: 3, flight: 1, damage: 20, aoe: 85, texture: 'fx_blob_red', count: 3, keepMoving: true, lead: [1.4, 1.8], scatter: 80, spawn: 5 }, // grosses boules rouges : 20 dégâts en zone + 3 araignées enragées (le poison, `lob.poison`, est disponible pour un autre usage)
    boss: { kind: 'final' },
    xp: 300,
    recruitChance: 1.3, // avant : 1 (×1.3 intégré le 09/10)
    color: 0xd9435a,
    hpBarWidth: 200,
  },
  /**
   * Araignée rouge : calquée sur le gling (mêmes stats : rapide, fragile, arrive en essaims). C'est elle que la Gling Mère fait apparaître
   * (`boss_gling.swarm.spawn`) à la place des glings. Ajoutée en DERNIER : l'ordre de `ALIENS` donne l'index réseau des aliens (`Protocol.ts`).
   */
  spider: {
    id: 'spider',
    hp: 22.5, // avant : 15 (×1.5 intégré le 09/10)
    speed: 225, // avant : 180 (×1.25 intégré le 09/10)
    radius: 18,
    mass: 0.6,
    damage: 2.5,
    attackCooldown: 0.3,
    target: 'nearest',
    revivable: true,
    xp: 1,
    recruitChance: 0.026, // avant : 0.02 (×1.3 intégré le 09/10)
    color: 0xe0364a, // rouge de l'araignée (éclaboussure à la mort)
    goo: 0xc41f2e, // couleur principale de son sprite (éclats et flaque de mort)
    hpBarWidth: 22,
  },
  /**
   * Œuf d'alien (boss_egg) : laissé sur le cadavre de chaque boss tué (sauf le final). Immobile, inoffensif ; ses 1000 PV sont exacts (sans escalade ni
   * multiplicateur). Détruit, il libère les globes d'upgrade roses (`DIFFICULTY.chestOrbs` par joueur vivant). Ajouté en DERNIER : l'ordre de `ALIENS` donne l'index réseau.
   */
  boss_egg: {
    id: 'boss_egg',
    hp: 2500,
    speed: 0,
    radius: 27,
    mass: 60,
    damage: 0,
    attackCooldown: 99,
    target: 'nearest',
    egg: true,
    xp: 0,
    recruitChance: 0,
    color: 0xb8e060,
    goo: 0xc8f070,
    hpBarWidth: 60,
  },
};

/**
 * Ennemis réellement en jeu pour l'instant : les autres restent définis (données, textures, réseau) mais
 * ils ne figurent pas dans le script de vagues par défaut (data/waves.ts), mais le Gestionnaire de vagues peut les utiliser.
 */
export const ACTIVE_ALIENS: AlienId[] = ['slime', 'gling', 'shooter', 'kamikaze', 'toad', 'charger', 'spitter', 'shaman', 'wall', 'bubble', 'burner', 'lurker', 'iceballer', 'spider'];

/** Réglages des zombies (ressuscités par le chaman), lus en direct : modifiables dans la vue d'unité du chaman. */
export function zombieStats(): ZombieStats {
  return ALIENS.shaman.revive!.zombie;
}
