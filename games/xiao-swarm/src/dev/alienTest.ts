import type Phaser from 'phaser';
import { ALIENS, type AlienId } from '../data/aliens';
import { MODES, type ModeDef } from '../data/modes';
import type { AlienState } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import type { PlayerId } from '../sim/types';
import { button, line } from './devUi';
import { RATIO_BASE_SOLDIERS, squadCapFor, TANK_MUL, testSoldiers, type AlienTestMode } from './alienTestRules';

/** Demande de test (registre Phaser `alienTest`) : l'alien à tester et la sélection de la vue d'unités à rouvrir en sortant. */
export interface AlienTestRequest {
  alien: AlienId;
  back: string;
  /** `ratio` : squad proportionnelle aux PV de l'alien ; `tank` : 1 Trooper ×10 PV contre l'alien ×10 PV (voir `dev/alienTestRules.ts`). Absent : `ratio`. */
  mode?: AlienTestMode;
}

/** Test d'un alien : distance d'apparition de l'alien (px), délai avant le suivant (s). Le nombre de Troopers vient du mode (`testSoldiers`). */
const TEST = { distance: 420, respawn: 1.5 };

/** Mode du test : celui de la survie, sans aucune vague (seul l'alien testé est sur la carte). */
export function alienTestMode(): ModeDef {
  return { ...MODES.survival, waves: { ...MODES.survival.waves, timeline: [] } };
}

/**
 * Test d'un alien (dev, depuis sa vue détaillée, deux boutons) : (1) l'alien contre une squad de Troopers proportionnelle à ses PV (2 Troopers contre un slime, `dev/alienTestRules.ts`) ; (2) 1 Trooper à 10× ses PV contre
 * l'alien à 10× ses PV (observer le combat sans mourir). Rien d'autre ne vient perturber le duel : pas de vagues, ni globes d'XP, ni recrues, ni power-ups, ni escalade. L'alien tué revient après `TEST.respawn` s ;
 * la squad anéantie revient à son effectif de départ (pas de fin de partie). Panneau : bilan des duels, « Recommencer », « Quitter le test » (retour à la vue).
 */
export class AlienTest {
  private alien: AlienState | null = null;
  private wait = 0;
  private fightT = 0;
  private lostAtStart = 0;
  /** Effectif de départ de la squad du test et mode (voir `dev/alienTestRules.ts`). */
  private readonly soldiers: number;
  private readonly mode: AlienTestMode;
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
    this.mode = req.mode ?? 'ratio';
    this.soldiers = testSoldiers(req.alien, this.mode);
    this.panel.style.cssText =
      'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99999;padding:8px 12px;background:rgba(0,0,0,0.78);color:#dfe;' +
      'font:13px system-ui,sans-serif;border-radius:6px;display:flex;flex-direction:column;gap:6px;align-items:center';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:bold;color:#ffd166';
    title.textContent =
      this.mode === 'tank'
        ? `Duel ×${TANK_MUL} : ${req.alien} (PV ×${TANK_MUL}) — 1 Trooper (PV ×${TANK_MUL}) contre 1`
        : `Test réaliste : ${req.alien} — ${this.soldiers} Trooper${this.soldiers > 1 ? 's' : ''} contre 1 (base : ${RATIO_BASE_SOLDIERS} contre un slime)`;
    this.status.style.cssText = 'font-size:12px;color:#9fe;white-space:pre-wrap;text-align:center';
    this.panel.append(title, this.status, line(button('Recommencer', () => this.reset()), button('Quitter le test', () => quit(req.back))));
    document.body.append(this.panel);
    scene.events.once('shutdown', () => this.panel.remove());
    this.reset();
  }

  /** Nouveau duel : squad remise à son effectif de départ (niveau 1, sans upgrade), aliens retirés, alien testé de nouveau sur la carte. */
  reset(): void {
    this.sim.aliens.length = 0;
    this.resetSquad();
    this.spawn();
  }

  private resetSquad(): void {
    const sq = this.sim.squadOf(this.me);
    if (!sq) return;
    sq.fastForward(1);
    const cap = squadCapFor(this.soldiers);
    if (cap > sq.maxSize) sq.stats.add('maxSquad', { flat: cap - sq.maxSize }); // une grande squad de test ne doit pas dépasser la taille maximale de la squad
    this.sim.respawnSquad(this.me, Array.from({ length: this.soldiers }, () => 'trooper'), 1);
    if (this.mode === 'tank') for (const s of sq.soldiers) this.tank(s);
  }

  private spawn(): void {
    const sq = this.sim.squadOf(this.me);
    if (!sq) return;
    const before = this.sim.aliens.length;
    this.sim.horde.spawnNear(sq, this.req.alien, 1, TEST.distance);
    this.alien = this.sim.aliens.length > before ? this.sim.aliens[this.sim.aliens.length - 1] : null;
    if (this.alien && this.mode === 'tank') this.tank(this.alien);
    this.fightT = 0;
    this.lostAtStart = sq.size;
  }

  /** Mode `tank` : PV (et bouclier) × `TANK_MUL`, pleins. */
  private tank(u: { hp: number; maxHp: number; shield: number; maxShield: number }): void {
    u.maxHp *= TANK_MUL;
    u.hp = u.maxHp;
    u.maxShield *= TANK_MUL;
    u.shield = u.maxShield;
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
      if (sq && sq.size < this.soldiers) this.resetSquad();
      this.spawn();
    }
    if (this.alien) this.fightT += dt;
    const a = this.alien;
    const hp = a ? `PV ${Math.ceil(a.hp)} / ${Math.round(a.maxHp)}${a.maxShield > 0 ? ` (+${Math.ceil(a.shield)} bouclier)` : ''}` : 'prochain dans un instant…';
    const me = this.mode === 'tank' && sq?.soldiers[0] ? ` · PV soldat ${Math.ceil(sq.soldiers[0].hp)} / ${Math.round(sq.soldiers[0].maxHp)}` : '';
    this.status.textContent = `${ALIENS[this.req.alien].boss ? 'Boss — ' : ''}${hp} · soldats ${sq?.size ?? 0}${me}\nVictoires ${this.wins} · défaites ${this.losses}${this.last ? `\n${this.last}` : ''}`;
  }
}
