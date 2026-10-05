import type { UpgradeId } from '../data/progression';

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
