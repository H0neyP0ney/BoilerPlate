import { range, type AssetEntry } from '@xiao/engine';

/**
 * Planches de sprites du jeu (fichiers dans public/assets/). Chaque visuel
 * déclaré ici remplace le dessin procédural du même id ; les autres restent
 * procéduraux. Liste des ids et conventions : ASSETS.md (racine du jeu).
 *
 * Exemples (à décommenter / adapter) :
 *
 *   // Planche en grille : 1 soldat, 4 frames idle + 6 frames de marche
 *   {
 *     type: 'sheet', url: 'soldiers/medic.png', frameWidth: 64, frameHeight: 64,
 *     sprites: {
 *       soldier_medic: {
 *         originY: 0.95, scale: 0.8,
 *         anims: { idle: { frames: range(0, 3), fps: 6 }, walk: { frames: range(4, 9), fps: 12 } },
 *       },
 *       gun_medic: { hidden: true },        // arme déjà dessinée dans la planche
 *     },
 *   },
 *
 *   // Export Aseprite (tags "idle", "walk"…)
 *   { type: 'aseprite', url: 'aliens/slime.png', json: 'aliens/slime.json',
 *     sprites: { alien_slime: { originY: 0.9, tags: { idle: 'idle', walk: 'walk' } } } },
 *
 *   // Un PNG isolé
 *   { type: 'image', id: 'rock_big', url: 'decor/rock_big.png', originY: 0.85 },
 */
export const ASSETS: AssetEntry[] = [
  // Obstacles volcaniques — art-src/obstacle_N.png convertis en WebP. Échelle, ancrage et hitbox : data/obstacles.ts.
  // Taches sombres posées sous les obstacles pour les fondre dans le sol — art-src/tache_N.png réduits de moitié (WebP).
  ...[1, 2, 3, 4].map((n): AssetEntry => ({ type: 'image', id: `tache_${n}`, url: `decor/tache_${n}.webp` })),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): AssetEntry => ({ type: 'image', id: `obstacle_${n}`, url: `decor/obstacle_${n}.webp` })),
  // Sol — texture qui se raccorde, répétée sur toute la carte (art-src/ground.png → 1024 px WebP ; voir view/ArenaView.ts).
  { type: 'image', id: 'ground_tile', url: 'ground/ground.webp' },
  // Globe d'XP — art-src/globe_xp.png converti en WebP (60 px, taille d'origine). Affiché à ~32 px de base (WorldView.syncOrbs) ; sans cette image : orbe procédural `fx_xp`.
  { type: 'image', id: 'xp_orb', url: 'fx/xp.webp' },
  // Recrue « bonus +1 » — art-src/bonus_recrue/*.png réduits en WebP, assemblés en une texture `recruit_trooper` (art/recruits.ts).
  ...['globe', 'ring', 'gunner', 'plus_one', 'star'].map((n): AssetEntry => ({ type: 'image', id: `recruit_part_${n}`, url: `recruit/${n}.webp` })),
  // Slime de base (`slime`, vert).
  // art-src/slime_walk.png (grille 3×3) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/slime.pack.json — 9 cases de 82×78, cycle de marche, regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/slime.png',
    frameWidth: 82,
    frameHeight: 78,
    sprites: {
      alien_slime: {
        originX: 0.507,
        originY: 0.881,
        scale: 0.73,
        shadow: 1.25,
        anchors: { 'walk:right': [0.507, 0.8052], 'walk:left': [0.514, 0.8052] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 8), fps: 5 },
          walk: { frames: range(0, 8), fps: 12 },
        },
      },
    },
  },
  // Petite coccinelle violette (`gling`).
  // art-src/gling_walk.png (grille 3×3) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/gling.pack.json — 9 cases de 64×48, cycle de marche, regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/gling.png',
    frameWidth: 64,
    frameHeight: 48,
    sprites: {
      alien_gling: {
        originX: 0.531,
        originY: 0.916,
        scale: 0.7,
        shadow: 1.45,
        anchors: { 'walk:right': [0.4698, 0.8111], 'walk:left': [0.5302, 0.8111] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 8), fps: 8 },
          walk: { frames: range(0, 8), fps: 18 },
        },
      },
    },
  },
  // Canon bleu (`shooter`, gros, lance des boules de gelée). Plus gros (rayon 24 contre 16) et plus lent.
  // art-src/shooter_walk.png (grille 3×3) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/shooter.pack.json — 9 cases de 66×59, cycle de marche, regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/shooter.png',
    frameWidth: 66,
    frameHeight: 59,
    sprites: {
      alien_shooter: {
        originX: 0.558,
        originY: 0.936,
        scale: 1.51,
        shadow: 1.25,
        muzzleFlash: true,
        muzzle: [0.2, 0.41],
        anchors: { 'walk:right': [0.4379, 0.8643], 'walk:left': [0.5621, 0.8643] },
        muzzles: {
          walk: [null, [0.2078, 0.3925], [0.2, 0.4714], [0.2, 0.4188], [0.2, 0.3574], [0.2, 0.4451], [0.2, 0.4538], [0.2, 0.3749]],
        },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 8), fps: 4 },
          walk: { frames: range(0, 8), fps: 9 },
        },
      },
    },
  },
  // Giant Crab (boss final de 10:00) — art-src/boss_crab.png (grille 4×4, vu de face) réduit par
  // node tools/pack-grids.mjs games/xiao-swarm/art-src/crab.pack.json (option flipX : planche retournée en X) — 16 cases de 255×208.
  // Cycle de marche ; idle = même cycle, plus lent (plus d'animation « attack » : le saut écrasant reste en marche).
  {
    type: 'sheet',
    url: 'aliens/crab.png',
    frameWidth: 255,
    frameHeight: 208,
    sprites: {
      alien_boss_crab: {
        originX: 0.425,
        originY: 0.917,
        scale: 1.31,
        shadow: 0.75,
        anchors: { 'walk:right': [0.5156, 0.716], 'walk:left': [0.4903, 0.716] },
        anims: {
          idle: { frames: range(0, 15), fps: 8 },
          walk: { frames: range(0, 15), fps: 12 },
        },
      },
    },
  },
  // Rhinocéros Alpha (mini-boss de 2:00).
  // art-src/boss_rhino_walk.png (grille 3×3) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/boss_rhino.pack.json — 9 cases de 128×83, cycle de marche, regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/boss_rhino.png',
    frameWidth: 128,
    frameHeight: 83,
    sprites: {
      alien_boss_rhino: {
        originX: 0.505,
        originY: 0.962,
        scale: 1.54,
        shadow: 1.7,
        anchors: { 'walk:right': [0.4657, 0.8322], 'walk:left': [0.5399, 0.8322] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 8), fps: 8 },
          walk: { frames: range(0, 8), fps: 12 },
        },
      },
    },
  },
  // Charognard jaune cornu (`charger`, charge télégraphiée).
  // art-src/charger_walk.png (grille 3×3) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/charger.pack.json — 9 cases de 126×97, cycle de marche, regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/charger.png',
    frameWidth: 126,
    frameHeight: 97,
    sprites: {
      alien_charger: {
        originX: 0.571,
        originY: 0.957,
        scale: 1.02,
        shadow: 1.95,
        anchors: { 'walk:right': [0.4946, 0.7948], 'walk:left': [0.5194, 0.7948] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 8), fps: 8 },
          walk: { frames: range(0, 8), fps: 12 },
        },
      },
    },
  },
  // Kamikaze : boule orange à pattes (`kamikaze`).
  // art-src/kamikaze_walk.png (grille 3×3) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/kamikaze.pack.json — 9 cases de 65×51, cycle de marche, regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/kamikaze.png',
    frameWidth: 65,
    frameHeight: 51,
    sprites: {
      alien_kamikaze: {
        originX: 0.481,
        originY: 0.914,
        scale: 1.63,
        shadow: 2.35,
        anchors: { 'walk:right': [0.4906, 0.7764], 'walk:left': [0.5015, 0.7764], 'idle:right': [0.482, 0.635], 'idle:left': [0.4966, 0.6325] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 8), fps: 8 },
          walk: { frames: range(0, 8), fps: 16 },
        },
      },
    },
  },
  // Canon rose (`toad`).
  // art-src/toad_walk.png (grille 3×3) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/toad.pack.json — 9 cases de 66×49, cycle de marche, regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/toad.png',
    frameWidth: 66,
    frameHeight: 49,
    sprites: {
      alien_toad: {
        originX: 0.502,
        originY: 0.931,
        scale: 1.98,
        shadow: 3,
        muzzleFlash: true,
        muzzle: [0.26, 0.47],
        anchors: { 'walk:right': [0.4944, 0.8187], 'walk:left': [0.498, 0.8187] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 8), fps: 6 },
          walk: { frames: range(0, 8), fps: 12 },
        },
      },
    },
  },
  // Cracheur : scorpion magenta (`spitter`).
  // art-src/spitter_walk.png (grille 3×3) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/spitter.pack.json — 9 cases de 63×54, cycle de marche, regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/spitter.png',
    frameWidth: 63,
    frameHeight: 54,
    sprites: {
      alien_spitter: {
        originX: 0.509,
        originY: 0.915,
        scale: 2.24,
        shadow: 2.7,
        muzzleFlash: true,
        muzzle: [0.57, 0.27],
        anchors: { 'walk:right': [0.4375, 0.7795], 'walk:left': [0.4988, 0.7795] },
        muzzles: {
          walk: [[0.404, 0.6703], [0.3985, 0.6961], [0.3985, 0.6574], [0.3929, 0.7155], [0.404, 0.6832], [0.404, 0.7025], [0.3874, 0.6832], [0.3985, 0.709], [0.3929, 0.709]],
        },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 8), fps: 6 },
          walk: { frames: range(0, 8), fps: 12 },
        },
      },
    },
  },
  // Lanceur de cailloux : golem de pierre (`wall`).
  // art-src/wall_walk.png (grille 3×3) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/wall.pack.json — 9 cases de 61×45, cycle de marche, regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/wall.png',
    frameWidth: 61,
    frameHeight: 45,
    sprites: {
      alien_wall: {
        originX: 0.458,
        originY: 0.917,
        scale: 2.15,
        shadow: 2.6,
        anchors: { 'walk:right': [0.5007, 0.8013], 'walk:left': [0.5136, 0.8013] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 8), fps: 6 },
          walk: { frames: range(0, 8), fps: 12 },
        },
      },
    },
  },
  // Araignée de lave (`burner`, laisse une traînée de feu).
  // art-src/burner_walk.png (grille 3×3) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/burner.pack.json — 9 cases de 65×47, cycle de marche, regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/burner.png',
    frameWidth: 65,
    frameHeight: 47,
    sprites: {
      alien_burner: {
        originX: 0.616,
        originY: 0.907,
        scale: 1.71,
        shadow: 2.2,
        anchors: { 'walk:right': [0.5026, 0.6536], 'walk:left': [0.4974, 0.6536] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 8), fps: 7 },
          walk: { frames: range(0, 8), fps: 14 },
        },
      },
    },
  },
  // Lurker : crabe à pics d'os (`lurker`, s'enterre et lance des pics).
  // art-src/lurker_walk.png (grille 3×3) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/lurker.pack.json — 9 cases de 61×43, cycle de marche, regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/lurker.png',
    frameWidth: 61,
    frameHeight: 43,
    sprites: {
      alien_lurker: {
        originX: 0.453,
        originY: 0.885,
        scale: 2.07,
        shadow: 2.15,
        anchors: { 'walk:right': [0.497, 0.7275], 'walk:left': [0.5014, 0.7275] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 8), fps: 6 },
          walk: { frames: range(0, 8), fps: 12 },
        },
      },
    },
  },
  // Bulle : méduse flottante (`bubble`, capture un soldat) ; originY relevé : elle flotte au-dessus de son ombre.
  // art-src/bubble_walk.png (grille 3×3) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/bubble.pack.json — 9 cases de 64×69, cycle de marche, regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/bubble.png',
    frameWidth: 64,
    frameHeight: 69,
    sprites: {
      alien_bubble: {
        originX: 0.467,
        originY: 1.057,
        scale: 1.59,
        shadow: 1.75,
        anchors: { 'walk:right': [0.4593, 0.7642], 'walk:left': [0.533, 0.7642] },
        anims: {
          idle: { frames: range(0, 8), fps: 6 },
          walk: { frames: range(0, 8), fps: 10 },
        },
      },
    },
  },
  // Scarab (mini-boss de 5:00).
  // art-src/boss_scarab_walk.png (grille 3×3) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/boss_scarab.pack.json — 9 cases de 138×114, cycle de marche, regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/boss_scarab.png',
    frameWidth: 138,
    frameHeight: 114,
    sprites: {
      alien_boss_scarab: {
        originX: 0.551,
        originY: 0.933,
        scale: 1.7,
        shadow: 1.25,
        anchors: { 'walk:right': [0.4897, 0.7276], 'walk:left': [0.5056, 0.7276] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 8), fps: 8 },
          walk: { frames: range(0, 8), fps: 12 },
        },
      },
    },
  },
  // Chaman : crustacé violet (`shaman`, ressuscite les slimes).
  // art-src/shaman_walk.png (grille 3×3, option flipX : planche retournée en X) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/shaman.pack.json — 9 cases de 64×49, cycle de marche ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/shaman.png',
    frameWidth: 64,
    frameHeight: 49,
    sprites: {
      alien_shaman: {
        originX: 0.525,
        originY: 0.918,
        scale: 1.83,
        shadow: 2.2,
        anchors: { 'walk:right': [0.4778, 0.7823], 'walk:left': [0.5033, 0.7823] },
        anims: {
          idle: { frames: range(0, 8), fps: 6 },
          walk: { frames: range(0, 8), fps: 12 },
        },
      },
    },
  },
  // Gunner — assemblé depuis art-src/gunner_{idle,walk}_2.png (node tools/pack-grids.mjs games/xiao-swarm/art-src/gunner.pack.json).
  // 32 cases de 67×52, pieds alignés : idle 0-15, walk 16-31. Pas d'animation de mort pour l'instant (gunner_death.png
  // de l'ancienne version reste dans art-src). Personnage tourné vers la droite (retourné par le jeu pour la gauche) ;
  // l'arme fait partie du dessin.
  {
    type: 'sheet',
    url: 'soldiers/gunner.png',
    frameWidth: 67,
    frameHeight: 52,
    sprites: {
      soldier_trooper: {
        originX: 0.3671,
        originY: 0.8946,
        scale: 1.25,
        muzzleFlash: true,
        muzzle: [0.8561, 0.6376],
        anchors: { 'idle:right': [0.3515, 0.8854], 'idle:left': [0.6463, 0.8854], 'walk:left': [0.6514, 0.9127], 'walk:right': [0.339, 0.9127] },
        muzzles: {
          idle: [[0.8968, 0.4058], [0.9055, 0.3908], [0.9026, 0.3983], [0.9055, 0.4134], [0.9143, 0.4171], [0.9143, 0.4397], [0.9202, 0.4397], [0.9289, 0.4435], [0.9231, 0.4397], [0.926, 0.4284], [0.926, 0.4134], [0.9231, 0.4021], [0.9062, 0.3983], [0.9143, 0.3908], [0.9085, 0.3832], [0.9114, 0.3908]],
          walk: [[0.9026, 0.4209], [0.9026, 0.4284], [0.9026, 0.4548], [0.9026, 0.436], [0.9026, 0.4171], [0.9114, 0.4247], [0.9085, 0.4322], [0.9114, 0.4171], [0.9055, 0.4134], [0.9026, 0.4322], [0.9055, 0.4548], [0.9114, 0.4209], [0.9085, 0.3945], [0.9114, 0.3983], [0.9085, 0.4171], [0.9143, 0.4209]],
        },
        anims: {
          idle: { frames: range(0, 15), fps: 8 },
          walk: { frames: range(16, 31), fps: 16 },
        },
      },
      gun_trooper: { hidden: true }, // l'arme est dessinée dans la planche
    },
  },
];
