import Phaser from 'phaser';
import { clamp, damp, DebugOverlay, MoveInput, music, poki, RunFlow, sfx, storage, DEV_TOOLS } from '@xiao/engine';
import { FREE_GAMES, INTERSTITIALS_ENABLED, SCENES } from '../config';
import { RETENTION_MILESTONES, TIME_MILESTONES } from '../data/analytics';
import type { SoldierClassId } from '../data/classes';
import { TUTORIAL } from '../data/tutorial';
import { MODES, type ModeDef } from '../data/modes';
import { levelAt } from '../data/waves';
import { loadSavedCrowd } from '../debugCrowd';
import { BotOverlay } from '../dev/botOverlay';
import { CheatPanel, type BotControl } from '../dev/cheatPanel';
import { JUMPS, jumpAhead, type JumpId } from '../dev/jumpAhead';
import { AlienTest, alienTestMode, type AlienTestRequest } from '../dev/alienTest';
import { setDocked } from '../dev/dock';
import { CrowdPanel } from '../dev/crowdPanel';
import { addVisualMenu, loadSavedVisual } from '../debugVisual';
import { t } from '../i18n';
import { MUSIC, settings, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../settings';
import { HostSession } from '../net/HostSession';
import { encodeSnapshot, SNAPSHOT_EVERY, takeSnapshot } from '../net/Protocol';
import { LocalSession, type Session } from '../net/Session';
import { RunRecorder } from '../sim/RunRecorder';
import { saveToCode } from '../dev/devSave';
import type { Squad } from '../sim/Squad';
import type { SimEvent } from '../sim/types';
import { scoreRows } from '../view/Scoreboard';
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
  private botOverlay?: BotOverlay;
  /** Vitesse de la simulation (panneau Triche, dev) : 1 = normale, 0 = figée. */
  private timeScale = 1;
  private revived = false;
  /** Partie qui a commencé par le tutoriel : la première mort offre un revive gratuit, et son onde de choc détruit les aliens (aide à la première expérience). */
  private freeRevive = false;
  private ended = false;
  /** Choix d'upgrade affiché (le jeu ne s'arrête pas). */
  private upgradeOpen = false;
  private recorder: RunRecorder | null = null;
  private snapMeasuredAt = -1;
  private snapPeak = 0;
  private snapPeakAt = 0;
  /** Proposition déjà choisie mais pas encore remplacée par l'hôte (évite de la rouvrir le temps de l'aller-retour réseau). */
  /** Proposition affichée dans la fenêtre de choix (pour la rouvrir quand elle change). */
  private shownOffer = '';
  /** Après un choix d'upgrade, le joystick (souris / tactile) reste ignoré tant que le joueur n'a pas relâché puis re-cliqué : le clic sur la carte d'upgrade ne doit pas lancer le déplacement. Le clavier n'est pas concerné. */
  private moveLocked = false;
  private readonly camTarget = { x: 0, y: 0 };
  /** Test d'un alien (dev, bouton « Test » de sa vue détaillée) : 1 Trooper contre lui, sans vagues ni fin de partie. */
  private alienTest?: AlienTest;
  /** Analytics (docs/ANALYTICS.md) : étape du tutoriel en cours, prochain palier de temps et dernier niveau de vague déjà notés. */
  private tutoPhase = '';
  private nextTimeMilestone = 0;
  private lastLevelSent = 0;

  constructor() {
    super(SCENES.game);
  }

  create(): void {
    this.revived = false;
    this.freeRevive = false;
    this.ended = false;
    this.upgradeOpen = false;
    this.moveLocked = false;
    this.shownOffer = '';
    this.tutoPhase = '';
    this.scene.stop(SCENES.levelUp); // une fenêtre d'upgrade restée ouverte d'une partie précédente
    if (DEV_TOOLS) {
      // réglages de dev mémorisés (absents du build Poki : le code est éliminé)
      loadSavedCrowd();
      loadSavedVisual();
    }
    const online = this.registry.get('session') as Session | undefined;
    this.registry.remove('session');
    if (online) {
      this.session = online;
    } else {
      const test = DEV_TOOLS ? (this.registry.get('alienTest') as AlienTestRequest | undefined) : undefined;
      this.registry.remove('alienTest');
      const mode = test ? alienTestMode() : this.pickMode();
      const botsParam = Number(poki.getURLParam('bots'));
      const jumpParam = poki.getURLParam('jump');
      const jump = jumpParam && jumpParam in JUMPS ? (jumpParam as JumpId) : null; // ?jump=gling|rhino|scarab|crab : partie avancée, build déployé compris
      this.session = new LocalSession({
        mode,
        seed: (Math.random() * 2 ** 31) | 0,
        bots: Number.isFinite(botsParam) && botsParam > 0 ? Math.min(botsParam, 11) : mode.id === 'royale' ? 5 : 0,
        tutorial: mode.id === 'survival' && !settings.tutorialDone && !jump && !test, // onboarding scripté à la première partie solo
      });
      this.alienTest = test
        ? new AlienTest(this, this.session.sim, this.session.localPlayer, test, (back) => {
            this.registry.set('viewerSelect', back);
            this.scene.start(SCENES.viewer);
          })
        : undefined;
      if (jump) console.info(jumpAhead(this.session.sim, this.session.localPlayer, jump)); // test : partie avancée dès le lancement
    }
    // la squad ne meurt pas pendant le tutoriel : une mort dans une partie qui l'a joué arrive forcément après, dans les vagues normales
    this.freeRevive = !online && !!this.session.sim.tutorial;
    this.view = new WorldView(this, this.session.sim, this.session.localPlayer);

    const cam = this.cameras.main;
    const map = this.session.sim.map;
    cam.setBounds(-320, -320, map.width + 640, map.height + 640); // marge : on voit l'espace autour de l'île
    const c = this.localSquad.center;
    this.camTarget.x = c.x;
    this.camTarget.y = c.y;
    cam.startFollow(this.camTarget, false, 0.12, 0.12);
    cam.centerOn(c.x, c.y);

    this.move = new MoveInput(this, { joystickFullSpeed: true, keyCodes: () => settings.moveKeys() }); // touches rebindables (Options > Hotkeys)
    this.watching = '';
    // à terre : un clic (hors boutons du HUD) regarde l'équipier suivant
    const onClick = (_p: Phaser.Input.Pointer, over: unknown[]): void => {
      if (over.length === 0) this.cycleSpectated();
    };
    this.input.on('pointerdown', onClick);
    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', this.pauseGame);
    kb.on('keydown-P', this.pauseGame);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.pauseGame);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', onClick);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.pauseGame);
      this.session.close();
      this.view.arena.destroy();
      this.scene.stop(SCENES.hud);
    });

    this.scene.launch(SCENES.hud);
    this.setupDebug();
    sfx.setVolume(settings.sfxGain());
  }

  update(time: number, delta: number): void {
    const secs = time / 1000;
    const dt = Math.min(delta, 50) / 1000;
    const dir = this.move.update();
    if (this.moveLocked) {
      // après le choix d'upgrade : le joystick (souris / tactile) est ignoré jusqu'à ce qu'il ait été relâché ; le clavier passe toujours
      if (!this.move.joystick.active) this.moveLocked = false;
      else dir.set(0, 0);
    }
    this.session.setLocalInput(dir.x, dir.y);
    if (this.flow.state === 'ready' && (this.move.active || this.alienTest) && !poki.isAdPlaying) this.beginRun(); // pas pendant une pub : le gameplayStart serait perdu

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
      this.alienTest?.update(dt * this.timeScale);
      this.checkEnd();
      this.trackProgress();
    }
    // choix d'upgrade : le monde est figé ; on dessine l'état à son dernier pas (alpha 1), sinon l'interpolation fait trembler les projectiles
    this.view.render(running && sim.choiceT <= 0 ? this.session.alpha : 1, dt, secs);
    this.updateCamera(dt);

    this.botOverlay?.update();
    this.debug?.set('tick', sim.tick);
    this.debug?.set('squads', sim.aliveSquads.length);
    this.debug?.set('soldiers', this.localSquad.size);
    this.debug?.set('aliens', sim.aliens.length);
    this.debug?.set('bullets', sim.combat.projectiles.active.length);
    if (this.debug) {
      this.measureSnapshot(secs);
      // enregistrement de la partie (calibration du Gestionnaire de vagues et du réseau) : pas chez un client, ses compteurs sont vides
      if (!this.ended && (!this.session.online || this.session instanceof HostSession)) {
        this.recorder ??= new RunRecorder(sim);
        this.recorder.update(this.session.localPlayer);
      }
    }
  }

  /** Pub interstitielle avant la prochaine partie ? Pas avant les `FREE_GAMES` premières parties jouées (compteur mémorisé d'une session à l'autre). */
  private adBeforeNextGame(): boolean {
    return INTERSTITIALS_ENABLED && storage.get('gamesPlayed', 0) >= FREE_GAMES;
  }

  /** Premier input du joueur : le gameplay démarre (Poki) et la musique se lance (en boucle, sans relance si elle joue déjà). */
  private beginRun(): void {
    const newRun = this.flow.state === 'ready';
    if (newRun) storage.set('gamesPlayed', storage.get('gamesPlayed', 0) + 1); // une partie de plus jouée (compte pour les interstitielles)
    this.flow.begin();
    if (newRun) {
      this.nextTimeMilestone = 0;
      this.lastLevelSent = 0;
      const games = storage.get('gamesPlayed', 0);
      if ((RETENTION_MILESTONES as readonly number[]).includes(games)) poki.measure('retention', `game-${games}`, 'reached'); // combien de joueurs rejouent
      const tuto = this.session.sim.tutorial;
      if (tuto?.active) this.trackTutorial(tuto.phase); // 1re étape déjà posée par la simulation
    }
    music.play(this, MUSIC.key, MUSIC.url, settings.musicGain());
  }

  /**
   * Analytics, entonnoir du tutoriel : chaque étape s'ouvre (`start`) et ferme la précédente (`complete`) ; `all` = le tutoriel entier.
   * La 1re étape (`move1`) est posée par la simulation avant le premier input, donc avant que cette scène l'écoute : `beginRun` la rattrape.
   */
  private trackTutorial(phase: string): void {
    if (phase === this.tutoPhase) return;
    if (this.tutoPhase) poki.measure('tutorial', this.tutoPhase, 'complete');
    else poki.measure('tutorial', 'all', 'start');
    this.tutoPhase = phase === 'done' ? '' : phase;
    if (phase === 'done') poki.measure('tutorial', 'all', 'complete');
    else poki.measure('tutorial', phase, 'start');
  }

  /** Analytics : paliers de temps et de niveau de vague atteints, une fois par partie (pas pendant le tutoriel, dont la timeline est différente). */
  private trackProgress(): void {
    const sim = this.session.sim;
    if (!this.flow.isPlaying || this.ended || sim.tutorial?.active) return;
    const time = this.runTime;
    while (this.nextTimeMilestone < TIME_MILESTONES.length && time >= TIME_MILESTONES[this.nextTimeMilestone]) {
      poki.measureOnce('time', `${TIME_MILESTONES[this.nextTimeMilestone++]}s`, 'reached');
    }
    const level = this.waveNumber;
    if (level > this.lastLevelSent) {
      this.lastLevelSent = level;
      poki.measureOnce('level', level, 'reached');
    }
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
    if (e.t === 'boss' || e.t === 'bossDown' || e.t === 'bossEnrage') this.events.emit('boss', e); // bandeau / flèche du HUD
    if (e.t === 'boss') this.recorder?.noteBoss(e.alien, e.kind);
    if (e.t === 'boss') poki.measureOnce('boss', e.alien, 'start');
    if (e.t === 'bossDown') poki.measureOnce('boss', e.alien, 'complete');
    if (e.t === 'tutorial') {
      this.trackTutorial(e.phase);
      if (e.phase === 'done') settings.setTutorialDone(true); // terminé : les parties suivantes sautent l'onboarding
    }
    if (e.t === 'upgradePicked' && e.owner === this.session.localPlayer) poki.measure('upgrade', e.id, e.prism ? 'prism' : 'picked');
    if (e.t === 'gameEnd' || e.t === 'restart') this.events.emit('netEnd', e); // écran de fin coop
    // Écran de fin coop : le gameplay s'arrête (gameplayStop) ; à la relance, retour à l'état « prêt » (le prochain input fait repartir gameplayStart)
    if (e.t === 'gameEnd') {
      this.saveRun(e.victory);
      if (e.victory) this.flow.win();
      else this.flow.fail();
    }
    if (e.t === 'restart') {
      void this.flow.restart({ ad: this.adBeforeNextGame() });
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
    if (this.session.online || this.alienTest) return; // test d'un alien : la squad anéantie revient (dev/alienTest.ts)
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
    this.scene.launch(SCENES.levelUp, { offer: squad.offer ? [...squad.offer] : null, prism: [...squad.offerPrism], level: squad.level, rerolls: this.session.sim.tutorial?.active ? 0 : squad.rerolls, suggest: this.session.sim.tutorial?.active ? TUTORIAL.suggest : undefined });
  }

  /** Dev : encode l'état comme un snapshot réseau 2 fois par seconde (sans l'envoyer) pour afficher sa taille et le débit qu'il coûterait. */
  private measureSnapshot(secs: number): void {
    if (secs - this.snapMeasuredAt < 0.5) return;
    this.snapMeasuredAt = secs;
    const sizes: Record<string, number> = {};
    const bytes = encodeSnapshot(takeSnapshot(this.session.sim), sizes).byteLength;
    this.recorder?.noteSnapshot(bytes, sizes);
    this.snapPeak = secs - this.snapPeakAt > 10 ? bytes : Math.max(this.snapPeak, bytes);
    if (bytes >= this.snapPeak) this.snapPeakAt = secs;
    const kbps = (b: number) => ((b * 30) / SNAPSHOT_EVERY / 1000).toFixed(0);
    this.debug?.set('snapshot', `${bytes} o · ${kbps(bytes)} Ko/s`);
    this.debug?.set('snapshot pic 10s', `${this.snapPeak} o · ${kbps(this.snapPeak)} Ko/s`);
  }

  private offerKey(squad: Squad): string {
    const picks = Object.values(squad.picked).reduce((n, v) => n + (v ?? 0), 0);
    return `${(squad.offer ?? []).join(',')}|${squad.offerPrism.join(',')}|${picks}|${squad.rerolls}`;
  }

  private closeUpgrade(): void {
    this.upgradeOpen = false;
    this.moveLocked = true;
    this.scene.stop(SCENES.levelUp);
  }

  /** Appelé par la fenêtre de choix : envoie l'upgrade (hôte ou client). La fenêtre se ferme quand la pause de choix se termine. */
  chooseUpgrade(index: number): void {
    this.session.chooseUpgrade(index);
  }

  /** Appelé par la fenêtre de choix : relance les propositions (la fenêtre se rouvre avec le nouveau tirage). */
  rerollUpgrade(): void {
    poki.measure('upgrade', 'reroll', 'interact');
    this.session.rerollUpgrade();
  }

  readonly pauseGame =(): void => {
    if (this.session.online || this.upgradeOpen) return; // pause impossible : les autres joueurs continuent
    if (!this.scene.isActive()) return;
    // avant le premier input (état « prêt ») le gameplay n'a pas démarré : rien à interrompre côté Poki, mais la pause reste possible
    if (this.flow.state !== 'ready' && !this.flow.interrupt()) return;
    this.scene.pause();
    this.scene.pause(SCENES.hud);
    this.scene.launch(SCENES.pause);
  };

  /** Reprise après une pause : `ad` = pub de sortie de pause (désactivée : les interstitielles ne passent qu'entre deux parties). */
  async resumeGame({ ad = false }: { ad?: boolean } = {}): Promise<void> {
    await this.flow.resume({ ad });
    this.scene.resume();
    this.scene.resume(SCENES.hud);
  }

  /** Dev : envoie la partie enregistrée au serveur de dev (`docs/bench/runs/`), si elle est assez longue pour compter. */
  private saveRun(victory: boolean): void {
    const rec = this.recorder;
    this.recorder = null; // une relance coop repart sur un nouvel enregistrement
    if (!rec || rec.samples.length < 10) return;
    void saveToCode('bench-run', rec.finish(this.session.localPlayer, this.mode.id, victory)).then((m) => console.info(m));
  }

  private endRun(victory: boolean, connectionLost = false): void {
    this.ended = true;
    this.saveRun(victory);
    if (victory) this.flow.win();
    else this.flow.fail();
    const online = this.session.online;
    const sim = this.session.sim;
    if (!victory && !connectionLost) {
      // analytics : à quel niveau de vague la squad est tombée, et sur quel boss (s'il y en avait un en vie)
      poki.measureOnce('death', `level-${this.waveNumber}`, 'reached');
      const boss = sim.aliens.find((a) => a.alive && a.def.boss);
      if (boss) poki.measureOnce('boss', boss.def.id, 'fail');
    }
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
      freeRevive: this.freeRevive && !this.revived,
      scores: scoreRows(sim.squads, this.session.localPlayer),
      title: connectionLost ? t('connectionLost') : undefined,
    };
    this.scene.launch(SCENES.gameOver, data);
  }

  async revive(free = false): Promise<boolean> {
    if (free ? !this.flow.reviveFree() : !(await this.flow.revive())) return false;
    this.revived = true;
    this.ended = false;
    this.session.reviveLocal(free);
    this.scene.resume();
    this.scene.resume(SCENES.hud);
    return true;
  }

  async retry(): Promise<void> {
    poki.measure('game', 'retry', 'interact');
    if (this.session.online) return this.retryOnline();
    await this.flow.restart({ ad: this.adBeforeNextGame() });
    this.scene.restart();
    // "Rejouer" est un input du joueur : le run démarre directement.
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.beginRun());
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
    const alive = this.session.sim.aliveSquads;
    return (alive.find((s) => s.owner === this.watching) ?? alive[0])?.owner ?? me;
  }

  /** Équipier regardé quand on est à terre (un clic passe au suivant) ; vide : le premier vivant. */
  private watching = '';

  /** À terre : passe à l'équipier vivant suivant (cycle). */
  private cycleSpectated(): void {
    if (this.localSquad?.alive) return;
    const alive = this.session.sim.aliveSquads;
    if (alive.length < 2) return;
    const i = alive.findIndex((s) => s.owner === this.spectated);
    this.watching = alive[(i + 1) % alive.length].owner;
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

  /**
   * Mode de la partie hors ligne : la SURVIE (seul ; à plusieurs, c'est la coop en ligne). Versus et battle royale sont désactivés pour
   * l'instant (08/10) : `?mode=royale` est ignoré ; leur code reste (`MODES`, scripts `sim:headless`) pour plus tard.
   */
  private pickMode(): ModeDef {
    return MODES.survival;
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

  /** Coéquipiers IA : disponibles pour l'hôte d'une partie coop (panneau Triche, dev). */
  private botControl(): BotControl | undefined {
    const s = this.session;
    if (!(s instanceof HostSession)) return undefined;
    return {
      list: () => [...s.bots].map(([id, b]) => ({ id, level: b.level })),
      add: (level) => s.addBot(level) !== null,
      remove: (id) => s.removeBot(id),
      setLevel: (id, level) => s.bots.get(id)?.setLevel(level),
    };
  }

  private setupDebug(): void {
    if (!DEV_TOOLS) return; // menu Réglages, panneaux Foule / Triche : dev uniquement
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
    onOff('Déformation écran (0/1)', "1 = onde de choc qui déforme l'écran à la montée de niveau (filtre plein écran). Sans menu : ?shock=0 / ?shock=1 dans l'URL.", () => settings.shockwave, (v) => settings.setShockwave(v));
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
      bots: this.botControl(),
    });
    if (this.session instanceof HostSession) this.botOverlay = new BotOverlay(this, this.session);
  }
}
