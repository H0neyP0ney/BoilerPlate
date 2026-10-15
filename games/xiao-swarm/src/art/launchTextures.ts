import type Phaser from 'phaser';

/**
 * Textures fabriquées PAR LE CODE au lancement du jeu (`BootScene.create` : repli des aliens, effets, soldats, recrue assemblée, décor…), plus les fonds de cartes et slots
 * que `art/cardTextures.ts` fabrique en tâche de fond juste après. Sert aux lignes roses de la vue Paquets (`PacksViewerScene`) ; celles
 * créées plus tard à la demande (globes recolorés, variantes de couleur d'un joueur, tronçons de sol, jauge de la timeline…) n'y figurent pas.
 */
const launchKeys = new Set<string>();

/** Mémorise les textures canvas présentes (à appeler une fois la fabrication du lancement terminée). */
export function recordLaunchTextures(scene: Phaser.Scene): void {
  for (const key of scene.textures.getTextureKeys()) {
    if (key.startsWith('__')) continue;
    if (scene.textures.get(key).getSourceImage() instanceof HTMLCanvasElement) launchKeys.add(key);
  }
}


/** Clés des textures fabriquées au lancement. */
export const launchTextureKeys = (): ReadonlySet<string> => launchKeys;
