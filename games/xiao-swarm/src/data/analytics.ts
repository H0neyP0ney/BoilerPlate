/**
 * Paliers des événements d'analytics Poki (`poki.measure`, voir docs/ANALYTICS.md). Valeurs bornées : chaque palier donne un `what` distinct,
 * donc un nombre fini de lignes dans le tableau de bord.
 */

/** Temps de partie (s) dont on note le passage (`time/<n>s/reached`, une fois par partie). La partie dure 10 min. */
export const TIME_MILESTONES = [60, 120, 180, 300, 420, 600] as const;

/** Numéros de partie dont on note l'arrivée (`retention/game-<n>/reached`) : combien de joueurs rejouent. */
export const RETENTION_MILESTONES = [2, 3, 5, 10] as const;
