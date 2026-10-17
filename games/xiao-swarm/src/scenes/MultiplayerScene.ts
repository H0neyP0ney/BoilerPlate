import Phaser from 'phaser';
import { Button, theme } from '@xiao/engine';
import { SCENES } from '../config';
import { hudOnTop } from './hudOnTop';
import { t } from '../i18n';
import type { RoomInfo } from '../net/Transport';
import { createOnlineSession, listPublicRooms, OnlineError, type OnlineRequest } from '../online';

const TEXT = { fontFamily: theme.font, color: '#ffffff', fontStyle: 'bold' } as const;
/** Tableau des parties publiques : hauteur d'une ligne (px du jeu) et nombre de lignes visibles au plus (au-delà : barre de défilement). */
const ROW_H = 30;
/** Hauteur de la ligne d'en-tête (ligne principale du tableau, un peu plus haute que les autres). */
const HEAD_H = 40;
const MAX_ROWS = 10;

/**
 * Menu multijoueur (overlay de l'écran d'accueil solo) : Partie rapide, créer une partie publique / privée,
 * rejoindre avec un code, liste des parties publiques. Toute entrée crée une session en ligne puis relance
 * `GameScene` avec elle (même chemin que `?net=…` au démarrage) ; la salle d'attente s'ouvre ensuite (`LobbyScene`).
 */
export class MultiplayerScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private input_: HTMLInputElement | null = null;
  /** Tableau des parties publiques : un `<div>` DOM à barre de défilement native (molette, glissement tactile) posé sur le canvas. */
  private table: HTMLDivElement | null = null;
  private rooms: RoomInfo[] | null = null;
  private busy = false;
  private message = '';

  constructor() {
    super(SCENES.multiplayer);
  }

  create(): void {
    hudOnTop(this); // boutons debug et son / musique du HUD au-dessus du calque sombre de cet écran
    this.rooms = null;
    this.busy = false;
    this.message = '';
    this.scale.on(Phaser.Scale.Events.RESIZE, this.rebuild);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuild);
      this.clear();
      this.input_?.remove();
      this.input_ = null;
      this.table?.remove();
      this.table = null;
    });
    void this.refresh();
  }

  /** Le tableau et le champ du code sont des éléments DOM, toujours au-dessus du canvas : on les cache tant que le menu Réglages est ouvert par-dessus. */
  update(): void {
    const visibility = this.scene.isActive(SCENES.options) ? 'hidden' : 'visible';
    if (this.table) this.table.style.visibility = visibility;
    if (this.input_) this.input_.style.visibility = visibility;
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


    // pas de titre : Partie rapide en tête. Le bloc du haut (Quick Play + « créer ») et le tableau montent de `lift` ; le tableau grandit d'autant pour que « Join with a code » et « Back » restent où ils étaient
    const lift = 30;
    const baseY = Math.max(60, h / 2 - 300) + 40;
    let y = baseY - lift;
    const quickW = 420;
    const gap = 16;
    const bw = (quickW - gap) / 2; // les deux boutons « créer » côte à côte occupent exactement la largeur de Partie rapide
    add(new Button(this, cx, y, { label: t('mpQuickPlay'), width: quickW, height: 68, onClick: () => void this.start({ kind: 'auto' }) }));
    y += 82;
    add(new Button(this, cx - bw / 2 - gap / 2, y, { label: t('mpCreatePublic'), variant: 'secondary', width: bw, height: 56, onClick: () => void this.start({ kind: 'host', public: true, lobby: true }) }));
    add(new Button(this, cx + bw / 2 + gap / 2, y, { label: t('mpCreatePrivate'), variant: 'secondary', width: bw, height: 56, onClick: () => void this.start({ kind: 'host', public: false, lobby: true }) }));
    y += 88; // haut du tableau (sous les boutons « créer », avec un espace de 60 px)

    // tableau des parties publiques, puis en dessous « Join with a code » : titre, champ du code et Join (ensemble, exactement la largeur de Partie rapide)
    const rows = Math.max(3, Math.min(MAX_ROWS, Math.floor((h - (y + lift) - 230) / ROW_H) - 1)); // autant de lignes que la place le permet, 10 au plus
    const tableH = rows * ROW_H + HEAD_H + lift; // + la ligne d'en-tête, + la hauteur gagnée en montant son bord haut
    this.placeTable(cx, y, quickW, tableH); // même largeur que Partie rapide
    y += tableH + 26;
    text(cx, y, t('mpJoinCode'), 22, '#9fb4cf');
    y += 44;
    const joinW = 154;
    const inputW = quickW - joinW - gap;
    this.placeInput(cx - quickW / 2 + inputW / 2, y, inputW);
    add(new Button(this, cx + quickW / 2 - joinW / 2, y, { label: t('mpJoin'), width: joinW, height: 56, onClick: () => this.joinTyped() }));
    // « Back » sous la ligne du code : même largeur que le tableau et Partie rapide, collé (18 px d'écart)
    const backH = 56;
    const backY = y + 28 + 18 + backH / 2;
    add(new Button(this, cx, backY, { label: t('mpBack'), variant: 'secondary', width: quickW, height: backH, onClick: () => this.back() }));
    // message d'erreur / de connexion (« Can't connect… ») : sous « Back »
    if (this.message) text(cx, backY + backH / 2 + 38, this.message, 24, '#ff8a8a');
  };

  /** Tableau DOM (code · joueurs) : une ligne par partie publique, clic = rejoindre ; en-tête fixe, lignes défilantes. */
  private placeTable(cx: number, top: number, width: number, height: number): void {
    if (!this.table) {
      this.table = document.createElement('div');
      document.body.appendChild(this.table);
    }
    const el = this.table;
    const rect = this.game.canvas.getBoundingClientRect();
    const sx = rect.width / this.scale.width;
    const sy = rect.height / this.scale.height;
    const px = (v: number): string => `${Math.round(v * sy)}px`;
    el.style.cssText = `position:fixed;left:${rect.left + (cx - width / 2) * sx}px;top:${rect.top + top * sy}px;width:${width * sx}px;height:${height * sy}px;overflow-y:auto;box-sizing:border-box;border-radius:${px(8)};background:rgba(11,26,77,0.85);border:2px solid #3f6fe0;font:700 ${px(17)} ${theme.font};color:#fff;z-index:10;`;
    const row = (code: string, players: string, head: boolean, onClick?: () => void): HTMLDivElement => {
      const r = document.createElement('div');
      r.style.cssText = `display:flex;justify-content:space-between;align-items:center;height:${px(head ? HEAD_H : ROW_H)};padding:0 ${px(12)};box-sizing:border-box;${head ? `position:sticky;top:0;background:#2f5bc4;color:#e6efff;font-size:${px(15)};` : onClick ? 'cursor:pointer;' : ''}`;
      const c = document.createElement('span');
      c.textContent = code;
      const p = document.createElement('span');
      p.textContent = players;
      r.append(c, p);
      if (head) {
        // « Refresh » : texte blanc sans fond mais avec un contour, centré en haut du tableau
        const refresh = document.createElement('span');
        refresh.textContent = t('mpRefresh');
        refresh.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#fff;font-size:${px(16)};line-height:1;padding:${px(4)} ${px(12)};border:${Math.max(1, Math.round(2 * sy))}px solid #fff;border-radius:${px(8)};cursor:pointer;user-select:none;`;
        refresh.onclick = () => void this.refresh();
        r.append(refresh);
      }
      if (onClick) {
        r.onclick = onClick;
        r.onmouseenter = () => (r.style.background = 'rgba(255,255,255,0.15)');
        r.onmouseleave = () => (r.style.background = '');
      }
      return r;
    };
    el.replaceChildren(row(t('mpPublicGames'), t('mpPlayers'), true));
    if (this.rooms === null || this.rooms.length === 0) {
      const empty = row(this.rooms === null ? t('mpBusy') : t('mpNoGames'), '', false);
      empty.style.color = '#9fb4cf';
      el.append(empty);
      return;
    }
    for (const r of this.rooms) el.append(row(r.code, `${r.playerCount}/${r.maxPlayers}`, false, () => void this.start({ kind: 'join', code: r.code })));
  }

  /** Champ de saisie du code : un vrai `<input>` posé sur le canvas (clavier mobile, collage). */
  private placeInput(centerX: number, y: number, width: number): void {
    if (!this.input_) {
      const el = document.createElement('input');
      el.type = 'text';
      el.maxLength = 40;
      el.autocomplete = 'off';
      el.placeholder = t('mpCodePlaceholder');
      el.style.cssText = `position:fixed;transform:translate(-50%,-50%);height:56px;font:700 22px ${theme.font};box-sizing:border-box;text-align:center;border-radius:10px;border:3px solid #0a1422;background:#fff;color:#13233a;z-index:10;`;
      el.addEventListener('input', () => this.fitInputText());
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
    this.input_.style.width = `${width * sx}px`;
    this.input_.style.height = `${56 * sy}px`;
    this.input_.style.left = `${rect.left + centerX * sx}px`;
    this.input_.style.top = `${rect.top + y * sy}px`;
    this.inputFont = 22 * sy; // texte à l'échelle du jeu
    this.fitInputText();
  }

  /** Taille de police de base du champ (px écran) ; réduite tant que le code saisi (ou l'indication) dépasse la largeur du champ. */
  private inputFont = 22;

  private fitInputText(): void {
    const el = this.input_;
    if (!el) return;
    let size = this.inputFont;
    el.style.fontSize = `${size}px`;
    const room = el.clientWidth - 2 * 12; // marges intérieures
    while (size > 10 && (el.value ? el.scrollWidth : this.measure(el.placeholder, size)) > (el.value ? el.clientWidth : room)) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
  }

  /** Largeur (px écran) d'un texte à la taille `size`, dans la police du champ. */
  private measure(text: string, size: number): number {
    const ctx = (this.measureCanvas ??= document.createElement('canvas')).getContext('2d');
    if (!ctx) return 0;
    ctx.font = `700 ${size}px ${theme.font}`;
    return ctx.measureText(text).width;
  }

  private measureCanvas: HTMLCanvasElement | null = null;

  /** Retour à l'écran titre. */
  private back(): void {
    this.scene.stop();
    this.scene.launch(SCENES.title);
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
