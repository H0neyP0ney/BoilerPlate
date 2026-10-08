import { DEV_TOOLS } from './devTools';
import Phaser from 'phaser';
import { poki } from '../poki/poki';

/** Touches qui feraient défiler la page Poki parente : flèches, espace, PageUp / PageDown, Fin / Début (codes clavier Phaser). */
const SCROLL_KEYS = [37, 38, 39, 40, 32, 33, 34, 35, 36];

/**
 * Empêche la molette / le clic droit de faire défiler la page Poki parente. Les touches de défilement (flèches, espace…) ne sont PAS
 * bloquées ici par un `preventDefault` sur `window` : Phaser ignore tout évènement clavier déjà « défaussé » (`defaultPrevented`), ce
 * qui rendait les flèches mortes. C'est Phaser qui les capture (`input.keyboard.capture` ci-dessous), après les avoir traitées.
 */
export function preventPageScroll(): void {
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
    input: { activePointers: 2, keyboard: { capture: SCROLL_KEYS } },
    disableContextMenu: true,
    banner: false,
    scene: opts.scenes,
    ...opts.config,
  });

  poki.attachGame(game);
  // Dev : accès console / outils de test (`__game.scene.getScene('Game')`).
  if (DEV_TOOLS) (window as unknown as { __game: Phaser.Game }).__game = game;
  window.focus();
  return game;
}
