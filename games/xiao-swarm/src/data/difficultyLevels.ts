/**
 * Niveaux de difficulté de la run : `normal`, `expert`, `impossible`. Choisi par le joueur sur l'écran d'accueil (boutons à droite) ; en ligne, c'est l'hôte qui choisit
 * pour toute la room, et les joueurs qui la rejoignent voient le niveau sans pouvoir le changer. Pour l'instant le niveau ne change rien au jeu.
 */
import { ptOn } from '../config';

export type DifficultyLevel = 'normal' | 'expert' | 'impossible';

export const DIFFICULTY_LEVELS: DifficultyLevel[] = ['normal', 'expert', 'impossible'];

/** Clé de texte (`locales/*.json`) du nom de chaque niveau. */
export const DIFFICULTY_LABEL_KEYS = { normal: 'difficultyNormal', expert: 'difficultyExpert', impossible: 'difficultyImpossible' } as const;

/** Le niveau `level` a-t-il au moins la difficulté `min` ? (`impossible` ⊇ `expert` ⊇ `normal`) */
export function atLeast(level: DifficultyLevel, min: DifficultyLevel): boolean {
  return DIFFICULTY_LEVELS.indexOf(level) >= DIFFICULTY_LEVELS.indexOf(min);
}

/**
 * Boss FINAL de chaque niveau (17/10) : la run se termine (victoire, séquence de fin) quand il tombe. Normal : le Scarab (3e boss) ; Hard (`expert`) : les rhinos jumeaux (4e boss, il faut
 * tuer les deux) ; Expert (`impossible`) : le Giant Crab (5e boss). La timeline continue d'envoyer les boss suivants dans les données, mais la partie s'arrête avant.
 */
export const FINAL_BOSS: Record<DifficultyLevel, readonly string[]> = {
  normal: ['boss_scarab'],
  expert: ['boss_rhino_fire', 'boss_rhino_ice'],
  impossible: ['boss_crab'],
};

/**
 * Boss final de la run au niveau `level` : `FINAL_BOSS`, sauf pendant la version test playtime (`PLAYTIME_TEST.fullTimeline`) où le Normal joue toute la timeline et se termine
 * au Giant Crab (comme l'Expert).
 */
export function finalBossesOf(level: DifficultyLevel): readonly string[] {
  return level === 'normal' && ptOn('fullTimeline') ? FINAL_BOSS.impossible : FINAL_BOSS[level];
}

/** Niveau lu dans une valeur libre (message réseau) : `normal` si ce n'en est pas un. */
export function parseDifficultyLevel(value: unknown): DifficultyLevel {
  return DIFFICULTY_LEVELS.includes(value as DifficultyLevel) ? (value as DifficultyLevel) : 'normal';
}
