import Phaser from 'phaser';
import { clamp, damp, DebugOverlay, MoveInput, poki, RunFlow, storage } from '@xiao/engine';
import { SCENES } from '../config';
import { WAVE_MARKS } from '../data/aliens';
import type { SoldierClassId } from '../data/classes';
import { MODES, type ModeDef } from '../data/modes';
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
 */
export class GameScene extends Phaser.Scene {
  readonly flow = new RunFlow('survival');
  session!: Session;
  private view!: WorldView;
  private move!: MoveInput;
  private debug?: DebugOverlay;
  private revived = false;
  private ended = false;
  private readonly camTarget = { x: 0, y: 0 };

  constructor() {
    super(SCENES.game);
  }

  create(): void {
    this.revived = false;
    this.ended = false;
    const mode = this.pickMode();
    const botsParam = Number(poki.getURLParam('bots'));
    this.session = new LocalSession({
      mode,
      seed: (Math.random() * 2 ** 31) | 0,
      bots: Number.isFinite(botsParam) && botsParam > 0 ? Math.min(botsParam, 11) : mode.id === 'royale' ? 5 : 0,
    });
    this.view = new WorldView(this, this.session.sim, this.session.localPlayer);

    const cam = this.cameras.main;
    const map = this.session.sim.map;
    cam.setBounds(0, 0, map.width, map.height);
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
      this.view.arena.destroy();
      this.scene.stop(SCENES.hud);
    });

    this.scene.launch(SCENES.hud);
    this.setupDebug();
  }

  update(time: number, delta: number): void {
    const secs = time / 1000;
    const dt = Math.min(delta, 50) / 1000;
    const dir = this.move.update();
    this.session.setLocalInput(dir.x, dir.y);
    if (this.flow.state === 'ready' && this.move.active) this.flow.begin();

    if (this.flow.isPlaying) {
      this.session.advance(delta, this.onEvent);
      this.checkEnd();
    }
    this.view.render(this.flow.isPlaying ? this.session.alpha : 1, dt, secs);
    this.updateCamera(dt);

    const sim = this.session.sim;
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

  get runTime(): number {
    return this.session.sim.time;
  }

  get kills(): number {
    return this.localSquad.kills;
  }

  get waveNumber(): number {
    let n = 0;
    for (const m of WAVE_MARKS) if (this.runTime >= m) n++;
    return n;
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
    if (e.t === 'recruited' && e.owner === this.session.localPlayer) poki.measure('recruit', e.cls, 'complete');
  };

  private checkEnd(): void {
    if (this.ended) return;
    const sim = this.session.sim;
    if (!this.localSquad.alive) return this.endRun(false);
    if (this.mode.id === 'survival' && sim.time >= this.mode.duration) return this.endRun(true);
    if (this.mode.id === 'royale' && sim.squads.length > 1 && sim.aliveSquads.length === 1) return this.endRun(true);
  }

  // ---------- Flow Poki ----------

  readonly pauseGame = (): void => {
    if (!this.scene.isActive() || !this.flow.interrupt()) return;
    this.scene.pause();
    this.scene.pause(SCENES.hud);
    this.scene.launch(SCENES.pause);
  };

  async resumeGame(): Promise<void> {
    await this.flow.resume({ ad: true });
    this.scene.resume();
    this.scene.resume(SCENES.hud);
  }

  private endRun(victory: boolean): void {
    this.ended = true;
    if (victory) this.flow.win();
    else this.flow.fail();
    const time = Math.floor(this.runTime);
    const best = Math.max(time, storage.get('bestTime', 0));
    storage.set('bestTime', best);
    this.scene.pause();
    this.scene.pause(SCENES.hud);
    const data: GameOverData = { victory, time, kills: this.kills, best, canRevive: !victory && !this.revived };
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
    await this.flow.restart();
    this.scene.restart();
    // "Rejouer" est un input du joueur : le run démarre directement.
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.flow.begin());
  }

  // ---------- Caméra ----------

  /** Suit le coeur de la squad locale et dézoome un peu quand elle grossit. */
  private updateCamera(dt: number): void {
    const focus = this.view.squadFocus(this.session.localPlayer);
    if (focus) {
      this.camTarget.x = focus.x;
      this.camTarget.y = focus.y;
    }
    const cam = this.cameras.main;
    const target = clamp(1 - (this.localSquad.size - 4) * 0.009, 0.8, 1);
    cam.setZoom(damp(cam.zoom, target, 2, dt));
  }

  private pickMode(): ModeDef {
    const id = poki.getURLParam('mode');
    return id === 'royale' ? MODES.royale : MODES.survival;
  }

  // ---------- Debug (dev uniquement) ----------

  private setupDebug(): void {
    this.debug = DebugOverlay.create(this);
    if (!this.debug) return;
    const sim = this.session.sim;
    const me = this.session.localPlayer;
    this.debug.cheat('K', 'kill all aliens', () => {
      for (const a of sim.aliens) sim.damage(a, 1e6, me);
    });
    this.debug.cheat('R', 'drop recruit', () => {
      const ids: SoldierClassId[] = ['gunner', 'medic', 'flammer', 'sniper', 'tank'];
      sim.recruits.drop(sim.rng.pick(ids), this.localSquad.center.x + 90, this.localSquad.center.y);
    });
    this.debug.cheat('T', '+30s', () => sim.waves.update(30));
    this.debug.cheat('B', 'spawn crab', () => sim.horde.spawnNear(this.localSquad, 'crab', 1, 420));
  }
}
