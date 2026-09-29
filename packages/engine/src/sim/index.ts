/**
 * @xiao/engine/sim — briques de simulation SANS Phaser ni DOM.
 * Importables côté serveur (Node) pour un mode multijoueur à serveur autoritaire.
 * Le code de simulation d'un jeu ne doit importer que ce point d'entrée.
 */
export { FixedStep } from './FixedStep';
export { EventQueue, IdGen } from './EventQueue';
export { SpatialHash, type Spatial } from '../math/SpatialHash';
export { Rng } from '../math/random';
export * from '../math/geometry';
export { Pool } from '../systems/Pool';
export { WaveDirector, type WaveEvent } from '../systems/WaveDirector';
export { Stats, type Modifier } from '../systems/Stats';
