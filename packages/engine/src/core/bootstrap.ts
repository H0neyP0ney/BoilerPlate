import Phaser from 'phaser';
import { poki } from '../poki/poki';

/** Empêche flèches / espace / molette / clic droit de faire défiler la page Poki parente. */
export function preventPageScroll(): void {
  const keys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'PageUp', 'PageDown', 'Home', 'End']);
  window.addEventListener('keydown', (e) => {
    if (keys.has(e.key)) e.preventDefault();
  });
  window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
}

export interface BootOptions {
  /** Côté de la safe zone carrée toujours visible (Scale.EXPAND). */
  safeSize?: number;
  backgroundColor?: number | string;
  scenes: Phaser.Types.Scenes.SceneType[];
  /** Appelé après poki.init(), avant la création du jeu (i18n, storage…). */
  beforeCreate?: () => void;
  /** Surcharge libre de la config Phaser. */
  config?: Partial<Phaser.Types.Core.GameConfig>;
}

/**
 * Démarrage standard d'un jeu Poki : anti-scroll, init SDK, config responsive.
 *
 * Scale.EXPAND + safe zone carrée : 16:9 sur desktop Poki (1280×720 pour 720),
 * plein écran portrait ou paysage sur mobile.
 */
export async function bootPokiGame(opts: BootOptions): Promise<Phaser.Game> {
  preventPageScroll();
  await poki.init();
  opts.beforeCreate?.();

  const size = opts.safeSize ?? 720;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: opts.backgroundColor ?? 0x000000,
    scale: {
      mode: Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: size,
      height: size,
    },
    input: { activePointers: 2 },
    disableContextMenu: true,
    banner: false,
    scene: opts.scenes,
    ...opts.config,
  });

  poki.attachGame(game);
  // Dev : accès console / outils de test (`__game.scene.getScene('Game')`).
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
  window.focus();
  return game;
}
