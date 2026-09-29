/** Safe zone carrée toujours visible (voir bootPokiGame / Scale.EXPAND). */
export const SAFE_SIZE = 720;

export const COLORS = {
  bg: 0x14121f,
  panel: 0x241f3a,
  primary: 0xffb938,
  rewarded: 0x6a5cff,
  text: '#ffffff',
  textDim: '#b6b0d6',
  player: 0x4fd1ff,
  coin: 0xffd84f,
  enemy: 0xff4f6d,
} as const;

export const SCENES = {
  boot: 'Boot',
  preload: 'Preload',
  game: 'Game',
  pause: 'Pause',
  gameOver: 'GameOver',
} as const;
