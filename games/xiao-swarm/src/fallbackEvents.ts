import { poki } from '@xiao/engine';

/**
 * Analytics des dessins de repli (docs/ANALYTICS.md) : un joueur a-t-il vu, dans cette partie, un visuel procédural parce que le paquet 2 n'était pas encore arrivé ?
 * `alien` : un alien affiché avec son dessin procédural ; `pickup` : globe, étoile ou icône de power-up / d'upgrade remplacé par un disque ou un emoji ;
 * `other` : tout le reste (chiffres de critique, drone de stase, globe d'XP, barres du HUD absentes). Évènement `perf/fallback/<type>`, une fois par partie.
 * À appeler depuis la vue seulement, jamais depuis `sim/`.
 */
export type FallbackKind = 'alien' | 'pickup' | 'other';

export function fallbackSeen(kind: FallbackKind): void {
  poki.measureOnce('perf', 'fallback', kind);
}
