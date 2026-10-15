import { SFX, type SfxId } from '../settings';
import { PACK_OVERRIDES, type Pack } from './packOverrides';

/**
 * Bruitages du paquet 1 par défaut (chargés au démarrage, avec les visuels de départ) : ceux qui servent dès les premières secondes (tir, interface, level up,
 * XP, recrue, morts d'aliens et de soldats). Tous les autres arrivent avec le paquet 2a (`latePack.ensure`, qui saute ceux déjà dans le cache).
 * Les exceptions posées dans la vue Paquets (`assets/packOverrides.ts`, clé `sfx:<id>`) l'emportent. Page de test `?sounds` : docs/SONS.md.
 */
export const DEFAULT_CORE_SFX: readonly SfxId[] = [
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

/** Paquet par défaut d'un bruitage (sans les exceptions de la vue Paquets). */
export const defaultSfxPack = (id: SfxId): Pack => (DEFAULT_CORE_SFX.includes(id) ? 'core' : '2a');
/** Paquet d'un bruitage : l'exception de la vue Paquets, sinon le défaut. */
export const sfxPack = (id: SfxId): Pack => PACK_OVERRIDES[`sfx:${id}`] ?? defaultSfxPack(id);

/** Bruitages du paquet 1. */
export const CORE_SFX: readonly SfxId[] = (Object.keys(SFX) as SfxId[]).filter((id) => sfxPack(id) === 'core');
