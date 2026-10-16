import Phaser from 'phaser';
import { Button, poki, theme } from '@xiao/engine';
import { DIFFICULTY_LABEL_KEYS, DIFFICULTY_LEVELS, type DifficultyLevel } from '../data/difficultyLevels';
import { SCENES } from '../config';
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

    add(this.add.rectangle(0, 0, w, h, 0x0a1422, 0.78).setOrigin(0).setInteractive());
    let y = Math.max(34, h / 2 - 205);
    text(cx, y, t('lobbyTitle'), 46);
    y += 52;
    text(cx, y, t('lobbyCode'), 18, '#9fb4cf');
    y += 34;
    text(cx, y, s.roomCode ?? '', 52, '#ffd84a');
    y += 40;
    text(cx, y, lobby.public ? t('lobbyPublic') : t('lobbyPrivate'), 18, '#9fb4cf');
    y += 40;
    add(new Button(this, cx - 170, y, { label: this.flash === 'code' ? t('lobbyCopied') : t('lobbyCopy'), variant: 'secondary', width: 320, height: 48, onClick: () => void this.copy('code') }));
    add(new Button(this, cx + 170, y, { label: this.flash === 'link' ? t('lobbyCopied') : t('lobbyInvite'), variant: 'secondary', width: 320, height: 48, onClick: () => void this.copy('link') }));
    y += 54;
    text(cx, y, t('lobbyPlayers', { humans: lobby.humans, bots: lobby.bots }), 26);
    y += 44;

    if (host) {
      DIFFICULTY_LEVELS.forEach((l: DifficultyLevel, i) => {
        const on = l === s.sim.difficulty;
        add(
          new Button(this, cx + (i - 1) * 190, y, {
            label: t(DIFFICULTY_LABEL_KEYS[l]),
            variant: on ? 'primary' : 'secondary',
            width: 176,
            height: 46,
            onClick: () => {
              settings.setDifficulty(l);
              s.setDifficulty(l);
            },
          }),
        );
      });
      y += 56;
      add(new Button(this, cx - 170, y, { label: t('lobbyAddBot'), variant: 'secondary', width: 320, height: 46, onClick: () => host.addBot() })); // `addBot` refuse tout seul quand la salle est pleine
      add(
        new Button(this, cx + 170, y, {
          label: t('lobbyRemoveBot'),
          variant: 'secondary',
          width: 320,
          height: 46,
          onClick: () => {
            const last = [...host.bots.keys()].pop();
            if (last) host.removeBot(last);
          },
        }),
      );
      y += 66;
      add(new Button(this, cx, y, { label: t('lobbyStart'), width: 360, height: 62, onClick: () => host.startGame() }));
    } else {
      text(cx, y + 14, s.connection === 'lost' ? t('connectionLost') : t('lobbyWaitHost'), 26, '#9fb4cf');
      y += 66;
    }
    y += 60;
    add(new Button(this, cx, y, { label: t('lobbyLeave'), variant: 'secondary', width: 240, height: 44, onClick: () => this.leave() }));
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

  /** Quitter la salle : retour à une partie solo (la page se recharge sans paramètre de salle). */
  private leave(): void {
    this.game_.session.close();
    window.location.href = `${window.location.origin}${window.location.pathname}`;
  }
}
