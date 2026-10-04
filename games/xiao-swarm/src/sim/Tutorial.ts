import type { Point } from '@xiao/engine/sim';
import { RECRUIT } from '../config';
import { TUTORIAL, TUTORIAL_REWARD, type TutorialGroup } from '../data/tutorial';
import { UPGRADES } from '../data/progression';
import type { UpgradeId } from '../data/progression';
import type { AlienState, PowerUpState } from './entities';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

/** Étapes de l'onboarding, dans l'ordre (voir `data/tutorial.ts`). */
export type TutorialPhase = 'move1' | 'wave1' | 'wave2' | 'wave3' | 'done';

/** Ce que l'affichage doit montrer : point vert sur le sol, ou flèche vers une recrue / un power-up à ramasser. */
export interface TutorialTarget {
  x: number;
  y: number;
  kind: 'marker' | 'recruit' | 'powerup' | 'orbs' | 'incoming';
  /** Zone englobante (px) : tous les globes d'XP restants (kind `orbs`). */
  radius?: number;
  /** Clé de texte de la bulle au-dessus de la flèche (absente : pas de bulle). */
  label?: 'tutoRecruit' | 'tutoIncoming' | 'tutoPowerup' | 'tutoOrbs' | 'tutoMove';
}

/** Distance (px) à laquelle tombent la recrue et le power-up du script : à distance de la squad, pour qu'il faille aller les chercher. */
const FAR_SPOT = 240;
/** Délai (s) entre l'apparition de la 2e vague et sa flèche rouge « ennemis en approche ». */
const SECOND_WAVE_ARROW_DELAY = 1.5;
/** Délai (s) entre l'apparition de la 1re recrue et sa flèche avec le texte « +1 fusilier ». */
const RECRUIT_LABEL_DELAY = 1;

/**
 * Onboarding scripté d'une partie solo : tant qu'il est actif, la timeline de vagues normale est suspendue (`Sim.step` n'appelle pas
 * `waves.update`) et les apparitions viennent d'ici ; à la dernière étape, `active` passe à faux et les vagues normales démarrent à 0 s.
 * Pur : positions déterministes, aléa de `sim.rng` seulement (règles 1 et 2 d'architecture).
 */
export class Tutorial {
  phase: TutorialPhase = 'move1';
  private started = false;
  /** Point vert actuel (null : aucun). */
  private marker: Point | null = null;
  /** Aliens de la vague en cours (pour savoir quand elle est terminée). */
  private wave: AlienState[] = [];
  private powerup: PowerUpState | null = null;
  /** Une recrue / un power-up du script est déjà apparu (puis disparu = ramassé). */
  /** Temps écoulé (s) depuis l'arrivée de la squad sur le 1er point vert (-1 : pas encore arrivée) ; la 1re vague part à `firstWaveDelay`. */
  private reachedFor = -1;
  /** Direction (rad) d'où arrive la 1re vague, tirée à l'arrivée sur le 1er point vert pour pouvoir l'annoncer. */
  private incomingAngle = 0;
  /** Zone englobant les globes d'XP (mise en cache) et nombre de globes au dernier calcul. */
  private orbsZone: TutorialTarget | null = null;
  private orbsCount = 0;
  /** Temps écoulé (s) dans l'étape en cours. */
  private phaseClock = 0;
  private recruitSeen = false;
  private powerupSeen = false;

  constructor(private readonly sim: Sim) {}

  get active(): boolean {
    return this.phase !== 'done';
  }

  private get squad(): Squad | undefined {
    return this.sim.squads[0];
  }

  /** Étape « ramasse les globes d'XP » : la vague est vaincue, il reste des globes au sol et la squad n'a pas encore monté de niveau (sinon l'objectif est atteint). */
  private get collectingOrbs(): boolean {
    return this.phase === 'wave2' && this.waveDead() && this.sim.xp.orbs.length > 0 && (this.squad?.level ?? 1) < 2;
  }

  /** Cibles à montrer : le point vert, la recrue ou le power-up du script. */
  targets(): TutorialTarget[] {
    this.start(); // le point vert est visible dès l'écran de départ, avant le premier input (la simulation ne tourne pas encore)
    const out: TutorialTarget[] = [];
    if (this.marker) out.push({ x: this.marker.x, y: this.marker.y, kind: 'marker', label: 'tutoMove' });
    if (this.collectingOrbs) {
      // « Ramasse tous les globes » : une zone qui les englobe tous, recalculée (position et taille) à chaque globe ramassé
      if (!this.orbsZone || this.orbsCount !== this.sim.xp.orbs.length) {
        const orbs = this.sim.xp.orbs;
        let cx = 0;
        let cy = 0;
        for (const o of orbs) {
          cx += o.x;
          cy += o.y;
        }
        cx /= orbs.length;
        cy /= orbs.length;
        let radius = 0;
        for (const o of orbs) radius = Math.max(radius, Math.hypot(o.x - cx, o.y - cy));
        this.orbsZone = { x: cx, y: cy, kind: 'orbs', radius: radius + 50, label: 'tutoOrbs' };
        this.orbsCount = orbs.length;
      }
      out.push(this.orbsZone);
    } else this.orbsZone = null;
    const inc = this.incoming();
    if (inc) out.push({ x: inc.x, y: inc.y, kind: 'incoming', label: 'tutoIncoming' });
    const r = this.sim.recruits.items.find((i) => i.forced);
    if (r && this.phase === 'wave1' && (r.age ?? 0) >= RECRUIT_LABEL_DELAY) out.push({ x: r.x, y: r.y, kind: 'recruit', label: 'tutoRecruit' }); // flèche et texte arrivent un instant après la recrue ; dernière étape : la recrue n'est plus signalée
    const p = this.powerup && this.sim.powerups.items.includes(this.powerup) ? this.powerup : null;
    if (p) out.push({ x: p.x, y: p.y, kind: 'powerup', label: 'tutoPowerup' });
    return out;
  }

  /** Où arrive la vague : le point d'apparition annoncé pendant la pause (1re vague), puis le centre des aliens vivants jusqu'à ce qu'elle soit vaincue (1re et 2e vagues). */
  private incoming(): Point | null {
    const squad = this.squad;
    if (!squad) return null;
    if (this.phase === 'move1' && this.reachedFor >= 0) {
      return { x: squad.center.x + Math.cos(this.incomingAngle) * TUTORIAL.firstRingRadius, y: squad.center.y + Math.sin(this.incomingAngle) * TUTORIAL.firstRingRadius };
    }
    if (this.phase !== 'wave1' && this.phase !== 'wave2') return null; // 1re vague, puis la 2e (juste après la recrue ramassée)
    if (this.phase === 'wave2' && this.phaseClock < SECOND_WAVE_ARROW_DELAY) return null; // la 2e flèche arrive un instant après les ennemis
    const alive = this.wave.filter((a) => a.alive);
    if (alive.length === 0) return null;
    return { x: alive.reduce((n, a) => n + a.x, 0) / alive.length, y: alive.reduce((n, a) => n + a.y, 0) / alive.length };
  }

  /** Offre de level-up imposée (null : tirage normal) : pendant le tutoriel, les 3 upgrades du script ; le joueur choisit ce qu'il veut. */
  forcedOffer(): UpgradeId[] | null {
    return this.active ? [...TUTORIAL.offer] : null;
  }

  /** Drop d'un alien du script : XP, et recrue / power-up forcés posés à distance de la squad. */
  drop(a: AlienState): void {
    const t = a.tut;
    if (!t) return;
    if (this.sim.xpEnabled && t.xp > 0) this.sim.xp.drop(a, t.xp);
    if (t.recruit) {
      // recrue du script : la 1re apparaît SUR le slime mort, les suivantes à distance de la squad ; elle saute en cloche SUR PLACE et reste
      // imprenable tant qu'elle n'a pas retouché le sol
      const at = this.phase === 'wave1' ? { x: a.x, y: a.y } : this.farSpot(a);
      const rec = this.sim.recruits.drop('trooper', at.x, at.y, undefined, true);
      rec.hop = { vx: 0, vy: 0, t: RECRUIT.hopTime };
      this.recruitSeen = true;
    }
    if (t.powerup) {
      const at = this.farSpot(a);
      this.powerup = this.sim.powerups.drop(t.powerup, at.x, at.y, true);
      this.powerupSeen = true;
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    this.phaseClock += dt;
    const squad = this.squad;
    if (!squad || !squad.alive) return;
    this.start();
    switch (this.phase) {
      case 'move1':
        if (this.reachedFor < 0 && this.reached(squad)) {
          this.marker = null; // atteint : le point vert disparaît, petite pause avant la 1re vague
          this.reachedFor = 0;
          this.incomingAngle = -Math.PI / 9; // les premiers ennemis arrivent par la droite, un peu plus haut que la squad, hors écran
        } else if (this.reachedFor >= 0) this.reachedFor += dt;
        if (this.reachedFor >= TUTORIAL.firstWaveDelay) {
          this.spawn(TUTORIAL.waves.first, TUTORIAL.firstRingRadius, this.incomingAngle);
          this.next('wave1');
        }
        break;
      case 'wave1':
        // vague 1 vaincue ET recrue du slime ramassée : vague suivante (que de l'XP, assez pour un level-up), sans autre étape
        if (this.waveDead() && this.recruitSeen && !this.recruitOnGround()) {
          this.spawn(TUTORIAL.waves.second, TUTORIAL.secondRingRadius, 0); // à droite, encore plus loin
          this.next('wave2');
        }
        break;
      case 'wave2':
        if (this.waveDead() && this.sim.xp.orbs.length === 0) {
          // sécurité : si l'XP des globes n'a pas suffi (valeurs modifiées), on donne ce qui manque pour que le level-up ait lieu
          if (squad.level < 2 && !squad.offer) squad.gainXp(squad.xpNeeded - squad.xp + 0.01);
          else if (squad.level >= 2 && !squad.offer && this.sim.choiceT <= 0) {
            this.spawn(TUTORIAL.waves.third, TUTORIAL.ringRadius, undefined, true);
            this.next('wave3');
          }
        }
        break;
      case 'wave3':
        if (this.waveDead() && this.recruitSeen && !this.recruitOnGround() && this.powerupSeen && !this.powerupOnGround()) {
          this.next('done');
        }
        break;
    }
  }

  // ---------- Aides ----------

  /** Pose le 1er point vert (une seule fois, dès que la squad existe). */
  private start(): void {
    const squad = this.squad;
    if (this.started || !squad || !squad.alive) return;
    this.started = true;
    this.marker = this.place(squad.center, TUTORIAL.markerDistance, -Math.PI / 3); // en haut à droite de la squad (60° au-dessus de l'horizontale)
    this.sim.events.push({ t: 'tutorial', phase: 'move1' });
  }

  private next(phase: TutorialPhase): void {
    this.phase = phase;
    this.phaseClock = 0;
    if (phase === 'done') this.grantReward();
    this.sim.events.push({ t: 'tutorial', phase });
  }

  /** Fin du tutoriel : les upgrades cachées de `TUTORIAL_REWARD` s'ajoutent aux stats de la squad (sans passer par `picked`, donc invisibles). */
  private grantReward(): void {
    const squad = this.squad;
    if (!squad) return;
    for (const [id, count] of Object.entries(TUTORIAL_REWARD) as [keyof typeof UPGRADES, number][]) {
      const def = UPGRADES[id];
      if (def.stat && def.mod) for (let i = 0; i < count; i++) squad.stats.add(def.stat, def.mod);
      if (id === 'hp') squad.refreshMaxHp(); // les soldats déjà là gagnent les PV max (et autant de PV courants), sans effet à l'écran
    }
  }

  private reached(squad: Squad): boolean {
    const m = this.marker;
    if (!m) return false;
    const r2 = TUTORIAL.markerRadius ** 2;
    return squad.soldiers.some((s) => s.alive && (s.x - m.x) ** 2 + (s.y - m.y) ** 2 <= r2);
  }

  private waveDead(): boolean {
    return this.wave.every((a) => !a.alive);
  }

  private recruitOnGround(): boolean {
    return this.sim.recruits.items.some((r) => r.forced);
  }

  private powerupOnGround(): boolean {
    return !!this.powerup && this.sim.powerups.items.includes(this.powerup);
  }

  /** Fait apparaître une vague autour de la squad et marque ses aliens (leur drop est géré par `drop`). */
  private spawn(groups: TutorialGroup[], radius = TUTORIAL.ringRadius, angle?: number, surround = false): void {
    const c = this.squad!.center;
    this.wave = [];
    this.powerup = null;
    this.recruitSeen = false;
    this.powerupSeen = false;
    for (const g of groups) {
      const made = surround
        ? this.sim.horde.spawnRing(c, g.type, g.count, radius, this.sim.rng.range(0, Math.PI * 2)) // dernière vague : la squad est encerclée
        : this.sim.horde.spawnAround(c, g.type, g.count, radius, angle);
      for (const a of made) {
        a.tut = { xp: g.xp, recruit: !!g.recruit, powerup: g.powerup };
        this.wave.push(a);
      }
    }
  }

  /** Point libre à `dist` px de `from`, dans la direction `angle` (par défaut vers le centre de la carte, en balayant les angles voisins si c'est occupé). */
  private place(from: Point, dist: number, angle?: number): Point {
    const { arena, map } = this.sim;
    const base = angle ?? Math.atan2(map.height / 2 - from.y, map.width / 2 - from.x);
    const b = arena.bounds;
    for (let k = 0; k < 12; k++) {
      const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
      const p = { x: from.x + Math.cos(a) * dist, y: from.y + Math.sin(a) * dist };
      if (p.x < b.minX + 80 || p.x > b.maxX - 80 || p.y < b.minY + 80 || p.y > b.maxY - 80) continue;
      if (arena.isFree(p, 40)) return p;
    }
    return { x: from.x + dist, y: from.y };
  }

  /** Endroit où poser la recrue / le power-up d'un alien mort : à `FAR_SPOT` px de la squad, du côté où l'alien est mort. */
  private farSpot(a: AlienState): Point {
    const c = this.squad!.center;
    const { arena } = this.sim;
    const base = Math.atan2(a.y - c.y, a.x - c.x);
    for (let k = 0; k < 8; k++) {
      const ang = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 5);
      const p = { x: c.x + Math.cos(ang) * FAR_SPOT, y: c.y + Math.sin(ang) * FAR_SPOT };
      if (arena.isFree(p, 30)) return p;
    }
    return { x: a.x, y: a.y };
  }
}
