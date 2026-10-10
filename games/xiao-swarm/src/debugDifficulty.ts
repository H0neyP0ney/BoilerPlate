import { DEV_TOOLS } from '@xiao/engine';
import { DIFFICULTY, DIFFICULTY_DEFAULTS, type DifficultyKey } from './config';
import { saveToCode } from './dev/devSave';
import { dropStaleOverride } from './dev/staleOverrides';

/**
 * Difficulté globale (dev uniquement) : un multiplicateur de `DIFFICULTY` par slider du panneau « Difficulté »
 * (dev/difficultyPanel.ts). Les réglages courants sont mémorisés dans le navigateur (localStorage) à chaque changement ;
 * Save les écrit dans `DIFFICULTY_DEFAULTS` (config.ts), Reset y revient.
 */
const STORAGE_KEY = 'xiao-debug-difficulty';

export interface DifficultySpec {
  key: DifficultyKey;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}

/** Réglages du panneau, par section (titre → curseurs). Toute nouvelle clé de `DIFFICULTY_DEFAULTS` doit y figurer. */
export const DIFFICULTY_SECTIONS: { title: string; specs: DifficultySpec[] }[] = [
  {
    title: 'Boss',
    specs: [
      { key: 'bossEscalationHp', label: 'Escalade : PV des aliens / boss', min: 0, max: 1, step: 0.01, hint: 'PV gagnés par les aliens à chaque boss ou mini-boss tué (0,15 = +15 %, cumulés ×1,15 par boss). Vaut pour les aliens qui apparaissent ensuite' },
      { key: 'bossEscalationDamage', label: 'Escalade : dégâts des aliens / boss', min: 0, max: 1, step: 0.01, hint: 'Dégâts (contact, tirs, flammes, explosions…) gagnés par les aliens à chaque boss ou mini-boss tué (cumulés). Vaut pour les aliens qui apparaissent ensuite' },
      { key: 'bossEscalationRate', label: 'Escalade : cadence des aliens / boss', min: 0, max: 1, step: 0.01, hint: "Cadence d'attaque gagnée par les aliens à chaque boss ou mini-boss tué (cumulée). Vaut pour les aliens qui apparaissent ensuite" },
      { key: 'bossEscalationSpeed', label: 'Escalade : vitesse des aliens / boss', min: 0, max: 1, step: 0.01, hint: 'Vitesse de déplacement gagnée par les aliens à chaque boss ou mini-boss tué (0,07 = +7 %, cumulés ×1,07 par boss). Vaut pour les aliens qui apparaissent ensuite' },
      { key: 'chestOrbs', label: 'Œuf de boss : globes d’upgrade par joueur', min: 0, max: 10, step: 1, hint: 'Globes d’upgrade aléatoire libérés par l’œuf détruit pour chaque joueur vivant ; chacun est réservé à son joueur et ne disparaît jamais' },
      { key: 'chestOrbGrace', label: 'Œuf de boss : globe imprenable (s)', min: 0, max: 5, step: 0.1, hint: 'Après sa sortie de l’œuf, un globe d’upgrade ne peut être ni attiré ni ramassé pendant ce temps : on le voit d’abord retomber' },
      { key: 'bossEnrageEvery', label: 'Enragement : toutes les (s)', min: 10, max: 300, step: 5, hint: "Un boss vivant gagne un niveau d'enragement toutes les N s après son apparition, sans fin" },
      { key: 'bossEnrageSpeed', label: 'Enragement : vitesse + / niveau', min: 0, max: 1, step: 0.05, hint: 'Vitesse de déplacement ajoutée par niveau (0,30 = +30 %, cumulés)' },
      { key: 'bossEnrageAttack', label: 'Enragement : cadence + / niveau', min: 0, max: 1, step: 0.05, hint: "Cadence d'attaque ajoutée par niveau (0,30 = +30 %, cumulés)" },
      { key: 'bossEnrageCooldownCut', label: 'Enragement : cooldown − / niveau', min: 0, max: 0.9, step: 0.05, hint: 'Réduction du cooldown des capacités par niveau (0,30 = −30 %, cumulés, gain plafonné à ×10)' },
    ],
  },
  {
    title: 'Multijoueur',
    specs: [
      { key: 'extraPlayerAliens', label: 'Aliens par joueur en plus', min: 0, max: 2, step: 0.05, hint: "Chaque joueur vivant en plus ajoute cette part des aliens d'une vague et des PV des boss (0,75 = +75 %)" },
      { key: 'maxAliensPerPlayer', label: "Plafond d'aliens / joueur", min: 20, max: 400, step: 5, hint: "Aliens au plus à l'apparition par joueur vivant. Un boss l'ignore" },
    ],
  },
  {
    title: 'Vagues',
    specs: [
      { key: 'wavePauseAbove', label: 'Pause au-delà de (aliens)', min: 20, max: 600, step: 5, hint: "La timeline se met en pause au-delà de ce nombre d'aliens vivants (tous joueurs)" },
      { key: 'waveResumeAt', label: 'Reprise à (aliens)', min: 0, max: 600, step: 5, hint: "La timeline en pause reprend quand il reste ce nombre d'aliens ou moins" },
      { key: 'bossReplayMulGling', label: 'Vagues rejouées : Gling Mère ×', min: 0, max: 3, step: 0.05, hint: "Pendant le combat de ce boss, chaque vague rejouée a son effectif (colonne de la timeline) × cette valeur : nombre de chaque groupe hors boss, arrondi, au moins 1" },
      { key: 'bossReplayMulRhino', label: 'Vagues rejouées : Rhino Alpha ×', min: 0, max: 3, step: 0.05, hint: "Pendant le combat de ce boss, chaque vague rejouée a son effectif (colonne de la timeline) × cette valeur : nombre de chaque groupe hors boss, arrondi, au moins 1" },
      { key: 'bossReplayMulScarab', label: 'Vagues rejouées : Scarab ×', min: 0, max: 3, step: 0.05, hint: "Pendant le combat de ce boss, chaque vague rejouée a son effectif (colonne de la timeline) × cette valeur : nombre de chaque groupe hors boss, arrondi, au moins 1" },
      { key: 'bossReplayMulTwins', label: 'Vagues rejouées : Rhinos jumeaux ×', min: 0, max: 3, step: 0.05, hint: "Pendant le combat de ce boss, chaque vague rejouée a son effectif (colonne de la timeline) × cette valeur : nombre de chaque groupe hors boss, arrondi, au moins 1" },
      { key: 'bossReplayMulCrab', label: 'Vagues rejouées : Giant Crab ×', min: 0, max: 3, step: 0.05, hint: "Pendant le combat de ce boss, chaque vague rejouée a son effectif (colonne de la timeline) × cette valeur : nombre de chaque groupe hors boss, arrondi, au moins 1" },
      { key: 'bossReplayCount', label: 'Vagues rejouées pendant un boss', min: 1, max: 20, step: 1, hint: "Tant qu'un boss est vivant, les N derniers envois d'avant lui sont rejoués en boucle (aliens sans XP)" },
    ],
  },
  {
    title: 'Aides au joueur',
    specs: [
      { key: 'powerupFirst', label: 'Premier power-up à (s)', min: 0, max: 120, step: 1, hint: 'Apparition du premier power-up de la partie' },
      { key: 'powerupEveryMin', label: 'Power-up toutes les (s) : min', min: 1, max: 120, step: 0.5, hint: 'Délai minimal entre deux power-ups (tiré au hasard entre min et max)' },
      { key: 'powerupEveryMax', label: 'Power-up toutes les (s) : max', min: 1, max: 120, step: 0.5, hint: 'Délai maximal entre deux power-ups' },
      { key: 'powerupMax', label: 'Power-ups au sol au plus', min: 0, max: 10, step: 1, hint: 'Nombre max de power-ups au sol en même temps' },
      { key: 'rocketIdleRange', label: 'Roquettes sans cible : portée (px)', min: 100, max: 3000, step: 50, hint: 'Sans aucun alien à viser, une roquette du power-up file droit dans une direction au hasard sur cette distance avant d’exploser (elle explose quand même au premier alien rencontré)' },
      { key: 'stimTime', label: 'Durée du stimpack (s)', min: 0, max: 30, step: 0.5, hint: 'Durée du bonus de vitesse et de cadence du stimpack' },
      { key: 'reviveSquadFraction', label: 'Revive solo : part de la squad', min: 0.05, max: 1, step: 0.05, hint: 'La squad réapparaît avec cette part de son effectif maximal de la partie' },
      { key: 'coopReviveRatio', label: 'Réanimation coop : part de la squad', min: 0.05, max: 1, step: 0.05, hint: 'Un joueur réanimé par un équipier revient avec cette part de son effectif maximal' },
      { key: 'rerolls', label: 'Relances par partie', min: 0, max: 10, step: 1, hint: "Relances des propositions d'upgrade par partie et par joueur" },
      { key: 'recruitMax', label: 'Recrues : facteur max (petite squad)', min: 0, max: 5, step: 0.05, hint: "Le taux de drop d'un alien (recruitChance) est multiplié par ce facteur quand la squad est petite ; il baisse avec sa taille. Facteur = max − (soldats − taille de départ) × pente, entre le plancher et ce max" },
      { key: 'recruitSizeRef', label: 'Recrues : taille de départ', min: 0, max: 20, step: 1, hint: "Jusqu'à cette taille de squad, le facteur reste au maximum ; au-delà il baisse" },
      { key: 'recruitSlope', label: 'Recrues : perte par soldat', min: 0, max: 0.5, step: 0.01, hint: 'Facteur perdu par soldat au-delà de la taille de départ' },
      { key: 'recruitMin', label: 'Recrues : facteur plancher (grosse squad)', min: 0, max: 2, step: 0.05, hint: 'Le facteur ne descend jamais sous cette valeur' },
      { key: 'magnetRadius', label: "Rayon d'attraction (px)", min: 20, max: 400, step: 5, hint: "Rayon d'attraction de base de tous les objets au sol (globes d'XP, recrues, power-ups, globes d'upgrade), avant l'upgrade Aimant" },
      { key: 'xpCostMul', label: 'Coût d’XP des niveaux ×', min: 0.2, max: 3, step: 0.05, hint: 'Multiplie l’XP nécessaire à chaque niveau (courbe xpToNext). Sans effet pendant le tutoriel' },
      { key: 'prismChance', label: 'Chance de carte prismatique', min: 0, max: 1, step: 0.01, hint: "Chance qu'une upgrade proposée soit prismatique (bonus doublé), hors niveaux 10, 20, 30…" },
    ],
  },
];

/** Enregistre les réglages courants (à appeler après chaque changement de slider). */
export function saveDifficulty(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DIFFICULTY));
  } catch {
    // stockage indisponible : les réglages ne survivent simplement pas au rechargement
  }
}

/** À appeler avant de créer la simulation : réapplique les réglages courants mémorisés. */
export function loadSavedDifficulty(): void {
  if (!DEV_TOOLS) return;
  dropStaleOverride(STORAGE_KEY, 'Difficulté', DIFFICULTY_DEFAULTS);
  try {
    const values = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Record<DifficultyKey, number>>;
    for (const key of Object.keys(DIFFICULTY_DEFAULTS) as DifficultyKey[]) {
      const v = values[key];
      if (typeof v === 'number' && Number.isFinite(v)) DIFFICULTY[key] = v;
    }
  } catch {
    // réglages illisibles : valeurs par défaut
  }
}

/** Boutons ±5 % : ajoute (ou retranche) `part` × la valeur du code à un réglage de `DIFFICULTY`. Additif : +5 % puis −5 % revient à l'origine. */
export function shiftDifficulty(key: DifficultyKey, part: number): number {
  DIFFICULTY[key] = Number((DIFFICULTY[key] + DIFFICULTY_DEFAULTS[key] * part).toPrecision(5));
  saveDifficulty();
  return DIFFICULTY[key];
}

export function resetDifficulty(): void {
  Object.assign(DIFFICULTY, DIFFICULTY_DEFAULTS);
  saveDifficulty();
}

/** Save : écrit les valeurs courantes dans `DIFFICULTY_DEFAULTS` (config.ts) ; Reset ramène ensuite à cette sauvegarde. */
export async function saveDifficultyToCode(): Promise<string> {
  const msg = await saveToCode('difficulty', DIFFICULTY);
  if (msg.startsWith('✔')) Object.assign(DIFFICULTY_DEFAULTS, DIFFICULTY);
  return msg;
}
