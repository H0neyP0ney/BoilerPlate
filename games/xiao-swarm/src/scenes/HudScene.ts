import Phaser from 'phaser';
import { device, music, sfx, theme, DEV_TOOLS } from '@xiao/engine';
import { PALETTE, SCENES } from '../config';
import type { AlienId } from '../data/aliens';
import { keyLabel } from '../hotkeys';
import { t } from '../i18n';
import { settings } from '../settings';
import type { SimEvent } from '../sim/types';
import { BOSS_ART, hudTop, XP_ART, xpBarLayout } from '../view/hudLayout';
import { BAR_GHOST_SPEED, ghostHit, type BarGhost } from '../view/WorldView';
import { HUD_ART, makeHudButton } from '../view/HudButtons';
import { TimelineHud } from '../view/TimelineHud';
import { staleDropped } from '../dev/staleOverrides';
import { buildScoreboard, scoreRows } from '../view/Scoreboard';
import { iconCheat, iconCrowd, makeSquareButton, VIEW_BORDER, VIEWER_BUTTONS } from '../dev/hudButtons';
import type { GameScene } from './GameScene';

/** Flèche de boss hors écran : toujours rouge (comme la flèche de réanimation, verte, a la sienne). */
const BOSS_ARROW_COLOR = 0xff3a3a;

/** Délai (ms) entre deux touches W A S D de l'aide de déplacement. */
const KEY_STEP = 300;

/**
 * HUD minimal en scène parallèle (non affecté par le zoom caméra) : bouton pause,
 * consigne de contrôle avant le premier input et, en ligne uniquement, le code de la salle à partager.
 */
export class HudScene extends Phaser.Scene {
  private game_!: GameScene;
  private pauseBtn!: Phaser.GameObjects.Container;
  /** Haut gauche : bouton son et bouton musique, chacun coupe / rétablit (mute) ; le volume se règle dans Options. */
  private soundBtn!: Phaser.GameObjects.Container;
  private soundSlash!: Phaser.GameObjects.Graphics;
  private musicSlash!: Phaser.GameObjects.Graphics;
  /** État (son / musique non nuls) des icônes affichées : redessinées si le volume change ailleurs (menu Options). */
  private iconState = '';
  private musicBtn!: Phaser.GameObjects.Container;
  /** Boutons de dev visibles (mode debug du menu Options) ? */
  private debugShown = false;
  private hint!: Phaser.GameObjects.Container;
  private hintLabel!: Phaser.GameObjects.Text;
  private roomText!: Phaser.GameObjects.Text;
  private debugBtn?: Phaser.GameObjects.Container;
  /** Boutons des visionneuses de dev (unités, particules, obstacles, divers), dans l'ordre d'affichage. */
  private viewerBtns: Phaser.GameObjects.Container[] = [];
  /** Boutons des panneaux de dev (foule, triche), avant les visionneuses. */
  private panelBtns: Phaser.GameObjects.Container[] = [];
  private respawnText!: Phaser.GameObjects.Text;
  /** En ligne : message quand l'hôte ne répond plus (onglet en arrière-plan, gel…). */
  private hostText!: Phaser.GameObjects.Text;
  /** Compteur de FPS (haut gauche), rafraîchi deux fois par seconde. */
  private fpsText!: Phaser.GameObjects.Text;
  private fpsAt = 0;
  /** Nombre d'aliens en jeu, en bas à droite (au-dessus du compteur de FPS). */
  private alienText!: Phaser.GameObjects.Text;
  private alienShown = -1;
  /** Timeline des vagues et « Next boss » (haut centre). */
  private timeline!: TimelineHud;
  /** Barre d'XP en bas de l'écran (hors ligne). */
  private xpFrame!: Phaser.GameObjects.Image;
  private xpFill!: Phaser.GameObjects.NineSlice;
  private xpLabel!: Phaser.GameObjects.Text;
  /** Part d'XP affichée (rattrape la vraie en ~0,2 s), niveau vu pour animer le passage de niveau (la jauge finit de se remplir puis repart de 0). */
  private xpShown = 0;
  private xpLevelSeen = 0;
  private xpWrap = false;
  /** Boss : bandeau d'annonce, barre de vie en haut et flèche vers le boss hors écran. */
  private bossBanner!: Phaser.GameObjects.Text;
  private bossBar!: Phaser.GameObjects.Graphics;
  /** Barre de vie du boss : cadre, part blanche (la vie d'avant le coup, qui rejoint la rouge) puis jauge rouge ; état de la part blanche. */
  private bossFrame!: Phaser.GameObjects.Image;
  private bossGhost!: Phaser.GameObjects.NineSlice;
  private bossFill!: Phaser.GameObjects.NineSlice;
  private bossGhostState: BarGhost & { id: number } = { id: -1, last: 1, ghost: 1, hold: 0, hits: 0 };
  private bossName!: Phaser.GameObjects.Text;
  private tutorialArrow!: Phaser.GameObjects.Graphics;
  private tutorialLabel!: Phaser.GameObjects.Text;
  private bossArrow!: Phaser.GameObjects.Graphics;
  private bossTip!: Phaser.GameObjects.Text;
  /** Flèche verte vers la zone de réanimation d'un équipier mort (au bord de l'écran si la zone est hors champ, sinon au-dessus d'elle). */
  private reviveArrow!: Phaser.GameObjects.Graphics;
  /** « Ally down » au-dessus de chaque flèche verte (un texte par zone de réanimation, créés à la demande). */
  private reviveLabels: Phaser.GameObjects.Text[] = [];
  /** Coop : scoreboard de l'écran de fin. */
  private endScores?: Phaser.GameObjects.Container;
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
    this.alienText = this.add.text(0, 0, '', { fontFamily: theme.font, fontSize: '16px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 4 });
    this.alienShown = -1; // la scène est réutilisée : le texte est à refaire
    this.respawnText = this.add
      .text(0, 0, t('respawning'), { fontFamily: theme.font, fontSize: '34px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 7 })
      .setOrigin(0.5)
      .setVisible(false);
    this.hostText = this.add
      .text(0, 0, t('hostStalled'), { fontFamily: theme.font, fontSize: '30px', fontStyle: 'bold', color: '#ffd166', stroke: '#13233a', strokeThickness: 7, align: 'center' })
      .setOrigin(0.5)
      .setVisible(false);
    // Dev uniquement : le menu Réglages, les panneaux et les visionneuses n'existent pas dans le build Poki.
    if (DEV_TOOLS) {
      this.debugBtn = this.makeDebugButton();
      this.panelBtns = [
        makeSquareButton(this, iconCrowd, () => this.game_.toggleCrowdPanel()),
        makeSquareButton(this, iconCheat, () => this.game_.toggleCheatPanel()),
      ];
      this.viewerBtns = VIEWER_BUTTONS.map((b) => makeSquareButton(this, b.icon, () => this.game_.openViewer(b.scene), VIEW_BORDER));
    }
    this.applyDebugMode();
    this.timeline = new TimelineHud(this);
    this.reviveLabels = []; // la scène est réutilisée : les anciens textes ont été détruits avec elle
    this.xpFrame = this.add.image(0, 0, 'ui_xp_frame');
    this.xpFill = this.add.nineslice(0, 0, 'ui_xp_fill', undefined, 53, 32, XP_ART.fillCap, XP_ART.fillCap).setOrigin(0, 0.5); // 3-slice : capuchons arrondis, milieu étiré
    this.xpFill.setDepth(this.xpFrame.depth + 0.1);
    this.xpLabel = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '20px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 5 })
      .setOrigin(0.5, 1); // « Niv. X » centré au-dessus de la jauge
    this.bossBanner = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '44px', fontStyle: 'bold', color: '#ff6a4a', stroke: '#2a0a08', strokeThickness: 8, align: 'center' })
      .setOrigin(0.5)
      .setAlpha(0);
    this.bossBar = this.add.graphics(); // bouclier du boss
    this.bossFrame = this.add.image(0, 0, 'ui_boss_frame').setVisible(false);
    this.bossGhost = this.add.nineslice(0, 0, 'ui_boss_fill', undefined, 53, 32, BOSS_ART.fillCap, BOSS_ART.fillCap).setOrigin(0, 0.5).setTint(0xffffff).setTintMode(Phaser.TintModes.FILL).setVisible(false);
    this.bossFill = this.add.nineslice(0, 0, 'ui_boss_fill', undefined, 53, 32, BOSS_ART.fillCap, BOSS_ART.fillCap).setOrigin(0, 0.5).setVisible(false);
    this.bossFrame.setDepth(0);
    this.bossGhost.setDepth(0.1);
    this.bossFill.setDepth(0.2);
    this.bossGhostState = { id: -1, last: 1, ghost: 1, hold: 0, hits: 0 };
    this.xpShown = 0; // la scène est réutilisée à chaque partie
    this.xpLevelSeen = 0;
    this.xpWrap = false;
    this.bossName = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '20px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 5 })
      .setOrigin(0.5);
    this.bossArrow = this.add.graphics();
    this.bossTip = this.add
      .text(0, 0, t('bossTip'), { fontFamily: theme.font, fontSize: '16px', fontStyle: 'bold', color: '#ff6a6a', stroke: '#2a0a08', strokeThickness: 5 })
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.reviveArrow = this.add.graphics();
    // onboarding : flèches vers le point vert / la recrue / le power-up, bulle au-dessus de la flèche, bandeau du haut
    this.tutorialArrow = this.add.graphics();
    this.tutorialLabel = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '22px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 6, padding: { x: 12, y: 6 } }) // fond : rectangle à coins arrondis dessiné dans `tutorialArrow`
      .setOrigin(0.5, 1)
      .setVisible(false);
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
    this.soundBtn = this.makeSoundButton();
    this.musicBtn = this.makeMusicButton();
    this.hint = this.makeHint();
    // dev : des réglages mémorisés dans le navigateur masquaient des valeurs du code qui ont changé ; ils ont été supprimés, on le dit
    if (DEV_TOOLS && staleDropped.length > 0) {
      const note = this.add
        .text(this.scale.width / 2, hudTop() + 96, `Réglages mémorisés périmés supprimés (le code a changé) :
${[...new Set(staleDropped)].join(', ')}`, { fontFamily: theme.font, fontSize: '16px', fontStyle: 'bold', color: '#ffe14a', stroke: '#13233a', strokeThickness: 5, align: 'center' })
        .setOrigin(0.5, 0)
        .setDepth(50);
      this.tweens.add({ targets: note, alpha: 0, delay: 7000, duration: 800, onComplete: () => note.destroy() });
      staleDropped.length = 0;
    }

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout));
    this.layout();
  }

  update(time: number): void {
    if (settings.debugMode !== this.debugShown) {
      this.applyDebugMode();
      this.layout();
    }
    if (this.iconState !== `${settings.sfxOn()}|${settings.musicOn()}`) {
      this.drawSpeaker();
      this.drawNote();
    }
    const aliens = this.game_.session.sim.aliens.length;
    if (aliens !== this.alienShown) {
      this.alienShown = aliens;
      this.alienText.setText(t('aliensCount', { value: aliens }));
    }
    if (time - this.fpsAt > 500) { // le compteur de FPS est toujours affiché
      this.fpsAt = time;
      this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} FPS`);
    }
    const g = this.game_;
    const s = g.session;
    this.roomText.setText(
      !s.online ? '' : s.connection === 'lost' ? t('connectionLost') : t('room', { code: s.roomCode ?? '', players: g.playerCount }),
    );
    this.hostText.setVisible(s.online && s.hostStalled);
    this.pauseBtn.setVisible(!s.online && !s.sim.tutorial?.active); // onboarding : l'interface se limite au strict nécessaire (réaffichée à la fin)
    this.hint.setVisible(g.flow.state === 'ready');
    this.hintLabel.setText(s.sim.tutorial?.active ? (device.isTouch ? t('hintTutoDrag') : t('hintTutoMove', { keys: this.moveKeysText() })) : device.isTouch ? t('hintDrag') : t('hintKeys'));
    this.drawXp();
    this.drawBoss();
    // pendant un combat de boss, sa barre de vie (drawBoss) prend la place de la timeline
    this.timeline.update(this.game_.session.sim, this.endText.visible || !!this.game_.session.sim.tutorial?.active || this.game_.session.sim.aliens.some((a) => a.alive && !!a.def.boss));
    this.drawReviveArrow();
    this.drawTutorial();
    const dead = s.online && s.connection === 'connected' && !g.localSquad?.alive;
    const coop = !g.mode.pvp; // survie à plusieurs : on regarde ses équipiers (en PvP on réapparaît)
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
      // scoreboard sous le texte de fin : aliens tués et dégâts totaux de chaque joueur
      this.endScores?.destroy();
      const g = this.game_;
      this.endScores = buildScoreboard(this, this.scale.width / 2, this.scale.height * 0.4 + 70, scoreRows(g.session.sim.squads, g.session.localPlayer));
    } else if (e.t === 'restart') {
      this.endText.setVisible(false);
      this.endScores?.destroy();
      this.endScores = undefined;
    }
  };

  /** Annonce d'un boss (ou de sa défaite) : gros bandeau au centre qui s'efface. */
  private readonly onBoss = (e: SimEvent): void => {
    if (e.t !== 'boss' && e.t !== 'bossDown' && e.t !== 'bossEnrage') return;
    const name = t(`alien_${e.alien}` as 'alien_boss_crab');
    const text = e.t === 'boss' ? `${t(e.kind === 'final' ? 'bossFinal' : 'bossMini')}\n${name}` : e.t === 'bossEnrage' ? t(e.level > 1 ? 'bossEnraged2' : 'bossEnraged', { name }) : t('bossDown', { name });
    this.tweens.killTweensOf(this.bossBanner);
    this.bossBanner.setText(text).setColor(e.t === 'boss' ? (e.kind === 'final' ? '#ff3a3a' : '#ff9a4a') : e.t === 'bossEnrage' ? '#ff2a1a' : '#8fff9a').setAlpha(1).setScale(1.3);
    this.tweens.add({ targets: this.bossBanner, scale: 1, duration: 220, ease: 'Back.Out' });
    this.tweens.add({ targets: this.bossBanner, alpha: 0, delay: 2600, duration: 700 });
  };

  /** Boss vivant : barre de vie en bas de l'écran, et flèche au bord de l'écran quand il est hors champ. */
  private drawBoss(): void {
    const g = this.game_;
    const boss = g.session.sim.aliens.find((a) => a.alive && a.def.boss);
    this.bossBar.clear();
    this.bossArrow.clear();
    this.bossTip.setVisible(false);
    this.bossName.setVisible(!!boss);
    this.bossFrame.setVisible(!!boss);
    this.bossGhost.setVisible(false);
    this.bossFill.setVisible(!!boss);
    if (!boss) return;
    const { width, height } = this.scale;
    const w = Math.min(364, width - 60); // grosse barre (520 × 0,7), à la place de la timeline (en haut, centrée)
    const k = w / BOSS_ART.W;
    const cx = width / 2;
    const top = hudTop() + 2;
    this.bossFrame.setPosition(cx, top + (BOSS_ART.H / 2) * k).setScale(k);
    this.bossName.setText(t(`alien_${boss.def.id as AlienId}` as 'alien_boss_crab')).setPosition(cx, top + 9 * k); // dans le creux au-dessus de l'ornement central
    // jauges 3-slice dans la zone sombre : la part blanche reste sur la vie d'avant le coup (BAR_GHOST_HOLD s) puis rejoint la rouge, comme sur les barres de vie des aliens
    const ratio = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
    const st = this.bossGhostState;
    const dt = Math.min(0.1, this.game.loop.delta / 1000);
    if (st.id !== boss.id) Object.assign(st, { id: boss.id, last: ratio, ghost: ratio, hold: 0, hits: 0 });
    ghostHit(st, ratio);
    if (ratio >= st.ghost) st.ghost = ratio;
    else if (st.hold > 0) st.hold -= dt;
    else st.ghost = Math.max(ratio, st.ghost - BAR_GHOST_SPEED * dt);
    st.last = ratio;
    const slotW = (BOSS_ART.slotX1 - BOSS_ART.slotX0) * k;
    const kf = (BOSS_ART.slotH * k) / this.bossFill.height;
    const fx = cx + (BOSS_ART.slotX0 - BOSS_ART.W / 2) * k;
    const fy = top + BOSS_ART.slotCy * k;
    const place = (img: Phaser.GameObjects.NineSlice, r: number): void => {
      img.setVisible(r > 0);
      if (r > 0) img.setScale(kf).setPosition(fx, fy).setSize(Math.max(2 * BOSS_ART.fillCap * kf, slotW * r) / kf, img.height);
    };
    place(this.bossFill, ratio);
    if (st.ghost > ratio) {
      place(this.bossGhost, st.ghost);
      this.bossGhost.setVisible(true);
    }
    if (boss.maxShield > 0) {
      // bouclier du boss : fine barre bleue sous le cadre
      const shieldRatio = Math.max(0, boss.shield / boss.maxShield);
      const sy = top + BOSS_ART.bottom * k;
      this.bossBar.fillStyle(0x0a1422, 0.8).fillRoundedRect(fx, sy, slotW, 7, 3);
      if (shieldRatio > 0) this.bossBar.fillStyle(PALETTE.shield, 1).fillRoundedRect(fx + 1.5, sy + 1.5, Math.max(6, (slotW - 3) * shieldRatio), 4, 2);
    }
    this.bossBanner.setPosition(width / 2, height * 0.3);

    // flèche rouge (même gabarit que celle de la zone de réanimation) vers le boss, seulement quand il est hors de l'écran
    const wv = g.cameras.main.worldView;
    const sx = ((boss.x - wv.x) / wv.width) * width;
    const sy = ((boss.y - wv.y) / wv.height) * height;
    const m = 46;
    if (sx > m && sx < width - m && sy > m && sy < height - m) return; // boss à l'écran : pas de flèche
    const ang = Math.atan2(sy - height / 2, sx - width / 2);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const edge = Math.min(c !== 0 ? (width / 2 - m) / Math.abs(c) : Infinity, s !== 0 ? (height / 2 - m) / Math.abs(s) : Infinity);
    const px = width / 2 + c * edge;
    const py = height / 2 + s * edge;
    const pulse = 1 + (0.5 + 0.5 * Math.sin(this.time.now / 170)) * 0.14;
    this.bossArrow.fillStyle(0x2a0a0a, 0.75).fillCircle(px, py, 25 * pulse);
    this.bossArrow.lineStyle(3, BOSS_ARROW_COLOR, 1).strokeCircle(px, py, 25 * pulse);
    this.bossArrow.fillStyle(BOSS_ARROW_COLOR, 1).fillTriangle(
      px + c * 15 + c * 6, py + s * 15 + s * 6,
      px - c * 4 - s * 11, py - s * 4 + c * 11,
      px - c * 4 + s * 11, py - s * 4 - c * 11,
    );
    // tip « BOSS » au-dessus de la flèche (sous elle quand la flèche est tout en haut), gardé dans l'écran
    this.placeOverArrow(this.bossTip.setText(t('bossTip')).setVisible(true), px, py, 30 * pulse);
  }

  /**
   * Bulle ou texte d'une flèche du HUD (boss, équipier à terre, tutoriel) : au-dessus de la flèche (`x`, `y`) à `gap` px ; si elle ne tient
   * pas dans l'écran au-dessus (flèche collée au bord haut), elle passe juste en dessous au lieu de la recouvrir. Gardée dans l'écran
   * horizontalement. Renvoie le haut du texte (pour dessiner un fond).
   */
  private placeOverArrow(txt: Phaser.GameObjects.Text, x: number, y: number, gap: number, margin = 6): number {
    const above = y - gap - txt.height >= margin;
    const half = txt.width / 2 + margin;
    const top = above ? y - gap - txt.height : y + gap;
    txt.setOrigin(0.5, 0).setPosition(Math.max(half, Math.min(this.scale.width - half, x)), top);
    return top;
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
    let shown = 0;
    const label = (px: number, py: number, gap: number): void => {
      let txt = this.reviveLabels[shown];
      if (!txt) {
        txt = this.add
          .text(0, 0, t('allyDown'), { fontFamily: theme.font, fontSize: '18px', fontStyle: 'bold', color: '#5dff84', stroke: '#0a2210', strokeThickness: 5 })
          .setOrigin(0.5, 1);
        this.reviveLabels[shown] = txt;
      }
      this.placeOverArrow(txt.setVisible(true), px, py, gap);
      shown++;
    };
    const hideRest = (): void => this.reviveLabels.slice(shown).forEach((x) => x.setVisible(false));
    if (!me?.alive) return hideRest();
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
      label(px, py, 30 * pulse);
      a.fillStyle(0x0a2210, 0.75).fillCircle(px, py, 25 * pulse);
      a.lineStyle(3, 0x5dff84, 1).strokeCircle(px, py, 25 * pulse);
      a.fillStyle(0x5dff84, 1).fillTriangle(
        px + c * 15 + c * 6, py + s * 15 + s * 6,
        px - c * 4 - s * 11, py - s * 4 + c * 11,
        px - c * 4 + s * 11, py - s * 4 - c * 11,
      );
    }
    hideRest();
  }

  /**
   * Onboarding (voir `sim/Tutorial.ts`) : flèche au bord de l'écran vers chaque cible hors champ ; une recrue / un power-up à l'écran
   * reçoit une flèche qui rebondit au-dessus de lui, avec sa bulle (« Get +1 trooper »). Le point vert à l'écran est dessiné au sol
   * par `WorldView`. Bandeau du haut pour la consigne « ramasse tous les globes ».
   */
  private drawTutorial(): void {
    const g = this.game_;
    const a = this.tutorialArrow;
    a.clear();
    const tut = g.session.sim.tutorial;
    if (!tut?.active) {
      this.tutorialLabel.setVisible(false);
      return;
    }
    const { width, height } = this.scale;
    const wv = g.cameras.main.worldView;
    const beat = 0.5 + 0.5 * Math.sin(this.time.now / 170);
    // bulle : flèche visée (`x`, `y`) et écart ; posée par `placeOverArrow` (au-dessus, ou dessous si la flèche est collée en haut)
    let label: { x: number; y: number; gap: number; text: string } | null = null;
    for (const target of tut.targets()) {
      const sx = ((target.x - wv.x) / wv.width) * width;
      const sy = ((target.y - wv.y) / wv.height) * height;
      const m = 46;
      const inside = sx > m && sx < width - m && sy > m && sy < height - m;
      if (inside && target.kind === 'marker') {
        // le point vert est dessiné au sol (chevron qui rebondit au-dessus, voir WorldView) : « Move here » se pose au-dessus du chevron
        if (target.label && !label) label = { x: sx, y: sy - (44 + 14 + 18) * (width / wv.width), gap: 12 * (width / wv.width), text: t(target.label) };
        continue;
      }
      if (inside && target.kind === 'incoming') continue; // le point vert est dessiné au sol ; les ennemis déjà à l'écran n'ont plus besoin de flèche
      const color = target.kind === 'marker' ? 0x5dff84 : target.kind === 'orbs' ? 0x5ac8ff : target.kind === 'incoming' ? 0xff4040 : 0xffe14a;
      const back = target.kind === 'marker' ? 0x0a2210 : target.kind === 'orbs' ? 0x0a1c2a : target.kind === 'incoming' ? 0x2a0808 : 0x2a2208;
      let px: number;
      let py: number;
      let ang: number;
      if (inside) {
        ang = Math.PI / 2; // pointe vers le bas, vers la cible
        px = sx;
        py = sy - 70 - beat * 14;
      } else {
        ang = Math.atan2(sy - height / 2, sx - width / 2);
        const c0 = Math.cos(ang);
        const s0 = Math.sin(ang);
        const k = Math.min(c0 !== 0 ? (width / 2 - m) / Math.abs(c0) : Infinity, s0 !== 0 ? (height / 2 - m) / Math.abs(s0) : Infinity);
        px = width / 2 + c0 * k;
        py = height / 2 + s0 * k;
      }
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const pulse = 1 + beat * 0.14;
      a.fillStyle(back, 0.75).fillCircle(px, py, 25 * pulse);
      a.lineStyle(3, color, 1).strokeCircle(px, py, 25 * pulse);
      a.fillStyle(color, 1).fillTriangle(
        px + c * 15 + c * 6, py + s * 15 + s * 6,
        px - c * 4 - s * 11, py - s * 4 + c * 11,
        px - c * 4 + s * 11, py - s * 4 - c * 11,
      );
      if (target.label && !label) label = { x: px, y: py, gap: 36 * pulse, text: t(target.label) };
    }
    // bulle de texte au-dessus de la flèche (gardée dans l'écran)
    this.tutorialLabel.setVisible(!!label);
    if (label) {
      this.tutorialLabel.setText(label.text);
      const top = this.placeOverArrow(this.tutorialLabel, label.x, label.y, label.gap, 8);
      // fond de la bulle à coins arrondis (le `backgroundColor` d'un texte Phaser est toujours carré), sous le texte
      const { x, width: w, height: h } = this.tutorialLabel;
      a.fillStyle(0x13233a, 0.8).fillRoundedRect(x - w / 2, top, w, h, Math.min(14, h / 2));
    }
  }

  /** Onboarding : la jauge d'XP n'apparaît qu'à l'étape « ramasse les globes » (vague 2), puis disparaît jusqu'à la fin du tutoriel. */
  private xpShownInTutorial(): boolean {
    const tut = this.game_.session.sim.tutorial;
    return !tut?.active || tut.phase === 'wave2';
  }

  /** Jauge d'XP de la squad locale : niveau à gauche, barre qui se remplit jusqu'à la prochaine upgrade. */
  private drawXp(): void {
    const squad = this.game_.localSquad;
    const on = this.game_.session.sim.xpEnabled && !!squad && this.xpShownInTutorial(); // masquée pendant l'onboarding, sauf à l'étape de collecte des globes
    this.xpFrame.setVisible(on);
    this.xpFill.setVisible(on);
    this.xpLabel.setVisible(on);
    if (!on) return;
    const { x, y, w, k } = xpBarLayout(this.scale.width, this.scale.height); // tout en bas de l'écran
    // progression lissée (rapide : ~0,2 s pour rattraper la vraie) ; au passage de niveau, la jauge finit de se remplir puis repart de zéro
    const target = Math.min(1, squad.xp / squad.xpNeeded);
    if (squad.level !== this.xpLevelSeen) {
      if (this.xpLevelSeen === 0) this.xpShown = target; // première image : pas d'animation
      else this.xpWrap = true;
      this.xpLevelSeen = squad.level;
    }
    const aim = this.xpWrap ? 1 : target;
    this.xpShown += (aim - this.xpShown) * (1 - Math.exp(-14 * Math.min(0.1, this.game.loop.delta / 1000)));
    if (this.xpWrap && this.xpShown > 0.985) {
      this.xpWrap = false;
      this.xpShown = 0;
    }
    const ratio = this.xpShown;
    this.xpFrame.setPosition(x + w / 2, y).setScale(k);
    // jauge bleue : de la gauche de la zone sombre jusqu'à la part d'XP acquise (au moins les deux capuchons arrondis)
    const slotW = (XP_ART.slotX1 - XP_ART.slotX0) * k;
    this.xpFill.setVisible(ratio > 0);
    if (ratio > 0) {
      const kf = (XP_ART.slotH * k) / this.xpFill.height; // l'image fait 32 px de haut : mise à l'échelle de la zone sombre
      this.xpFill.setScale(kf).setPosition(x + w / 2 + (XP_ART.slotX0 - XP_ART.W / 2) * k, y).setSize(Math.max(2 * XP_ART.fillCap * kf, slotW * ratio) / kf, this.xpFill.height);
    }
    this.xpLabel.setText(t('xpLevel', { value: squad.level })).setPosition(x + w / 2, y - (XP_ART.H / 2) * k - 2);
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

  /** Haut-parleur : coupe / rétablit les bruitages (icône barrée quand coupés). */
  private makeSoundButton(): Phaser.GameObjects.Container {
    const b = makeHudButton(this, 44, HUD_ART.sound, () => {
      settings.toggleSfx();
      sfx.setVolume(settings.sfxGain());
      this.drawSpeaker();
    });
    this.soundSlash = b.slash;
    this.drawSpeaker();
    return b.container;
  }

  private drawSpeaker(): void {
    this.soundSlash.setVisible(!settings.sfxOn());
  }

  /** Note de musique : coupe / rétablit la musique (icône barrée quand coupée). */
  private makeMusicButton(): Phaser.GameObjects.Container {
    const b = makeHudButton(this, 44, HUD_ART.music, () => {
      settings.toggleMusic();
      music.setVolume(this.game, settings.musicGain());
      this.drawNote();
    });
    this.musicSlash = b.slash;
    this.drawNote();
    return b.container;
  }

  private drawNote(): void {
    this.musicSlash.setVisible(!settings.musicOn());
    this.iconState = `${settings.sfxOn()}|${settings.musicOn()}`;
  }

  private makePauseButton(): Phaser.GameObjects.Container {
    return makeHudButton(this, 60, HUD_ART.pause, () => this.game_.pauseGame()).container;
  }

  /** « WASD » (ou les touches choisies : « ZQSD », « I / J / K / L »…) pour le texte du tutoriel. */
  private moveKeysText(): string {
    const l = [settings.hotkeys.up, settings.hotkeys.left, settings.hotkeys.down, settings.hotkeys.right].map(keyLabel);
    return l.every((x) => x.length === 1) ? l.join('') : l.join(' / ');
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
        align: 'center',
      })
      .setOrigin(0.5);
    this.hintLabel = label;
    c.add(label);
    if (device.isTouch) {
      const hand = this.add.image(-60, 0, 'hand').setScale(0.8);
      c.add(hand);
      this.tweens.add({ targets: hand, x: 60, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    } else {
      // clavier : vraies touches W / A S D dessinées (une touche s'enfonce à tour de rôle)
      label.setY(96);
      const caps: [string, number, number][] = [[keyLabel(settings.hotkeys.up), 0, -26], [keyLabel(settings.hotkeys.left), -52, 26], [keyLabel(settings.hotkeys.down), 0, 26], [keyLabel(settings.hotkeys.right), 52, 26]]; // touches choisies dans Options > Hotkeys
      caps.forEach(([letter, kx, ky], i) => {
        const key = this.add.container(kx, ky);
        const g = this.add.graphics();
        g.fillStyle(0x0a1422, 0.55).fillRoundedRect(-24, -20, 48, 48, 9); // ombre
        g.fillStyle(0x2a3a52, 1).fillRoundedRect(-24, -24, 48, 48, 9); // flanc de la touche
        g.fillStyle(0xf2f5fa, 1).fillRoundedRect(-22, -24, 44, 42, 8); // dessus
        g.lineStyle(2, 0x13233a, 1).strokeRoundedRect(-22, -24, 44, 42, 8);
        const txt = this.add.text(0, -3, letter, { fontFamily: theme.font, fontSize: '26px', fontStyle: 'bold', color: '#13233a' }).setOrigin(0.5);
        key.add([g, txt]);
        c.add(key);
        // à tour de rôle, la touche s'enfonce de quelques pixels
        // ordre W → A → S → D (haut, gauche, bas, droite = sens anti-horaire) ; chaque touche se relève avant que la suivante s'enfonce, le cycle boucle régulièrement
        const press = 110 * 2 + 60;
        this.tweens.add({ targets: key, y: ky + 5, duration: 110, yoyo: true, delay: i * KEY_STEP, hold: 60, repeatDelay: 4 * KEY_STEP - press, repeat: -1 });
      });
    }
    return c;
  }

  private readonly layout = (): void => {
    const { width, height } = this.scale;
    // Décalé sous la pill Poki sur mobile
    const top = device.isTouch ? 70 : 12;
    // haut gauche : son, puis la musique en dessous ; le code de salle se place à droite du bouton son
    this.soundBtn.setPosition(14 + 22, top + 22);
    this.musicBtn.setPosition(14 + 22, top + 22 + 44 + 8); // la musique juste en dessous du son
    this.roomText.setPosition(14 + 44 + 8 + 10, top + 10);
    this.fpsText.setOrigin(1, 1).setPosition(width - 14, height - 12); // compteur de FPS en bas à droite
    this.alienText.setOrigin(1, 1).setPosition(width - 14, height - 34); // nombre d'aliens juste au-dessus
    // boutons de dev en bas à gauche, en colonne (le premier tout en bas, les suivants au-dessus)
    const bottomY = height - 14 - 22;
    const devBtns = [...(this.debugBtn ? [this.debugBtn] : []), ...this.panelBtns, ...this.viewerBtns];
    devBtns.forEach((b, i) => b.setPosition(14 + 22, bottomY - i * (44 + 8)));
    this.pauseBtn.setPosition(width - 44, top + 34);
    this.hint.setPosition(width / 2, height * 0.62);
    this.respawnText.setPosition(width / 2, height * 0.22);
    this.hostText.setPosition(width / 2, height * 0.34);
    this.endText.setPosition(width / 2, height * 0.4);
  };
}
