import type { Point } from '@xiao/engine/sim';
import { TUTORIAL, type TutorialGroup } from '../data/tutorial';
import type { UpgradeId } from '../data/progression';
import type { AlienState, PowerUpState } from './entities';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

/** Étapes de l'onboarding, dans l'ordre (voir `data/tutorial.ts`). */
export type TutorialPhase = 'move1' | 'wave1' | 'move2' | 'wave2' | 'wave3' | 'wave4' | 'done';

/** Ce que l'affichage doit montrer : point vert sur le sol, ou flèche vers une recrue / un power-up à ramasser. */
export interface TutorialTarget {
  x: number;
  y: number;
  kind: 'marker' | 'recruit' | 'powerup';
  /** Clé de texte de la bulle au-dessus de la flèche (absente : pas de bulle). */
  label?: 'tutoRecruit';
}

/** Distance (px) à laquelle tombent la recrue et le power-up du script : à distance de la squad, pour qu'il faille aller les chercher. */
const FAR_SPOT = 240;

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
  /** Dernier point vert atteint (le suivant se place par rapport à lui). */
  private lastMarker: Point | null = null;
  /** Aliens de la vague en cours (pour savoir quand elle est terminée). */
  private wave: AlienState[] = [];
  private powerup: PowerUpState | null = null;
  /** Une recrue / un power-up du script est déjà apparu (puis disparu = ramassé). */
  private recruitSeen = false;
  private powerupSeen = false;

  constructor(private readonly sim: Sim) {}

  get active(): boolean {
    return this.phase !== 'done';
  }

  private get squad(): Squad | undefined {
    return this.sim.squads[0];
  }

  /** Clé de texte du bandeau du haut de l'écran (null : aucun). */
  get banner(): 'tutoOrbs' | null {
    return this.phase === 'wave3' && this.waveDead() && this.sim.xp.orbs.length > 0 ? 'tutoOrbs' : null;
  }

  /** Cibles à montrer : le point vert, la recrue ou le power-up du script. */
  targets(): TutorialTarget[] {
    this.start(); // le point vert est visible dès l'écran de départ, avant le premier input (la simulation ne tourne pas encore)
    const out: TutorialTarget[] = [];
    if (this.marker) out.push({ x: this.marker.x, y: this.marker.y, kind: 'marker' });
    const r = this.sim.recruits.items.find((i) => i.forced);
    if (r) out.push({ x: r.x, y: r.y, kind: 'recruit', label: 'tutoRecruit' });
    const p = this.powerup && this.sim.powerups.items.includes(this.powerup) ? this.powerup : null;
    if (p) out.push({ x: p.x, y: p.y, kind: 'powerup' });
    return out;
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
      const at = this.farSpot(a);
      this.sim.recruits.drop('trooper', at.x, at.y, undefined, true);
      this.recruitSeen = true;
    }
    if (t.powerup) {
      const at = this.farSpot(a);
      this.powerup = this.sim.powerups.drop(t.powerup, at.x, at.y, true);
      this.powerupSeen = true;
    }
  }

  update(): void {
    if (!this.active) return;
    const squad = this.squad;
    if (!squad || !squad.alive) return;
    this.start();
    switch (this.phase) {
      case 'move1':
        if (this.reached(squad)) {
          this.lastMarker = this.marker;
          this.marker = null; // atteint : le point vert disparaît
          this.spawn(TUTORIAL.waves.first);
          this.next('wave1');
        }
        break;
      case 'wave1':
        // vague 1 vaincue : le 2e point vert apparaît un peu plus loin, mais à l'écran
        if (this.waveDead()) {
          this.marker = this.place(this.lastMarker ?? squad.center, TUTORIAL.markerDistance[1]);
          this.next('move2');
        }
        break;
      case 'move2':
        if (this.reached(squad)) {
          this.marker = null;
          this.spawn(TUTORIAL.waves.second);
          this.next('wave2');
        }
        break;
      case 'wave2':
        // la recrue du slime a été ramassée : vague 3, plus grosse (que de l'XP, assez pour un level-up)
        if (this.recruitSeen && !this.recruitOnGround()) {
          this.spawn(TUTORIAL.waves.third);
          this.next('wave3');
        }
        break;
      case 'wave3':
        if (this.waveDead() && this.sim.xp.orbs.length === 0) {
          // sécurité : si l'XP des globes n'a pas suffi (valeurs modifiées), on donne ce qui manque pour que le level-up ait lieu
          if (squad.level < 2 && !squad.offer) squad.gainXp(squad.xpNeeded - squad.xp + 0.01);
          else if (squad.level >= 2 && !squad.offer && this.sim.choiceT <= 0) {
            this.spawn(TUTORIAL.waves.fourth);
            this.next('wave4');
          }
        }
        break;
      case 'wave4':
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
    this.marker = this.place(squad.center, TUTORIAL.markerDistance[0]);
    this.sim.events.push({ t: 'tutorial', phase: 'move1' });
  }

  private next(phase: TutorialPhase): void {
    this.phase = phase;
    this.sim.events.push({ t: 'tutorial', phase });
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
  private spawn(groups: TutorialGroup[]): void {
    const c = this.squad!.center;
    this.wave = [];
    this.powerup = null;
    this.recruitSeen = false;
    this.powerupSeen = false;
    for (const g of groups) {
      for (const a of this.sim.horde.spawnAround(c, g.type, g.count, TUTORIAL.ringRadius)) {
        a.tut = { xp: g.xp, recruit: !!g.recruit, powerup: g.powerup };
        this.wave.push(a);
      }
    }
  }

  /** Point libre à `dist` px de `from`, dans la direction du centre de la carte (en balayant les angles voisins si c'est occupé). */
  private place(from: Point, dist: number): Point {
    const { arena, map } = this.sim;
    const base = Math.atan2(map.height / 2 - from.y, map.width / 2 - from.x);
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
