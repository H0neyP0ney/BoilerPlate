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
  /**
   * Flaques au sol à la mort d'un alien (fx_puddle) : 1 à `countMax` flaques, taille et durée aléatoires, qui s'effacent en alpha et en taille.
   * Taille de base = largeur de l'ombre portée de l'alien × `shadowMul` (pour tous les aliens, flaque de cadavre comprise).
   */
  puddle: { countMin: 1, countMax: 3, scaleMin: 0.6, scaleMax: 1.3, spread: 22, alpha: 0.75, lifeMinMs: 2500, lifeMaxMs: 4500, endScale: 0.3, shadowMul: 1.6 },
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
  /** Fissures noires au sol (fx_cracks_<n>) sous les grosses explosions (rayon >= minRadius) : elles restent `holdMs` puis s'effacent en `fadeMs` ; dessous, une trace de brûlure noir / gris (fx_scorch_<n>, `scorch*`) plus large qui dure plus longtemps. */
  cracks: { minRadius: 90, scale: 1.2, alpha: 0.85, holdMs: 1200, fadeMs: 3500, scorchAlpha: 0.6, scorchScale: 1.3, scorchHoldMs: 3000, scorchFadeMs: 7000 },
  /** Secousses d'écran (caméra) : slam d'un alien, mort d'un de TES soldats, mort d'un gros alien (amplitude = part de l'écran). La secousse des explosions est dans `explosion`. */
  shake: { slamMs: 220, slamAmount: 0.01, deathMs: 160, deathAmount: 0.009, bigKillMs: 110, bigKillAmount: 0.004 },
  /** Poussière quand une unité sort du sol (trou d'apparition, lurker, Scarab) : `countBase` + `countPerRadius` × rayon de l'unité de bouffées (fx_smoke). */
  dust: { countBase: 6, countPerRadius: 0.33, speedMin: 18, speedMax: 70, scaleStart: 0.4, scaleEnd: 1.1, alpha: 0.55, lifeMin: 450, lifeMax: 800, color: 0xb9a78c },
  /** Bulle de critique « ! 123 » : taille finale, grossissement des chiffres seuls, apparition, pause avant la montée, montée. */
  crit: { scale: 0.7, textGrow: 1.35, popMs: 140, holdMs: 300, riseMs: 420, rise: 34 },
  /** Flammes d'enragé (fx_flame, additif) : aliens ressuscités par un chaman et soldats sous stimpack. `spreadX` = largeur de la source, en part du rayon de l'unité. */
  enraged: { spreadX: 0.7, speedYMin: 45, speedYMax: 100, speedX: 14, scaleStart: 0.8, alpha: 0.95, lifeMin: 380, lifeMax: 650 },
  /** Montée de niveau : chaque soldat de la squad devient tout blanc `holdMs` ms puis repasse à sa couleur en fondu (`fadeMs`). */
  levelFlash: { holdMs: 100, fadeMs: 650 },
  /** Colonne de lumière (fx_column) qui monte et s'estompe, avec halo : nouvelle recrue dans la squad (taille et durée par défaut). */
  column: { height: 130, durationMs: 800, glowScale: 1.2, glowEnd: 2.4 },
  /** Perte d'un soldat (composé) : éclats, gouttes, flaque, double onde, flash blanc, colonne rouge et croix. */
  death: { burstCount: 44, flashCount: 20, gloopSize: 1.8, puddleSize: 1.2, ringBig: 130, ringSmall: 75, flashScale: 3.4, flashMs: 260, columnHeight: 170, columnMs: 700, crossSize: 34 },
  /** Pluie de particules arc-en-ciel des cartes d'upgrade prismatiques (fx_star, additif). */
  prism: { every: 16, speedYMin: 8, speedYMax: 38, speedX: 12, scaleStart: 0.4, lifeMin: 600, lifeMax: 1100 },
  /** Croix vertes qui montent dans les globes de soin (fx_plus) : une toutes les ~`everyMs` ms par globe, au hasard dans la zone ; `scale` = taille, `rise` = montée (px). */
  healZone: { everyMs: 140, scale: 1.4, rise: 46, durationMs: 1100, alpha: 0.9 },
  /**
   * Glaçon (soldat gelé) : éclats à chaque coup (`shard*`, × `breakMul` quand il se brise), et petits BLOCS de glace (`chunk*`, texture
   * `fx_ice_chunk`) qui sautent en cloche (élan horizontal ±`chunkSpread`, vers le haut `chunkUpMin`-`chunkUpMax` px/s, gravité
   * `chunkGravity`), retombent `chunkFall` px sous le point d'impact puis s'effacent en `chunkFadeMs` ms. Taille aux derniers PV : `minScale`
   * (1 = il ne rétrécit pas, 08/10) ; fissures qui s'ajoutent quand la part de PV restante passe sous `crack1` / `crack2` / `crack3`.
   */
  ice: { shardCount: 6, shardSpeedMin: 40, shardSpeedMax: 190, shardScale: 1.1, shardLifeMin: 350, shardLifeMax: 700, shardGravity: 380, breakMul: 3, minScale: 1, crack1: 0.7, crack2: 0.4, crack3: 0.15, chunkCount: 3, chunkScale: 1, chunkSpread: 120, chunkUpMin: 180, chunkUpMax: 300, chunkGravity: 900, chunkFall: 14, chunkFadeMs: 250 },
  /** Petits flocons qui montent dans le globe de stase (fx_ice_ball) : un toutes les ~`everyMs` ms, au hasard dans la zone ; taille `scaleMin`-`scaleMax`, montée `rise` (px) en `durationMs`, rotation `spin` (tours / s), opacité de départ `alpha`. */
  stasis: { everyMs: 35, scaleMin: 0.15, scaleMax: 0.35, rise: 80, durationMs: 1500, alpha: 0.85, spin: 0.4 },
  /** Ondes de montée de niveau : nombre d'ondes blanches, écart entre deux, force de la déformation de l'écran (part de l'écran déplacée au maximum). */
  levelWave: { waves: 4, gapMs: 170, distort: 0.07 },
  /** Onde de choc au sol (fx_ring) : explosion, slam du crabe, recrutement, apparition de squad. */
  ring: { durationMs: 350, startScaleX: 0.1, startScaleY: 0.07, alpha: 0.9, squash: 0.7 },
  /** Petit « + » qui monte : soin du Medic (fx_plus). */
  heal: { rise: 34, durationMs: 700, jitter: 10 },
  /** Roquettes du power-up (fx_rocket, ligne droite) et leur traînée de fumée blanche opaque qui rétrécit jusqu'à 0 (fx_smoke). */
  rocket: { scale: 1.1, smokeScale: 0.55, smokeLifeMin: 300, smokeLifeMax: 520, smokeSpeed: 18, smokeSpread: 3 },
  /** Texte flottant : « +1 Gunner ! », « BOSS DOWN! » (taille fixée par l'appelant). */
  text: { popMs: 140, popFrom: 0.6, holdMs: 450, fadeMs: 600, rise: 30 },
  /**
   * Recrue « bonus +1 » composée (art/recruits.ts) : position (en part de la taille du globe, depuis son centre), taille
   * (part de la taille du globe) et opacité de chaque pièce ; taille affichée ; étoiles qui scintillent autour (recruit/star).
   */
  recruit: {
    displayScale: 0.34,
    globeScale: 1,
    globeAlpha: 1,
    ringScale: 1,
    ringAlpha: 1,
    headX: 0,
    headY: 0.02,
    headScale: 0.58,
    plusX: 0.25,
    plusY: 0.18,
    plusScale: 0.48,
    starEvery: 120,
    starLifeMin: 390,
    starLifeMax: 850,
    starRadius: 23,
    starScale: 0.21,
    starRise: 35,
    starY: 6,
  },
};

export type FxParams = typeof FX_DEFAULTS;
export type FxName = keyof FxParams;

/** Valeurs courantes (modifiées à chaud par la visionneuse de particules). */
export const FX: FxParams = structuredClone(FX_DEFAULTS);
