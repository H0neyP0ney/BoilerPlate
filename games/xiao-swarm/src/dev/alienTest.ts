import type Phaser from 'phaser';
import { ALIENS, type AlienId } from '../data/aliens';
import { MODES, type ModeDef } from '../data/modes';
import type { AlienState } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import type { PlayerId } from '../sim/types';
import { button, line } from './devUi';

/** Demande de test (registre Phaser `alienTest`) : l'alien à tester et la sélection de la vue d'unités à rouvrir en sortant. */
export interface AlienTestRequest {
  alien: AlienId;
  back: string;
}

/** Test d'un alien : nombre de Gunners, distance d'apparition de l'alien (px), délai avant le suivant (s). */
const TEST = { soldiers: 4, distance: 420, respawn: 1.5 };

/** Mode du test : celui de la survie, sans aucune vague (seul l'alien testé est sur la carte). */
export function alienTestMode(): ModeDef {
  return { ...MODES.survival, waves: { ...MODES.survival.waves, timeline: [] } };
}

/**
 * Test d'un alien (dev, depuis sa vue détaillée) : 4 Gunners contre 1 alien, en situation de jeu. Rien d'autre ne vient perturber le
 * duel : pas de vagues, ni globes d'XP, ni recrues, ni power-ups, ni escalade. L'alien tué revient après `TEST.respawn` s ; la squad
 * anéantie revient à 4 Gunners (pas de fin de partie). Panneau : bilan des duels, « Recommencer », « Quitter le test » (retour à la vue).
 */
export class AlienTest {
  private alien: AlienState | null = null;
  private wait = 0;
  private fightT = 0;
  private lostAtStart = 0;
  private wins = 0;
  private losses = 0;
  private last = '';
  private readonly panel = document.createElement('div');
  private readonly status = document.createElement('div');

  constructor(
    scene: Phaser.Scene,
    private readonly sim: Sim,
    private readonly me: PlayerId,
    private readonly req: AlienTestRequest,
    quit: (back: string) => void,
  ) {
    this.panel.style.cssText =
      'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99999;padding:8px 12px;background:rgba(0,0,0,0.78);color:#dfe;' +
      'font:13px system-ui,sans-serif;border-radius:6px;display:flex;flex-direction:column;gap:6px;align-items:center';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:bold;color:#ffd166';
    title.textContent = `Test : ${req.alien} — ${TEST.soldiers} Gunners contre 1`;
    this.status.style.cssText = 'font-size:12px;color:#9fe;white-space:pre-wrap;text-align:center';
    this.panel.append(title, this.status, line(button('Recommencer', () => this.reset()), button('Quitter le test', () => quit(req.back))));
    document.body.append(this.panel);
    scene.events.once('shutdown', () => this.panel.remove());
    this.reset();
  }

  /** Nouveau duel : squad remise à 4 Gunners (niveau 1, sans upgrade), aliens retirés, alien testé de nouveau sur la carte. */
  reset(): void {
    this.sim.aliens.length = 0;
    this.resetSquad();
    this.spawn();
  }

  private resetSquad(): void {
    const sq = this.sim.squadOf(this.me);
    if (!sq) return;
    sq.fastForward(1);
    this.sim.respawnSquad(this.me, Array.from({ length: TEST.soldiers }, () => 'trooper'), 1);
  }

  private spawn(): void {
    const sq = this.sim.squadOf(this.me);
    if (!sq) return;
    const before = this.sim.aliens.length;
    this.sim.horde.spawnNear(sq, this.req.alien, 1, TEST.distance);
    this.alien = this.sim.aliens.length > before ? this.sim.aliens[this.sim.aliens.length - 1] : null;
    this.fightT = 0;
    this.lostAtStart = sq.size;
  }

  /** À chaque image (après le pas de simulation) : duel suivant, squad anéantie, et rien d'autre que le duel sur la carte. */
  update(dt: number): void {
    const { sim } = this;
    sim.xp.clear();
    sim.recruits.clear();
    sim.powerups.clear();
    sim.bossKills = 0; // pas d'escalade d'un duel à l'autre
    const sq = sim.squadOf(this.me);
    if (sq && sq.size === 0) {
      this.losses++;
      this.last = `Squad anéantie en ${this.fightT.toFixed(1)} s (alien à ${this.alien ? Math.round((this.alien.hp / this.alien.maxHp) * 100) : 0} % PV)`;
      this.reset();
    } else if (this.alien && (!this.alien.alive || !sim.aliens.includes(this.alien))) {
      this.wins++;
      this.last = `Alien tué en ${this.fightT.toFixed(1)} s, ${this.lostAtStart - (sq?.size ?? 0)} soldat(s) perdu(s)`;
      this.alien = null;
      this.wait = TEST.respawn;
    } else if (!this.alien && (this.wait -= dt) <= 0) {
      if (sq && sq.size < TEST.soldiers) this.resetSquad();
      this.spawn();
    }
    if (this.alien) this.fightT += dt;
    const a = this.alien;
    const hp = a ? `PV ${Math.ceil(a.hp)} / ${Math.round(a.maxHp)}${a.maxShield > 0 ? ` (+${Math.ceil(a.shield)} bouclier)` : ''}` : 'prochain dans un instant…';
    this.status.textContent = `${ALIENS[this.req.alien].boss ? 'Boss — ' : ''}${hp} · soldats ${sq?.size ?? 0}\nVictoires ${this.wins} · défaites ${this.losses}${this.last ? `\n${this.last}` : ''}`;
  }
}
