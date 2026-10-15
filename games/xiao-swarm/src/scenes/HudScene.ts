import Phaser from 'phaser';
import { playSfx } from '../playSfx';
import { teleColor } from '../view/telegraph';
import { latePack } from '../assets/latePack';
import { Button, device, music, sfx, theme, toggleDevLog, DEV_TOOLS } from '@xiao/engine';
import { PALETTE, SCENES } from '../config';
import type { AlienId } from '../data/aliens';
import { defaultMoveLabels } from '../hotkeys';
import { DIFFICULTY_LABEL_KEYS, DIFFICULTY_LEVELS, type DifficultyLevel } from '../data/difficultyLevels';
import { t } from '../i18n';
import { settings } from '../settings';
import type { SimEvent } from '../sim/types';
import { BOSS_ART, hudTop, XP_ART, xpBarLayout } from '../view/hudLayout';
import { BAR_GHOST_SPEED, ghostHit, type BarGhost } from '../view/WorldView';
import { HUD_ART, makeHudButton } from '../view/HudButtons';
import { TimelineHud, timelineBottom } from '../view/TimelineHud';
import { UPGRADE_PINK } from '../view/GlobeGlitter';
import { staleDropped } from '../dev/staleOverrides';
import { buildScoreboard, scoreRows } from '../view/Scoreboard';
import { iconCheat, iconCrowd, iconDifficulty, iconLog, makeSquareButton, VIEW_BORDER, VIEWER_BUTTONS } from '../dev/hudButtons';
import type { GameScene } from './GameScene';
import { fallbackSeen } from '../fallbackEvents';

/** Flèche de boss hors écran : toujours rouge (comme la flèche de réanimation, verte, a la sienne). */
/** Rouge des flèches rouges du HUD (boss, ennemis qui arrivent) : celui des télégraphes d'attaque (`FX.telegraph`, réglable dans la visionneuse de particules). */
const redArrow = (): number => teleColor('rush');
const redArrowCss = (): string => `#${redArrow().toString(16).padStart(6, '0')}`;
/** Profondeur des flèches de signalisation et de leurs textes : au-dessus des barres du haut (boss, timeline, XP). */
const ARROW_DEPTH = 20;
/** Taille des flèches de signalisation (1 = gabarit d'origine de « Ally down » ; 0,8 depuis le 12/10 : 20 % plus petites). */
const ARROW_SIZE = 0.8;
/** Réglage fin du centrage du triangle dans la pastille (px à ARROW_SIZE 1, le long de la flèche) : + = vers la pointe, − = vers l'arrière ; 0 = centré sur sa longueur. */
/** Hauteur (px) réservée au titre du boss au-dessus de sa barre de vie. */
const BOSS_NAME_H = 22; // 30 avant le 13/10 : le titre est plus près de la barre
/** Décalage vertical (px, + = vers le bas) du titre dans cette zone : le texte se pose juste au-dessus du cadre de la barre. */
const BOSS_NAME_DY = 9; // 4 puis +5 px : le titre se rapproche encore de la barre
const ARROW_CENTER_OFFSET = 5;
/** Épaisseur (px à ARROW_SIZE 1) du contour noir du triangle ; la moitié dépasse du remplissage. */
const ARROW_OUTLINE = 6;

/**
 * Flèche de signalisation commune (boss, œuf / dé / globes d'upgrade, équipier à terre, tutoriel) : disque sombre cerclé de `color`, triangle qui pointe vers (`dirX`, `dirY`),
 * pouls (+20 %) et deux ondes qui partent de la flèche en s'effaçant, pour attirer l'œil (`animate` = false : ni pouls ni ondes, pour les flèches posées sur une cible à l'écran). Renvoie le facteur de pouls (à appliquer à l'écart du texte posé dessus).
 */
function drawSignalArrow(g: Phaser.GameObjects.Graphics, px: number, py: number, dirX: number, dirY: number, color: number, back: number, now: number, animate = true): number {
  const pulse = animate ? 1 + (0.5 + 0.5 * Math.sin(now / 170)) * 0.2 : 1;
  for (let k = 0; k < (animate ? 2 : 0); k++) {
    const w = (now / 1000 + k * 0.5) % 1;
    g.lineStyle(4 * ARROW_SIZE, color, 0.8 * (1 - w)).strokeCircle(px, py, (35 + 52 * w) * ARROW_SIZE);
  }
  g.fillStyle(back, 0.8).fillCircle(px, py, 35 * pulse * ARROW_SIZE);
  g.lineStyle(4 * ARROW_SIZE, color, 1).strokeCircle(px, py, 35 * pulse * ARROW_SIZE);
  const k = ARROW_SIZE;
  // triangle CENTRÉ dans la pastille : sa pointe est à +29 (× pouls), sa base à −6 ; on décale tout de la moitié de sa longueur le long de la flèche
  const mid = ((29 * pulse - 6) / 2 - ARROW_CENTER_OFFSET) * k;
  const cx = px - dirX * mid;
  const cy = py - dirY * mid;
  const tip: [number, number] = [cx + dirX * 29 * pulse * k, cy + dirY * 29 * pulse * k];
  const left: [number, number] = [cx - dirX * 6 * k - dirY * 15 * k, cy - dirY * 6 * k + dirX * 15 * k];
  const right: [number, number] = [cx - dirX * 6 * k + dirY * 15 * k, cy - dirY * 6 * k - dirX * 15 * k];
  g.lineStyle(ARROW_OUTLINE * k, 0x000000, 1).strokeTriangle(...tip, ...left, ...right); // contour noir (tracé d'abord : seule sa moitié extérieure reste visible)
  g.fillStyle(color, 1).fillTriangle(...tip, ...left, ...right);
  return pulse;
}

/** Délai (ms) entre deux touches W A S D de l'aide de déplacement. */
const KEY_STEP = 300;
/** Tracé de la main du tutoriel « glisse » : un 8 couché de demi-largeur `width` et de demi-hauteur `height` (px). */
const HAND_EIGHT = { width: 70, height: 18 };

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
  /** Les trois boutons de niveau (Normal / Expert / Impossible), en colonne à droite de l'écran d'arrivée : visibles tant que le joueur n'a pas bougé. Seul Normal est actif pour l'instant. */
  private modeButtons!: Phaser.GameObjects.Container;
  /** Niveau dont les boutons sont dessinés (pour les reconstruire quand il change). */
  private modeShown: DifficultyLevel | null = null;
  private hintLabel!: Phaser.GameObjects.Text;
  private latePackAsked = false;
  /** Entrée des barres du haut (timeline) et du bas (XP) : 0 = hors de l'écran, 1 = en place. Cachées tant que le joueur n'a pas commencé, puis elles glissent (Quad.Out). */
  private barsSlide = 0;
  private barsShown = false;
  private barsTween?: Phaser.Tweens.Tween;
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
  /** Niveau de difficulté de la run (Normal / Expert / Impossible), en bas à droite au-dessus du nombre d'aliens. */
  private levelText!: Phaser.GameObjects.Text;
  private levelShown: DifficultyLevel | null = null;
  /** Timeline des vagues et « Next boss » (haut centre). */
  private timeline?: TimelineHud; // timeline et barre de vie du boss : images du paquet 2, construites à son arrivée (`buildBars`) ; la barre d'XP est au paquet 1 (`buildXpBar`)
  /** Barre d'XP en bas de l'écran (hors ligne). */
  private xpFrame?: Phaser.GameObjects.Image;
  private xpFill?: Phaser.GameObjects.NineSlice;
  private xpLabel?: Phaser.GameObjects.Text;
  /** Part d'XP affichée (rattrape la vraie en ~0,2 s), niveau vu pour animer le passage de niveau (la jauge finit de se remplir puis repart de 0). */
  private xpShown = 0;
  private xpLevelSeen = 0;
  private xpWrap = false;
  /** Boss : bandeau d'annonce, barre de vie en haut et flèche vers le boss hors écran. */
  private bossBanner!: Phaser.GameObjects.Text;
  /** Barre de vie du boss : cadre, part blanche (la vie d'avant le coup, qui rejoint la rouge) puis jauge rouge ; état de la part blanche. */
  private bossFrame?: Phaser.GameObjects.Image; // images du paquet 2 : construites avec les barres (`buildBars`)
  private bossGhost?: Phaser.GameObjects.NineSlice;
  private bossFill?: Phaser.GameObjects.NineSlice;
  private bossGhostState: BarGhost & { id: number } = { id: -1, last: 1, ghost: 1, hold: 0, hits: 0 };
  /** Rhinos jumeaux vus (id → PV max, PV, nom) : la barre cumulée garde le maximum et le nom de celui déjà tombé. */
  private twinSeen = new Map<number, { max: number; hp: number; name: string }>();
  private bossName!: Phaser.GameObjects.Text;
  private tutorialArrow!: Phaser.GameObjects.Graphics;
  private tutorialLabel!: Phaser.GameObjects.Text;
  private bossArrow!: Phaser.GameObjects.Graphics;
  private bossTip!: Phaser.GameObjects.Text;
  /** Flèche verte vers la zone de réanimation d'un équipier mort (au bord de l'écran si la zone est hors champ, sinon au-dessus d'elle). */
  private reviveArrow!: Phaser.GameObjects.Graphics;
  /** Flèches roses vers les globes d'upgrade du joueur local hors de l'écran (`drawUpgradeOrbArrows`). */
  private orbArrow!: Phaser.GameObjects.Graphics;
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
    this.levelText = this.add.text(0, 0, '', { fontFamily: theme.font, fontSize: '16px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 4 });
    this.levelShown = null;
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
        makeSquareButton(this, iconDifficulty, () => this.game_.toggleDifficultyPanel()),
        makeSquareButton(this, iconLog, () => toggleDevLog()), // console de log en jeu (aussi F4)
      ];
      this.viewerBtns = VIEWER_BUTTONS.map((b) => makeSquareButton(this, b.icon, () => this.game_.openViewer(b.scene), VIEW_BORDER));
    }
    this.applyDebugMode();
    this.timeline = undefined; // la scène est réutilisée : les barres sont reconstruites (les anciens objets ont été détruits avec elle)
    this.xpFrame = this.xpFill = this.xpLabel = undefined;
    this.bossFrame = this.bossGhost = this.bossFill = undefined;
    this.reviveLabels = [];
    this.buildXpBar(); // images du paquet 1 : la barre d'XP existe dès le départ
    if (latePack.ready || this.textures.exists('ui_tl_frame')) this.buildBars(true); // paquet 2 déjà là (debug, en ligne, ?jump…), sinon construites à l'arrivée du paquet 2a (aucun repli d'image) : `create` n'est pas encore « actif » (`sys.isActive`)
    else {
      const off = latePack.onReady(() => this.buildBars());
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    }
    this.bossBanner = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '44px', fontStyle: 'bold', color: '#ff6a4a', stroke: '#2a0a08', strokeThickness: 8, align: 'center' })
      .setOrigin(0.5)
      .setAlpha(0);
    this.bossGhostState = { id: -1, last: 1, ghost: 1, hold: 0, hits: 0 };
    this.xpShown = 0; // la scène est réutilisée à chaque partie
    this.xpLevelSeen = 0;
    this.xpWrap = false;
    this.bossName = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '22px', fontStyle: 'bold', color: '#ffc83d', stroke: '#000000', strokeThickness: 5 }) // jaune, contour noir (celui du bouton principal)
      .setOrigin(0.5)
      .setDepth(0.3); // titre du boss, au-dessus de sa barre de vie
    // flèches de signalisation hors champ : au-dessus de toute l'interface du haut (barre de vie du boss comprise, profondeurs 0 à 0,3)
    this.bossArrow = this.add.graphics().setDepth(ARROW_DEPTH);
    this.bossTip = this.add
      .text(0, 0, t('bossTip'), { fontFamily: theme.font, fontSize: '24px', fontStyle: 'bold', color: '#ff6a6a', stroke: '#2a0a08', strokeThickness: 7 })
      .setOrigin(0.5, 1)
      .setDepth(ARROW_DEPTH + 1)
      .setVisible(false);
    this.reviveArrow = this.add.graphics().setDepth(ARROW_DEPTH);
    this.orbArrow = this.add.graphics().setDepth(ARROW_DEPTH);
    // onboarding : flèches vers le point vert / la recrue / le power-up, bulle au-dessus de la flèche, bandeau du haut
    this.tutorialArrow = this.add.graphics().setDepth(ARROW_DEPTH);
    this.tutorialLabel = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '26px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 7, padding: { x: 14, y: 7 } }) // fond : rectangle à coins arrondis dessiné dans `tutorialArrow`
      .setOrigin(0.5, 1)
      .setDepth(ARROW_DEPTH + 1)
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
    this.modeButtons = this.makeModeButtons();
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
    const level = this.game_.session.sim.difficulty;
    if (level !== this.levelShown) {
      // le niveau peut encore changer avant le départ de la run (boutons de l'écran d'accueil) ; couleurs des boutons : jaune / orange / rouge
      this.levelShown = level;
      this.levelText.setText(t(DIFFICULTY_LABEL_KEYS[level])).setColor(level === 'expert' ? '#ffb347' : level === 'impossible' ? '#ff6a6a' : '#ffe14a');
    }
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
      !s.online ? '' : s.connection === 'lost' ? t('connectionLost') : `${t('room', { code: s.roomCode ?? '', players: g.playerCount })} · ${t(DIFFICULTY_LABEL_KEYS[s.sim.difficulty])}`, // le niveau de la room, visible de tous les joueurs
    );
    this.hostText.setVisible(s.online && s.hostStalled);
    this.pauseBtn.setVisible(!s.online && !s.sim.tutorial?.active); // onboarding : l'interface se limite au strict nécessaire (réaffichée à la fin)
    if (g.flow.state !== 'ready' && !latePack.ready) fallbackSeen('other'); // analytics : partie lancée sans timeline (paquet 2a pas arrivé)
    this.hint.setVisible(g.flow.state === 'ready');
    this.refreshModeButtons();
    this.modeButtons.setVisible(g.flow.state === 'ready' && s.isHost && !s.sim.tutorial?.active); // écran d'accueil, pour qui choisit le niveau (solo ou hôte), hors onboarding : un joueur qui rejoint ne les voit pas
    if (!this.latePackAsked && g.flow.state === 'ready') {
      // paquet 2 des visuels : chargé dès que le joueur est sur la scène de jeu avec l'indice des commandes affiché (pas pendant l'écran de choix d'upgrade)
      this.latePackAsked = true;
      this.time.delayedCall(300, () => latePack.ensure(g));
    }
    this.hintLabel.setText(s.sim.tutorial?.active && device.isTouch ? t('hintTutoDrag') : // tutoriel mobile : « Drag to move » ; sur ordinateur, « Move your squad » sous les touches (tutoriel compris)
       device.isTouch ? t('hintDrag') : t('hintKeys'));
    this.updateBarsSlide(g.flow.state !== 'ready' && !!this.timeline); // le glissement attend que les barres existent (paquet 2)
    this.drawXp();
    this.drawBoss();
    // pendant un combat de boss, sa barre de vie (drawBoss) prend la place de la timeline
    this.timeline?.update(this.game_.session.sim, this.endText.visible || !!this.game_.session.sim.tutorial?.active || this.game_.session.sim.aliens.some((a) => a.alive && !!a.def.boss), -(1 - this.barsSlide) * (timelineBottom(this.scale.width) + 20));
    this.drawReviveArrow();
    this.drawUpgradeOrbArrows();
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

  /** Bandeau des boss : centré, monté d'un tiers de demi-écran (`height / 6`) pour dégager la squad. */
  private placeBossBanner(): void {
    this.bossBanner?.setPosition(this.scale.width / 2, this.scale.height / 2 - this.scale.height / 6);
  }

  /** Annonce d'un boss (ou de sa défaite) : gros bandeau au centre qui s'efface. */
  private readonly onBoss = (e: SimEvent): void => {
    if (e.t !== 'boss' && e.t !== 'bossDown' && e.t !== 'bossEnrage') return;
    const name = t(`alien_${e.alien}` as 'alien_boss_crab');
    const text = e.t === 'boss' ? `${t(e.kind === 'final' ? 'bossFinal' : 'bossMini')}\n${name}` : e.t === 'bossEnrage' ? t(e.level > 1 ? 'bossEnraged2' : 'bossEnraged', { name }) : t('bossDown', { name });
    playSfx(this, e.t === 'boss' ? 'boss_arrive' : e.t === 'bossEnrage' ? 'boss_enrage' : 'boss_down');
    this.tweens.killTweensOf(this.bossBanner);
    this.placeBossBanner(); // boss vivant ou non (« boss tué » arrive quand il n'y en a plus)
    this.bossBanner.setText(text).setColor(e.t === 'boss' ? (e.kind === 'final' ? '#ff3a3a' : '#ff9a4a') : e.t === 'bossEnrage' ? '#ff2a1a' : '#8fff9a').setAlpha(1).setScale(1.3);
    this.tweens.add({ targets: this.bossBanner, scale: 1, duration: 220, ease: 'Back.Out' });
    this.tweens.add({ targets: this.bossBanner, alpha: 0, delay: 2600, duration: 700 });
  };

  /** Boss vivant : barre de vie en bas de l'écran, et flèche au bord de l'écran quand il est hors champ. */
  private drawBoss(): void {
    const g = this.game_;
    const boss = g.session.sim.aliens.find((a) => a.alive && a.def.boss);
    this.bossArrow.clear();
    this.bossTip.setVisible(false);
    this.bossName.setVisible(!!boss);
    this.bossFrame?.setVisible(!!boss);
    this.bossGhost?.setVisible(false);
    this.bossFill?.setVisible(!!boss);
    if (!boss) this.twinSeen.clear();
    if (!boss || !this.bossFrame || !this.bossGhost || !this.bossFill) return;
    const { width, height } = this.scale;
    const w = Math.min(364, width - 60); // grosse barre (520 × 0,7), à la place de la timeline (en haut, centrée)
    const k = w / BOSS_ART.W;
    const cx = width / 2;
    const top = hudTop() + 2 + BOSS_NAME_H; // la barre descend d'une ligne : le titre du boss est au-dessus
    this.bossFrame.setPosition(cx, top + (BOSS_ART.H / 2) * k).setScale(k);
    // Rhinos jumeaux : UNE barre qui cumule les PV des deux (celui déjà tombé compte à 0, son maximum reste dans le total) et leurs deux noms
    let name = t(`alien_${boss.def.id as AlienId}` as 'alien_boss_crab');
    let hp = boss.hp;
    let maxHp = boss.maxHp;
    let groupId = boss.id;
    if (boss.def.boss?.twin) {
      for (const s of this.twinSeen.values()) s.hp = 0; // celui qui n'est plus vivant compte à 0
      for (const a of g.session.sim.aliens) if (a.alive && a.def.boss?.twin) this.twinSeen.set(a.id, { max: a.maxHp, hp: a.hp, name: t(`alien_${a.def.id as AlienId}` as 'alien_boss_crab') });
      hp = maxHp = 0;
      const names: string[] = [];
      for (const s of this.twinSeen.values()) {
        hp += s.hp;
        maxHp += s.max;
        names.push(s.name);
      }
      name = names.join(' & ');
      groupId = -2; // même état de la part blanche tant que les jumeaux sont là (elle ne repart pas à 100 % quand le premier tombe)
    } else this.twinSeen.clear();
    this.bossName.setText(name).setPosition(cx, hudTop() + 2 + BOSS_NAME_H / 2 + BOSS_NAME_DY); // titre du boss AU-DESSUS de sa barre de vie
    // jauges 3-slice dans la zone sombre : la part blanche reste sur la vie d'avant le coup (BAR_GHOST_HOLD s) puis rejoint la rouge, comme sur les barres de vie des aliens
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    const st = this.bossGhostState;
    const dt = Math.min(0.1, this.game.loop.delta / 1000);
    if (st.id !== groupId) Object.assign(st, { id: groupId, last: ratio, ghost: ratio, hold: 0, hits: 0 });
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
    // pas de barre de bouclier sous la grosse barre de vie (13/10) : le bouclier du boss reste visible au-dessus du boss lui-même
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
    const pulse = drawSignalArrow(this.bossArrow, px, py, c, s, redArrow(), 0x2a0a0a, this.time.now);
    // tip « BOSS » au-dessus de la flèche (sous elle quand la flèche est tout en haut), gardé dans l'écran
    this.placeOverArrow(this.bossTip.setText(t('bossTip')).setColor(redArrowCss()).setScale(1 + (pulse - 1) * 0.5).setVisible(true), px, py, 46 * ARROW_SIZE * pulse);
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
   * Flèche rose (même gabarit que celle du boss) au bord de l'écran vers chaque globe d'upgrade du joueur local hors champ, chaque œuf de boss
   * (qui libère des globes d'upgrade) et chaque dé de relance au sol : ces objets n'expirent jamais, la flèche évite de les oublier.
   */
  private drawUpgradeOrbArrows(): void {
    const g = this.game_;
    const a = this.orbArrow;
    a.clear();
    const me = g.localSquad;
    if (!me?.alive) return;
    const { width, height } = this.scale;
    const wv = g.cameras.main.worldView;
    const m = 46;
    const sim = g.session.sim;
    const targets: { x: number; y: number; gold?: boolean }[] = [];
    for (const o of sim.upgradeOrbs.items) if (o.owner === me.owner) targets.push(o);
    for (const e of sim.aliens) if (e.alive && e.def.egg) targets.push(e); // œuf d'un boss tué
    for (const p of sim.powerups.items) {
      if (p.kind === 'reroll') targets.push(p); // dé de relance
      else if (p.kind === 'prism') targets.push({ x: p.x, y: p.y, gold: true }); // booster prismatique : flèche dorée
    }
    for (const o of targets) {
      const sx = ((o.x - wv.x) / wv.width) * width;
      const sy = ((o.y - wv.y) / wv.height) * height;
      if (sx > m && sx < width - m && sy > m && sy < height - m) continue; // à l'écran : pas de flèche
      const ang = Math.atan2(sy - height / 2, sx - width / 2);
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const edge = Math.min(c !== 0 ? (width / 2 - m) / Math.abs(c) : Infinity, s !== 0 ? (height / 2 - m) / Math.abs(s) : Infinity);
      const px = width / 2 + c * edge;
      const py = height / 2 + s * edge;
      if (o.gold) drawSignalArrow(a, px, py, c, s, 0xffd24a, 0x2a2208, this.time.now);
      else drawSignalArrow(a, px, py, c, s, UPGRADE_PINK, 0x2a0a22, this.time.now);
    }
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
    const beat = 0.5 + 0.5 * Math.sin(this.time.now / 170);
    const label = (px: number, py: number, gap: number): void => {
      let txt = this.reviveLabels[shown];
      if (!txt) {
        txt = this.add
          .text(0, 0, t('allyDown'), { fontFamily: theme.font, fontSize: '26px', fontStyle: 'bold', color: '#5dff84', stroke: '#0a2210', strokeThickness: 7 })
          .setOrigin(0.5, 1)
          .setDepth(ARROW_DEPTH + 1);
        this.reviveLabels[shown] = txt;
      }
      txt.setScale(1 + beat * 0.1); // le texte « bat » avec la flèche
      this.placeOverArrow(txt.setVisible(true), px, py, gap);
      shown++;
    };
    const hideRest = (): void => this.reviveLabels.slice(shown).forEach((x) => x.setVisible(false));
    if (!me?.alive) return hideRest();
    const { width, height } = this.scale;
    const cam = g.cameras.main;
    const wv = cam.worldView;
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
        py = sy - 92 - beat * 24; // rebondit plus haut au-dessus de la zone
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
      label(px, py, 46 * ARROW_SIZE * drawSignalArrow(a, px, py, c, s, 0x5dff84, 0x0a2210, this.time.now));
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
      const color = target.kind === 'marker' || target.kind === 'powerup' ? 0x5dff84 : target.kind === 'orbs' ? 0x5ac8ff : target.kind === 'incoming' ? redArrow() : 0xffe14a;
      const back = target.kind === 'marker' || target.kind === 'powerup' ? 0x0a2210 : target.kind === 'orbs' ? 0x0a1c2a : target.kind === 'incoming' ? 0x2a0808 : 0x2a2208;
      let px: number;
      let py: number;
      let ang: number;
      if (inside) {
        ang = Math.PI / 2; // pointe vers le bas, vers la cible
        px = sx;
        py = sy - 92 - beat * 24; // rebondit plus haut au-dessus de la cible
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
      const pulse = drawSignalArrow(a, px, py, c, s, color, back, this.time.now, !inside); // à l'écran : flèche fixe (elle rebondit seulement), sans pouls ni ondes
      if (target.label && !label) label = { x: px, y: py, gap: 50 * ARROW_SIZE * pulse, text: t(target.label) };
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

  /** Barre d'XP (images du paquet 1, depuis le 15/10) : construite à la création de la scène. */
  private buildXpBar(): void {
    this.xpFrame = this.add.image(0, 0, 'ui_xp_frame');
    this.xpFill = this.add.nineslice(0, 0, 'ui_xp_fill', undefined, 53, 32, XP_ART.fillCap, XP_ART.fillCap).setOrigin(0, 0.5); // 3-slice : capuchons arrondis, milieu étiré
    this.xpFill.setDepth(this.xpFrame.depth + 0.1);
    this.xpLabel = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '20px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 5 })
      .setOrigin(0.5, 1); // « Niv. X » centré au-dessus de la jauge
  }

  /** Timeline et barre de vie du boss (images du paquet 2) : construites dès que le paquet est là ; d'ici là elles n'existent pas (et restent cachées hors de l'écran). */
  private buildBars(creating = false): void {
    if (this.timeline || (!creating && !this.sys.isActive())) return; // à l'arrivée tardive du paquet : seulement si la scène tourne encore
    this.timeline = new TimelineHud(this);
    this.bossFrame = this.add.image(0, 0, 'ui_boss_frame').setVisible(false);
    this.bossGhost = this.add.nineslice(0, 0, 'ui_boss_fill', undefined, 53, 32, BOSS_ART.fillCap, BOSS_ART.fillCap).setOrigin(0, 0.5).setTint(0xffffff).setTintMode(Phaser.TintModes.FILL).setVisible(false);
    this.bossFill = this.add.nineslice(0, 0, 'ui_boss_fill', undefined, 53, 32, BOSS_ART.fillCap, BOSS_ART.fillCap).setOrigin(0, 0.5).setVisible(false);
    this.bossFrame.setDepth(0);
    this.bossGhost.setDepth(0.1);
    this.bossFill.setDepth(0.2);
  }

  /** Au début de la partie les barres sont hors de l'écran ; au premier input du joueur (`playing`) elles glissent à leur place (Quad.Out) ; au retour à l'attente (relance) elles repartent cachées. */
  private updateBarsSlide(playing: boolean): void {
    if (playing === this.barsShown) return;
    this.barsShown = playing;
    this.barsTween?.stop();
    if (!playing) {
      this.barsSlide = 0;
      return;
    }
    const state = { v: this.barsSlide };
    this.barsTween = this.tweens.add({ targets: state, v: 1, duration: 700, ease: 'Quad.Out', onUpdate: () => (this.barsSlide = state.v), onComplete: () => (this.barsSlide = 1) });
  }

  /** Jauge d'XP de la squad locale : niveau à gauche, barre qui se remplit jusqu'à la prochaine upgrade. */
  private drawXp(): void {
    const squad = this.game_.localSquad;
    const on = this.game_.session.sim.xpEnabled && !!squad && this.xpShownInTutorial(); // masquée pendant l'onboarding, sauf à l'étape de collecte des globes
    if (!this.xpFrame || !this.xpFill || !this.xpLabel) return;
    this.xpFrame.setVisible(on);
    this.xpFill.setVisible(on);
    this.xpLabel.setVisible(on);
    if (!on) return;
    const { x, y: y0, w, k } = xpBarLayout(this.scale.width, this.scale.height); // tout en bas de l'écran
    const y = y0 + (1 - this.barsSlide) * ((XP_ART.H + 40) * k + 40); // glissement d'entrée : sous le bord bas de l'écran tant que barsSlide < 1
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

  /**
   * Boutons Normal / Expert / Impossible (colonne à droite de l'écran d'accueil) : choisissent le niveau de difficulté de la run. Le niveau en cours est plein (jaune / orange / rouge), les autres
   * sont discrets. Le choix est mémorisé (`settings.difficulty`) : la run suivante démarre dans ce niveau ; en ligne, l'hôte l'annonce à tous les joueurs (`Session.setDifficulty`).
   * Reconstruits quand le niveau change (`refreshModeButtons`).
   */
  private makeModeButtons(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    this.modeShown = null;
    return c;
  }

  private refreshModeButtons(): void {
    const level = this.game_.session.sim.difficulty;
    if (level === this.modeShown) return;
    this.modeShown = level;
    for (const b of this.modeButtons.list.slice()) b.destroy();
    const fills: Record<DifficultyLevel, number | undefined> = { normal: undefined, expert: 0xe8892b, impossible: 0xc63b3b };
    DIFFICULTY_LEVELS.forEach((l, i) => {
      const on = l === level;
      const b = new Button(this, 0, (i - 1) * 74, {
        label: t(DIFFICULTY_LABEL_KEYS[l]),
        variant: on ? 'primary' : 'secondary',
        fill: on ? fills[l] : undefined,
        textColor: on && fills[l] !== undefined ? '#ffffff' : undefined,
        width: 210,
        height: 58,
        onClick: () => {
          if (l === this.game_.session.sim.difficulty) return;
          settings.setDifficulty(l); // mémorisé : la prochaine run démarre dans ce niveau
          this.game_.session.setDifficulty(l);
        },
      });
      this.modeButtons.add(b);
    });
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
      // la main dessine un 8 couché (∞, lemniscate de Gerono : x = a·sin t, y = b·sin 2t) : le geste du joystick, dans toutes les directions
      this.tweens.addCounter({
        from: 0,
        to: Math.PI * 2,
        duration: 2800,
        repeat: -1,
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          hand.setPosition(HAND_EIGHT.width * Math.sin(t), HAND_EIGHT.height * Math.sin(2 * t));
        },
      });
    } else {
      // clavier : vraies touches (image `ui_key`) avec la lettre dessinée (`ui_key_<lettre>`) : toujours WASD ou ZQSD selon le clavier, quelles que soient les touches choisies dans Options ; une touche s'enfonce à tour de rôle
      label.setY(152); // sous les touches (descendues de 40 px, texte compris)
      const [up, left, down, right] = defaultMoveLabels();
      const caps: [string, number, number][] = [[up, 0, 10], [left, -65, 70], [down, 0, 70], [right, 65, 70]];
      caps.forEach(([letter, kx, ky], i) => {
        const key = this.add.container(kx, ky);
        const face = this.textures.exists(`ui_key_${letter}`)
          ? this.add.image(0, -6, `ui_key_${letter}`)
          : this.add.text(0, -6, letter, { fontFamily: theme.font, fontSize: '26px', fontStyle: 'bold', color: '#ffffff', stroke: '#0c2f66', strokeThickness: 5 }).setOrigin(0.5);
        key.add([this.add.image(0, 0, 'ui_key'), face]);
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
    this.placeBossBanner();
    const { width, height } = this.scale;
    // Décalé sous la pill Poki sur mobile
    const top = device.isTouch ? 70 : 12;
    // haut gauche : son, puis la musique en dessous ; le code de salle se place à droite du bouton son
    this.soundBtn.setPosition(14 + 22, top + 22);
    this.musicBtn.setPosition(14 + 22, top + 22 + 44 + 8); // la musique juste en dessous du son
    this.roomText.setPosition(14 + 44 + 8 + 10, top + 10);
    this.fpsText.setOrigin(1, 1).setPosition(width - 14, height - 12); // compteur de FPS en bas à droite
    this.alienText.setOrigin(1, 1).setPosition(width - 14, height - 34); // nombre d'aliens juste au-dessus
    this.levelText.setOrigin(1, 1).setPosition(width - 14, height - 56); // niveau de difficulté au-dessus du nombre d'aliens
    // boutons de dev en bas à gauche, en colonne (le premier tout en bas, les suivants au-dessus)
    const bottomY = height - 14 - 22;
    const devBtns = [...(this.debugBtn ? [this.debugBtn] : []), ...this.panelBtns, ...this.viewerBtns];
    // la colonne passe à la suivante (vers la droite) quand elle atteindrait les boutons de son / musique du haut (écran bas)
    const rows = Math.max(1, Math.floor((bottomY - (top + 22 + 44 + 8 + 44)) / (44 + 8)) + 1);
    devBtns.forEach((b, i) => b.setPosition(14 + 22 + Math.floor(i / rows) * (44 + 8), bottomY - (i % rows) * (44 + 8)));
    this.pauseBtn.setPosition(width - 44, top + 34);
    this.hint.setPosition(width / 2, height * 0.62);
    this.modeButtons.setPosition(width - 14 - 105, height / 2); // à droite, au centre verticalement, les uns au-dessus des autres
    this.respawnText.setPosition(width / 2, height * 0.22);
    this.hostText.setPosition(width / 2, height * 0.34);
    this.endText.setPosition(width / 2, height * 0.4);
  };
}
