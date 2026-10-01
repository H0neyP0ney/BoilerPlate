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
  // Slime vert — art-src/sprite--9px-frames-16-rows-4-cols-4 (1).png réduit par node tools/pack-grids.mjs games/xiao-swarm/art-src/slime.pack.json.
  // 16 cases de 64×64 (cycle de marche) ; le dessin regarde vers la GAUCHE ; idle = même cycle, plus lent.
  {
    type: 'sheet',
    url: 'aliens/slime.png',
    frameWidth: 64,
    frameHeight: 64,
    sprites: {
      alien_slime: {
        originX: 0.516,
        originY: 0.948,
        scale: 0.9,
        shadow: 1.35,
        anchors: { 'walk:left': [0.4888, 0.8834], 'idle:left': [0.4854, 0.863], 'walk:right': [0.5024, 0.8732], 'idle:right': [0.499, 0.8562] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 5 },
          walk: { frames: range(0, 15), fps: 12 },
        },
      },
    },
  },
  // Petit slime rose — la planche du slime vert recolorée (node tools/hue-shift.mjs public/assets/aliens/slime.png public/assets/aliens/slime_pink.png 235),
  // plus petit (rayon 11 contre 16) et qui marche plus vite.
  {
    type: 'sheet',
    url: 'aliens/slime_pink.png',
    frameWidth: 64,
    frameHeight: 64,
    sprites: {
      alien_slime_pink: {
        originX: 0.516,
        originY: 0.948,
        scale: 0.6,
        shadow: 1.25,
        anchors: { 'idle:right': [0.5058, 0.8868], 'idle:left': [0.4956, 0.8715] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 8 },
          walk: { frames: range(0, 15), fps: 18 },
        },
      },
    },
  },
  // Gros slime bleu — la planche du slime vert recolorée (node tools/hue-shift.mjs public/assets/aliens/slime.png public/assets/aliens/slime_blue.png 118),
  // plus gros (rayon 24 contre 16) et plus lent.
  {
    type: 'sheet',
    url: 'aliens/slime_blue.png',
    frameWidth: 64,
    frameHeight: 64,
    sprites: {
      alien_slime_blue: {
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
  // Kamikaze — la planche du slime vert recolorée en orange (node tools/hue-shift.mjs … slime_orange.png 285).
  {
    type: 'sheet',
    url: 'aliens/slime_orange.png',
    frameWidth: 64,
    frameHeight: 64,
    sprites: {
      alien_kamikaze: {
        originX: 0.516,
        originY: 0.948,
        scale: 0.85,
        shadow: 1.3,
        anchors: { 'idle:right': [0.4872, 0.876], 'idle:left': [0.498, 0.858] },
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 6 },
          walk: { frames: range(0, 15), fps: 12 },
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
  // Slime soigneur — planche du slime recolorée en jaune pâle (node tools/hue-shift.mjs … slime_lemon.png 315 0.5).
  {
    type: 'sheet',
    url: 'aliens/slime_lemon.png',
    frameWidth: 64,
    frameHeight: 64,
    sprites: {
      alien_healer: {
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
        originX: 0.3478,
        originY: 0.9134,
        scale: 1.25,
        anchors: { 'idle:right': [0.3624, 0.8946], 'idle:left': [0.6401, 0.8983], 'walk:left': [0.6576, 0.8946] },
        muzzles: {
          idle: [[0.8968, 0.4058], [0.9055, 0.3908], [0.9026, 0.3983], [0.9055, 0.4134], [0.9143, 0.4171], [0.9143, 0.4397], [0.9202, 0.4397], [0.9289, 0.4435], [0.9231, 0.4397], [0.926, 0.4284], [0.926, 0.4134], [0.9231, 0.4021], [0.9202, 0.3983], [0.9143, 0.3908], [0.9085, 0.3832], [0.9114, 0.3908]],
          walk: [[0.9026, 0.4209], [0.9026, 0.4284], [0.9026, 0.4548], [0.9026, 0.436], [0.9026, 0.4171], [0.9114, 0.4247], [0.9085, 0.4322], [0.9114, 0.4171], [0.9055, 0.4134], [0.9026, 0.4322], [0.9055, 0.4548], [0.9114, 0.4209], [0.9085, 0.3945], [0.9114, 0.3983], [0.9085, 0.4171], [0.9143, 0.4209]],
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
