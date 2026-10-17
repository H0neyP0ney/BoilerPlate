import Phaser from 'phaser';
import { Button, theme } from '@xiao/engine';
import { SCENES } from '../config';
import { hudOnTop } from './hudOnTop';
import { t } from '../i18n';
import { createOnlineSession, OnlineError, type OnlineRequest } from '../online';

const TEXT = { fontFamily: theme.font, color: '#ffffff', fontStyle: 'bold' } as const;

/**
 * Menu multijoueur (overlay de l'écran d'accueil solo), volontairement simple : Quick Play en gros, au-dessus deux boutons, Create game (crée une partie et ouvre sa salle d'attente,
 * `LobbyScene`) et Join game (ouvre `JoinScene` : liste des parties publiques et code de salle), puis Back. Toute entrée crée une session en ligne puis relance `GameScene` avec elle
 * (même chemin que `?net=…` au démarrage).
 */
export class MultiplayerScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private busy = false;
  private message = '';

  constructor() {
    super(SCENES.multiplayer);
  }

  create(): void {
    hudOnTop(this); // boutons debug et son / musique du HUD au-dessus de cet écran
    this.busy = false;
    this.message = '';
    this.rebuild();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.rebuild);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuild);
      this.clear();
    });
  }

  private readonly rebuild = (): void => {
    this.clear();
    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      return o;
    };
    const quickW = Math.min(440, w - 40); // comme Play de l'écran Solo
    const gap = 16;
    const bw = (quickW - gap) / 2; // les deux boutons côte à côte occupent exactement la largeur de Quick Play
    // mêmes positions verticales que l'écran Solo : Quick Play à la place de Play, Back sous lui au même endroit, Create / Join à la place des boutons de difficulté
    const lift = h * 0.1;
    const playY = h - 110 - lift;
    const backH = 56;
    const backY = playY + 55 + 18 + backH / 2;
    add(new Button(this, cx, backY, { label: t('mpBack'), variant: 'secondary', width: quickW, height: backH, onClick: () => this.back() }));
    add(new Button(this, cx, playY, { label: t('mpQuickPlay'), width: quickW, height: 110, pulse: true, onClick: () => void this.start({ kind: 'auto' }) }));
    const rowY = playY - 55 - 50;
    add(new Button(this, cx - bw / 2 - gap / 2, rowY, { label: t('mpCreateGame'), variant: 'secondary', width: bw, height: 64, onClick: () => void this.start({ kind: 'host', public: true, lobby: true }) }));
    add(new Button(this, cx + bw / 2 + gap / 2, rowY, { label: t('mpJoinGame'), variant: 'secondary', width: bw, height: 64, onClick: () => this.join() }));
    // Armory (pièce d'or) à gauche et Skins (diamant vert) à droite, comme sur l'écran titre
    const sw = Math.min(190, Math.max(110, w * 0.26));
    const sh = 128;
    const side = (x: number, label: string, fill: number, scene: string): void => {
      add(new Button(this, x, h / 2, { label, variant: 'secondary', fill, textColor: '#ffffff', width: sw, height: sh, onClick: () => this.openMenu(scene) }));
    };
    side(sw / 2 + 14, t('armoryBtn'), 0x8a5a05, SCENES.armory);
    side(w - sw / 2 - 14, t('skinsBtn'), 0x1f7a4d, SCENES.shop);
    // message d'erreur / de connexion (« Can't connect… ») : au-dessus de la ligne Create / Join
    if (this.message) add(this.add.text(cx, rowY - 32 - 30, this.message, { ...TEXT, fontSize: '24px', color: '#ff8a8a', align: 'center' }).setOrigin(0.5));
  };

  /** Retour à l'écran titre. */
  private back(): void {
    this.scene.stop();
    this.scene.launch(SCENES.title);
  }

  private openMenu(scene: string): void {
    if (this.busy) return;
    this.registry.set('menuFrom', 'multiplayer'); // Back de l'armurerie / boutique revient ici
    this.scene.stop();
    this.scene.launch(scene);
  }

  /** Ouvre l'écran de la liste des parties publiques et du code de salle. */
  private join(): void {
    if (this.busy) return;
    this.scene.stop();
    this.scene.launch(SCENES.join);
  }

  private async start(req: OnlineRequest): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.message = t('mpBusy');
    this.rebuild();
    try {
      const session = await createOnlineSession(req);
      this.registry.set('session', session);
      this.scene.stop();
      this.scene.get(SCENES.game).scene.restart();
    } catch (e) {
      const reason = e instanceof OnlineError ? e.reason : 'failed';
      const key = reason === 'not-found' ? 'roomNotFound' : reason === 'full' ? 'roomFull' : reason === 'version' ? 'versionMismatch' : 'connectFailed';
      this.message = t(key).replace(/ — .*$/, '');
      this.busy = false;
      this.rebuild();
    }
  }

  private clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }
}
