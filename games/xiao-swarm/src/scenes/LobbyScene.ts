import Phaser from 'phaser';
import { Button, poki, theme } from '@xiao/engine';
import { DIFFICULTY_LABEL_KEYS, DIFFICULTY_LEVELS, type DifficultyLevel } from '../data/difficultyLevels';
import { SCENES } from '../config';
import { hudOnTop } from './hudOnTop';
import { t } from '../i18n';
import { HostSession } from '../net/HostSession';
import { settings } from '../settings';
import type { GameScene } from './GameScene';

const TEXT = { fontFamily: theme.font, color: '#ffffff', fontStyle: 'bold' } as const;

/**
 * Salle d'attente du coop en ligne (overlay de `GameScene`, dont le monde est figé tant que l'hôte n'a pas lancé).
 * Tous : code de la salle (copier / lien d'invitation), effectif, Quitter. Hôte en plus : difficulté, bots, Lancer.
 * Les autres joueurs voient « On attend l'hôte ». Se ferme tout seul quand l'hôte lance (`session.lobby.started`).
 */
export class LobbyScene extends Phaser.Scene {
  private game_!: GameScene;
  private objects: Phaser.GameObjects.GameObject[] = [];
  /** Clé de ce qui est affiché : on ne reconstruit l'écran que si l'effectif ou le niveau change. */
  private shown = '';
  private flash = '';

  constructor() {
    super(SCENES.lobby);
  }

  create(): void {
    hudOnTop(this); // boutons debug et son / musique du HUD au-dessus du calque sombre de cet écran
    this.game_ = this.scene.get(SCENES.game) as GameScene;
    this.shown = '';
    this.flash = '';
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clear());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.rebuild);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuild));
  }

  update(): void {
    const s = this.game_.session;
    const lobby = s.lobby;
    if (!lobby || lobby.started) return void this.scene.stop();
    const key = `${lobby.humans}/${lobby.bots}/${lobby.public}/${s.sim.difficulty}/${s.connection}/${this.flash}`;
    if (key !== this.shown) {
      this.shown = key;
      this.rebuild();
    }
  }

  private readonly rebuild = (): void => {
    this.clear();
    const s = this.game_.session;
    const lobby = s.lobby;
    if (!lobby) return;
    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const host = s instanceof HostSession ? s : null;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      return o;
    };
    const text = (x: number, y: number, str: string, size: number, color = '#ffffff'): Phaser.GameObjects.Text =>
      add(this.add.text(x, y, str, { ...TEXT, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5));
    // même mise en page que le menu multijoueur : une colonne de 420 px (largeur de Partie rapide), boutons alignés dessus, 16 px entre les blocs
    const colW = 420;
    const gap = 16;

    const dim = add(this.add.rectangle(0, 0, w, h, 0x0a1422, 0.85).setOrigin(0)); // calque sombre semi-transparent
    const tight = h < 720; // petit écran : sans les lignes d'explication, tableau plus serré
    let y = tight ? 28 : 100; // position de départ provisoire : tout l'écran est recentré verticalement en fin de construction
    const topY = y - 20; // haut du contenu

    // une ligne : « Public game » / « Private game » collé au bord gauche de la colonne, le code de la salle collé au bord droit ; puis « Copy code » et « Copy invite link » côte à côte
    const label = add(this.add.text(cx - colW / 2, y, lobby.public ? t('lobbyPublic') : t('lobbyPrivate'), { ...TEXT, fontSize: `${tight ? 26 : 32}px`, color: '#ffffff' }).setOrigin(0, 0.5));
    const code = add(this.add.text(cx + colW / 2, y, s.roomCode ?? '', { ...TEXT, fontSize: `${tight ? 22 : 26}px`, color: '#ffd84a' }).setOrigin(1, 0.5));
    const room = colW - label.width - 16; // place laissée au code
    if (code.width > room) code.setScale(room / code.width); // un long code est réduit pour ne pas toucher le libellé
    y += tight ? 44 : 54;
    const halfW = (colW - gap) / 2;
    add(new Button(this, cx - halfW / 2 - gap / 2, y, { label: this.flash === 'link' ? t('lobbyCopied') : t('lobbyInvite'), variant: 'secondary', width: halfW, height: 56, onClick: () => void this.copy('link') })); // lien d'invitation à gauche
    add(new Button(this, cx + halfW / 2 + gap / 2, y, { label: this.flash === 'code' ? t('lobbyCopied') : t('lobbyCopy'), variant: 'secondary', width: halfW, height: 56, onClick: () => void this.copy('code') })); // code à droite, sous le code de la salle
    y += 28 + 24;

    // tableau des joueurs (même style que celui des parties publiques : en-tête bleu clair plus haut, corps bleu foncé à contour bleu)
    const HEAD = 40;
    const ROW = tight ? 30 : 36; // assez haute pour loger les boutons « Add bot » / « Remove bot » de l'hôte
    const SLOTS = 4;
    const ph = HEAD + SLOTS * ROW;
    const left = cx - colW / 2;
    const panel = add(this.add.graphics());
    panel.fillStyle(0x0b1a4d, 0.85).fillRoundedRect(left, y, colW, ph, 8);
    panel.fillStyle(0x2f5bc4, 1).fillRoundedRect(left, y, colW, HEAD, { tl: 8, tr: 8, bl: 0, br: 0 });
    panel.lineStyle(2, 0x3f6fe0, 1).strokeRoundedRect(left, y, colW, ph, 8);
    add(this.add.text(left + 14, y + HEAD / 2, t('lobbyPlayersHead'), { ...TEXT, fontSize: '16px', color: '#e6efff' }).setOrigin(0, 0.5));
    add(this.add.text(left + colW - 14, y + HEAD / 2, `${lobby.humans + lobby.bots}/${SLOTS}`, { ...TEXT, fontSize: '16px', color: '#e6efff' }).setOrigin(1, 0.5));
    const names: { label: string; color: string }[] = [];
    for (let i = 0; i < lobby.humans; i++) names.push({ label: i === 0 ? t('lobbyHost') : t('scorePlayer', { value: i + 1 }), color: '#ffffff' });
    for (let i = 0; i < lobby.bots; i++) names.push({ label: t('lobbyBot', { value: i + 1 }), color: '#9fd4ff' });
    // bouton sans texture : juste le texte blanc dans un cadre blanc arrondi (comme « Refresh » du menu multijoueur)
    const outlineButton = (x: number, yy: number, bw: number, bh: number, label: string, onClick: () => void): void => {
      const frame = add(this.add.graphics());
      frame.lineStyle(2, 0xffffff, 1).strokeRoundedRect(x - bw / 2, yy - bh / 2, bw, bh, 8);
      const txt = add(this.add.text(x, yy, label, { ...TEXT, fontSize: '15px' }).setOrigin(0.5));
      if (txt.width > bw - 12) txt.setScale((bw - 12) / txt.width);
      const hit = add(this.add.zone(x, yy, bw, bh).setInteractive({ useHandCursor: true }));
      let pressed = false;
      hit.on('pointerdown', () => (pressed = true));
      hit.on('pointerout', () => (pressed = false));
      hit.on('pointerup', () => {
        if (!pressed) return;
        pressed = false;
        Button.clickHook?.(this);
        onClick();
      });
    };
    const botIds = host ? [...host.bots.keys()] : [];
    const btnW = 120;
    const btnH = ROW - 8;
    for (let i = 0; i < SLOTS; i++) {
      const row = names[i];
      const rowY = y + HEAD + i * ROW + ROW / 2;
      add(this.add.text(left + 14, rowY, row ? row.label : t('lobbyEmptySlot'), { ...TEXT, fontSize: '17px', color: row ? row.color : '#5f7396' }).setOrigin(0, 0.5));
      if (!host) continue;
      const bx = left + colW - 10 - btnW / 2;
      if (!row) outlineButton(bx, rowY, btnW, btnH, t('lobbyAddBot'), () => host.addBot()); // place libre : « Add bot » à droite de la ligne
      else if (i >= lobby.humans) outlineButton(bx, rowY, btnW, btnH, t('lobbyRemoveBot'), () => host.removeBot(botIds[i - lobby.humans])); // ligne d'un bot : « Remove bot » à droite
    }
    const blockGap = tight ? 12 : 70; // gros espace entre le haut (code, copie, joueurs) et le bloc du bas (difficulté, Play, Back)
    y += ph + blockGap + (host ? 28 : 0); // le bouton suivant est centré sur y

    if (host) {
      // difficulté : trois boutons sur une ligne, de la largeur de la colonne (comme l'écran Solo)
      const dw = (colW - 2 * 10) / 3;
      DIFFICULTY_LEVELS.forEach((l: DifficultyLevel, i) => {
        const on = l === s.sim.difficulty;
        const locked = !settings.isUnlocked(l);
        add(
          new Button(this, cx + (i - 1) * (dw + 10), y, {
            label: locked ? `🔒 ${t(DIFFICULTY_LABEL_KEYS[l])}` : t(DIFFICULTY_LABEL_KEYS[l]),
            variant: on ? 'primary' : 'secondary',
            width: dw,
            height: 56,
            onClick: () => {
              if (locked) return;
              settings.setDifficulty(l);
              s.setDifficulty(l);
            },
          }).setEnabled(!locked, false),
        );
      });
      y += 28 + 18 + 55;
      add(new Button(this, cx, y, { label: t('play'), width: colW, height: 110, onClick: () => host.startGame() })); // « Play », grand bouton comme sur l'écran Solo
      y += 55 + 18 + 28;
    } else {
      text(cx, y, `${t(DIFFICULTY_LABEL_KEYS[s.sim.difficulty])}`, 24, '#ffd84a');
      y += 38;
      text(cx, y, s.connection === 'lost' ? t('connectionLost') : t('lobbyWaitHost'), 22, '#9fb4cf');
      y += 30 + 28;
    }
    add(new Button(this, cx, y, { label: t('mpBack'), variant: 'secondary', width: colW, height: 56, onClick: () => this.leave() }));
    // recentre tout le contenu verticalement (comme l'écran d'avant, le menu multijoueur) : on décale tout ce qui a été posé, hors calque sombre
    const dy = Math.max(12 - topY, (h - (y + 28 - topY)) / 2 - topY);
    for (const o of this.objects) if (o !== dim) (o as Phaser.GameObjects.GameObject & { y: number }).y += dy;
  };

  private clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }

  private async copy(what: 'code' | 'link'): Promise<void> {
    const code = this.game_.session.roomCode ?? '';
    let value = code;
    if (what === 'link') {
      const shared = await poki.shareableURL({ room: code });
      value = shared ?? `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(code)}`;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* presse-papiers refusé (iframe sans droit) : rien à faire, le code reste affiché */
    }
    this.flash = what;
    this.time.delayedCall(1500, () => (this.flash = ''));
  }

  /** « Back » : quitte la salle et revient à l'écran d'avant, le menu multijoueur (plus de rechargement de la page). */
  private leave(): void {
    void this.game_.leaveOnline();
  }
}
