/**
 * Réglages des effets de particules du jeu (affichage uniquement, hors simulation). Lus par `view/Fx.ts` ;
 * éditables dans la visionneuse de particules (dev), qui les mémorise dans le navigateur (debugFx.ts).
 * Une fois satisfait : « Copier le code » → coller le bloc de l'effet dans FX_DEFAULTS.
 *
 * Durées en ms, vitesses en px/s, échelles relatives à la texture (fx_dot 12 px, fx_flame 40 px, fx_ring 128 px).
 */
export const FX_DEFAULTS = {
  /** Éclaboussure colorée : touche, mort d'un alien ou d'un soldat, recrutement (texture fx_dot). */
  burst: { countMul: 1, speedMin: 60, speedMax: 240, scaleStart: 0.9, scaleEnd: 0, lifeMin: 250, lifeMax: 500 },
  /** Impact d'une balle qui disparaît : quelques petites particules (fx_dot), teinte donnée par l'appelant (bleu pour le Gunner). */
  impact: { count: 5, speedMin: 30, speedMax: 110, scaleStart: 0.5, scaleEnd: 0, lifeMin: 120, lifeMax: 260 },
  /** Éclatement du slime à sa mort : grosses gouttes qui retombent (gravité, px/s²) + fines gouttelettes (fx_dot). */
  gloop: { count: 14, speedMin: 50, speedMax: 220, scaleStart: 1.3, scaleEnd: 0.2, lifeMin: 350, lifeMax: 700, gravity: 260 },
  /** Flaques au sol à la mort du slime (fx_puddle) : 1 à `countMax` flaques, taille et durée aléatoires, qui s'effacent en alpha et en taille. */
  puddle: { countMin: 1, countMax: 3, scaleMin: 0.5, scaleMax: 0.95, spread: 22, alpha: 0.75, lifeMinMs: 2500, lifeMaxMs: 4500, endScale: 0.3 },
  /** Flash de tir à la bouche du canon (fx_glow, additif) : Gunner. */
  muzzle: { scale: 0.5, durationMs: 90, color: 0xffd27a },
  /** Explosion : gerbe de flammes (fx_flame, additif) + onde de choc ; mort du Flammeur, grenade, boss. */
  explosion: {
    count: 22,
    speedMin: 40,
    speedMax: 260,
    scaleStart: 1.6,
    scaleEnd: 0.2,
    alphaStart: 1,
    alphaEnd: 0,
    lifeMin: 300,
    lifeMax: 600,
    ringColor: 0xffb040,
    shakeAmount: 0.008,
    shakeMs: 180,
  },
  /** Onde de choc au sol (fx_ring) : explosion, slam du crabe, recrutement, apparition de squad. */
  ring: { durationMs: 350, startScaleX: 0.1, startScaleY: 0.07, alpha: 0.9, squash: 0.7 },
  /** Petit « + » qui monte : soin du Medic (fx_plus). */
  heal: { rise: 34, durationMs: 700, jitter: 10 },
  /** Texte flottant : « +1 Gunner ! », « BOSS DOWN! » (taille fixée par l'appelant). */
  text: { popMs: 140, popFrom: 0.6, holdMs: 450, fadeMs: 500, rise: 46 },
};

export type FxParams = typeof FX_DEFAULTS;
export type FxName = keyof FxParams;

/** Valeurs courantes (modifiées à chaud par la visionneuse de particules). */
export const FX: FxParams = structuredClone(FX_DEFAULTS);
