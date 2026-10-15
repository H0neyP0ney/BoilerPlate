/**
 * Niveaux de difficulté de la run : `normal`, `expert`, `impossible`. Choisi par le joueur sur l'écran d'accueil (boutons à droite) ; en ligne, c'est l'hôte qui choisit
 * pour toute la room, et les joueurs qui la rejoignent voient le niveau sans pouvoir le changer. Pour l'instant le niveau ne change rien au jeu.
 */
export type DifficultyLevel = 'normal' | 'expert' | 'impossible';

export const DIFFICULTY_LEVELS: DifficultyLevel[] = ['normal', 'expert', 'impossible'];

/** Clé de texte (`locales/*.json`) du nom de chaque niveau. */
export const DIFFICULTY_LABEL_KEYS = { normal: 'difficultyNormal', expert: 'difficultyExpert', impossible: 'difficultyImpossible' } as const;

/** Le niveau `level` a-t-il au moins la difficulté `min` ? (`impossible` ⊇ `expert` ⊇ `normal`) */
export function atLeast(level: DifficultyLevel, min: DifficultyLevel): boolean {
  return DIFFICULTY_LEVELS.indexOf(level) >= DIFFICULTY_LEVELS.indexOf(min);
}

/** Niveau lu dans une valeur libre (message réseau) : `normal` si ce n'en est pas un. */
export function parseDifficultyLevel(value: unknown): DifficultyLevel {
  return DIFFICULTY_LEVELS.includes(value as DifficultyLevel) ? (value as DifficultyLevel) : 'normal';
}
