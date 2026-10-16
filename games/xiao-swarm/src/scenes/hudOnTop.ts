import type Phaser from 'phaser';
import { SCENES } from '../config';

/**
 * Pour un écran d'entrée (titre, Solo, menu multijoueur, salle d'attente) : le HUD (boutons debug, son / musique) passe au-dessus de son calque
 * sombre tant qu'il est ouvert, puis retrouve sa place à sa place d'origine (juste au-dessus de `GameScene`, sous `EndingScene` et les menus) à sa fermeture (sinon il resterait au-dessus du menu pause, etc.).
 */
export function hudOnTop(scene: Phaser.Scene): void {
  scene.scene.bringToTop(SCENES.hud);
  scene.events.once('shutdown', () => scene.scene.moveBelow(SCENES.ending, SCENES.hud));
}
