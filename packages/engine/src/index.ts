// @xiao/engine — briques réutilisables. Ce package ne doit JAMAIS importer un jeu.

// Poki & démarrage
export { poki } from './poki/poki';
export { bootPokiGame, preventPageScroll, type BootOptions } from './core/bootstrap';
export { RunFlow, type RunState } from './flow/RunFlow';

// Core
export { log } from './core/log';
export { storage } from './core/storage';
export { device } from './core/device';
export { createI18n, type I18n, type Vars } from './core/i18n';

// Input & UI
export { MoveInput } from './input/MoveInput';
export { VirtualJoystick } from './ui/VirtualJoystick';
export { Button, type ButtonOptions, type ButtonVariant } from './ui/Button';
export { theme, setTheme, type Theme } from './ui/theme';

// Simulation (sans Phaser : aussi dispo via '@xiao/engine/sim' pour un serveur)
export * from './sim/index';
export { rng } from './math/random';

// Art : procédural + planches de sprites
export { canvasTexture, roundRect, fillOutlined } from './art/canvasTexture';
export { SpriteCatalog, sprites, type SpriteDef } from './art/SpriteCatalog';
export { loadAssets, applyAssets, range, type AssetEntry, type AnimSpec, type SheetSprite, type AsepriteSprite } from './art/assetManifest';

// Debug
export { DebugOverlay } from './debug/DebugOverlay';
