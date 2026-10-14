/** Réglage de chaque bruitage : volume de base (0 à 1), variation de hauteur (cents), délai minimal entre deux lectures (ms), voix simultanées (0 = illimité), variante choisie.
 *  Réglé avec la page de test `?sounds` (bouton Save). Pur (données). */
export interface SfxTuning {
  volume: number;
  detune: number;
  /** Hauteur de base (cents, signé : − = plus grave) : s'ajoute à la variation aléatoire. */
  pitch: number;
  /** Vitesse de lecture (1 = normale). */
  rate: number;
  minGapMs: number;
  maxVoices: number;
  /** Variante jouée dans le jeu : '' = le fichier de base `<nom>.mp3`, sinon `<nom>--<variante>.mp3` (ex. `levelup--v2`). */
  variant: string;
  /** Variantes connues (en plus de la base), pour la liste déroulante de la page `?sounds` ; la liste se complète toute seule en dev (`/__dev/sfx-list`). */
  variants: string[];
}

export const SFX_TUNING: Record<string, SfxTuning> = {
  blaster: { volume: 0.35, detune: 120, pitch: 0, rate: 1, minGapMs: 60, maxVoices: 2, variant: '', variants: [] },
  blast: { volume: 0.68, detune: 250, pitch: 0, rate: 1, minGapMs: 90, maxVoices: 3, variant: '', variants: [] },
  ui_click: { volume: 0.35, detune: 0, pitch: 0, rate: 1, minGapMs: 40, maxVoices: 0, variant: '', variants: [] },
  ui_hover: { volume: 0.15, detune: 0, pitch: 0, rate: 1, minGapMs: 60, maxVoices: 0, variant: '', variants: [] },
  ui_open: { volume: 0, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: '', variants: [] },
  ui_claim: { volume: 0.56, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: 'upgrade_pick', variants: ['upgrade_pick'] },
  ui_claim_prism: { volume: 0.56, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: 'upgrade_pick', variants: ['upgrade_pick'] },
  ui_reroll: { volume: 0.55, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: '', variants: [] },
  levelup: { volume: 0.68, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: 'level_up', variants: ['level_up'] },
  defeat: { volume: 0, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: '', variants: [] },
  victory: { volume: 0, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: '', variants: [] },
  xp: { volume: 0.82, detune: 200, pitch: 0, rate: 1, minGapMs: 35, maxVoices: 4, variant: 'xp_globe', variants: ['note', 'xp_globe'] },
  recruit: { volume: 0.42, detune: 0, pitch: 0, rate: 1, minGapMs: 80, maxVoices: 0, variant: 'recrue3', variants: ['recrue', 'recrue2', 'recrue3'] },
  pu_stim: { volume: 0.33, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: '', variants: [] },
  pu_magnet: { volume: 0.33, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: '', variants: [] },
  pu_heal: { volume: 0.45, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: 'medibot', variants: ['medibot'] },
  pu_stasis: { volume: 0.34, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: '', variants: [] },
  pu_rockets: { volume: 0.9, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: '', variants: [] },
  pu_reroll: { volume: 0.5, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: 'loot_rare', variants: ['loot_rare'] },
  pu_prism: { volume: 0.5, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: 'loot_rare', variants: ['loot_rare'] },
  egg_break: { volume: 0, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: '', variants: [] },
  alien_die_s: { volume: 0.35, detune: 200, pitch: 0, rate: 1, minGapMs: 40, maxVoices: 4, variant: 'death', variants: ['death', 'plop'] },
  alien_die_m: { volume: 0.35, detune: 150, pitch: 0, rate: 1, minGapMs: 60, maxVoices: 3, variant: 'death', variants: ['death'] },
  alien_die_l: { volume: 0.35, detune: 100, pitch: 0, rate: 1, minGapMs: 100, maxVoices: 2, variant: 'death', variants: ['death'] },
  soldier_die: { volume: 0.24, detune: 0, pitch: 0, rate: 1, minGapMs: 80, maxVoices: 3, variant: 'soldier_out', variants: ['soldier_out'] },
  crit: { volume: 0, detune: 100, pitch: 0, rate: 1, minGapMs: 60, maxVoices: 2, variant: '', variants: [] },
  alien_shot: { volume: 0.19, detune: 250, pitch: 0, rate: 1, minGapMs: 90, maxVoices: 4, variant: '', variants: [] },
  tongue: { volume: 0.29, detune: 100, pitch: 0, rate: 1, minGapMs: 80, maxVoices: 2, variant: '', variants: [] },
  fuse: { volume: 0, detune: 0, pitch: 0, rate: 1, minGapMs: 120, maxVoices: 2, variant: '', variants: [] },
  cleave: { volume: 0.36, detune: 100, pitch: 0, rate: 1, minGapMs: 100, maxVoices: 2, variant: '', variants: [] },
  stalactite: { volume: 0, detune: 150, pitch: 0, rate: 1, minGapMs: 80, maxVoices: 3, variant: '', variants: [] },
  freeze: { volume: 0.18, detune: 0, pitch: 0, rate: 1, minGapMs: 80, maxVoices: 2, variant: '', variants: [] },
  thaw: { volume: 0, detune: 150, pitch: 0, rate: 1, minGapMs: 80, maxVoices: 2, variant: '', variants: [] },
  capture: { volume: 0.22, detune: 0, pitch: 0, rate: 1, minGapMs: 120, maxVoices: 2, variant: '', variants: [] },
  release: { volume: 0, detune: 0, pitch: 0, rate: 1, minGapMs: 100, maxVoices: 2, variant: '', variants: [] },
  rock_break: { volume: 0.17, detune: 150, pitch: 0, rate: 1, minGapMs: 100, maxVoices: 2, variant: '', variants: [] },
  heal: { volume: 0, detune: 100, pitch: 0, rate: 1, minGapMs: 150, maxVoices: 2, variant: '', variants: [] },
  boss_arrive: { volume: 0.4, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: '', variants: [] },
  boss_down: { volume: 0, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: '', variants: [] },
  boss_enrage: { volume: 0.29, detune: 0, pitch: 0, rate: 1, minGapMs: 0, maxVoices: 0, variant: '', variants: [] },
};
