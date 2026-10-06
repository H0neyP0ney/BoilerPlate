import Phaser from 'phaser';
import { theme } from '@xiao/engine';
import { UPGRADES, type UpgradeId } from '../data/progression';
import { t } from '../i18n';
import { upgradeIconKey } from './upgradeIcons';

/**
 * Fond des cartes d'upgrade : une image par upgrade (`public/assets/ui/cards/card_<id>.png`, couleur de `UPGRADES[id].color`), produite par
 * `node tools/slice-upgrade-cards.mjs` à partir de `art-src/card_upgrade.png`. Id de texture d'une carte : `ui_card_<id>` ; carte prismatique : `ui_card_prism` (arc-en-ciel holographique, même pour toutes les upgrades).
 */
export const cardTexture = (id: UpgradeId, prism = false): string => (prism ? 'ui_card_prism' : `ui_card_${id}`);

/**
 * Repères du dessin (pixels de la planche recadrée, CARD.W × CARD.H) : la carte se met à l'échelle `largeur affichée / CARD.W` et chaque
 * texte se place à ces coordonnées (centre) avec sa taille de police (px de planche).
 */
export const CARD = {
  W: 461,
  H: 675,
  /** Nom de l'upgrade : en haut du corps. */
  name: { x: 232, y: 108, size: 54, wrap: 340 },
  /** Icône (emoji), sous le nom. */
  icon: { x: 232, y: 232, size: 130 },
  /** Description (largeur de retour à la ligne comprise). */
  desc: { x: 232, y: 322, size: 46, wrap: 320 },
  /** Slots de progression (une prise = un slot plein) : `cols` par ligne, lignes centrées autour de `y`, `size` = côté d'un slot, `step` / `rowStep` = pas horizontal / vertical. */
  slots: { y: 456, size: 44, step: 54, rowStep: 50, cols: 5 },
  /** « Claim » sur la plaque dorée. */
  claim: { x: 232, y: 574, size: 58 },
} as const;

/** Résolution du texte des cartes (multiple de la taille d'écran) : le texte est dessiné 3× plus grand puis affiché réduit, donc net, contour compris. */
export const CARD_TEXT_RES = 3;

/**
 * Carte de choix d'upgrade, sans interaction (la fenêtre de montée de niveau y ajoute sa zone cliquable `hit`, voir `LevelUpScene`) : fond, icône,
 * nom, description, slots et « Claim ». `count` = prises faites, celle qu'on s'apprête à prendre comprise ; `prism` : bonus doublé, fond holographique.
 * `resizeUpgradeCard` la met à la taille voulue. Partagée par la fenêtre de choix et la visionneuse d'upgrades : un seul dessin.
 */
export function buildUpgradeCard(scene: Phaser.Scene, id: UpgradeId, count: number, prism: boolean): Phaser.GameObjects.Container {
  const def = UPGRADES[id];
  const c = scene.add.container(0, 0);
  const bg = scene.add.image(0, 0, cardTexture(id, prism)); // prismatique : fond holographique
  // nom en haut ; icône ; description ; compteur ; « Claim » sur la plaque dorée
  const icon = scene.add.image(0, 0, upgradeIconKey(id));
  const name = scene.add.text(0, 0, t(`up_${id}`), { fontFamily: theme.font, fontStyle: 'bold', color: prism ? '#fff3a0' : '#ffffff', align: 'center' }).setOrigin(0.5);
  const claim = scene.add.text(0, 0, t('claim'), { fontFamily: theme.font, fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5); // sur la plaque dorée : le « bouton » de la carte
  const desc = scene.add
    .text(0, 0, t(`up_${id}_desc`, { value: def.value * (prism ? 2 : 1) }), { fontFamily: theme.font, fontStyle: 'bold', color: prism ? '#fff3a0' : '#ffffff', align: 'center' })
    .setOrigin(0.5, 0);
  const slots = makeSlots(scene, id, def.maxStacks, count);
  for (const txt of [name, claim, desc]) txt.setResolution(CARD_TEXT_RES); // texte rendu en haute résolution puis réduit : net malgré la réduction de la carte
  c.add([bg, icon, desc, slots, name, claim]);
  c.setData({ id, bg, icon, name, claim, desc, slots });
  return c;
}

/**
 * Progression de l'upgrade en slots (images vide / plein) : une ligne par 5 prises maximum, chaque ligne centrée ; les prises faites
 * (y compris celle qu'on s'apprête à prendre) sont pleines, les autres vides. Aucun slot pour une upgrade sans limite (Renfort). Positions en pixels de
 * planche relatifs au centre de la carte (`CARD.slots`) : le conteneur est mis à l'échelle dans `resizeUpgradeCard`.
 */
function makeSlots(scene: Phaser.Scene, id: UpgradeId, max: number, count: number): Phaser.GameObjects.Container {
  const box = scene.add.container(0, 0);
  if (max >= 99) return box;
  const S = CARD.slots;
  const rows = Math.ceil(max / S.cols);
  for (let i = 0; i < max; i++) {
    const row = Math.floor(i / S.cols);
    const inRow = Math.min(S.cols, max - row * S.cols);
    const col = i - row * S.cols;
    const img = scene.add.image((col - (inRow - 1) / 2) * S.step, S.y - CARD.H / 2 + (row - (rows - 1) / 2) * S.rowStep, i < count ? 'ui_slot_full' : `ui_slot_empty_${id}`);
    img.setScale(S.size / img.width);
    box.add(img);
  }
  return box;
}

/** Met la carte à la largeur `w` (hauteur = w × CARD.H / CARD.W) : le fond, puis chaque texte à son repère (CARD) à la même échelle. */
export function resizeUpgradeCard(c: Phaser.GameObjects.Container, w: number, h: number, vertical: boolean): void {
  const s = w / CARD.W;
  const bg = c.getData('bg') as Phaser.GameObjects.Image;
  const icon = c.getData('icon') as Phaser.GameObjects.Image;
  const name = c.getData('name') as Phaser.GameObjects.Text;
  const claim = c.getData('claim') as Phaser.GameObjects.Text;
  const desc = c.getData('desc') as Phaser.GameObjects.Text;
  const slots = c.getData('slots') as Phaser.GameObjects.Container;
  const hit = c.getData('hit') as Phaser.GameObjects.Zone | undefined; // zone cliquable ajoutée par la fenêtre de choix (absente dans la visionneuse)
  bg.setDisplaySize(w, h);
  const at = (txt: Phaser.GameObjects.Text, p: { x: number; y: number }, size: number, minPx: number, stroke = 0) => {
    txt.setFontSize(Math.max(minPx, size * s)).setPosition((p.x - CARD.W / 2) * s, (p.y - CARD.H / 2) * s);
    if (stroke) txt.setStroke('#0a1422', Math.max(2, stroke * s));
  };
  icon.setPosition((CARD.icon.x - CARD.W / 2) * s, (CARD.icon.y - CARD.H / 2) * s).setScale(Math.max(CARD.icon.size * s, vertical ? 30 : 40) / Math.max(icon.width, icon.height));
  slots.setScale(s); // positions en pixels de planche : le conteneur suit l'échelle de la carte
  at(desc, CARD.desc, CARD.desc.size, 12, 10);
  desc.setWordWrapWidth(CARD.desc.wrap * s, true);
  at(name, CARD.name, CARD.name.size, 12, 9);
  at(claim, CARD.claim, CARD.claim.size, 12, 11);
  claim.setStroke('#000000', Math.max(2, 11 * s)); // blanc cerclé de noir
  name.setWordWrapWidth(CARD.name.wrap * s, true);
  // un nom trop long pour la carte est rétréci pour tenir
  const maxNameW = CARD.name.wrap * s;
  if (name.width > maxNameW) name.setFontSize(parseFloat(String(name.style.fontSize)) * (maxNameW / name.width));
  hit?.setSize(w, h);
}
