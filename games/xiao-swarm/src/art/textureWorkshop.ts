import type Phaser from 'phaser';
import { DEV_TOOLS, TextureFactory, devLog, log, type AssetEntry } from '@xiao/engine';
import { ACTIVE_CLASSES } from '../data/classes';
import { LATE_ASSETS, LATE_B_ASSETS } from '../assets/manifest';
import type { SoldierClassId } from '../data/classes';
import { proceduralKey, makeAlienTextures } from './aliens';
import { makeRecruitTextures } from './recruits';
import { makeFxTextures } from './fx';
import { makeSoldierTextures } from './soldiers';
import { declareGlobeTextures } from './upgradeOrbs';
import { declareUpgradeCardTextures } from './cardTextures';
import { AT_LAUNCH, AT_PACK_2B } from './textureModes';
import { latePack, noLatePackage } from '../assets/latePack';
import { ensureBeamTexture } from '../view/LootBeam';

/**
 * Atelier des textures dessinées par le code (`TextureFactory` de l'engine) : au lancement, on ne fait que DÉCLARER les textures procédurales (effets, soldats, replis
 * d'aliens, globes recolorés, globes d'upgrade) ; leur fabrication démarre en tâche de fond une fois le jeu jouable (`startTextureWorkshop`), par
 * tranches de quelques ms, dans l'ordre de `texturePriority`. Une texture demandée avant son tour (`textures.get / exists`) est fabriquée à l'instant : le journal
 * `[textures]` liste ces fabrications « à la demande » avec leur durée, pour repérer ce qu'il faudrait fabriquer avant l'affichage (`AT_LAUNCH`).
 */
let factory: TextureFactory | null = null;

/** L'atelier du jeu (null avant `setupTextureWorkshop`). */
export const textureWorkshop = (): TextureFactory | null => factory;

/** Une fabrication à la demande plus longue que ça (ms) risque une saccade (une image dure 16 ms à 60 FPS) : signalée dans le journal `[textures]`. */
export const SLOW_ON_DEMAND_MS = 8;


/** Ids de visuels (sprites de planches, images) des paquets 2a et 2b : leur repli n'est utile qu'en attendant leur arrivée. */
function lateSpriteIds(entries: readonly AssetEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const e of entries) for (const id of e.type === 'image' ? [e.id] : Object.keys(e.sprites)) ids.add(proceduralKey(id));
  return ids;
}

/** Ordre de fabrication en tâche de fond : plus petit = plus tôt. */
function makePriority(): (key: string) => number {
  const late2a = lateSpriteIds(LATE_ASSETS);
  const late2b = lateSpriteIds(LATE_B_ASSETS);
  const active = new Set<string>(ACTIVE_CLASSES);
  return (key) => {
    if (/^ui_(card|slot_empty)_/.test(key)) return 18; // fonds de cartes : prêts bien avant le premier level-up
    if (key === 'fx_loot_beam') return 45; // colonne de lumière des loots rares : le premier arrive après plusieurs minutes
    if (/^fx_(cracks|scorch|spike3|holo_band)/.test(key)) return 40; // gros dessins : après les premières explosions
    if (key.startsWith('fx_')) return 10; // petits effets : servent tout de suite
    if (key.startsWith('alien_') || key.startsWith('spider')) return late2a.has(key) ? 20 : late2b.has(key) ? 30 : /^alien_(ice|fire)_orb|^alien_iceblock/.test(key) ? 25 : 80; // replis : seulement tant que le paquet 2 n'est pas là
    if (/^(soldier|gun|recruit)_/.test(key)) return active.has(key.replace(/^(soldier|gun|recruit)_/, '').replace(/#.*$/, '')) ? 12 : 85; // classes inactives : en dernier
    if (/^(globe|star)_/.test(key)) return 50;
    if (key.startsWith('upgrade_orb_')) return 55;
    return 60;
  };
}

/**
 * Déclare toutes les textures procédurales à l'atelier et l'installe (à appeler dans `BootScene.create`, APRÈS les textures qui s'assemblent à partir de fichiers
 * comme la recrue : une clé déjà fabriquée n'est pas redéclarée). Fabrique tout de suite les textures « au lancement » (`AT_LAUNCH` de `art/textureModes.ts`).
 */
export function setupTextureWorkshop(scene: Phaser.Scene, loaded: readonly AssetEntry[]): TextureFactory {
  const f = new TextureFactory(scene);
  const priority = makePriority();
  // Un repli ne sert qu'en attendant le fichier : jamais fabriqué pour un visuel dont le fichier est chargé dès le démarrage (paquet 1, ou tout chargé : dev, en ligne, ?jump).
  const hasFile = lateSpriteIds(loaded);
  const active = new Set<string>(ACTIVE_CLASSES);
  const skip = (key: string): boolean => {
    if (hasFile.has(key)) return true;
    const m = /^(soldier|gun|recruit)_(\w+)$/.exec(key);
    if (m && hasFile.has(`${m[1]}_${m[2]}`)) return true;
    if (m && !active.has(m[2] as SoldierClassId) && !DEV_TOOLS) return true; // classes désactivées : seulement en dev (panneau Triche)
    return false;
  };
  f.declare(() => makeRecruitTextures(scene), priority); // recrue assemblée à partir de ses pièces (paquet 1) : déclarée AVANT les soldats, dont la recrue procédurale de même clé est alors ignorée
  f.declare(() => {
    makeSoldierTextures(scene);
    makeAlienTextures(scene);
    makeFxTextures(scene);
  }, priority, skip);
  declareGlobeTextures(f, scene, priority);
  declareUpgradeCardTextures(f, scene, priority);
  f.declare(() => ensureBeamTexture(scene), priority);
  // étape de fabrication choisie dans la vue Paquets (art/textureModes.ts) : 2a par défaut, 2b si listée ; rien n'est fabriqué d'avance avant que son paquet soit arrivé
  const pack2b = new Set(AT_PACK_2B);
  f.prefetch = (key) => stage >= (pack2b.has(key) ? 2 : 1);
  if (noLatePackage()) { const p1 = new Set(AT_LAUNCH); f.blocked = (key) => !p1.has(key); } // `?nolate=1` : seules les textures du paquet 1 existent, rien n'est fabriqué ensuite, même à la demande
  f.install();
  for (const key of AT_LAUNCH) f.ensure(key); // fabriquées pendant le chargement, avant l'affichage (paquet 1)
  f.onDemandBuilt = (key, ms) => {
    if (ms <= SLOW_ON_DEMAND_MS) return;
    const msg = `texture fabriquée À LA DEMANDE en ${ms.toFixed(1)} ms (saccade possible) : ${key} — à fabriquer plus tôt (paquet plus tôt dans la vue Paquets, ou priorité plus haute)`;
    log.warn(`[textures] ${msg}`);
    devLog(msg, 'warn');
  };
  f.onDone = () => {
    const demand = f.onDemand.map((d) => `${d.key} ${d.ms.toFixed(1)} ms`);
    const msg = `[textures] fabrication en tâche de fond terminée : ${f.declaredKeys().length} textures, ${Math.round(f.busyMs)} ms de calcul, ${demand.length} à la demande${demand.length ? ` (${demand.join(', ')})` : ''}`;
    log.info(msg);
    devLog(msg.replace('[textures] ', ''));
  };
  factory = f;
  return f;
}

/** Ordre de fabrication en tâche de fond : priorité d'une texture (plus petit = plus tôt) ; sert aussi à la vue Paquets (tri par ordre de chargement). */
export const texturePriority = (): ((key: string) => number) => makePriority();

/** Étapes débloquées : 0 = seulement le paquet 1 (déjà fabriqué), 1 = textures « paquet 2a » (défaut, pendant le téléchargement du 2a), 2 = aussi celles du « paquet 2b » (pendant le téléchargement du 2b). */
let stage = 0;

/**
 * Lance la fabrication en tâche de fond (le jeu est jouable) : 4 ms de calcul au plus toutes les 16 ms. Les textures « paquet 2a » démarrent tout de suite (le paquet 2a se télécharge), celles du « paquet 2b » quand le paquet 2a est
 * arrivé (tout de suite s'il l'est déjà), celles du « paquet 2b » quand 2b arrive.
 */
export function startTextureWorkshop(): void {
  if (noLatePackage()) return; // `?nolate=1` : aucune texture des paquets 2a / 2b
  const release = (to: 1 | 2): void => {
    if (stage >= to) return;
    stage = to;
    factory?.start(4, 16);
  };
  release(1); // le jeu est affiché et le paquet 2a se télécharge : les textures « paquet 2a » se fabriquent en même temps
  if (latePack.ready) release(2); // 2a arrivé : le 2b se télécharge, ses textures se fabriquent en même temps
  else latePack.onReady(() => release(2));
}
