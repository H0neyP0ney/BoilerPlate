import type { SfxId } from '../settings';

/**
 * Bruitages du paquet 1 (chargés au démarrage, avec les visuels de départ) : ceux qui servent dès les premières secondes (tir, interface, level up,
 * XP, recrue, morts d'aliens et de soldats). Tous les autres arrivent avec le paquet 2a (`latePack.ensure`, qui saute ceux déjà dans le cache).
 * Page de test `?sounds` : docs/SONS.md.
 */
export const CORE_SFX: readonly SfxId[] = [
  'blaster',
  'blast',
  'ui_click',
  'ui_hover',
  'ui_claim',
  'ui_claim_prism',
  'ui_reroll',
  'levelup',
  'xp',
  'recruit',
  'alien_die_s',
  'alien_die_m',
  'alien_die_l',
  'soldier_die',
];
