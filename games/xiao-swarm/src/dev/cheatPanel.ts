import type Phaser from 'phaser';
import { ALIENS, type AlienId } from '../data/aliens';
import { CLASSES, type SoldierClassId } from '../data/classes';
import type { SoldierState } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import type { Squad } from '../sim/Squad';
import type { PlayerId } from '../sim/types';
import { button, checkbox, floatingPanel, heading, line, note, select, slider, type FloatingPanel } from './devUi';

/** Ce dont le panneau a besoin du jeu (fourni par GameScene). */
export interface CheatHost {
  sim: Sim;
  me: PlayerId;
  online: boolean;
  squad(): Squad;
  /** Vitesse de la simulation (1 = normale, 0 = figée). */
  getTimeScale(): number;
  setTimeScale(v: number): void;
}

/**
 * Panneau « Triche » (dev, hors ligne) : tester vite une situation — ajouter / retirer des soldats de la squad,
 * faire apparaître des aliens, lâcher des recrues, avancer les vagues, ralentir ou figer la simulation, rendre la
 * squad invincible. Bouton en haut à gauche du jeu. En ligne la simulation appartient à l'hôte : rien n'est proposé.
 */
export class CheatPanel {
  private readonly panel: FloatingPanel;
  private readonly status: HTMLDivElement;
  private readonly counts: HTMLDivElement;
  private god = false;

  constructor(
    scene: Phaser.Scene,
    private readonly host: CheatHost,
  ) {
    this.panel = floatingPanel('Triche / tests', { width: 300 });
    this.status = document.createElement('div');
    this.status.style.cssText = 'font-size:12px;color:#9fe;min-height:1.4em;white-space:pre-wrap';
    this.counts = document.createElement('div');
    this.counts.style.cssText = 'font-size:12px;color:#ffd166';
    if (host.online) {
      this.panel.body.append(note("Indisponible en ligne : la simulation appartient à l'hôte."));
    } else {
      this.build();
      // l'invincibilité remet les PV au maximum à chaque image (pas de clignotement d'invulnérabilité)
      const onUpdate = () => {
        if (!this.god) return;
        for (const s of host.squad().soldiers) s.hp = s.maxHp;
      };
      scene.events.on('postupdate', onUpdate);
      const timer = scene.time.addEvent({ delay: 250, loop: true, callback: () => this.refreshCounts() });
      scene.events.once('shutdown', () => {
        scene.events.off('postupdate', onUpdate);
        timer.remove();
      });
    }
    scene.events.once('shutdown', () => this.panel.destroy());
  }

  toggle(): void {
    this.panel.toggle();
    this.refreshCounts();
  }

  private say(msg: string): void {
    this.status.textContent = msg;
  }

  private refreshCounts(): void {
    if (!this.panel.isOpen || this.host.online) return;
    const sq = this.host.squad();
    const parts = (Object.keys(CLASSES) as SoldierClassId[]).filter((c) => sq.countOf(c) > 0).map((c) => `${c} ${sq.countOf(c)}`);
    this.counts.textContent = `Squad : ${sq.size} soldat(s)${parts.length ? ' — ' + parts.join(' · ') : ''}\nAliens : ${this.host.sim.aliens.length}`;
  }

  /** Retire un soldat même s'il vient d'arriver (l'invulnérabilité des recrues est ignorée). */
  private remove(s: SoldierState): void {
    s.invulnerable = 0;
    this.host.sim.damageSoldier(s, 1e9);
  }

  private build(): void {
    const { sim, me } = this.host;
    const squad = () => this.host.squad();
    const body = this.panel.body;
    this.counts.style.whiteSpace = 'pre-wrap';

    // ----- Squad -----
    const classes = Object.keys(CLASSES) as SoldierClassId[];
    const cls = select('Classe', classes.map((c) => [c, c] as [string, string]));
    let qty = 1;
    const qtySlider = slider('Quantité', { min: 1, max: 30, step: 1, get: () => qty, set: (v) => (qty = v) });
    let spawned = 0;
    const add = (id: SoldierClassId, n: number): void => {
      const sq = squad();
      for (let i = 0; i < n; i++) {
        // réparties autour du centre de la squad (angle d'or : pas d'aléa, la simulation reste reproductible)
        const a = (spawned++ * 2.399963) % (Math.PI * 2);
        const s = sq.recruit(id, { x: sq.center.x + Math.cos(a) * 50, y: sq.center.y + Math.sin(a) * 50 });
        s.invulnerable = 1;
      }
    };
    const removeOf = (id: SoldierClassId, n: number): number => {
      const sq = squad();
      let removed = 0;
      for (const s of [...sq.soldiers].reverse()) {
        if (removed >= n || sq.size - removed <= 1) break; // au moins un soldat : sinon c'est la fin de partie
        if (s.def.id === id && s.alive) {
          this.remove(s);
          removed++;
        }
      }
      return removed;
    };

    body.append(
      this.counts,
      heading('Squad'),
      cls.row,
      qtySlider.row,
      line(
        button('+ Ajouter', () => {
          add(cls.select.value as SoldierClassId, qty);
          this.say(`+${qty} ${cls.select.value}`);
        }),
        button('− Retirer', () => this.say(`−${removeOf(cls.select.value as SoldierClassId, qty)} ${cls.select.value}`)),
        button('+1 de chaque', () => classes.forEach((c) => add(c, 1))),
      ),
      line(
        button('− 1 soldat', () => {
          const sq = squad();
          if (sq.size > 1) this.remove(sq.soldiers[sq.size - 1]);
        }),
        button('Garder 1 seul', () => squad().soldiers.slice(1).forEach((s) => this.remove(s))),
        button('Reset (4 Gunners)', () => {
          const sq = squad();
          const old = [...sq.soldiers];
          for (let i = 0; i < 4; i++) sq.recruit('gunner', { x: sq.center.x + 30 * i - 45, y: sq.center.y + 40 }).invulnerable = 1;
          old.forEach((s) => this.remove(s));
          this.say('Squad remise à 4 Gunners');
        }),
      ),
      line(
        button('Soigner la squad', () => squad().soldiers.forEach((s) => (s.hp = s.maxHp))),
        button('Anéantir la squad', () => {
          squad().soldiers.forEach((s) => this.remove(s));
          this.say('Squad anéantie (test de fin de partie)');
        }),
      ),
      checkbox('Invincible (PV toujours pleins)', false, (v) => (this.god = v)),
    );

    // ----- Aliens -----
    const aliens = select('Alien', (Object.keys(ALIENS) as AlienId[]).map((a) => [a, a] as [string, string]));
    let alienQty = 5;
    body.append(
      heading('Aliens'),
      aliens.row,
      slider('Quantité', { min: 1, max: 50, step: 1, get: () => alienQty, set: (v) => (alienQty = v) }).row,
      line(
        button('Faire apparaître', () => {
          const before = sim.aliens.length;
          sim.horde.spawnNear(squad(), aliens.select.value as AlienId, alienQty, 420);
          this.say(`+${sim.aliens.length - before} ${aliens.select.value}`);
        }),
        button('Tuer tous les aliens', () => {
          for (const a of sim.aliens) sim.damage(a, 1e6, me);
        }),
      ),
    );

    // ----- Recrues -----
    body.append(
      heading('Recrues'),
      line(
        button('Lâcher une recrue (classe choisie)', () => {
          const c = squad().center;
          sim.recruits.drop(cls.select.value as SoldierClassId, c.x + 90, c.y);
        }),
        button('Une de chaque', () => {
          const c = squad().center;
          classes.forEach((id, i) => sim.recruits.drop(id, c.x + 90 + i * 30, c.y + (i % 2 ? 40 : -40)));
        }),
      ),
    );

    // ----- Temps -----
    let scale = this.host.getTimeScale();
    const speed = slider('Vitesse du jeu', {
      min: 0,
      max: 3,
      step: 0.1,
      hint: '0 = figé, 1 = normal, 0,3 = ralenti pour observer',
      get: () => scale,
      set: (v) => this.host.setTimeScale((scale = v)),
    });
    body.append(
      heading('Temps'),
      speed.row,
      line(
        button('+30 s de vagues', () => sim.waves.update(30)),
        button('+2 min', () => sim.waves.update(120)),
        button('1× vitesse normale', () => {
          this.host.setTimeScale((scale = 1));
          speed.sync();
        }),
      ),
      this.status,
    );
  }
}
