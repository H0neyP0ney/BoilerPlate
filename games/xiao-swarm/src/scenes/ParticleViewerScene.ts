import Phaser from 'phaser';
import { sprites } from '@xiao/engine';
import { DEPTH, FREEZE, SCENES, UPGRADE_REPEL, VISUAL, VIEW_BG } from '../config';
import { fxSnippet, resetFx, saveFxToCode, setFx } from '../debugFx';
import { button, checkbox, colorInput, header, heading, line, note, panel, select, slider } from '../dev/devUi';
import { FX, type FxName } from '../fxParams';
import { createEnragedFlames } from '../view/EnragedFx';
import { iceLook } from '../view/IceBlockFx';
import { Fx } from '../view/Fx';
import { drawField, drawPickupSpot, GLOBE_LIFT, UPGRADE_PINK } from '../view/PickupViews';
import { createPrismRain, setPrismZone } from '../view/PrismFx';
import { ShockDistort } from '../view/ShockDistort';
import { clearGlobeTextures } from '../art/upgradeOrbs';
import { UpgradeOrbView } from '../view/LootViews';
import { drawTeleEllipse, teleColor, teleInner, teleOuter, TELEGRAPH_KINDS, type TelegraphKind } from '../view/telegraph';
import { RecruitView } from '../view/UnitViews';
import { makeRecruitTextures } from '../art/recruits';
import { CLASSES } from '../data/classes';

/**
 * Visionneuse de particules (dev uniquement) : joue chaque effet du jeu et permet d'en régler les paramètres
 * en direct. Les réglages sont mémorisés dans le navigateur (debugFx.ts) et s'appliquent au jeu ; « Copier le code »
 * donne le bloc à coller dans FX_DEFAULTS (fxParams.ts).
 * Un clic sur la scène rejoue l'effet à cet endroit.
 */
interface Spec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  color?: boolean;
  hint?: string;
}

interface EffectDef {
  id: FxName;
  label: string;
  where: string;
  specs: Spec[];
}

const EFFECTS: EffectDef[] = [
  {
    id: 'telegraph',
    label: 'Télégraphes des attaques d’aliens',
    where: 'Zones annoncées avant une attaque (charge, saut, boules en cloche, kamikaze, pics du lurker, Scarab, stalactites, murs). Aperçu : les 8 types, remplis en boucle.',
    specs: [
      { key: 'full', label: "Opacité à l'impact", min: 0.2, max: 1, step: 0.05, hint: 'Opacité totale atteinte au moment de l’impact (zone entière + zone intérieure qui grandit), pour tous les types' },
      ...TELEGRAPH_KINDS.map((t) => ({ key: `${t.kind}Color`, label: t.label, min: 0, max: 0, step: 1, color: true })),
    ],
  },
  {
    id: 'burst',
    label: 'Éclaboussure (touche, mort, recrutement)',
    where: 'Touche du boss, mort d\'un alien / soldat, recrutement ; teinte = couleur de l\'unité.',
    specs: [
      { key: 'countMul', label: 'Quantité (×)', min: 0.1, max: 4, step: 0.05, hint: 'Multiplie le nombre de particules demandé par chaque événement' },
      { key: 'speedMin', label: 'Vitesse min', min: 0, max: 500, step: 5 },
      { key: 'speedMax', label: 'Vitesse max', min: 0, max: 700, step: 5 },
      { key: 'scaleStart', label: 'Taille au départ', min: 0, max: 3, step: 0.05 },
      { key: 'scaleEnd', label: 'Taille à la fin', min: 0, max: 3, step: 0.05 },
      { key: 'lifeMin', label: 'Durée min (ms)', min: 50, max: 1500, step: 10 },
      { key: 'lifeMax', label: 'Durée max (ms)', min: 50, max: 2000, step: 10 },
    ],
  },
  {
    id: 'explosion',
    label: 'Explosion (flammes + onde)',
    where: 'Mort du Flammeur, kamikaze, mort du boss (les fissures au sol sont dans « Fissures ») ; la taille de l\'onde vient de l\'événement.',
    specs: [
      { key: 'count', label: 'Particules', min: 1, max: 100, step: 1 },
      { key: 'speedMin', label: 'Vitesse min', min: 0, max: 500, step: 5 },
      { key: 'speedMax', label: 'Vitesse max', min: 0, max: 700, step: 5 },
      { key: 'scaleStart', label: 'Taille au départ', min: 0, max: 4, step: 0.05 },
      { key: 'scaleEnd', label: 'Taille à la fin', min: 0, max: 4, step: 0.05 },
      { key: 'alphaStart', label: 'Opacité au départ', min: 0, max: 1, step: 0.05 },
      { key: 'alphaEnd', label: 'Opacité à la fin', min: 0, max: 1, step: 0.05 },
      { key: 'lifeMin', label: 'Durée min (ms)', min: 50, max: 1500, step: 10 },
      { key: 'lifeMax', label: 'Durée max (ms)', min: 50, max: 2000, step: 10 },
      { key: 'ringColor', label: "Couleur de l'onde", min: 0, max: 0, step: 1, color: true },
      { key: 'shakeAmount', label: 'Secousse (amplitude)', min: 0, max: 0.03, step: 0.001, hint: '0 = pas de secousse' },
      { key: 'shakeMs', label: 'Secousse (ms)', min: 0, max: 800, step: 10 },
    ],
  },
  {
    id: 'ring',
    label: 'Onde de choc au sol',
    where: 'Explosion, slam du crabe, recrutement, apparition de squad ; couleur et rayon viennent de l\'événement.',
    specs: [
      { key: 'durationMs', label: 'Durée (ms)', min: 50, max: 1500, step: 10 },
      { key: 'startScaleX', label: 'Taille de départ X', min: 0, max: 1, step: 0.01 },
      { key: 'startScaleY', label: 'Taille de départ Y', min: 0, max: 1, step: 0.01 },
      { key: 'alpha', label: 'Opacité de départ', min: 0, max: 1, step: 0.05 },
      { key: 'squash', label: 'Aplatissement (Y / X)', min: 0.2, max: 1.2, step: 0.05, hint: '1 = cercle, < 1 = ellipse couchée (vue de dessus)' },
    ],
  },
  {
    id: 'heal',
    label: 'Soin (+ qui monte)',
    where: 'Soin du Medic, sur chaque soldat soigné.',
    specs: [
      { key: 'rise', label: 'Montée (px)', min: 0, max: 120, step: 1 },
      { key: 'durationMs', label: 'Durée (ms)', min: 100, max: 2000, step: 10 },
      { key: 'jitter', label: 'Dispersion X (px)', min: 0, max: 40, step: 1 },
    ],
  },
  {
    id: 'text',
    label: 'Texte flottant',
    where: '« +1 Gunner ! » au recrutement, « BOSS DOWN! ».',
    specs: [
      { key: 'popFrom', label: "Taille d'apparition", min: 0, max: 1.5, step: 0.05 },
      { key: 'popMs', label: 'Apparition (ms)', min: 0, max: 600, step: 10 },
      { key: 'holdMs', label: 'Pause avant de monter (ms)', min: 0, max: 2000, step: 10 },
      { key: 'fadeMs', label: 'Disparition (ms)', min: 50, max: 2000, step: 10 },
      { key: 'rise', label: 'Montée (px)', min: 0, max: 150, step: 1 },
    ],
  },
  {
    id: 'impact',
    label: "Impact d'une balle",
    where: "Balle qui disparaît (touche un obstacle, un alien…) : quelques étincelles ; teinte donnée par l'appelant (bleu pour le Trooper).",
    specs: [
      { key: 'count', label: 'Particules', min: 1, max: 40, step: 1 },
      { key: 'speedMin', label: 'Vitesse min', min: 0, max: 400, step: 5 },
      { key: 'speedMax', label: 'Vitesse max', min: 0, max: 500, step: 5 },
      { key: 'scaleStart', label: 'Taille au départ', min: 0, max: 3, step: 0.05 },
      { key: 'scaleEnd', label: 'Taille à la fin', min: 0, max: 3, step: 0.05 },
      { key: 'lifeMin', label: 'Durée min (ms)', min: 30, max: 1000, step: 10 },
      { key: 'lifeMax', label: 'Durée max (ms)', min: 30, max: 1500, step: 10 },
    ],
  },
  {
    id: 'gloop',
    label: 'Éclatement de gelée',
    where: "Mort d'un slime : grosses gouttes qui retombent (gravité) + fines gouttelettes.",
    specs: [
      { key: 'count', label: 'Grosses gouttes', min: 1, max: 60, step: 1 },
      { key: 'speedMin', label: 'Vitesse min', min: 0, max: 400, step: 5 },
      { key: 'speedMax', label: 'Vitesse max', min: 0, max: 500, step: 5 },
      { key: 'scaleStart', label: 'Taille au départ', min: 0, max: 4, step: 0.05 },
      { key: 'scaleEnd', label: 'Taille à la fin', min: 0, max: 4, step: 0.05 },
      { key: 'lifeMin', label: 'Durée min (ms)', min: 50, max: 1500, step: 10 },
      { key: 'lifeMax', label: 'Durée max (ms)', min: 50, max: 2000, step: 10 },
      { key: 'gravity', label: 'Gravité (px/s²)', min: 0, max: 1000, step: 10 },
    ],
  },
  {
    id: 'puddle',
    label: 'Flaques au sol',
    where: "Mort d'un slime : 1 à N flaques qui rétrécissent et s'effacent (les chamans les ressuscitent depuis ces flaques).",
    specs: [
      { key: 'countMin', label: 'Nombre min', min: 0, max: 10, step: 1 },
      { key: 'countMax', label: 'Nombre max', min: 0, max: 10, step: 1 },
      { key: 'scaleMin', label: 'Taille min', min: 0.1, max: 2, step: 0.05 },
      { key: 'scaleMax', label: 'Taille max', min: 0.1, max: 2, step: 0.05 },
      { key: 'spread', label: 'Dispersion (px)', min: 0, max: 80, step: 1 },
      { key: 'alpha', label: 'Opacité', min: 0, max: 1, step: 0.05 },
      { key: 'lifeMinMs', label: 'Durée min (ms)', min: 200, max: 10000, step: 100 },
      { key: 'lifeMaxMs', label: 'Durée max (ms)', min: 200, max: 12000, step: 100 },
      { key: 'endScale', label: 'Taille finale (part)', min: 0, max: 1, step: 0.05 },
      { key: 'shadowMul', label: "Taille (× largeur de l'ombre de l'alien)", min: 0.2, max: 4, step: 0.05 },
    ],
  },
  {
    id: 'muzzle',
    label: 'Flash de tir',
    where: 'Bouche du canon du Trooper à chaque tir (additif, très bref).',
    specs: [
      { key: 'scale', label: 'Taille', min: 0.1, max: 2, step: 0.05 },
      { key: 'durationMs', label: 'Durée (ms)', min: 20, max: 500, step: 5 },
      { key: 'color', label: 'Couleur', min: 0, max: 0, step: 1, color: true },
    ],
  },
  {
    id: 'rocket',
    label: 'Roquette + fumée',
    where: "Rafale de roquettes (power-up) : fusée en ligne droite et traînée de fumée blanche qui rétrécit.",
    specs: [
      { key: 'scale', label: 'Taille de la fusée', min: 0.3, max: 3, step: 0.05 },
      { key: 'smokeScale', label: 'Taille de la fumée', min: 0.1, max: 2, step: 0.05 },
      { key: 'smokeLifeMin', label: 'Fumée : durée min (ms)', min: 50, max: 1500, step: 10 },
      { key: 'smokeLifeMax', label: 'Fumée : durée max (ms)', min: 50, max: 2000, step: 10 },
      { key: 'smokeSpeed', label: 'Fumée : vitesse', min: 0, max: 100, step: 1 },
      { key: 'smokeSpread', label: 'Fumée : dispersion (px)', min: 0, max: 20, step: 0.5 },
    ],
  },
  {
    id: 'levelFlash',
    label: 'Flash de montée de niveau',
    where: 'Montée de niveau : chaque soldat de la squad devient tout blanc puis repasse à sa couleur en fondu. Aperçu : un Gunner.',
    specs: [
      { key: 'holdMs', label: 'Blanc plein (ms)', min: 0, max: 800, step: 10 },
      { key: 'fadeMs', label: 'Fondu (ms)', min: 50, max: 2500, step: 10 },
    ],
  },
  {
    id: 'column',
    label: 'Colonne de lumière',
    where: "Nouvelle recrue dans la squad : colonne qui monte et s'estompe, avec halo (taille et durée par défaut ; la mort d'un soldat et la prise d'upgrade ont les leurs).",
    specs: [
      { key: 'height', label: 'Hauteur (px)', min: 40, max: 400, step: 5 },
      { key: 'durationMs', label: 'Durée (ms)', min: 200, max: 3000, step: 50 },
      { key: 'glowScale', label: 'Halo : taille au départ', min: 0.2, max: 4, step: 0.05 },
      { key: 'glowEnd', label: 'Halo : taille à la fin', min: 0.5, max: 6, step: 0.1 },
    ],
  },
  {
    id: 'death',
    label: "Perte d'un soldat",
    where: "Composé : éclats, gerbe de gouttes, flaque, double onde, flash blanc, colonne rouge et croix (réutilise les effets ci-dessus, dont leurs réglages).",
    specs: [
      { key: 'burstCount', label: 'Éclats colorés', min: 0, max: 100, step: 1 },
      { key: 'flashCount', label: 'Éclats blancs', min: 0, max: 60, step: 1 },
      { key: 'gloopSize', label: 'Gouttes : taille ×', min: 0, max: 4, step: 0.1 },
      { key: 'puddleSize', label: 'Flaque : taille ×', min: 0, max: 4, step: 0.1 },
      { key: 'ringBig', label: 'Onde colorée : rayon', min: 20, max: 300, step: 5 },
      { key: 'ringSmall', label: 'Onde blanche : rayon', min: 20, max: 300, step: 5 },
      { key: 'flashScale', label: 'Flash blanc : taille', min: 0.5, max: 8, step: 0.1 },
      { key: 'flashMs', label: 'Flash blanc : durée (ms)', min: 50, max: 1000, step: 10 },
      { key: 'columnHeight', label: 'Colonne : hauteur', min: 40, max: 400, step: 5 },
      { key: 'columnMs', label: 'Colonne : durée (ms)', min: 200, max: 2000, step: 50 },
      { key: 'crossSize', label: 'Croix : taille', min: 10, max: 80, step: 1 },
    ],
  },
  {
    id: 'upgradeOrb',
    label: "Globe d'upgrade (coffre de boss)",
    where: "Même modèle que la recrue et le power-up, en rose : globe, anneau, icône de l'upgrade, mêmes étoiles, rond rose au sol. Taille et étoiles se règlent dans l'entrée « Recrue gunner » (communs aux trois globes). L'aperçu dure 4 s.",
    specs: [
      { key: 'hue', label: 'Teinte du globe (°)', min: 0, max: 360, step: 5, hint: '0 = doré (pièces du bonus recrue), 285 = rose' },
      { key: 'light', label: 'Éclaircissement (0 à 1)', min: 0, max: 0.8, step: 0.05, hint: 'Rose plus clair : mélange avec du blanc (globe, étoiles ; le rond au sol est un rose clair fixe)' },
    ],
  },
  {
    id: 'gain',
    label: "Gain d'un soldat",
    where: "Recrue qui rejoint la squad : éclats de sa classe, double onde, flash, « +1 » vert ; la colonne bleue d'arrivée (hauteur et durée ci-dessous) suit le soldat en jeu.",
    specs: [
      { key: 'burstCount', label: 'Éclats colorés', min: 0, max: 100, step: 1 },
      { key: 'flashCount', label: 'Éclats blancs', min: 0, max: 60, step: 1 },
      { key: 'ringBig', label: 'Onde colorée : rayon', min: 20, max: 300, step: 5 },
      { key: 'ringSmall', label: 'Onde blanche : rayon', min: 20, max: 300, step: 5 },
      { key: 'flashScale', label: 'Flash : taille', min: 0.5, max: 8, step: 0.1 },
      { key: 'flashMs', label: 'Flash : durée (ms)', min: 50, max: 1000, step: 10 },
      { key: 'columnHeight', label: 'Colonne d’arrivée : hauteur', min: 40, max: 400, step: 5 },
      { key: 'columnMs', label: 'Colonne d’arrivée : durée (ms)', min: 200, max: 2000, step: 50 },
      { key: 'textSize', label: '« +1 » : taille', min: 10, max: 80, step: 1 },
    ],
  },
  {
    id: 'cracks',
    label: 'Fissures noires au sol',
    where: "Sous les grosses explosions (kamikaze, Flamer, boss) : fissures noires et trace de brûlure noir / gris qui restent un moment puis s'effacent. Le rayon vient de l'événement ; le rayon min décide quelles explosions fissurent le sol.",
    specs: [
      { key: 'minRadius', label: 'Rayon min des explosions', min: 0, max: 300, step: 5, hint: "Seules les explosions d'au moins ce rayon (px) fissurent le sol ; 0 = toutes" },
      { key: 'scale', label: 'Taille ×', min: 0.3, max: 3, step: 0.05, hint: "Diamètre des fissures en multiple du diamètre de l'explosion" },
      { key: 'alpha', label: 'Opacité', min: 0, max: 1, step: 0.05, hint: '0 = pas de fissures' },
      { key: 'holdMs', label: 'Visibles (ms)', min: 0, max: 6000, step: 50, hint: 'Temps avant le début du fondu' },
      { key: 'fadeMs', label: 'Fondu (ms)', min: 100, max: 10000, step: 100 },
      { key: 'scorchAlpha', label: 'Trace noire : opacité', min: 0, max: 1, step: 0.05, hint: 'Tache de brûlure noir / gris sous les fissures ; 0 = pas de trace' },
      { key: 'scorchScale', label: 'Trace noire : taille ×', min: 0.3, max: 3, step: 0.05, hint: "Diamètre en multiple du diamètre de l'explosion" },
      { key: 'scorchHoldMs', label: 'Trace noire : visible (ms)', min: 0, max: 10000, step: 100 },
      { key: 'scorchFadeMs', label: 'Trace noire : fondu (ms)', min: 100, max: 20000, step: 100 },
    ],
  },
  {
    id: 'shake',
    label: "Secousses d'écran",
    where: "Slam d'un alien, mort d'un de tes soldats, mort d'un gros alien (la secousse des explosions est dans « Explosion »). Amplitude = part de l'écran.",
    specs: [
      { key: 'slamMs', label: 'Slam : durée (ms)', min: 0, max: 800, step: 10 },
      { key: 'slamAmount', label: 'Slam : amplitude', min: 0, max: 0.03, step: 0.001 },
      { key: 'deathMs', label: 'Mort d\'un soldat : durée (ms)', min: 0, max: 800, step: 10 },
      { key: 'deathAmount', label: 'Mort d\'un soldat : amplitude', min: 0, max: 0.03, step: 0.001 },
      { key: 'bigKillMs', label: 'Gros alien : durée (ms)', min: 0, max: 800, step: 10 },
      { key: 'bigKillAmount', label: 'Gros alien : amplitude', min: 0, max: 0.03, step: 0.001 },
    ],
  },
  {
    id: 'dust',
    label: "Poussière d'apparition",
    where: "Une unité sort du sol (trou d'apparition, lurker, Scarab) : bouffées de poussière. Le rayon vient de l'unité.",
    specs: [
      { key: 'countBase', label: 'Bouffées de base', min: 0, max: 30, step: 1 },
      { key: 'countPerRadius', label: 'Bouffées par px de rayon', min: 0, max: 1, step: 0.01 },
      { key: 'speedMin', label: 'Vitesse min', min: 0, max: 200, step: 1 },
      { key: 'speedMax', label: 'Vitesse max', min: 0, max: 300, step: 1 },
      { key: 'scaleStart', label: 'Taille au départ', min: 0, max: 3, step: 0.05 },
      { key: 'scaleEnd', label: 'Taille à la fin', min: 0, max: 4, step: 0.05 },
      { key: 'alpha', label: 'Opacité au départ', min: 0, max: 1, step: 0.05 },
      { key: 'lifeMin', label: 'Durée min (ms)', min: 50, max: 2000, step: 10 },
      { key: 'lifeMax', label: 'Durée max (ms)', min: 50, max: 3000, step: 10 },
      { key: 'color', label: 'Couleur', min: 0, max: 0, step: 1, color: true },
    ],
  },
  {
    id: 'crit',
    label: 'Bulle de critique',
    where: "Coup critique : bulle « ! » avec les dégâts, qui pop, reste un instant puis monte en s'effaçant.",
    specs: [
      { key: 'scale', label: 'Taille finale', min: 0.2, max: 2, step: 0.05 },
      { key: 'textGrow', label: 'Chiffres : grossissement', min: 0.5, max: 2.5, step: 0.05, hint: 'La bulle garde sa taille, seuls les chiffres grossissent' },
      { key: 'popMs', label: 'Apparition (ms)', min: 0, max: 600, step: 10 },
      { key: 'holdMs', label: 'Pause avant de monter (ms)', min: 0, max: 1500, step: 10 },
      { key: 'riseMs', label: 'Montée (ms)', min: 50, max: 2000, step: 10 },
      { key: 'rise', label: 'Montée (px)', min: 0, max: 150, step: 1 },
    ],
  },
  {
    id: 'enraged',
    label: "Flammes d'enragé",
    where: "Alien ressuscité par un chaman, soldat sous stimpack : flammes rouges qui montent du corps. Aperçu : une unité de 20 px de rayon pendant 2 s.",
    specs: [
      { key: 'spreadX', label: 'Largeur de la source (× rayon)', min: 0.1, max: 1.5, step: 0.05 },
      { key: 'speedYMin', label: 'Montée min', min: 0, max: 300, step: 5 },
      { key: 'speedYMax', label: 'Montée max', min: 0, max: 400, step: 5 },
      { key: 'speedX', label: 'Dérive latérale', min: 0, max: 80, step: 1 },
      { key: 'scaleStart', label: 'Taille au départ', min: 0.1, max: 3, step: 0.05 },
      { key: 'alpha', label: 'Opacité au départ', min: 0, max: 1, step: 0.05 },
      { key: 'lifeMin', label: 'Durée min (ms)', min: 100, max: 2000, step: 10 },
      { key: 'lifeMax', label: 'Durée max (ms)', min: 100, max: 3000, step: 10 },
    ],
  },
  {
    id: 'levelWave',
    label: 'Ondes de montée de niveau',
    where: "Ondes de choc blanches répétées + déformation de l'écran (WebGL ; désactivée si l'option « shockwave » est coupée). Le rayon et la durée viennent de UPGRADE_REPEL (config.ts).",
    specs: [
      { key: 'waves', label: "Nombre d'ondes", min: 1, max: 8, step: 1 },
      { key: 'gapMs', label: 'Écart entre deux (ms)', min: 50, max: 600, step: 10 },
      { key: 'distort', label: "Déformation de l'écran", min: 0, max: 0.12, step: 0.005, hint: "Part de l'écran déplacée au maximum ; au-delà de 0,12 les bords de l'écran apparaissent" },
    ],
  },
  {
    id: 'healZone',
    label: 'Croix de soin (globe)',
    where: "Globe de soin : des croix vertes naissent au hasard dans la zone et montent en s'effaçant. Aperçu : un globe de 6 s ; le rayon vient du jeu (slider « Rayon »).",
    specs: [
      { key: 'everyMs', label: 'Une croix toutes les (ms)', min: 20, max: 1000, step: 10, hint: 'Par globe, avec ±40 % de variation' },
      { key: 'scale', label: 'Taille', min: 0.3, max: 4, step: 0.05 },
      { key: 'rise', label: 'Montée (px)', min: 0, max: 150, step: 1 },
      { key: 'durationMs', label: 'Durée (ms)', min: 200, max: 3000, step: 50 },
      { key: 'alpha', label: 'Opacité', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'ice',
    label: 'Glaçon (coups, fissures)',
    where: "Soldat gelé : le glaçon a 50 PV, un coup de soldat = 1 PV, pas de barre de vie. Il rétrécit, se fissure par étages et crache des éclats à chaque coup, puis se brise. Aperçu : un glaçon qui encaisse un coup toutes les 0,2 s.",
    specs: [
      { key: 'shardCount', label: 'Éclats par coup', min: 0, max: 40, step: 1 },
      { key: 'breakMul', label: 'Éclats à la rupture (×)', min: 1, max: 8, step: 0.5 },
      { key: 'shardSpeedMin', label: 'Éclats : vitesse min', min: 0, max: 400, step: 5 },
      { key: 'shardSpeedMax', label: 'Éclats : vitesse max', min: 0, max: 500, step: 5 },
      { key: 'shardScale', label: 'Éclats : taille', min: 0.1, max: 3, step: 0.05 },
      { key: 'shardLifeMin', label: 'Éclats : durée min (ms)', min: 50, max: 1500, step: 10 },
      { key: 'shardLifeMax', label: 'Éclats : durée max (ms)', min: 50, max: 2000, step: 10 },
      { key: 'shardGravity', label: 'Éclats : gravité', min: 0, max: 1000, step: 10 },
      { key: 'chunkCount', label: 'Blocs par coup', min: 0, max: 12, step: 1 },
      { key: 'chunkScale', label: 'Blocs : taille', min: 0.2, max: 3, step: 0.05 },
      { key: 'chunkSpread', label: 'Blocs : élan horizontal', min: 0, max: 400, step: 5 },
      { key: 'chunkUpMin', label: 'Blocs : élan vers le haut min', min: 0, max: 600, step: 5 },
      { key: 'chunkUpMax', label: 'Blocs : élan vers le haut max', min: 0, max: 800, step: 5 },
      { key: 'chunkGravity', label: 'Blocs : gravité', min: 50, max: 3000, step: 25 },
      { key: 'chunkFall', label: 'Blocs : sol sous l’impact (px)', min: 0, max: 60, step: 1 },
      { key: 'chunkFadeMs', label: 'Blocs : effacement (ms)', min: 0, max: 1500, step: 10 },
      { key: 'minScale', label: 'Taille aux derniers PV', min: 0.1, max: 1, step: 0.05, hint: '1 = le glaçon ne rétrécit pas' },
      { key: 'crack1', label: 'Fissures 1 sous (part de PV)', min: 0, max: 1, step: 0.05 },
      { key: 'crack2', label: 'Fissures 2 sous (part de PV)', min: 0, max: 1, step: 0.05 },
      { key: 'crack3', label: 'Fissures 3 sous (part de PV)', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'stasis',
    label: 'Globe de stase (flocons)',
    where: "Power-up stase : zone bleue au sol qui ralentit les aliens, avec plein de petits flocons qui montent en s'effaçant. Aperçu : une zone de 5 s ; le rayon vient du jeu (450 px, ici le slider « Rayon »).",
    specs: [
      { key: 'everyMs', label: 'Un flocon toutes les (ms)', min: 5, max: 300, step: 5 },
      { key: 'scaleMin', label: 'Taille min', min: 0.05, max: 1, step: 0.01 },
      { key: 'scaleMax', label: 'Taille max', min: 0.05, max: 1.5, step: 0.01 },
      { key: 'rise', label: 'Montée (px)', min: 0, max: 250, step: 5 },
      { key: 'durationMs', label: 'Durée (ms)', min: 200, max: 4000, step: 50 },
      { key: 'alpha', label: 'Opacité de départ', min: 0, max: 1, step: 0.05 },
      { key: 'spin', label: 'Rotation (tours / s)', min: 0, max: 3, step: 0.05 },
    ],
  },
  {
    id: 'prism',
    label: 'Pluie prismatique (cartes)',
    where: "Carte d'upgrade prismatique : particules arc-en-ciel qui montent sur toute la carte. Aperçu : une carte de 190 × 278 px pendant 3 s.",
    specs: [
      { key: 'every', label: 'Une particule toutes les (ms)', min: 4, max: 120, step: 1 },
      { key: 'speedYMin', label: 'Montée min', min: 0, max: 200, step: 1 },
      { key: 'speedYMax', label: 'Montée max', min: 0, max: 200, step: 1 },
      { key: 'speedX', label: 'Dérive latérale', min: 0, max: 100, step: 1 },
      { key: 'scaleStart', label: 'Taille au départ', min: 0.1, max: 2, step: 0.05 },
      { key: 'lifeMin', label: 'Durée min (ms)', min: 100, max: 3000, step: 10 },
      { key: 'lifeMax', label: 'Durée max (ms)', min: 100, max: 4000, step: 10 },
    ],
  },
  {
    id: 'recruit',
    label: 'Recrue gunner (bonus +1)',
    where: "Recrue à ramasser : globe, anneau, tête et « +1 » assemblés en une image (art/recruits.ts), plus les étoiles qui scintillent autour. Position = part de la taille du globe, depuis son centre.",
    specs: [
      { key: 'displayScale', label: 'Taille de TOUS les globes au sol', min: 0.1, max: 1.2, step: 0.01, hint: "Recrue, power-up et globe d'upgrade ont la même taille : 0,34 ≈ 55 px de globe à l'écran (zoom 1), taille d'origine de la recrue" },
      { key: 'globeScale', label: 'Globe : taille', min: 0.3, max: 1.3, step: 0.01 },
      { key: 'globeAlpha', label: 'Globe : opacité', min: 0, max: 1, step: 0.05 },
      { key: 'ringScale', label: 'Anneau : taille', min: 0.3, max: 1.3, step: 0.01 },
      { key: 'ringAlpha', label: 'Anneau : opacité', min: 0, max: 1, step: 0.05 },
      { key: 'headX', label: 'Tête : position X', min: -0.5, max: 0.5, step: 0.01 },
      { key: 'headY', label: 'Tête : position Y', min: -0.5, max: 0.5, step: 0.01 },
      { key: 'headScale', label: 'Tête : taille', min: 0.1, max: 1.2, step: 0.01 },
      { key: 'plusX', label: '+1 : position X', min: -0.5, max: 0.5, step: 0.01 },
      { key: 'plusY', label: '+1 : position Y', min: -0.5, max: 0.5, step: 0.01 },
      { key: 'plusScale', label: '+1 : taille', min: 0.1, max: 1, step: 0.01 },
      { key: 'starEvery', label: 'Étoiles : une toutes les (ms)', min: 30, max: 1000, step: 10 },
      { key: 'starLifeMin', label: 'Étoiles : durée min (ms)', min: 100, max: 2000, step: 10 },
      { key: 'starLifeMax', label: 'Étoiles : durée max (ms)', min: 100, max: 3000, step: 10 },
      { key: 'starRadius', label: 'Étoiles : rayon de la zone (px)', min: 0, max: 120, step: 1 },
      { key: 'starScale', label: 'Étoiles : taille', min: 0.05, max: 1, step: 0.01 },
      { key: 'starRise', label: 'Étoiles : montée (px/s)', min: 0, max: 80, step: 1 },
      { key: 'starY', label: 'Étoiles : position Y (px)', min: -60, max: 60, step: 1, hint: 'Décalage vertical de la zone des étoiles par rapport au centre du globe (négatif = plus haut)' },
    ],
  },
];

/** L'effet a-t-il un bloc de réglages dans `FX` (enregistrable) ? */
const isParam = (id: EffectDef['id']): id is FxName => id in FX;

const ZOOMS = [1, 1.5, 2, 3];
/** PV de gel (données du jeu) : l'aperçu en encaisse autant, un coup à la fois. */
const ICE_HP = FREEZE.hp;

export class ParticleViewerScene extends Phaser.Scene {
  private fx!: Fx;
  private effect: EffectDef = EFFECTS[0];
  private zoom = 1.5;
  private panel?: HTMLDivElement;
  private paramBox!: HTMLDivElement;
  private info!: HTMLDivElement;
  private syncs: (() => void)[] = [];
  private loopTimer?: Phaser.Time.TimerEvent;
  private ground?: Phaser.GameObjects.TileSprite;
  /** Gunner de référence pour l'échelle (masquable). */
  private gunner?: Phaser.GameObjects.Sprite;
  // réglages d'aperçu (pas ceux du jeu)
  private tint = 0xe84a4a;
  private burstCount = 14;
  private radius = 100;
  private ringColor = 0xff6a6a;
  private shakePreview = true;
  /** Aperçus : dégâts de la bulle de critique, secousse jouée, déformation d'écran des ondes de niveau. */
  private critDmg = 123;
  private shakeKind: 'slam' | 'death' | 'bigKill' = 'slam';
  private shock!: ShockDistort;
  /** Aperçu du globe de stase : zone dessinée à chaque image jusqu'à `until` (ms de la scène). */
  private field?: { kind: 'heal' | 'stasis'; x: number; y: number; until: number; nextCross: number };
  /** Aperçu du glaçon : image, fissures, PV restants (sur 20) et prochain coup. */
  private ice?: { body: Phaser.GameObjects.Image; cracks: Phaser.GameObjects.Image; x: number; y: number; hp: number; next: number };
  private fieldG?: Phaser.GameObjects.Graphics;
  /** Aperçu des télégraphes : dessin refait à chaque image, libellés sous chaque type. */
  private tele?: { g: Phaser.GameObjects.Graphics; labels: Phaser.GameObjects.Text[] };
  /** Aperçu de la recrue gunner composée (effet « recruit »). */
  private recruit?: RecruitView;
  private recruitAt = { x: 0, y: 0 };

  constructor() {
    super(SCENES.particles);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(VIEW_BG);
    this.fx = new Fx(this);
    this.shock = new ShockDistort(this);
    this.buildPanel();
    this.setBackground(true);
    if (this.textures.exists('soldier_trooper')) {
      this.gunner = sprites.add(this, 'soldier_trooper', 190, 40).setDepth(5);
      sprites.play(this.gunner, 'soldier_trooper', 'idle');
    }
    this.selectEffect(this.effect);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.play(p.worldX, p.worldY));
    this.input.keyboard!.on('keydown-SPACE', () => this.play(0, 0));
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fit);
      this.panel?.remove();
      this.loopTimer?.remove();
      this.recruit?.destroy();
    });
    this.fit();
  }

  // ---------- Lecture ----------

  /** Joue l'effet courant en (x, y) ; (0, 0) = centre de la scène. */
  private play(x = 0, y = 0): void {
    switch (this.effect.id) {
      case 'levelFlash':
        this.previewLevelFlash(x, y);
        break;
      case 'burst':
        this.fx.burst(x, y - 20, this.tint, this.burstCount);
        break;
      case 'explosion':
        this.fx.explosion(x, y, this.radius, this.shakePreview);
        break;
      case 'ring':
        this.fx.ring(x, y, this.radius, this.ringColor);
        break;
      case 'heal':
        for (let i = 0; i < 4; i++) this.time.delayedCall(i * 120, () => this.fx.heal(x + (i - 1.5) * 18, y));
        break;
      case 'text':
        this.fx.text(x, y - 20, '+1 Gunner !', '#ffe066', 24);
        break;
      case 'recruit':
        this.showRecruit(x, y);
        break;
      case 'impact':
        this.fx.impact(x, y - 20, this.tint);
        break;
      case 'gloop':
        this.fx.gloop(x, y - 16, this.tint, 0xffffff, 1);
        break;
      case 'puddle':
        this.fx.puddles(x, y, this.tint, 1);
        break;
      case 'muzzle':
        this.fx.muzzleFlash(x, y - 20);
        break;
      case 'rocket': {
        // fusée en ligne droite vers la droite, avec sa traînée de fumée
        const img = this.add.image(x - 160, y - 20, 'fx_rocket').setScale(FX.rocket.scale).setDepth(6);
        this.tweens.add({
          targets: img,
          x: x + 160,
          duration: 700,
          onUpdate: () => this.fx.rocketSmoke(img.x - 14 * FX.rocket.scale, img.y),
          onComplete: () => img.destroy(),
        });
        break;
      }
      case 'column':
        this.fx.column(x, y, this.tint);
        break;
      case 'death':
        this.fx.death(x, y, this.tint);
        break;
      case 'upgradeOrb': {
        // aperçu : un globe (upgrade « dégâts ») posé là, avec son rond rose au sol, pendant 4 s ; textures refaites (teinte modifiée)
        clearGlobeTextures(this);
        const orb = new UpgradeOrbView(this, { id: 0, owner: 'p1', upgrade: 'damage', x, y, px: x, py: y, life: 1e9, age: 9 });
        const ground = this.add.graphics().setDepth(DEPTH.ground + 4);
        const end = this.time.now + 4000;
        const timer = this.time.addEvent({
          delay: 16,
          loop: true,
          callback: () => {
            const t = this.time.now / 1000;
            ground.clear();
            drawPickupSpot(ground, x, y, UPGRADE_PINK, t, 0);
            orb.sync(x, y - GLOBE_LIFT * FX.recruit.displayScale + Math.sin(t * 5) * 4, y, t);
            if (this.time.now > end) {
              timer.remove();
              orb.kill();
              ground.destroy();
            }
          },
        });
        break;
      }
      case 'gain':
        this.fx.gain(x, y, this.tint);
        this.fx.column(x, y, 0x4aa8ff, FX.gain.columnHeight, FX.gain.columnMs);
        break;
      case 'cracks':
        this.fx.cracks(x, y, this.radius);
        break;
      case 'shake': {
        const k = FX.shake;
        const [ms, amount] = this.shakeKind === 'slam' ? [k.slamMs, k.slamAmount] : this.shakeKind === 'death' ? [k.deathMs, k.deathAmount] : [k.bigKillMs, k.bigKillAmount];
        if (amount > 0) this.cameras.main.shake(ms, amount);
        break;
      }
      case 'dust':
        this.fx.dust(x, y, this.radius);
        break;
      case 'crit':
        this.fx.crit(x, y - 20, this.critDmg);
        break;
      case 'enraged': {
        const flames = createEnragedFlames(this, 20);
        flames.setPosition(x, y);
        this.time.delayedCall(2000, () => {
          flames.stop();
          this.time.delayedCall(900, () => flames.destroy());
        });
        break;
      }
      case 'prism': {
        const rain = createPrismRain(this);
        setPrismZone(rain, x, y, 190, 278);
        rain.setDepth(20);
        this.time.delayedCall(3000, () => {
          rain.stop();
          this.time.delayedCall(1300, () => rain.destroy());
        });
        break;
      }
      case 'stasis':
        this.field = { kind: 'stasis', x, y, until: this.time.now + 5000, nextCross: 0 };
        break;
      case 'healZone':
        this.field = { kind: 'heal', x, y, until: this.time.now + 6000, nextCross: 0 };
        break;
      case 'ice':
        this.showIce(x, y);
        break;
      case 'levelWave': {
        const ms = UPGRADE_REPEL.reach * 1000;
        const { waves, gapMs } = FX.levelWave;
        for (let i = 0; i < waves; i++) this.time.delayedCall(i * gapMs, () => this.fx.ring(x, y, UPGRADE_REPEL.radius, 0xffffff, ms));
        this.shock.start(x, y, UPGRADE_REPEL.radius, ms, waves, gapMs, FX.ring.squash);
        break;
      }
    }
  }

  /** Aperçu du flash de montée de niveau : un Gunner qui devient tout blanc puis repasse à sa couleur en fondu (comme `SoldierView.levelFlash`). */
  private previewLevelFlash(x: number, y: number): void {
    const f = FX.levelFlash;
    const body = sprites.add(this, 'soldier_trooper', x, y).setDepth(6).setScale(sprites.scaleOf('soldier_trooper') * 2);
    sprites.place(body, 'soldier_trooper');
    const white = this.add
      .image(x, y, body.texture.key, body.frame.name)
      .setOrigin(body.originX, body.originY)
      .setScale(body.scaleX, body.scaleY)
      .setDepth(6.1)
      .setTint(0xffffff)
      .setTintMode(Phaser.TintModes.FILL);
    this.tweens.add({ targets: white, alpha: 0, delay: f.holdMs, duration: f.fadeMs, onComplete: () => white.destroy() });
    this.time.delayedCall(f.holdMs + f.fadeMs + 600, () => body.destroy());
  }

  /** Glaçon d'aperçu en (x, y) : `ICE_HP` PV, un coup toutes les 0,2 s ; mêmes aspects que dans le jeu (`iceLook`), éclats puis rupture. */
  private showIce(x: number, y: number): void {
    this.ice?.body.destroy();
    this.ice?.cracks.destroy();
    const body = this.add.image(x, y, 'alien_iceblock').setDepth(6).setAlpha(0.82);
    const cracks = this.add.image(x, y, 'alien_iceblock_cracks_1').setDepth(6.1).setVisible(false);
    this.ice = { body, cracks, x, y, hp: ICE_HP, next: this.time.now + 600 };
  }

  private updateIce(): void {
    const ice = this.ice;
    if (!ice) return;
    if (this.time.now >= ice.next) {
      ice.next = this.time.now + 200;
      ice.hp--;
      if (ice.hp <= 0) {
        this.fx.iceShards(ice.x, ice.y - 8, FX.ice.breakMul);
        ice.body.destroy();
        ice.cracks.destroy();
        this.ice = undefined;
        return;
      }
      this.fx.iceShards(ice.x, ice.y - 8);
    }
    const look = iceLook(ice.hp / ICE_HP);
    const size = (52 / 64) * 2 * look.scale; // le glaçon du jeu : rayon 26 px, texture de 64 px, zoom 2 de la vue
    ice.body.setScale(size);
    ice.cracks.setVisible(look.stage > 0).setScale(size);
    if (look.stage > 0) ice.cracks.setTexture(`alien_iceblock_cracks_${look.stage}`);
  }

  /** (Re)crée l'aperçu de la recrue en (x, y), avec les réglages courants (texture redessinée, étoiles recréées). */
  private showRecruit(x: number, y: number): void {
    this.recruit?.destroy();
    this.recruitAt = { x, y };
    makeRecruitTextures(this);
    const state = { id: 1, cls: 'trooper' as const, x, y, px: x, py: y, life: 1e9 };
    this.recruit = new RecruitView(this, state, CLASSES.trooper.color);
  }

  update(time: number): void {
    this.shock.update();
    if (this.field) {
      const g = (this.fieldG ??= this.add.graphics().setDepth(DEPTH.ground + 4));
      const left = (this.field.until - this.time.now) / 1000;
      g.clear();
      if (left <= 0) this.field = undefined;
      else {
        const f = this.field;
        const fade = Math.min(1, left / 1.2);
        drawField(g, f.kind, f.x, f.y, this.radius, fade, time / 1000);
        if (f.kind === 'heal' && this.time.now >= f.nextCross) {
          // même tirage que dans le jeu (PickupViews.syncHealZones) : point au hasard dans l'ellipse du globe
          f.nextCross = this.time.now + FX.healZone.everyMs * (0.6 + Math.random() * 0.8);
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * this.radius * 0.92;
          this.fx.healZoneCross(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.7, fade);
        }
        if (f.kind === 'stasis' && this.time.now >= f.nextCross) {
          // même tirage que dans le jeu (PickupViews.syncFieldParticles)
          f.nextCross = this.time.now + FX.stasis.everyMs * (0.6 + Math.random() * 0.8);
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * this.radius * 0.92;
          this.fx.stasisFlake(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.7, fade);
        }
      }
    }
    this.updateIce();
    this.recruit?.sync(1, time / 1000);
    if (this.tele) this.drawTelegraphs(time);
  }

  /** Centre de l'aperçu du télégraphe n° `i` (grille de 4 × 2 autour du centre de la scène). */
  private static teleSlot(i: number): [number, number] {
    return [((i % 4) - 1.5) * 200, (Math.floor(i / 4) - 0.5) * 190];
  }

  /** Aperçu des télégraphes : chaque type se remplit en 1,4 s puis reste plein 0,3 s, en boucle (mêmes couches que dans le jeu). */
  private drawTelegraphs(time: number): void {
    const g = this.tele!.g;
    g.clear();
    const k = Math.min(1, (time % 1700) / 1400);
    const poly = (kind: TelegraphKind, x: number, y: number, len: number, w: number, fromBack: boolean): void => {
      // rectangle couché : depuis la gauche (charge, pics : la zone intérieure s'allonge) ou centré (murs : elle grandit en tout sens)
      const rect = (l: number, wd: number): Phaser.Math.Vector2[] => {
        const x0 = fromBack ? x - len / 2 : x - l / 2;
        return [[x0, y - wd / 2], [x0 + l, y - wd / 2], [x0 + l, y + wd / 2], [x0, y + wd / 2]].map(([px, py]) => new Phaser.Math.Vector2(px, py));
      };
      const c = teleColor(kind);
      g.fillStyle(c, teleOuter(k)).fillPoints(rect(len, w), true);
      g.fillStyle(c, teleInner(k)).fillPoints(rect(len * k, fromBack ? w : w * k), true);
      g.lineStyle(3, c, 0.5 + 0.4 * k).strokePoints(rect(len, w), true);
    };
    TELEGRAPH_KINDS.forEach((t, i) => {
      const [x, y] = ParticleViewerScene.teleSlot(i);
      if (t.kind === 'rush') poly('rush', x, y, 170, 50, true);
      else if (t.kind === 'lurk') poly('lurk', x, y, 170, 34, true);
      else if (t.kind === 'wall') poly('wall', x, y, 160, 26, false);
      else drawTeleEllipse(g, t.kind, x, y, t.kind === 'stalactite' ? 40 : 60, k, 0, t.kind === 'leap' || t.kind === 'burrow' ? 4 : 3);
    });
  }

  private setLoop(on: boolean): void {
    this.loopTimer?.remove();
    this.loopTimer = on ? this.time.addEvent({ delay: 1400, loop: true, callback: () => this.play(0, 0) }) : undefined;
  }

  // ---------- Interface ----------

  private selectEffect(e: EffectDef): void {
    this.effect = e;
    this.tele?.g.destroy();
    this.tele?.labels.forEach((t) => t.destroy());
    this.tele = undefined;
    if (e.id === 'telegraph') {
      this.tele = {
        g: this.add.graphics().setDepth(DEPTH.ground + 4),
        labels: TELEGRAPH_KINDS.map((t, i) =>
          this.add.text(...ParticleViewerScene.teleSlot(i), t.label, { fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(7),
        ),
      };
      this.tele.labels.forEach((t) => (t.y += 64));
    }
    if (e.id !== 'recruit') {
      this.recruit?.destroy();
      this.recruit = undefined;
    }
    this.paramBox.replaceChildren();
    this.syncs = [];
    this.paramBox.append(note(e.where));

    // réglages d'aperçu propres à l'effet (non enregistrés : ce sont ceux de l'événement en jeu)
    if (['impact', 'gloop', 'puddle', 'column', 'death', 'gain', 'upgradeOrb'].includes(e.id)) this.paramBox.append(colorInput('Teinte (aperçu)', () => this.tint, (v) => (this.tint = v)).row);
    if (e.id === 'burst') {
      this.paramBox.append(
        colorInput('Teinte (aperçu)', () => this.tint, (v) => (this.tint = v)).row,
        slider('Particules demandées (aperçu)', { min: 1, max: 60, step: 1, get: () => this.burstCount, set: (v) => (this.burstCount = v), hint: '10 touche, 14 mort de soldat, 16 recrutement, 40 boss' }).row,
      );
    }
    if (['explosion', 'ring', 'cracks', 'dust', 'stasis', 'healZone'].includes(e.id)) {
      this.paramBox.append(
        slider('Rayon (aperçu)', { min: 30, max: 260, step: 5, get: () => this.radius, set: (v) => (this.radius = v), hint: '70 grenade, 95 kamikaze, 120 mort du Flammeur, 160 boss' }).row,
      );
    }
    if (e.id === 'crit') this.paramBox.append(slider('Dégâts (aperçu)', { min: 1, max: 9999, step: 1, get: () => this.critDmg, set: (v) => (this.critDmg = v) }).row);
    if (e.id === 'shake') {
      const kind = select('Secousse jouée (aperçu)', [['slam', 'Slam (alien)'], ['death', "Mort d'un soldat"], ['bigKill', "Mort d'un gros alien"]]);
      kind.select.value = this.shakeKind;
      kind.select.addEventListener('change', () => {
        this.shakeKind = kind.select.value as typeof this.shakeKind;
        this.play(0, 0);
      });
      this.paramBox.append(kind.row);
    }
    if (e.id === 'ring') this.paramBox.append(colorInput('Couleur (aperçu)', () => this.ringColor, (v) => (this.ringColor = v)).row);
    if (e.id === 'explosion') this.paramBox.append(checkbox("Secousse d'écran dans l'aperçu", this.shakePreview, (v) => (this.shakePreview = v)));

    if (!isParam(e.id)) {
      this.paramBox.append(note('Pas de réglage enregistrable pour cet effet.'));
      this.play(0, 0);
      return;
    }
    this.paramBox.append(heading('Réglages de l\'effet (appliqués au jeu)'));
    const id = e.id;
    const block = FX[id] as unknown as Record<string, number>;
    for (const s of e.specs) {
      const get = () => block[s.key];
      const set = (v: number) => {
        setFx(id, s.key as never, v);
        if (['burst', 'explosion', 'impact', 'gloop', 'rocket', 'dust', 'ice'].includes(id)) this.fx.build(); // émetteurs recréés avec les nouvelles valeurs
        if (e.id === 'recruit') this.showRecruit(this.recruitAt.x, this.recruitAt.y); // image redessinée, étoiles recréées
      };
      const c = s.color ? colorInput(s.label, get, (v) => set(v)) : slider(s.label, { min: s.min, max: s.max, step: s.step, get, set, hint: s.hint });
      this.syncs.push(c.sync);
      this.paramBox.append(c.row);
    }
    this.play(0, 0);
  }

  private buildPanel(): void {
    const p = panel(310);
    const effects = select('Effet', EFFECTS.map((e) => [e.id, e.label] as [string, string]));
    effects.select.addEventListener('change', () => this.selectEffect(EFFECTS.find((e) => e.id === effects.select.value)!));

    const zoom = select('Zoom', ZOOMS.map((z) => [String(z), `${z * 100} %`] as [string, string]));
    zoom.select.value = String(this.zoom);
    zoom.select.addEventListener('change', () => {
      this.zoom = Number(zoom.select.value);
      this.fit();
    });

    this.paramBox = document.createElement('div');
    this.paramBox.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    this.info = document.createElement('div');
    this.info.style.cssText = 'font-size:12px;color:#9fe;white-space:pre-wrap';

    p.append(
      header('Visionneuse de particules', () => this.scene.start(SCENES.game)),
      note('Clic sur la scène ou Espace : rejoue l\'effet (au clic : à cet endroit).'),
      effects.row,
      line(
        button('▶ Jouer', () => this.play(0, 0)),
        checkbox('En boucle', false, (v) => this.setLoop(v)),
        checkbox('Sol du jeu', true, (v) => this.setBackground(v)),
      ),
      checkbox('Afficher un Gunner (échelle)', true, (v) => this.gunner?.setVisible(v)),
      zoom.row,
      this.paramBox,
      heading('Divers'),
      line(
        button('Copier le code', () => {
          if (!isParam(this.effect.id)) {
            this.info.textContent = 'Pas de bloc de réglages pour cet effet.';
            return;
          }
          const code = fxSnippet(this.effect.id);
          void navigator.clipboard?.writeText(code).catch(() => {});
          this.info.textContent = `Copié — à coller dans FX_DEFAULTS (fxParams.ts) :\n${code}`;
        }),
        button('Save', () => void saveFxToCode().then((msg) => (this.info.textContent = `${msg}\n(tous les effets sont enregistrés)`))),
        button('Reset', () => {
          if (!isParam(this.effect.id)) return;
          resetFx(this.effect.id);
          this.fx.build();
          if (this.effect.id === 'recruit') this.showRecruit(this.recruitAt.x, this.recruitAt.y);
          for (const s of this.syncs) s();
          this.info.textContent = "Retour à la dernière sauvegarde (cet effet).";
        }),
      ),
      this.info,
    );
    document.body.append(p);
    this.panel = p;
  }

  private setBackground(on: boolean): void {
    this.ground?.destroy();
    this.ground = undefined;
    if (on && this.textures.exists('ground_tile')) {
      this.ground = this.add.tileSprite(0, 0, 4000, 4000, 'ground_tile').setOrigin(0.5).setTileScale(VISUAL.groundScale).setDepth(-2);
    }
  }

  private readonly fit = (): void => {
    const cam = this.cameras.main;
    cam.setZoom(this.zoom);
    cam.centerOn(-(330 / 2) / this.zoom + 60, 0); // décalé pour laisser la place au panneau
  };
}
