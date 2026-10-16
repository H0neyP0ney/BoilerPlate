import Phaser from 'phaser';
import { Button, theme } from '@xiao/engine';
import { PALETTE, SCENES } from '../config';
import { t } from '../i18n';
import { HostSession } from '../net/HostSession';
import type { GameScene } from './GameScene';

/** Overlay de pause. La reprise passe par RunFlow (commercialBreak → gameplayStart). */
export class PauseScene extends Phaser.Scene {
  private busy = false;

  constructor() {
    super(SCENES.pause);
  }

  create(): void {
    this.busy = false;
    this.confirmObjects = [];
    const online = (this.scene.get(SCENES.game) as GameScene).session.online; // en ligne : le jeu continue derrière, pas de « Rejouer »
    const { width, height } = this.scale;
    const dim = this.add.rectangle(0, 0, width, height, 0x0a1422, 0.7).setOrigin(0).setInteractive();
    const title = this.add
      .text(width / 2, height / 2 - 120, online ? t('menu') : t('paused'), { fontFamily: theme.font, fontSize: '64px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    const resume = new Button(this, width / 2, height / 2 + 10, { label: t('resume'), onClick: () => this.resume() });
    // Rejouer : même mécanisme que « Rejouer » de l'écran de fin (pub entre deux parties, le run repart aussitôt).
    const restart = new Button(this, width / 2, height / 2 + 96, {
      label: t('restart'),
      variant: 'secondary',
      width: 320,
      height: 64,
      onClick: () => this.confirm('restartAsk', () => void this.restart()), // confirmation d'abord : la run en cours est perdue
    });
    // Quitter : retour à l'écran Solo (choix de la difficulté, puis Play).
    const quit = new Button(this, width / 2, height / 2 + (online ? 172 : 248), {
      label: t('quit'),
      variant: 'secondary',
      width: 320,
      height: 64,
      onClick: () => this.confirm(this.quitMessage(), () => void this.quit()), // confirmation d'abord, en solo comme en ligne
    });

    // Options par-dessus la pause : à la fermeture on revient ici (la partie reste en pause).
    const options = new Button(this, width / 2, height / 2 + (online ? 96 : 172), {
      label: t('options'),
      variant: 'secondary',
      width: 320,
      height: 64,
      onClick: () => {
        if (!this.scene.isActive(SCENES.options)) this.scene.launch(SCENES.options, { resumeGame: false });
      },
    });

    restart.setVisible(!online);
    for (const key of online ? [] : ['ESC', 'P', 'SPACE', 'ENTER']) { // en ligne, ESC / P sont gérés par `GameScene.pauseGame` (bascule)
      this.input.keyboard!.on(`keydown-${key}`, () => {
        if (!this.scene.isActive(SCENES.options)) void this.resume(); // ESC / Entrée ferment d'abord le menu Options
      });
    }

    const layout = () => {
      const { width: w, height: h } = this.scale;
      dim.setSize(w, h);
      title.setPosition(w / 2, h / 2 - 120);
      resume.setPosition(w / 2, h / 2 + 10);
      restart.setPosition(w / 2, h / 2 + 96);
      options.setPosition(w / 2, h / 2 + (online ? 96 : 172));
      quit.setPosition(w / 2, h / 2 + (online ? 172 : 248));
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));
  }

  private async restart(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const game = this.scene.get(SCENES.game) as GameScene;
    this.scene.stop();
    await game.retry(false, true); // nouvelle run sans écran titre, qui attend le premier input comme d'habitude
  }

  /** Texte de confirmation de « Quit » : en solo la run est perdue ; en ligne, l'hôte ramène TOUT LE MONDE à la salle d'attente (run abandonnée), un joueur quitte la salle. */
  private quitMessage(): 'quitAskHost' | 'quitAskClient' | 'quitAskSolo' {
    const session = (this.scene.get(SCENES.game) as GameScene).session;
    return session.online ? (session instanceof HostSession ? 'quitAskHost' : 'quitAskClient') : 'quitAskSolo';
  }

  /** Fenêtre « Oui / Non » par-dessus le menu pause ; `onYes` ne part que sur « Oui ». */
  private confirm(messageKey: 'quitAskHost' | 'quitAskClient' | 'quitAskSolo' | 'restartAsk', onYes: () => void): void {
    if (this.busy || this.confirmObjects.length > 0) return;
    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const cy = h / 2;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.confirmObjects.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, w, h, 0x0a1422, 0.85).setOrigin(0).setInteractive().setDepth(10)); // bloque les clics du menu derrière
    const panel = add(this.add.graphics().setDepth(11));
    const pw = Math.min(460, w - 40);
    panel.fillStyle(PALETTE.panel, 0.97).fillRoundedRect(cx - pw / 2, cy - 130, pw, 260, 20);
    panel.lineStyle(3, PALETTE.panelBorder, 1).strokeRoundedRect(cx - pw / 2, cy - 130, pw, 260, 20);
    add(
      this.add
        .text(cx, cy - 60, t(messageKey), { fontFamily: theme.font, fontSize: '26px', color: '#ffffff', fontStyle: 'bold', align: 'center', wordWrap: { width: pw - 50 } })
        .setOrigin(0.5)
        .setDepth(12),
    );
    const bw = (pw - 60) / 2;
    add(new Button(this, cx - bw / 2 - 10, cy + 70, { label: t('yes'), width: bw, height: 64, onClick: onYes }).setDepth(12));
    add(new Button(this, cx + bw / 2 + 10, cy + 70, { label: t('no'), variant: 'secondary', width: bw, height: 64, onClick: () => this.closeConfirm() }).setDepth(12));
  }

  private closeConfirm(): void {
    for (const o of this.confirmObjects) o.destroy();
    this.confirmObjects = [];
  }

  private confirmObjects: Phaser.GameObjects.GameObject[] = [];

  private async quit(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const game = this.scene.get(SCENES.game) as GameScene;
    this.scene.stop();
    if (game.session.online) return game.quitOnline(); // hôte : tous à la salle d'attente ; joueur : il quitte la salle
    game.registry.set('openScreen', SCENES.solo);
    await game.retry(true); // retour à l'écran Solo
  }

  private async resume(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const game = this.scene.get(SCENES.game) as GameScene;
    this.scene.stop();
    await game.resumeGame();
  }
}
