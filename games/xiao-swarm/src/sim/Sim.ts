import { EventQueue, IdGen, Rng, SpatialHash, WaveDirector, type Point } from '@xiao/engine/sim';
import type { AlienId } from '../data/aliens';
import type { SoldierClassId } from '../data/classes';
import type { MapDef } from '../data/maps';
import type { ModeDef } from '../data/modes';
import { Arena } from './Arena';
import { Combat } from './Combat';
import type { AlienState, SoldierState, Unit } from './entities';
import { Horde } from './Horde';
import { Recruits } from './Recruits';
import { Squad } from './Squad';
import { NO_INPUT, type PlayerId, type PlayerInput, type SimEvent } from './types';

/** Distance minimale entre un point de réapparition et les squads vivantes (hors écran). */
const SAFE_SPAWN_DISTANCE = 700;

/** Distance de spawn des aliens autour d'une squad (hors écran). */
const SPAWN_DISTANCE = 780;

export interface SimConfig {
  mode: ModeDef;
  seed: number;
  players: PlayerId[];
}

/**
 * Simulation complète d'une partie, SANS Phaser ni DOM : elle peut tourner
 * dans le navigateur (solo, ou hôte Netlib) comme sur un serveur Node.
 *
 *   sim.step(dt, inputs)   // tick fixe, inputs par joueur
 *   sim.events.drain(fn)   // effets à jouer / à diffuser
 *
 * Tout l'aléatoire passe par `sim.rng` (seedé) : même seed + mêmes inputs = même partie.
 */
export class Sim {
  readonly rng: Rng;
  readonly ids = new IdGen();
  readonly events = new EventQueue<SimEvent>();
  readonly map: MapDef;
  readonly arena: Arena;
  readonly squads: Squad[];
  readonly aliens: AlienState[] = [];
  readonly alienHash = new SpatialHash<AlienState>(64);
  readonly soldierHash = new SpatialHash<SoldierState>(64);
  readonly horde: Horde;
  readonly combat: Combat;
  readonly recruits: Recruits;
  readonly waves: WaveDirector<AlienId>;
  alienHpMul = 1;
  tick = 0;
  private readonly blasts: { x: number; y: number; r: number; dmg: number; team: string; owner: PlayerId }[] = [];

  constructor(readonly config: SimConfig) {
    this.rng = new Rng(config.seed);
    this.map = config.mode.map(config.seed);
    this.arena = new Arena(this.map);
    this.horde = new Horde(this);
    this.combat = new Combat(this);
    this.recruits = new Recruits(this);
    this.squads = config.players.map((id) => new Squad(this, id));
    this.waves = new WaveDirector(
      config.mode.waves,
      (type, count) => {
        for (const sq of this.aliveSquads) this.horde.spawnNear(sq, type, count, SPAWN_DISTANCE);
      },
      () => this.horde.canSpawn(),
    );
  }

  get mode(): ModeDef {
    return this.config.mode;
  }

  /** Temps de jeu écoulé (s). */
  get time(): number {
    return this.waves.time;
  }

  get aliveSquads(): Squad[] {
    return this.squads.filter((s) => s.alive);
  }

  squadOf(owner: PlayerId): Squad | undefined {
    return this.squads.find((s) => s.owner === owner);
  }

  nearestSquad(x: number, y: number): Squad | undefined {
    let best: Squad | undefined;
    let bestD = Infinity;
    for (const s of this.squads) {
      if (!s.alive) continue;
      const d = (s.center.x - x) ** 2 + (s.center.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** Place chaque squad à son point de départ avec une composition de départ. */
  spawnSquads(pickComposition: () => SoldierClassId[]): void {
    const points = this.mode.spawnPoints(this.map, this.squads.length, this.rng);
    this.squads.forEach((sq, i) => sq.spawn(pickComposition(), points[i]));
  }

  // ---------- Joueurs en cours de partie (réseau) ----------

  /** Crée (sans la placer) la squad d'un joueur qui rejoint. Idempotent. */
  addPlayer(owner: PlayerId): Squad {
    let sq = this.squadOf(owner);
    if (!sq) {
      sq = new Squad(this, owner);
      this.squads.push(sq);
    }
    return sq;
  }

  /** Un joueur part : sa squad disparaît de la partie (ses soldats sont retirés sans mort spectaculaire). */
  removePlayer(owner: PlayerId): void {
    const i = this.squads.findIndex((s) => s.owner === owner);
    if (i === -1) return;
    for (const s of this.squads[i].soldiers) s.alive = false;
    this.squads.splice(i, 1);
    this.events.push({ t: 'squadWiped', owner });
  }

  /**
   * (Re)place la squad d'un joueur à un endroit aléatoire de la carte, à distance des
   * autres squads vivantes (arrivée en cours de partie, ou réapparition après une mort).
   */
  spawnLate(owner: PlayerId, composition: SoldierClassId[], invulnerable = 2.5): void {
    const sq = this.addPlayer(owner);
    if (sq.alive) return;
    sq.spawn(composition, this.randomSpawnPoint());
    for (const s of sq.soldiers) s.invulnerable = invulnerable;
  }

  /** Point libre tiré au hasard, idéalement hors de vue (> SAFE_SPAWN_DISTANCE) des squads vivantes. */
  private randomSpawnPoint(): Point {
    const b = this.arena.bounds;
    const others = this.aliveSquads;
    let best: Point | null = null;
    let bestD = -1;
    for (let i = 0; i < 30; i++) {
      const p = { x: this.rng.range(b.minX + 120, b.maxX - 120), y: this.rng.range(b.minY + 120, b.maxY - 120) };
      if (!this.arena.isFree(p, 80)) continue;
      const d = others.reduce((m, o) => Math.min(m, Math.hypot(o.center.x - p.x, o.center.y - p.y)), Infinity);
      if (d >= SAFE_SPAWN_DISTANCE) return p;
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    return best ?? { x: this.map.width / 2, y: this.map.height / 2 };
  }

  // ---------- Tick ----------

  step(dt: number, inputs: ReadonlyMap<PlayerId, PlayerInput>): void {
    this.tick++;
    for (const sq of this.squads) {
      for (const s of sq.soldiers) {
        s.px = s.x;
        s.py = s.y;
      }
    }
    for (const a of this.aliens) {
      a.px = a.x;
      a.py = a.y;
    }

    this.waves.update(dt);
    this.rebuildHashes();
    for (const sq of this.squads) sq.update(dt, inputs.get(sq.owner) ?? NO_INPUT);
    this.horde.update(dt);
    this.combat.update(dt);
    this.recruits.update(dt);
    this.cleanup();
  }

  private rebuildHashes(): void {
    this.alienHash.clear();
    for (const a of this.aliens) if (a.alive) this.alienHash.insert(a);
    this.soldierHash.clear();
    for (const sq of this.squads) for (const s of sq.soldiers) if (s.alive) this.soldierHash.insert(s);
  }

  // ---------- Dégâts & morts ----------

  /** Dégâts à n'importe quelle unité. `attacker` = joueur crédité du kill. */
  damage(u: Unit, amount: number, attacker: PlayerId | null, dirX = 0, dirY = 0): void {
    if (u.kind === 'soldier') {
      this.damageSoldier(u, amount, attacker);
      return;
    }
    if (!u.alive) return;
    u.hp -= amount;
    u.kx += (dirX * 40) / u.mass;
    u.ky += (dirY * 40) / u.mass;
    this.events.push({ t: 'hit', id: u.id });
    if (u.hp <= 0) this.killAlien(u, attacker);
  }

  damageSoldier(s: SoldierState, amount: number, attacker: PlayerId | null = null): void {
    if (!s.alive || s.invulnerable > 0) return;
    s.hp -= amount;
    this.events.push({ t: 'hit', id: s.id });
    if (s.hp > 0) return;
    s.alive = false;
    if (attacker && attacker !== s.owner) {
      const k = this.squadOf(attacker);
      if (k) k.kills++;
    }
    const blast = s.def.deathBlast;
    if (blast) this.blasts.push({ x: s.x, y: s.y, r: blast.radius, dmg: blast.damage, team: s.team, owner: s.owner });
  }

  private killAlien(a: AlienState, killer: PlayerId | null): void {
    a.alive = false;
    const squad = killer ? this.squadOf(killer) : undefined;
    if (squad) squad.kills++;
    this.events.push({ t: 'alienDied', id: a.id, x: a.x, y: a.y, alien: a.def.id, killer });
    this.recruits.maybeDrop(a, squad);
  }

  /** Retire les morts en fin de tick (jamais pendant les itérations). */
  private cleanup(): void {
    // Explosions de Flammeurs morts (peuvent en tuer d'autres)
    while (this.blasts.length > 0) {
      const b = this.blasts.shift()!;
      this.events.push({ t: 'explosion', x: b.x, y: b.y, r: b.r });
      for (const a of this.aliens) this.blastHit(a, b);
      if (this.mode.pvp) for (const sq of this.squads) if (sq.owner !== b.owner) for (const s of sq.soldiers) this.blastHit(s, b);
    }

    for (let i = this.aliens.length - 1; i >= 0; i--) if (!this.aliens[i].alive) this.aliens.splice(i, 1);

    for (const sq of this.squads) {
      const hadSoldiers = sq.size > 0;
      for (const s of sq.removeDead()) {
        this.events.push({ t: 'soldierDied', id: s.id, x: s.x, y: s.y, cls: s.def.id, owner: s.owner });
      }
      if (hadSoldiers && sq.size === 0) this.events.push({ t: 'squadWiped', owner: sq.owner });
    }
  }

  private blastHit(u: Unit, b: { x: number; y: number; r: number; dmg: number; owner: PlayerId }): void {
    if (!u.alive) return;
    const dx = u.x - b.x;
    const dy = u.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > b.r + u.radius) return;
    u.kx += ((dx / d) * 300) / u.mass;
    u.ky += ((dy / d) * 300) / u.mass;
    this.damage(u, b.dmg, b.owner);
  }

  // ---------- Revive ----------

  /** Relance une squad anéantie (pub récompensée en solo) en dégageant les aliens proches. */
  respawnSquad(owner: PlayerId, composition: SoldierClassId[], invulnerable = 2.5): void {
    const sq = this.squadOf(owner);
    if (!sq) return;
    const at = { x: sq.anchor.x, y: sq.anchor.y };
    for (const a of this.aliens) if (Math.hypot(a.x - at.x, a.y - at.y) < 420) a.alive = false;
    this.aliens.splice(0, this.aliens.length, ...this.aliens.filter((a) => a.alive));
    sq.spawn(composition, at);
    for (const s of sq.soldiers) s.invulnerable = invulnerable;
  }
}
