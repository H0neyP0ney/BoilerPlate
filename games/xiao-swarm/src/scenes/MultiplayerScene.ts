import Phaser from 'phaser';
import { Button, theme } from '@xiao/engine';
import { SCENES } from '../config';
import { t } from '../i18n';
import type { RoomInfo } from '../net/Transport';
import { createOnlineSession, listPublicRooms, OnlineError, type OnlineRequest } from '../online';

const TEXT = { fontFamily: theme.font, color: '#ffffff', fontStyle: 'bold' } as const;
const MAX_LISTED = 5;

/**
 * Menu multijoueur (overlay de l'écran d'accueil solo) : Partie rapide, créer une partie publique / privée,
 * rejoindre avec un code, liste des parties publiques. Toute entrée crée une session en ligne puis relance
 * `GameScene` avec elle (même chemin que `?net=…` au démarrage) ; la salle d'attente s'ouvre ensuite (`LobbyScene`).
 */
export class MultiplayerScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private input_: HTMLInputElement | null = null;
  private rooms: RoomInfo[] | null = null;
  private busy = false;
  private message = '';

  constructor() {
    super(SCENES.multiplayer);
  }

  create(): void {
    this.rooms = null;
    this.busy = false;
    this.message = '';
    this.scale.on(Phaser.Scale.Events.RESIZE, this.rebuild);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuild);
      this.clear();
      this.input_?.remove();
      this.input_ = null;
    });
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    this.rooms = null;
    this.rebuild();
    const list = await listPublicRooms();
    if (!this.scene.isActive()) return;
    this.rooms = list;
    this.rebuild();
  }

  private readonly rebuild = (): void => {
    this.clear();
    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      return o;
    };
    const text = (x: number, y: number, str: string, size: number, color = '#ffffff'): Phaser.GameObjects.Text =>
      add(this.add.text(x, y, str, { ...TEXT, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5));

    add(this.add.rectangle(0, 0, w, h, 0x0a1422, 0.85).setOrigin(0).setInteractive());
    let y = Math.max(60, h / 2 - 300);
    text(cx, y, t('multiplayer'), 52);
    y += 78;
    const bw = 340;
    add(new Button(this, cx, y, { label: t('mpQuickPlay'), width: 420, height: 68, onClick: () => void this.start({ kind: 'auto' }) }));
    y += 82;
    add(new Button(this, cx - bw / 2 - 8, y, { label: t('mpCreatePublic'), variant: 'secondary', width: bw, height: 56, onClick: () => void this.start({ kind: 'host', public: true, lobby: true }) }));
    add(new Button(this, cx + bw / 2 + 8, y, { label: t('mpCreatePrivate'), variant: 'secondary', width: bw, height: 56, onClick: () => void this.start({ kind: 'host', public: false, lobby: true }) }));
    y += 74;

    text(cx, y, t('mpJoinCode'), 22, '#9fb4cf');
    y += 40;
    this.placeInput(cx, y);
    add(new Button(this, cx + 150, y, { label: t('mpJoin'), width: 200, height: 52, onClick: () => this.joinTyped() }));
    y += 66;

    text(cx, y, t('mpPublicGames'), 22, '#9fb4cf');
    y += 34;
    if (this.rooms === null || this.rooms.length === 0) {
      text(cx, y + 20, this.rooms === null ? t('mpBusy') : t('mpNoGames'), 22, '#9fb4cf');
      y += 52;
    } else {
      for (const r of this.rooms.slice(0, MAX_LISTED)) {
        add(new Button(this, cx, y + 22, { label: `${r.code}  ·  ${r.playerCount}/${r.maxPlayers}`, variant: 'secondary', width: 420, height: 46, onClick: () => void this.start({ kind: 'join', code: r.code }) }));
        y += 54;
      }
    }
    y += 12;
    add(new Button(this, cx - 130, y + 22, { label: t('mpRefresh'), variant: 'secondary', width: 220, height: 48, onClick: () => void this.refresh() }));
    add(new Button(this, cx + 130, y + 22, { label: t('mpBack'), variant: 'secondary', width: 220, height: 48, onClick: () => this.scene.stop() }));
    if (this.message) text(cx, y + 80, this.message, 24, '#ff8a8a');
  };

  /** Champ de saisie du code : un vrai `<input>` posé sur le canvas (clavier mobile, collage). */
  private placeInput(cx: number, y: number): void {
    if (!this.input_) {
      const el = document.createElement('input');
      el.type = 'text';
      el.maxLength = 40;
      el.autocomplete = 'off';
      el.placeholder = t('mpCodePlaceholder');
      el.style.cssText = `position:fixed;transform:translate(-50%,-50%);width:220px;height:44px;font:700 22px ${theme.font};text-align:center;border-radius:10px;border:3px solid #0a1422;background:#fff;color:#13233a;z-index:10;`;
      el.addEventListener('keydown', (e) => {
        e.stopPropagation(); // pas de déplacement de squad ni de pause pendant la saisie
        if (e.key === 'Enter') this.joinTyped();
      });
      document.body.appendChild(el);
      this.input_ = el;
    }
    // position écran = position canvas mise à l'échelle
    const rect = this.game.canvas.getBoundingClientRect();
    const sx = rect.width / this.scale.width;
    const sy = rect.height / this.scale.height;
    this.input_.style.left = `${rect.left + (cx - 110) * sx}px`;
    this.input_.style.top = `${rect.top + y * sy}px`;
  }

  private joinTyped(): void {
    const code = this.input_?.value.trim();
    if (code) void this.start({ kind: 'join', code });
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
