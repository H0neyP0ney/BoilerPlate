import Phaser from 'phaser';
import { device, theme } from '@xiao/engine';
import { PALETTE, SCENES } from '../config';
import { ALIENS, type AlienId } from '../data/aliens';
import { nextBoss } from '../data/waves';
import { t } from '../i18n';
import { settings } from '../settings';
import type { SimEvent } from '../sim/types';
import { xpBarLayout } from '../view/hudLayout';
import { iconCheat, iconCrowd, makeSquareButton, VIEWER_BUTTONS } from '../dev/hudButtons';
import type { GameScene } from './GameScene';

/**
 * HUD minimal en scène parallèle (non affecté par le zoom caméra) : bouton pause,
 * consigne de contrôle avant le premier input et, en ligne uniquement, le code de la salle à partager.
 */
export class HudScene extends Phaser.Scene {
  private game_!: GameScene;
  private pauseBtn!: Phaser.GameObjects.Container;
  /** Bouton Options (roue crantée, à gauche de la pause) : volume de la musique, mode debug. */
  private optionsBtn!: Phaser.GameObjects.Container;
  /** Boutons de dev visibles (mode debug du menu Options) ? */
  private debugShown = false;
  private hint!: Phaser.GameObjects.Container;
  private roomText!: Phaser.GameObjects.Text;
  private debugBtn?: Phaser.GameObjects.Container;
  /** Boutons des visionneuses de dev (unités, particules, obstacles, divers), dans l'ordre d'affichage. */
  private viewerBtns: Phaser.GameObjects.Container[] = [];
  /** Boutons des panneaux de dev (foule, triche), avant les visionneuses. */
  private panelBtns: Phaser.GameObjects.Container[] = [];
  private respawnText!: Phaser.GameObjects.Text;
  /** Compteur de FPS (haut gauche), rafraîchi deux fois par seconde. */
  private fpsText!: Phaser.GameObjects.Text;
  private fpsAt = 0;
  /** Haut centre : compte à rebours avant le prochain boss (mini ou final), dès le début de la partie. */
  private bossTimer!: Phaser.GameObjects.Text;
  /** Camembert du compte à rebours : secteur orange (rouge pour le boss final) qui se vide dans le sens inverse des aiguilles. */
  private bossPie!: Phaser.GameObjects.Graphics;
  /** Capsule « Prochain boss » sous le camembert (chevauche un peu son bas). */
  private bossCapsule!: Phaser.GameObjects.Graphics;
  private bossLabel!: Phaser.GameObjects.Text;
  private bossLabelShown = '';
  /** Barre d'XP en bas de l'écran (hors ligne). */
  private xpBar!: Phaser.GameObjects.Graphics;
  private xpLabel!: Phaser.GameObjects.Text;
  /** Boss : bandeau d'annonce, barre de vie en haut et flèche vers le boss hors écran. */
  private bossBanner!: Phaser.GameObjects.Text;
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossName!: Phaser.GameObjects.Text;
  private bossArrow!: Phaser.GameObjects.Graphics;
  /** Flèche verte vers la zone de réanimation d'un équipier mort (au bord de l'écran si la zone est hors champ, sinon au-dessus d'elle). */
  private reviveArrow!: Phaser.GameObjects.Graphics;
  /** Coop : écran de fin (victoire / défaite) avec compte à rebours avant la nouvelle partie. */
  private endText!: Phaser.GameObjects.Text;
  private endVictory = false;
  private endAt = 0;

  constructor() {
    super(SCENES.hud);
  }

  create(): void {
    this.game_ = this.scene.get(SCENES.game) as GameScene;
    this.roomText = this.add.text(0, 0, '', {
      fontFamily: theme.font,
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#13233a',
      strokeThickness: 4,
    });
    // Compteur de FPS, toujours affiché pour l'instant
    this.fpsText = this.add.text(0, 0, '', { fontFamily: theme.font, fontSize: '16px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 4 });
    this.fpsAt = 0;
    this.respawnText = this.add
      .text(0, 0, t('respawning'), { fontFamily: theme.font, fontSize: '34px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 7 })
      .setOrigin(0.5)
      .setVisible(false);
    // Dev uniquement : le menu Réglages, les panneaux et les visionneuses n'existent pas dans le build Poki.
    if (import.meta.env.DEV) {
      this.debugBtn = this.makeDebugButton();
      this.panelBtns = [
        makeSquareButton(this, iconCrowd, () => this.game_.toggleCrowdPanel()),
        makeSquareButton(this, iconCheat, () => this.game_.toggleCheatPanel()),
      ];
      this.viewerBtns = VIEWER_BUTTONS.map((b) => makeSquareButton(this, b.icon, () => this.game_.openViewer(b.scene)));
    }
    this.applyDebugMode();
    this.bossLabelShown = ''; // la scène est réutilisée à chaque partie : le nouveau texte est vide, il faut le remplir
    this.bossPie = this.add.graphics();
    this.bossCapsule = this.add.graphics();
    this.bossLabel = this.add.text(0, 0, '', { fontFamily: theme.font, fontSize: '12px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    this.bossTimer = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '19px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 5 })
      .setOrigin(0.5)
    this.xpBar = this.add.graphics();
    this.xpLabel = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '20px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 5 })
      .setOrigin(1, 0.5); // « Niv. X » à gauche de la jauge
    this.bossBanner = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '44px', fontStyle: 'bold', color: '#ff6a4a', stroke: '#2a0a08', strokeThickness: 8, align: 'center' })
      .setOrigin(0.5)
      .setAlpha(0);
    this.bossBar = this.add.graphics();
    this.bossName = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '20px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 5 })
      .setOrigin(0.5);
    this.bossArrow = this.add.graphics();
    this.reviveArrow = this.add.graphics();
    this.endText = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '54px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 9, align: 'center' })
      .setOrigin(0.5)
      .setVisible(false);
    this.game_.events.on('boss', this.onBoss);
    this.game_.events.on('netEnd', this.onNetEnd);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game_.events.off('boss', this.onBoss);
      this.game_.events.off('netEnd', this.onNetEnd);
    });
    this.pauseBtn = this.makePauseButton().setVisible(!this.game_.session.online);
    this.optionsBtn = this.makeOptionsButton();
    this.hint = this.makeHint();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout));
    this.layout();
  }

  update(time: number): void {
    if (settings.debugMode !== this.debugShown) {
      this.applyDebugMode();
      this.layout();
    }
    this.fpsText.setVisible(settings.showFps);
    if (settings.showFps && time - this.fpsAt > 500) {
      this.fpsAt = time;
      this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} FPS`);
    }
    const g = this.game_;
    const s = g.session;
    this.roomText.setText(
      !s.online ? '' : s.connection === 'lost' ? t('connectionLost') : t('room', { code: s.roomCode ?? '', players: g.playerCount }),
    );
    this.hint.setVisible(g.flow.state === 'ready');
    this.drawXp();
    this.drawBoss();
    this.drawBossTimer();
    this.drawReviveArrow();
    const dead = s.online && s.connection === 'connected' && !g.localSquad?.alive;
    const coop = g.mode.id === 'coop';
    this.respawnText.setVisible(dead && !this.endText.visible).setText(coop ? t('spectating') : t('respawning')).setFontSize(coop ? 24 : 34);
    if (this.endText.visible) {
      const left = Math.max(0, Math.ceil((this.endAt - this.time.now) / 1000));
      this.endText.setText(`${t(this.endVictory ? 'coopWin' : 'coopLose')}\n${t('restartIn', { value: left })}`);
    }
  }

  /** Coop : fin de partie (victoire ou défaite) puis relance par l'hôte. */
  private readonly onNetEnd = (e: SimEvent): void => {
    if (e.t === 'gameEnd') {
      this.endVictory = e.victory;
      this.endAt = this.time.now + e.delay * 1000;
      this.endText.setColor(e.victory ? '#8fff9a' : '#ff6a6a').setVisible(true);
    } else if (e.t === 'restart') this.endText.setVisible(false);
  };

  /** Annonce d'un boss (ou de sa défaite) : gros bandeau au centre qui s'efface. */
  private readonly onBoss = (e: SimEvent): void => {
    if (e.t !== 'boss' && e.t !== 'bossDown') return;
    const name = t(`alien_${e.alien}` as 'alien_crab');
    const text = e.t === 'boss' ? `${t(e.kind === 'final' ? 'bossFinal' : 'bossMini')}\n${name}` : t('bossDown', { name });
    this.tweens.killTweensOf(this.bossBanner);
    this.bossBanner.setText(text).setColor(e.t === 'boss' ? (e.kind === 'final' ? '#ff3a3a' : '#ff9a4a') : '#8fff9a').setAlpha(1).setScale(1.3);
    this.tweens.add({ targets: this.bossBanner, scale: 1, duration: 220, ease: 'Back.Out' });
    this.tweens.add({ targets: this.bossBanner, alpha: 0, delay: 2600, duration: 700 });
  };

  /** Boss vivant : barre de vie en bas de l'écran, et flèche au bord de l'écran quand il est hors champ. */
  private drawBoss(): void {
    const g = this.game_;
    const boss = g.session.sim.aliens.find((a) => a.alive && a.def.boss);
    this.bossBar.clear();
    this.bossArrow.clear();
    this.bossName.setVisible(!!boss);
    if (!boss) return;
    const { width, height } = this.scale;
    const w = Math.min(460, width - 80);
    const x = (width - w) / 2;
    const barY = height - 34; // haut de la barre (bas de l'écran)
    const final = boss.def.boss!.kind === 'final';
    const color = final ? 0xff3a3a : 0xff9a4a;
    this.bossName.setText(t(`alien_${boss.def.id as AlienId}` as 'alien_crab')).setPosition(width / 2, barY - 14);
    this.bossBar.fillStyle(0x0a1422, 0.8).fillRoundedRect(x, barY, w, 16, 8);
    const ratio = Math.max(0, boss.hp / boss.maxHp);
    if (ratio > 0) this.bossBar.fillStyle(color, 1).fillRoundedRect(x + 2, barY + 2, Math.max(12, (w - 4) * ratio), 12, 6);
    this.bossBar.lineStyle(2, 0xffffff, 0.4).strokeRoundedRect(x, barY, w, 16, 8);
    this.bossBanner.setPosition(width / 2, height * 0.3);

    // flèche vers le boss quand il est hors de l'écran
    const cam = g.cameras.main;
    const wv = cam.worldView;
    const inside = boss.x > wv.x && boss.x < wv.right && boss.y > wv.y && boss.y < wv.bottom;
    if (inside) return;
    const ang = Math.atan2(boss.y - (wv.y + wv.height / 2), boss.x - (wv.x + wv.width / 2));
    const m = 46;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const k = Math.min(c !== 0 ? (width / 2 - m) / Math.abs(c) : Infinity, s !== 0 ? (height / 2 - m) / Math.abs(s) : Infinity);
    const px = width / 2 + c * k;
    const py = height / 2 + s * k;
    const pulse = 1 + Math.sin(this.time.now / 140) * 0.12;
    this.bossArrow.fillStyle(0x0a1422, 0.75).fillCircle(px, py, 24 * pulse);
    this.bossArrow.lineStyle(3, color, 1).strokeCircle(px, py, 24 * pulse);
    this.bossArrow.fillStyle(color, 1).fillTriangle(
      px + c * 14 + c * 6, py + s * 14 + s * 6,
      px - c * 4 - s * 10, py - s * 4 + c * 10,
      px - c * 4 + s * 10, py - s * 4 - c * 10,
    );
  }

  /**
   * Flèche verte vers chaque zone de réanimation (équipier mort) tant que le joueur local est en vie : collée au bord de l'écran
   * quand la zone est hors champ, sinon elle rebondit juste au-dessus de la zone en pointant vers elle.
   */
  private drawReviveArrow(): void {
    const g = this.game_;
    const a = this.reviveArrow;
    a.clear();
    const me = g.localSquad;
    if (!me?.alive) return;
    const { width, height } = this.scale;
    const cam = g.cameras.main;
    const wv = cam.worldView;
    const beat = 0.5 + 0.5 * Math.sin(this.time.now / 170);
    for (const z of g.session.sim.reviveZones) {
      if (z.owner === me.owner) continue;
      const sx = ((z.x - wv.x) / wv.width) * width;
      const sy = ((z.y - wv.y) / wv.height) * height;
      const m = 46;
      const inside = sx > m && sx < width - m && sy > m && sy < height - m;
      let px: number;
      let py: number;
      let ang: number;
      if (inside) {
        ang = Math.PI / 2; // pointe vers le bas, vers la zone
        px = sx;
        py = sy - 70 - beat * 14;
      } else {
        ang = Math.atan2(sy - height / 2, sx - width / 2);
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const k = Math.min(c !== 0 ? (width / 2 - m) / Math.abs(c) : Infinity, s !== 0 ? (height / 2 - m) / Math.abs(s) : Infinity);
        px = width / 2 + c * k;
        py = height / 2 + s * k;
      }
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const pulse = 1 + beat * 0.14;
      a.fillStyle(0x0a2210, 0.75).fillCircle(px, py, 25 * pulse);
      a.lineStyle(3, 0x5dff84, 1).strokeCircle(px, py, 25 * pulse);
      a.fillStyle(0x5dff84, 1).fillTriangle(
        px + c * 15 + c * 6, py + s * 15 + s * 6,
        px - c * 4 - s * 11, py - s * 4 + c * 11,
        px - c * 4 + s * 11, py - s * 4 - c * 11,
      );
    }
  }

  /** Compte à rebours avant le prochain boss annoncé par la timeline ; masqué quand il n'y en a plus ou que l'écran de fin est affiché. */
  private drawBossTimer(): void {
    const g = this.game_;
    const sim = g.session.sim;
    const next = nextBoss(sim.mode.waves, g.runTime);
    const bossAlive = sim.aliens.some((a) => a.alive && a.def.boss);
    const left = next ? Math.max(0, next.at - g.runTime) : 0;
    // Caché pendant un combat de boss, sauf s'il reste moins d'une minute avant le suivant.
    const show = !!next && !this.endText.visible && (!bossAlive || left < 60);
    this.bossTimer.setVisible(show);
    this.bossLabel.setVisible(show);
    this.bossPie.clear();
    this.bossCapsule.clear();
    if (!show || !next) return;
    const { height } = this.scale;
    const R = 30;
    const cx = 14 + R + 16; // bord gauche (la capsule « Prochain boss » dépasse un peu du disque)
    const cy = height / 3; // à un tiers de la hauteur depuis le haut
    // part restante = temps restant / durée écoulée entre le boss précédent (ou le début) et celui-ci
    const prev = sim.mode.waves.timeline.reduce((m, e) => (e.config !== undefined && e.at <= g.runTime ? Math.max(m, e.at) : m), 0);
    const frac = Math.max(0, Math.min(1, left / Math.max(1, next.at - prev)));
    const final = ALIENS[next.type].boss?.kind === 'final';
    const color = final ? 0xff3a3a : 0xff9a4a;
    const urgent = left < 10 && Math.sin(this.time.now / 90) > 0;
    const pie = this.bossPie;
    pie.fillStyle(0x0a1422, 0.82).fillCircle(cx, cy, R);
    if (frac > 0) {
      const start = -Math.PI / 2;
      pie.fillStyle(urgent ? 0xffffff : color, 0.9);
      pie.beginPath();
      pie.moveTo(cx, cy);
      pie.arc(cx, cy, R - 3, start, start + Math.PI * 2 * frac, false);
      pie.closePath();
      pie.fillPath();
    }
    pie.fillStyle(0x0a1422, 0.78).fillCircle(cx, cy, R - 12); // centre sombre : le temps y est lisible
    pie.lineStyle(3, 0xffffff, 0.45).strokeCircle(cx, cy, R);
    // capsule bleu foncé sous le camembert : son bord haut recouvre un peu le bas du disque
    const label = t('nextBoss'); // toujours « Next boss », même pour le boss final
    if (label !== this.bossLabelShown) {
      this.bossLabelShown = label;
      this.bossLabel.setText(label);
    }
    const lw = this.bossLabel.width + 20;
    const ly = cy + R + 1;
    this.bossCapsule.fillStyle(0x0b1a4d, 0.95).fillRoundedRect(cx - lw / 2, ly - 10, lw, 20, 10);
    this.bossCapsule.lineStyle(2, 0x3f6fe0, 0.9).strokeRoundedRect(cx - lw / 2, ly - 10, lw, 20, 10);
    this.bossLabel.setPosition(cx, ly);
    const secs = Math.ceil(left);
    this.bossTimer.setPosition(cx, cy).setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`).setFontSize(15);
  }

  /** Jauge d'XP de la squad locale : niveau à gauche, barre qui se remplit jusqu'à la prochaine upgrade. */
  private drawXp(): void {
    const squad = this.game_.localSquad;
    const on = this.game_.session.sim.xpEnabled && !!squad;
    this.xpBar.setVisible(on);
    this.xpLabel.setVisible(on);
    if (!on) return;
    const { x, y, w } = xpBarLayout(this.scale.width); // tout en haut de l'écran
    const ratio = Math.min(1, squad.xp / squad.xpNeeded);
    this.xpBar.clear();
    this.xpBar.fillStyle(0x0a1422, 0.75).fillRoundedRect(x, y - 9, w, 18, 9);
    if (ratio > 0) this.xpBar.fillStyle(0x4aa8ff, 1).fillRoundedRect(x + 2, y - 7, Math.max(14, (w - 4) * ratio), 14, 7);
    this.xpBar.lineStyle(2, 0xffffff, 0.35).strokeRoundedRect(x, y - 9, w, 18, 9);
    this.xpLabel.setText(t('xpLevel', { value: squad.level })).setPosition(x - 8, y);
  }

  /** Bouton « curseurs » en haut à gauche : ouvre / ferme le menu Réglages (zoom du jeu, visuel, stats). */
  private makeDebugButton(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.panel, 0.92).fillRoundedRect(-22, -22, 44, 44, 10);
    g.lineStyle(2.5, PALETTE.panelBorder, 1).strokeRoundedRect(-22, -22, 44, 44, 10);
    // trois curseurs : une barre + un bouton décalé
    [-10, 0, 10].forEach((y, i) => {
      g.fillStyle(0xffffff, 1).fillRoundedRect(-12, y - 1.5, 24, 3, 1.5);
      g.fillStyle(PALETTE.primary, 1).fillCircle([-4, 5, -1][i], y, 4);
    });
    const hit = this.add.zone(0, 0, 44, 44).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.game_.toggleDebug());
    c.add([g, hit]);
    return c;
  }

  /** Mode debug (menu Options) : affiche ou masque les boutons des outils de dev en haut à gauche. */
  private applyDebugMode(): void {
    this.debugShown = settings.debugMode;
    const show = this.debugShown && !!this.debugBtn;
    for (const b of [this.debugBtn, ...this.panelBtns, ...this.viewerBtns]) b?.setVisible(show);
  }

  /** Roue crantée : ouvre le menu Options. */
  private makeOptionsButton(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.panel, 0.92).fillRoundedRect(-30, -30, 60, 60, 12);
    g.lineStyle(2.5, PALETTE.panelBorder, 1).strokeRoundedRect(-30, -30, 60, 60, 12);
    g.fillStyle(0xffffff, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillCircle(Math.cos(a) * 13, Math.sin(a) * 13, 4.5); // dents
    }
    g.fillCircle(0, 0, 13);
    g.fillStyle(PALETTE.panel, 1).fillCircle(0, 0, 5.5);
    const hit = this.add.zone(0, 0, 60, 60).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.game_.openOptions());
    c.add([g, hit]);
    return c;
  }

  private makePauseButton(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.panel, 0.92).fillRoundedRect(-30, -30, 60, 60, 12);
    g.lineStyle(2.5, PALETTE.panelBorder, 1).strokeRoundedRect(-30, -30, 60, 60, 12);
    g.fillStyle(0xffffff, 1).fillRoundedRect(-11, -13, 8, 26, 2).fillRoundedRect(3, -13, 8, 26, 2);
    const hit = this.add.zone(0, 0, 60, 60).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.game_.pauseGame());
    c.add([g, hit]);
    return c;
  }

  private makeHint(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const label = this.add
      .text(0, 70, device.isTouch ? t('hintDrag') : t('hintKeys'), {
        fontFamily: theme.font,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#13233a',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    c.add(label);
    if (device.isTouch) {
      const hand = this.add.image(-60, 0, 'hand').setScale(0.8);
      c.add(hand);
      this.tweens.add({ targets: hand, x: 60, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    } else {
      this.tweens.add({ targets: label, scale: 1.06, duration: 600, yoyo: true, repeat: -1 });
    }
    return c;
  }

  private readonly layout = (): void => {
    const { width, height } = this.scale;
    // Décalé sous la pill Poki sur mobile
    const top = device.isTouch ? 70 : 12;
    // boutons alignés à gauche ; le code de salle (en ligne) se place à droite du dernier
    this.debugBtn?.setPosition(14 + 22, top + 22);
    const devBtns = [...this.panelBtns, ...this.viewerBtns];
    devBtns.forEach((b, i) => b.setPosition(14 + (1 + i) * (44 + 8) + 22, top + 22));
    const buttons = this.debugBtn && this.debugShown ? 1 + devBtns.length : 0; // menu Réglages + panneaux + visionneuses (dev, mode debug)
    this.roomText.setPosition(buttons ? 14 + buttons * (44 + 8) + 10 : 14, buttons ? top + 10 : top);
    this.fpsText.setPosition(14, top + (buttons ? 54 : 30)); // sous les boutons de dev / le code de salle
    this.pauseBtn.setPosition(width - 44, top + 34);
    this.optionsBtn.setPosition(this.pauseBtn.visible ? width - 44 - 70 : width - 44, top + 34);
    this.hint.setPosition(width / 2, height * 0.62);
    this.respawnText.setPosition(width / 2, height * 0.22);
    this.endText.setPosition(width / 2, height * 0.4);
  };
}
