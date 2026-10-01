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
 *     sprites: { alien_slime_basic: { originY: 0.9, tags: { idle: 'idle', walk: 'walk' } } } },
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
  // Recrue « bonus +1 » — art-src/bonus_recrue/*.png réduits en WebP, assemblés en une texture `recruit_gunner` (art/recruits.ts).
  ...['globe', 'ring', 'gunner', 'plus_one', 'star'].map((n): AssetEntry => ({ type: 'image', id: `recruit_part_${n}`, url: `recruit/${n}.webp` })),
  // Slime de base (`slime_basic`, vert) — art-src/slime_basic.png (1600 px) réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/slime_basic.pack.json.
  // 16 cases de 82×78 (cycle de marche) ; le dessin regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/slime_basic.png',
    frameWidth: 82,
    frameHeight: 78,
    sprites: {
      alien_slime_basic: {
        originX: 0.4807,
        originY: 0.7891,
        scale: 0.73,
        shadow: 1.1,
        anchors: { 'walk:left': [0.4728, 0.808], 'idle:left': [0.4701, 0.7913], 'walk:right': [0.4834, 0.7996], 'idle:right': [0.484, 0.796] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 5 },
          walk: { frames: range(0, 15), fps: 12 },
        },
      },
    },
  },
  // Petit cafard (id `slime_pink`, l'ancien petit slime rose) — art-src/cafard.png réduit par
  // node tools/pack-grids.mjs games/xiao-swarm/art-src/cafard.pack.json (16 cases de 64×55, cycle de marche ; regarde vers la GAUCHE).
  // Même surface à l'écran que le petit slime rose (~37×28 px, plus plat que le slime) ; rayon 11 et marche rapide inchangés.
  {
    type: 'sheet',
    url: 'aliens/cafard.png',
    frameWidth: 64,
    frameHeight: 55,
    sprites: {
      alien_slime_pink: {
        originX: 0.4188,
        originY: 0.7446,
        scale: 0.7,
        shadow: 1.45,
        anchors: { 'walk:right': [0.4057, 0.7497], 'walk:left': [0.445, 0.7547] },
        muzzles: {
          idle: [null, [0.4585, 0.5726]],
        },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 8 },
          walk: { frames: range(0, 15), fps: 18 },
        },
      },
    },
  },
  // Slime bombardier (`slime_bombardier`, gros et bleu, lance des boules de gelée) — art-src/slime_grenadier.png (4096 px) réduit par
  // node tools/pack-grids.mjs games/xiao-swarm/art-src/slime_grenadier.pack.json (16 cases de 64×64). Plus gros (rayon 24 contre 16) et plus lent.
  {
    type: 'sheet',
    url: 'aliens/slime_grenadier.png',
    frameWidth: 64,
    frameHeight: 64,
    sprites: {
      alien_slime_bombardier: {
        originX: 0.516,
        originY: 0.948,
        scale: 1.35,
        shadow: 1.35,
        anchors: { 'idle:left': [0.4956, 0.8596], 'idle:right': [0.4865, 0.8573] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 4 },
          walk: { frames: range(0, 15), fps: 9 },
        },
      },
    },
  },
  // Crabe géant (mini-boss de 5:00) — art-src/crab_idle.png, crab_walk.png et crab_attack.png (cases de 800×651) assemblés par
  // node tools/pack-grids.mjs games/xiao-swarm/art-src/crab.pack.json (8 colonnes pour rester sous 2048 px), puis convertis en WebP
  // (qualité 90). Vu de face. Taille à l'écran ≈ celle du crabe procédural (~390 px de large) ; « attack » = saut + écrasement,
  // joué une fois par saut écrasant (data/aliens.ts `leap`, sim/Horde.ts).
  {
    type: 'sheet',
    url: 'aliens/crab.webp',
    frameWidth: 255,
    frameHeight: 197,
    sprites: {
      alien_crab: {
        originX: 0.533,
        originY: 0.892,
        scale: 2.1,
        shadow: 1,
        anims: {
          idle: { frames: range(0, 15), fps: 8 },
          walk: { frames: range(16, 31), fps: 12 },
          attack: { frames: range(32, 47), fps: 7, repeat: 0 }, // saut : écrasement (frame ~11) à l'impact (0,6 s + 0,9 s), récupération ensuite
        },
      },
    },
  },
  // Rhinocéros — art-src/rino.png (16 cases, cycle de marche, regarde vers la GAUCHE) réduit par
  // node tools/pack-grids.mjs games/xiao-swarm/art-src/rino.pack.json (cases de 125×96), puis converti en WebP. Sert au mini-boss
  // « Rhinocéros Alpha » (taille d'origine) ; la variante jaune (`rino_yellow`, node tools/hue-shift.mjs … 28 1.05) sert au Rhinocéros
  // qui charge (`charger`, plus petit). Placement (échelle, ancrage, ombre) : visionneuse d'unités.
  {
    type: 'sheet',
    url: 'aliens/rino.webp',
    frameWidth: 125,
    frameHeight: 96,
    sprites: {
      alien_rhino_boss: {
        originX: 0.517,
        originY: 0.9,
        scale: 1,
        shadow: 1.2,
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 8 },
          walk: { frames: range(0, 15), fps: 12 },
        },
      },
    },
  },
  {
    type: 'sheet',
    url: 'aliens/rino_yellow.webp',
    frameWidth: 125,
    frameHeight: 96,
    sprites: {
      alien_charger: {
        originX: 0.517,
        originY: 0.9,
        scale: 0.55,
        shadow: 1.1,
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 8 },
          walk: { frames: range(0, 15), fps: 12 },
        },
      },
    },
  },
  // Kamikaze : araignée rouge — art-src/spider_red.png réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/spider_red.pack.json
  // (16 cases de 64×55, cycle de marche ; regarde vers la GAUCHE). Même surface à l'écran que l'ancien slime kamikaze (plus plate).
  {
    type: 'sheet',
    url: 'aliens/spider_red.png',
    frameWidth: 64,
    frameHeight: 55,
    sprites: {
      alien_kamikaze: {
        originX: 0.4873,
        originY: 1.6505,
        scale: 1.63,
        shadow: 1.95,
        anchors: { 'walk:right': [0.498, 0.635], 'walk:left': [0.5015, 0.6375], 'idle:right': [0.497, 0.635], 'idle:left': [0.4966, 0.6325] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 8 },
          walk: { frames: range(0, 15), fps: 16 },
        },
      },
    },
  },
  // Grenouille — planche du slime recolorée en turquoise (node tools/hue-shift.mjs … slime_teal.png 60).
  {
    type: 'sheet',
    url: 'aliens/slime_teal.png',
    frameWidth: 64,
    frameHeight: 64,
    sprites: {
      alien_frog: {
        originX: 0.516,
        originY: 0.948,
        scale: 0.95,
        shadow: 1.35,
        anchors: { 'idle:left': [0.4902, 0.8965], 'idle:right': [0.4934, 0.8836] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 6 },
          walk: { frames: range(0, 15), fps: 12 },
        },
      },
    },
  },
  // Cracheur — planche du slime recolorée en violet (node tools/hue-shift.mjs … slime_purple.png 180).
  {
    type: 'sheet',
    url: 'aliens/slime_purple.png',
    frameWidth: 64,
    frameHeight: 64,
    sprites: {
      alien_spitter: {
        originX: 0.516,
        originY: 0.948,
        scale: 0.95,
        shadow: 1.2,
        anchors: { 'idle:left': [0.4806, 0.8965], 'idle:right': [0.4902, 0.89] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 6 },
          walk: { frames: range(0, 15), fps: 12 },
        },
      },
    },
  },
  // Chaman — planche du slime recolorée en jaune (node tools/hue-shift.mjs … slime_yellow.png 310).
  {
    type: 'sheet',
    url: 'aliens/slime_yellow.png',
    frameWidth: 64,
    frameHeight: 64,
    sprites: {
      alien_shaman: {
        originX: 0.516,
        originY: 0.948,
        scale: 1,
        shadow: 1.25,
        anchors: { 'idle:right': [0.4885, 0.896], 'idle:left': [0.4823, 0.8929] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 6 },
          walk: { frames: range(0, 15), fps: 12 },
        },
      },
    },
  },
  // Lanceur de cailloux — planche du slime recolorée en brun (node tools/hue-shift.mjs … slime_brown.png 285 0.4).
  {
    type: 'sheet',
    url: 'aliens/slime_brown.png',
    frameWidth: 64,
    frameHeight: 64,
    sprites: {
      alien_thrower: {
        originX: 0.516,
        originY: 0.948,
        scale: 0.95,
        shadow: 1.3,
        anchors: { 'idle:right': [0.4967, 0.8739], 'idle:left': [0.4967, 0.89] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 6 },
          walk: { frames: range(0, 15), fps: 12 },
        },
      },
    },
  },
  // Slime de feu — planche du slime recolorée en rouge-orangé (node tools/hue-shift.mjs … slime_red.png 275 1.15).
  {
    type: 'sheet',
    url: 'aliens/slime_red.png',
    frameWidth: 64,
    frameHeight: 64,
    sprites: {
      alien_fire: {
        originX: 0.516,
        originY: 0.948,
        scale: 0.9,
        shadow: 1.3,
        anchors: { 'idle:right': [0.4956, 0.9004], 'idle:left': [0.5058, 0.9004] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 7 },
          walk: { frames: range(0, 15), fps: 14 },
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
      soldier_gunner: {
        originX: 0.5975,
        originY: 0.8847,
        scale: 1.25,
        muzzleFlash: true,
        muzzle: [0.8561, 0.6376],
        anchors: { 'idle:left': [0.6489, 0.8847], 'walk:left': [0.6559, 0.9088], 'walk:right': [0.3586, 0.9126], 'die:left': [0.5921, 0.8768], 'idle:right': [0.3566, 0.8907] },
        muzzles: {
          idle: [[0.9031, 0.4113], [0.9142, 0.3925], [0.8982, 0.4015], [0.909, 0.4204], [0.9135, 0.4261], [0.9103, 0.4307], [0.9258, 0.4431], [0.9265, 0.4431], [0.9227, 0.4351], [0.9198, 0.4193], [0.929, 0.4193], [0.9276, 0.3952], [0.9142, 0.3983], [0.9135, 0.3992], [0.9121, 0.3891], [0.9198, 0.3958]],
          walk: [[0.8653, 0.6403], [0.8653, 0.6509], [0.8653, 0.6456], [0.8684, 0.6376], [0.8561, 0.6482], [0.8684, 0.6641], null, null, [0.8684, 0.6403], null, [0.8684, 0.6403], [0.8653, 0.6429], [0.8714, 0.6588], [0.8745, 0.6641], [0.8653, 0.6403], [0.8622, 0.6323]],
        },
        anims: {
          idle: { frames: range(0, 15), fps: 8 },
          walk: { frames: range(16, 31), fps: 16 },
        },
      },
      gun_gunner: { hidden: true }, // l'arme est dessinée dans la planche
    },
  },
];
