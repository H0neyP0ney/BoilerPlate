import Phaser from 'phaser';
import { clamp, damp, DebugOverlay, MoveInput, music, poki, RunFlow, sfx, storage } from '@xiao/engine';
import { SCENES } from '../config';
import type { SoldierClassId } from '../data/classes';
import { MODES, type ModeDef } from '../data/modes';
import { levelAt } from '../data/waves';
import { loadSavedCrowd } from '../debugCrowd';
import { CheatPanel } from '../dev/cheatPanel';
import { setDocked } from '../dev/dock';
import { CrowdPanel } from '../dev/crowdPanel';
import { addVisualMenu, loadSavedVisual } from '../debugVisual';
import { t } from '../i18n';
import { MUSIC, MUSIC_STEPS, settings, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../settings';
import { LocalSession, type Session } from '../net/Session';
import type { Squad } from '../sim/Squad';
import type { SimEvent } from '../sim/types';
import { WorldView } from '../view/WorldView';
import type { GameOverData } from './GameOverScene';

/**
 * Scène de jeu : relie une Session (qui fait avancer la simulation) à
 * l'affichage (WorldView), l'input local, la caméra et le flow Poki.
 * Elle ne contient aucune règle de jeu : tout est dans sim/.
 *
 * Paramètres d'URL (tests) : ?mode=royale&bots=5
 * En ligne (voir online.ts) : ?net=host, ?net=join&room=CODE, ?net=auto. BootScene fournit alors
 * la session via `registry` ; la scène ne fait aucune différence entre solo, hôte et client.
 */
export class GameScene extends Phaser.Scene {
  readonly flow = new RunFlow('survival');
  session!: Session;
  private view!: WorldView;
  private move!: MoveInput;
  private debug?: DebugOverlay;
  private crowdPanel?: CrowdPanel;
  private cheatPanel?: CheatPanel;
  /** Vitesse de la simulation (panneau Triche, dev) : 1 = normale, 0 = figée. */
  private timeScale = 1;
  private revived = false;
  private ended = false;
  /** Choix d'upgrade affiché (le jeu ne s'arrête pas). */
  private upgradeOpen = false;
  /** Proposition déjà choisie mais pas encore remplacée par l'hôte (évite de la rouvrir le temps de l'aller-retour réseau). */
  /** Proposition affichée dans la fenêtre de choix (pour la rouvrir quand elle change). */
  private shownOffer = '';
  private readonly camTarget = { x: 0, y: 0 };

  constructor() {
    super(SCENES.game);
  }

  create(): void {
    this.revived = false;
    this.ended = false;
    this.upgradeOpen = false;
    this.shownOffer = '';
    this.scene.stop(SCENES.levelUp); // une fenêtre d'upgrade restée ouverte d'une partie précédente
    if (import.meta.env.DEV) {
      // réglages de dev mémorisés (absents du build Poki : le code est éliminé)
      loadSavedCrowd();
      loadSavedVisual();
    }
    const online = this.registry.get('session') as Session | undefined;
    this.registry.remove('session');
    if (online) {
      this.session = online;
    } else {
      const mode = this.pickMode();
      const botsParam = Number(poki.getURLParam('bots'));
      this.session = new LocalSession({
        mode,
        seed: (Math.random() * 2 ** 31) | 0,
        bots: Number.isFinite(botsParam) && botsParam > 0 ? Math.min(botsParam, 11) : mode.id === 'royale' ? 5 : 0,
      });
    }
    this.view = new WorldView(this, this.session.sim, this.session.localPlayer);

    const cam = this.cameras.main;
    const map = this.session.sim.map;
    cam.setBounds(-320, -320, map.width + 640, map.height + 640); // marge : on voit l'espace autour de l'île
    const c = this.localSquad.center;
    this.camTarget.x = c.x;
    this.camTarget.y = c.y;
    cam.startFollow(this.camTarget, false, 0.12, 0.12);
    cam.centerOn(c.x, c.y);

    this.move = new MoveInput(this);
    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', this.pauseGame);
    kb.on('keydown-P', this.pauseGame);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.pauseGame);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.pauseGame);
      this.session.close();
      this.view.arena.destroy();
      this.scene.stop(SCENES.hud);
    });

    this.scene.launch(SCENES.hud);
    this.setupDebug();
    music.play(this, MUSIC.key, MUSIC.url, settings.musicVolume / MUSIC_STEPS); // en boucle, sans relance si elle joue déjà
    sfx.setVolume(settings.sfxVolume / MUSIC_STEPS);
  }

  update(time: number, delta: number): void {
    const secs = time / 1000;
    const dt = Math.min(delta, 50) / 1000;
    const dir = this.move.update();
    this.session.setLocalInput(dir.x, dir.y);
    if (this.flow.state === 'ready' && this.move.active) this.flow.begin();

    // Montée de niveau : la simulation est en PAUSE le temps du choix (`sim.choiceT`, le même chez tous les joueurs). On affiche
    // ses propositions, ou, en ligne, l'attente des autres joueurs une fois son choix fait.
    const squad = this.localSquad;
    const offer = squad?.offer;
    const sim = this.session.sim;
    const choosing = sim.xpEnabled && sim.choiceT > 0 && !this.ended && (!!offer || this.session.online);
    const key = !choosing ? '' : offer ? this.offerKey(squad) : 'wait';
    if (!choosing) {
      if (this.upgradeOpen) this.closeUpgrade();
    } else if (!this.upgradeOpen || key !== this.shownOffer) this.openUpgrade(key);

    // En ligne, le monde ne s'arrête jamais : l'hôte fait tourner la partie de tout le monde.
    const running = this.flow.isPlaying || this.session.online;
    if (running) {
      this.session.advance(delta * this.timeScale, this.onEvent);
      this.checkEnd();
    }
    this.view.render(running ? this.session.alpha : 1, dt, secs);
    this.updateCamera(dt);

    this.debug?.set('tick', sim.tick);
    this.debug?.set('squads', sim.aliveSquads.length);
    this.debug?.set('soldiers', this.localSquad.size);
    this.debug?.set('aliens', sim.aliens.length);
    this.debug?.set('bullets', sim.combat.projectiles.active.length);
  }

  // ---------- Infos pour le HUD ----------

  get mode(): ModeDef {
    return this.session.sim.mode;
  }

  get localSquad(): Squad {
    return this.session.sim.squadOf(this.session.localPlayer)!;
  }

  /** Nombre de joueurs dans la partie (1 hors ligne). */
  get playerCount(): number {
    return this.session.online ? this.session.sim.squads.length : 1;
  }

  get runTime(): number {
    return this.session.sim.time;
  }

  get kills(): number {
    return this.localSquad.kills;
  }

  get waveNumber(): number {
    // plus haut niveau de vague déjà envoyé par la timeline (le script de vagues fait foi)
    return levelAt(this.session.sim.mode.waves, this.runTime);
  }

  get squadsAlive(): number {
    return this.session.sim.aliveSquads.length;
  }

  composition(): Map<SoldierClassId, number> {
    const m = new Map<SoldierClassId, number>();
    for (const s of this.localSquad.soldiers) m.set(s.def.id, (m.get(s.def.id) ?? 0) + 1);
    return m;
  }

  // ---------- Événements de la simulation ----------

  private readonly onEvent = (e: SimEvent): void => {
    this.view.handle(e);
    if (e.t === 'boss' || e.t === 'bossDown') this.events.emit('boss', e); // bandeau / flèche du HUD
    if (e.t === 'gameEnd' || e.t === 'restart') this.events.emit('netEnd', e); // écran de fin coop
    if (e.t === 'restart') {
      this.closeUpgrade(); // relance coop : plus de choix d'upgrade en cours
      this.shownOffer = '';
    }
    if (e.t === 'recruited' && e.owner === this.session.localPlayer) poki.measure('recruit', e.cls, 'complete');
  };

  private checkEnd(): void {
    if (this.ended) return;
    const sim = this.session.sim;
    if (this.session.connection === 'lost') return this.endRun(false, true);
    // En ligne, une squad anéantie réapparaît toute seule (voir HostSession) : jamais d'écran de fin.
    if (this.session.online) return;
    if (!this.localSquad.alive) return this.endRun(false);
    if (this.mode.id === 'survival' && sim.finalBossDead) return this.endRun(true); // victoire : le boss final est tombé
    if (this.mode.id === 'royale' && sim.squads.length > 1 && sim.aliveSquads.length === 1) return this.endRun(true);
  }

  // ---------- Flow Poki ----------

  /** Ouvre (ou rouvre, nouvelle manche / passage en attente) la fenêtre de choix d'upgrade. */
  private openUpgrade(key: string): void {
    const squad = this.localSquad;
    this.upgradeOpen = true;
    this.shownOffer = key;
    this.scene.stop(SCENES.levelUp);
    this.scene.launch(SCENES.levelUp, { offer: squad.offer ? [...squad.offer] : null, prism: [...squad.offerPrism], level: squad.level });
  }

  private offerKey(squad: Squad): string {
    const picks = Object.values(squad.picked).reduce((n, v) => n + (v ?? 0), 0);
    return `${(squad.offer ?? []).join(',')}|${picks}`;
  }

  private closeUpgrade(): void {
    this.upgradeOpen = false;
    this.scene.stop(SCENES.levelUp);
  }

  /** Appelé par la fenêtre de choix : envoie l'upgrade (hôte ou client). La fenêtre se ferme quand la pause de choix se termine. */
  chooseUpgrade(index: number): void {
    this.session.chooseUpgrade(index);
  }

  readonly pauseGame = (): void => {
    if (this.session.online || this.upgradeOpen) return; // pause impossible : les autres joueurs continuent
    if (!this.scene.isActive() || !this.flow.interrupt()) return;
    this.scene.pause();
    this.scene.pause(SCENES.hud);
    this.scene.launch(SCENES.pause);
  };

  /** Reprise après une pause : `ad` = pub de sortie de pause (écran Pause) ; non pour le menu Options. */
  async resumeGame({ ad = true }: { ad?: boolean } = {}): Promise<void> {
    await this.flow.resume({ ad });
    this.scene.resume();
    this.scene.resume(SCENES.hud);
  }

  private endRun(victory: boolean, connectionLost = false): void {
    this.ended = true;
    if (victory) this.flow.win();
    else this.flow.fail();
    const online = this.session.online;
    const time = Math.floor(this.runTime);
    const best = online ? time : Math.max(time, storage.get('bestTime', 0));
    if (!online) storage.set('bestTime', best);
    // En ligne la scène ne se met JAMAIS en pause : l'hôte ferait geler tous les joueurs.
    if (!online) {
      this.scene.pause();
      this.scene.pause(SCENES.hud);
    }
    const data: GameOverData = {
      victory,
      time,
      kills: this.kills,
      best,
      canRevive: !online && !victory && !this.revived,
      title: connectionLost ? t('connectionLost') : undefined,
    };
    this.scene.launch(SCENES.gameOver, data);
  }

  async revive(): Promise<boolean> {
    if (!(await this.flow.revive())) return false;
    this.revived = true;
    this.ended = false;
    this.session.reviveLocal();
    this.scene.resume();
    this.scene.resume(SCENES.hud);
    return true;
  }

  async retry(): Promise<void> {
    if (this.session.online) return this.retryOnline();
    await this.flow.restart();
    this.scene.restart();
    // "Rejouer" est un input du joueur : le run démarre directement.
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.flow.begin());
  }

  /** En ligne, le seul écran de fin est « connexion perdue » : retour au solo. */
  private retryOnline(): void {
    window.location.assign(window.location.pathname);
  }

  // ---------- Caméra ----------

  /** Suit le coeur de la squad locale et dézoome un peu quand elle grossit. */
  /** Squad que la caméra suit : la nôtre, ou — si elle est anéantie — celle d'un équipier vivant (spectateur). */
  get spectated(): string {
    const me = this.session.localPlayer;
    if (this.localSquad?.alive) return me;
    return this.session.sim.aliveSquads[0]?.owner ?? me;
  }

  private updateCamera(dt: number): void {
    const focus = this.view.squadFocus(this.spectated);
    const cam = this.cameras.main;
    if (focus) {
      // Réapparition à l'autre bout de la carte : on saute au lieu de traverser la carte en glissant.
      const jump = Math.hypot(focus.x - this.camTarget.x, focus.y - this.camTarget.y) > 900;
      this.camTarget.x = focus.x;
      this.camTarget.y = focus.y;
      if (jump) cam.centerOn(focus.x, focus.y);
    }
    cam.setZoom(damp(cam.zoom, this.targetZoom(), 2, dt));
  }

  /** Zoom auto (dézoome quand la squad grossit) × réglage du joueur. */
  private targetZoom(): number {
    const watched = this.session.sim.squadOf(this.spectated) ?? this.localSquad;
    return clamp(1 - (watched.size - 4) * 0.009, 0.8, 1) * settings.zoom;
  }

  /** Applique le réglage de zoom immédiatement (menu Réglages : sans attendre le lissage de la caméra). */
  applyZoomNow(): void {
    this.cameras.main.setZoom(this.targetZoom());
  }

  private pickMode(): ModeDef {
    const id = poki.getURLParam('mode');
    return id === 'royale' ? MODES.royale : MODES.survival;
  }

  // ---------- Debug (dev uniquement) ----------

  /** Bouton du HUD : ouvre / ferme le menu Réglages (comme la touche ² / F2). */
  /** Bouton Options du HUD : en solo la partie se met en pause le temps du menu (en ligne, impossible : le jeu continue). */
  openOptions(): void {
    if (this.scene.isActive(SCENES.options) || this.scene.isActive(SCENES.pause)) return;
    const paused = !this.session.online && !this.upgradeOpen && this.scene.isActive() && this.flow.interrupt();
    if (paused) {
      this.scene.pause();
      this.scene.pause(SCENES.hud);
    }
    this.scene.launch(SCENES.options, { resumeGame: paused });
  }

  toggleDebug(): void {
    this.debug?.toggleMenu();
  }

  /** Boutons du HUD (dev) : ouvrent une visionneuse (unités, particules, obstacles, divers). */
  /** Boutons du HUD (dev) : ouvrent / ferment le panneau « Foule » ou « Triche ». */
  toggleCrowdPanel(): void {
    this.crowdPanel?.toggle();
  }

  toggleCheatPanel(): void {
    this.cheatPanel?.toggle();
  }

  openViewer(scene: string): void {
    this.scene.start(scene);
  }

  /** Le menu Réglages existe-t-il (dev uniquement) ? Le HUD n'affiche son bouton que dans ce cas. */
  get hasDebug(): boolean {
    return !!this.debug;
  }

  private setupDebug(): void {
    if (!import.meta.env.DEV) return; // menu Réglages, panneaux Foule / Triche : dev uniquement
    this.debug = DebugOverlay.create(this, { title: 'Réglages', onMenuToggle: (open, menu) => setDocked(menu, open) });
    if (!this.debug) return;
    const sim = this.session.sim;
    const me = this.session.localPlayer;
    // Réglages du jeu : zoom total de la caméra (multiplie le dézoom automatique quand la squad grossit), mémorisé.
    this.debug.section('Jeu');
    this.debug.slider('Zoom du jeu', {
      min: ZOOM_MIN,
      max: ZOOM_MAX,
      step: ZOOM_STEP,
      hint: '1 = zoom d\'origine. Se combine avec le dézoom automatique quand la squad grossit.',
      get: () => settings.zoom,
      set: (v) => {
        settings.setZoom(v);
        this.applyZoomNow();
      },
    });
    const dbg = this.debug;
    const onOff = (label: string, hint: string, get: () => boolean, set: (v: boolean) => void): void =>
      dbg.slider(label, { min: 0, max: 1, step: 1, hint, get: () => (get() ? 1 : 0), set: (v) => set(v >= 0.5) });
    onOff('Compteur FPS (0/1)', "1 = affiché en haut à gauche. Sans menu (téléphone) : ?fps=0 / ?fps=1 dans l'URL.", () => settings.showFps, (v) => settings.setShowFps(v));
    onOff('Fond étoilé (0/1)', "0 = fond noir uni, bien plus léger sur mobile. Sans menu (téléphone) : ?space=0 / ?space=1 dans l'URL.", () => settings.starfield, (v) => settings.setStarfield(v));
    addVisualMenu(this.debug);
    // Panneaux dédiés (boutons du HUD) : mouvement de foule, et triche / tests (hors ligne seulement).
    this.crowdPanel = new CrowdPanel(this);
    this.cheatPanel = new CheatPanel(this, {
      sim,
      me,
      online: this.session.online,
      squad: () => this.localSquad,
      getTimeScale: () => this.timeScale,
      setTimeScale: (v) => (this.timeScale = v),
    });
  }
}
