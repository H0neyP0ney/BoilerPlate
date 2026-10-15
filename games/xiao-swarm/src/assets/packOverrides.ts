/**
 * Paquet de chargement d'un asset : `core` = paquet 1 (au démarrage), `2a` = premières minutes, `2b` = ce qui arrive ensuite (voir `assets/latePack.ts`).
 * Le paquet « par défaut » vient des règles de `assets/manifest.ts` (dossiers, listes de fichiers) et de `assets/coreSfx.ts` ; cette table ne porte que les
 * **exceptions** posées dans la vue Paquets (dev : bouton « Paquets » du HUD, `?packs`, Save écrit ce fichier). Clé : l'adresse du fichier d'un visuel
 * (`aliens/toad.png`) ou `sfx:<id>` pour un bruitage.
 */
export type Pack = 'core' | '2a' | '2b';

export const PACK_OVERRIDES: Record<string, Pack> = {
};
