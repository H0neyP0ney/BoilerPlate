import { SFX, type SfxId } from '../settings';
import { PACK_OF, type Pack } from './packTable';

/**
 * Paquet d'un bruitage d'après la table `PACK_OF` (`assets/packTable.ts`, clé `sfx:<id>`, écrite par la vue Paquets) ; absent : paquet 1.
 * Paquet 1 : chargés au démarrage ; 2a : avec le paquet 2a (`latePack.ensure`) ; 2b : avec le 2b. Page de test `?sounds` : docs/SONS.md.
 */
export const sfxPack = (id: SfxId): Pack => PACK_OF[`sfx:${id}`] ?? 'core';

/** Bruitages du paquet 1. */
export const CORE_SFX: readonly SfxId[] = (Object.keys(SFX) as SfxId[]).filter((id) => sfxPack(id) === 'core');
