import { sprites } from '@xiao/engine';

/**
 * Décalage vertical (px, positif = vers le bas) du sprite ET de l'ombre d'une unité par rapport à son point au sol (`offsetY` de son placement,
 * réglé dans la visionneuse d'unités). La hitbox, elle, ne bouge pas. Tout ce qui est dessiné « sur le corps » ou « sous l'ombre » (barres de vie,
 * cercle d'équipe, glaçon, flammes, flaques, trous d'apparition…) l'ajoute à la position au sol de l'unité pour rester collé au sprite.
 */
export const alienOffsetY = (id: string): number => sprites.get(`alien_${id}`).offsetY ?? 0;
export const soldierOffsetY = (cls: string): number => sprites.get(`soldier_${cls}`).offsetY ?? 0;
