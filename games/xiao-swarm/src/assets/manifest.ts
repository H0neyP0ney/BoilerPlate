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
  // Gunner — découpé depuis art-src/gunner_sheet.png (node tools/slice-sheet.mjs games/xiao-swarm/art-src/gunner.slice.json)
  {
    type: 'sheet',
    url: 'soldiers/gunner.png',
    frameWidth: 98,
    frameHeight: 88,
    sprites: {
      soldier_gunner: {
        originX: 0.403,
        originY: 0.864,
        scale: 0.8,
        anims: {
          idle: { frames: range(0, 3), fps: 6 },
          shoot: { frames: range(6, 9), fps: 14 },
          walk_down: { frames: range(12, 15), fps: 10 },
          walk_up: { frames: range(18, 21), fps: 10 },
          walk_left: { frames: range(24, 27), fps: 10 },
          walk_right: { frames: range(30, 33), fps: 10 },
          hurt: { frames: range(36, 38), fps: 12, repeat: 0 },
          die: { frames: range(42, 47), fps: 10, repeat: 0 },
        },
      },
      gun_gunner: { hidden: true }, // l'arme est dessinée dans la planche
      portrait_gunner: { frame: 0, crop: [0, 0, 98, 52], originX: 0.43, originY: 0.59, scale: 0.9 },
    },
  },
];
