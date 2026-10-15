/**
 * Registre des replis : la liste de tout ce qui s'affiche à la place d'un asset pas encore arrivé (fichier d'un paquet 2) ou pas encore fabriqué (texture procédurale
 * d'un paquet 2a / 2b). **Un seul endroit** : la vue Paquets (`PacksViewerScene`) en tire ses pastilles rouges. Tout NOUVEAU repli dans le jeu doit être déclaré ici,
 * sinon la vue ne le signale pas (règles : `docs/CHARGEMENT.md`). Fichier pur (aucun Phaser, aucun DOM).
 *
 * Un asset absent de ce registre n'a AUCUN repli : rien ne s'affiche tant qu'il n'est pas là.
 */
interface FallbackRule {
  match: RegExp;
  /** Ce qui s'affiche à la place. */
  text: string;
}

/** Fichiers (images isolées du manifeste, clé = id du visuel). Les planches d'unités sont traitées à part (`sheetFallback`). */
const FILE_FALLBACKS: FallbackRule[] = [
  { match: /^ground_tile$/, text: 'sol dessiné par le code (drawGroundChunk)' },
  { match: /^powerup_icon_heal$/, text: 'emoji du power-up (💚)' },
  { match: /^recruit_part_/, text: 'recrue dessinée par le code (art/recruits.ts)' },
];

/** Textures procédurales (clé de texture) : ce qui s'affiche tant qu'elles ne sont pas fabriquées. */
const TEXTURE_FALLBACKS: FallbackRule[] = [
  { match: /^ui_card_/, text: 'la carte de base ui_card_base (paquet 1) tant que ce fond n’est pas fabriqué (addWithBase, view/upgradeCards.ts)' },
  { match: /^ui_slot_empty_/, text: 'le slot ui_slot_empty (paquet 1) tant que ce slot n’est pas fabriqué (addWithBase, view/upgradeCards.ts)' },
];

const find = (rules: FallbackRule[], key: string): string | undefined => rules.find((r) => r.match.test(key))?.text;

/** Repli d'une image isolée du manifeste (undefined = aucun, rien ne s'affiche). */
export const fileFallback = (id: string): string | undefined => find(FILE_FALLBACKS, id);

/** Repli d'une texture procédurale (undefined = aucun : c'est elle-même un repli, ou elle est simplement fabriquée plus tard). */
export const textureFallback = (key: string): string | undefined => find(TEXTURE_FALLBACKS, key);

/** Repli d'une planche d'unités : le dessin procédural de chacun de ses visuels qui en a un (`hasProcedural`). */
export function sheetFallback(spriteIds: readonly string[], hasProcedural: (id: string) => boolean): string | undefined {
  const ids = spriteIds.filter(hasProcedural);
  return ids.length ? `dessin procédural : ${ids.join(', ')}` : undefined;
}
