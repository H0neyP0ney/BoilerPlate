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
  // Champ de saisie HTML (outils de dev : nom d'une vague…) : Phaser ne doit ni voir la touche (la squad bougerait) ni la capturer
  // (son `preventDefault` sur Espace / flèches empêchait de les taper). Enregistré avant Phaser : coupe la propagation avant lui, après le champ.
  window.addEventListener('keydown', (e) => {
    if (isTextField(e.target)) e.stopImmediatePropagation();
  });
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'number', 'url', 'email', 'password', 'tel']);

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement || target.isContentEditable) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);
}

/**
 * Son sur mobile et dans les webviews (ex. lien ouvert depuis une appli) : le contexte audio ne démarre qu'après un vrai geste du joueur, et Phaser
 * abandonne dès le premier essai raté (le `touchstart` d'un glissement n'est pas un geste) ; son `onGameVisible` suspend en plus le contexte à chaque
 * retour de visibilité. Le jeu se joue au glissement, sans toucher de bouton : on retente donc à CHAQUE geste (toucher relâché, clic, touche) tant
 * que le contexte n'est pas en marche, et on prévient Phaser (`unlocked`) pour qu'il lance la musique en attente.
 */
function keepAudioUnlocked(game: Phaser.Game): void {
  const sm = game.sound as Phaser.Sound.WebAudioSoundManager & { unlocked: boolean }; // `unlocked` existe dans Phaser mais pas dans ses types
  if (!sm || !('context' in sm) || !sm.context) return; // pas de Web Audio : rien à débloquer
  const attempt = (): void => {
    const ctx = sm.context;
    if (ctx.state === 'running') {
      if (sm.locked) sm.unlocked = true; // Phaser émet alors `UNLOCKED` (la musique en attente démarre)
      return;
    }
    void ctx.resume().then(
      () => {
        sm.unlocked = true;
      },
      () => undefined,
    );
    try {
      // iOS : un son vide joué pendant le geste achève le déblocage
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* contexte fermé : rien à faire */
    }
  };
  for (const type of ['touchend', 'pointerup', 'pointerdown', 'mouseup', 'click', 'keydown']) window.addEventListener(type, attempt, { capture: true, passive: true });
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
  keepAudioUnlocked(game);
  // Dev : accès console / outils de test (`__game.scene.getScene('Game')`).
  if (DEV_TOOLS) (window as unknown as { __game: Phaser.Game }).__game = game;
  window.focus();
  return game;
}
