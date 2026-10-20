/**
 * Paliers des événements d'analytics Poki (`poki.measure`, voir docs/ANALYTICS.md). Valeurs bornées : chaque palier donne un `what` distinct,
 * donc un nombre fini de lignes dans le tableau de bord.
 */

/** Temps de partie (s) dont on note le passage (`time/<n>s/reached`, une fois par partie). La partie dure 10 min. */
export const TIME_MILESTONES = [60, 120, 180, 300, 420, 600] as const;

/** Numéros de partie dont on note l'arrivée (`retention/game-<n>/reached`) : combien de joueurs rejouent. */
export const RETENTION_MILESTONES = [1, 2, 3, 4, 5, 10] as const;

/** Libellés affichés des niveaux de difficulté (ids internes `expert` = « Hard », `impossible` = « Expert ») : préfixe des événements d'équilibrage. */
export const DIFFICULTY_LABEL = { normal: 'normal', expert: 'hard', impossible: 'expert' } as const;

/**
 * Événements d'équilibrage (`balanceAnalytics.ts`, solo) : un échantillon par seconde de jeu.
 * `deathWindow` : secondes regardées pour la cause de la mort ; `sizeBeforeDeath` : taille de la squad lue N s avant la mort (à la mort elle vaut 0) ;
 * `crash` : la squad perd au moins `crashLoss` de ses soldats en `crashWindow` s (au moins `crashMinSize` au départ), `crashMax` par partie, un par minute.
 */
export const BALANCE = { ringSize: 16, deathWindow: 15, sizeBeforeDeath: 3, crashWindow: 10, crashLoss: 0.4, crashMinSize: 5, crashMax: 3 } as const;

/** Taille de la squad en lettres (Poki : au plus 2 chiffres par événement) : xs < 5, s 5-9, m 10-14, l 15-24, xl 25+. */
export function sizeBucket(n: number): string {
  return n < 5 ? 'xs' : n < 10 ? 's' : n < 15 ? 'm' : n < 25 ? 'l' : 'xl';
}

/** Temps tenu après un revive vidéo (`reward/revive/survived-<tranche>`), au plus 2 chiffres : 0-30s, 30-60s, 1-2m, 2-5m, 5m+. */
export function survivedBucket(seconds: number): string {
  return seconds < 30 ? '0-30s' : seconds < 60 ? '30-60s' : seconds < 120 ? '1-2m' : seconds < 300 ? '2-5m' : '5m+';
}
