/**
 * Constantes du jeu. Ce fichier est partagé par la simulation (sim/) et
 * l'affichage : il doit rester sans import (pur).
 */

/** Safe zone carrée toujours visible (Scale.EXPAND) : 1280×720 sur desktop Poki. */
export const SAFE_SIZE = 720;

export const SQUAD = {
  startSize: 4,
  baseMaxSize: 12,
  speed: 210,
  /** Distance entre voisins dans la formation. */
  spacing: 50,
  /** L'ancre ne s'éloigne jamais plus que ça du coeur de la squad. */
  leash: 70,
  /** Temps à l'arrêt avant que le Medic soigne. */
  stillDelay: 0.5,
} as const;

/** Profondeurs : sol < ombres/anneaux < acteurs (triés par y) < barres de vie. */
export const DEPTH = {
  ground: 0,
  groundFx: 1,
  actors: 10,
  fx: 50_000,
  bars: 60_000,
} as const;

export const PALETTE = {
  bgDark: 0x1b2a1f,
  panel: 0x13233a,
  panelBorder: 0x3fb6e8,
  primary: 0xffc83d,
  rewarded: 0x7a5cff,
  allyRing: 0x39c6ff,
  hpAlly: 0x5ee05e,
  hpEnemy: 0xe84a4a,
  hpBack: 0x1a1a24,
  text: '#ffffff',
  textDim: '#a9c3dd',
  outline: '#2a1d2e',
} as const;

export const SCENES = {
  boot: 'Boot',
  game: 'Game',
  hud: 'Hud',
  pause: 'Pause',
  gameOver: 'GameOver',
} as const;
