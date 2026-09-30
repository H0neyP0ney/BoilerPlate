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
        facesLeft: true,
        anims: {
          idle: { frames: range(0, 15), fps: 5 },
          walk: { frames: range(0, 15), fps: 12 },
        },
      },
    },
  },
  // Gunner — assemblé depuis art-src/gunner_{idle,walk,death}.png (node tools/pack-grids.mjs games/xiao-swarm/art-src/gunner.pack.json).
  // 48 cases de 64×74, pieds alignés : idle 0-15, walk 16-31, death 32-47. Personnage tourné vers la droite
  // (retourné par le jeu pour la gauche) ; l'arme fait partie du dessin.
  {
    type: 'sheet',
    url: 'soldiers/gunner.png',
    frameWidth: 64,
    frameHeight: 74,
    sprites: {
      soldier_gunner: {
        originX: 0.402,
        originY: 0.894,
        scale: 1,
        anims: {
          idle: { frames: range(0, 15), fps: 8 },
          walk: { frames: range(16, 31), fps: 16 },
          die: { frames: range(32, 47), fps: 12, repeat: 0 },
        },
      },
      gun_gunner: { hidden: true }, // l'arme est dessinée dans la planche
    },
  },
];
