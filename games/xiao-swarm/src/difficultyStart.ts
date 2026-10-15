import { poki } from '@xiao/engine';
import { parseDifficultyLevel, type DifficultyLevel } from './data/difficultyLevels';
import { settings } from './settings';

/**
 * Niveau de difficulté dans lequel la run démarre : `?difficulty=expert|impossible` (test, prioritaire), sinon le dernier niveau choisi avec les boutons de l'écran d'accueil
 * (`settings.difficulty`, mémorisé). `onboarding` : partie qui commence par le tutoriel (première partie) : toujours `normal`.
 */
export function startDifficulty(onboarding: boolean): DifficultyLevel {
  const url = poki.getURLParam('difficulty');
  if (url) return parseDifficultyLevel(url);
  return onboarding ? 'normal' : settings.difficulty;
}
