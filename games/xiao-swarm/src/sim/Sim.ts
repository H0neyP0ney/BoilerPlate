import { EventQueue, IdGen, Rng, SpatialHash, type Point } from '@xiao/engine/sim';
import { CAPTIVE_VULN, DIFFICULTY, REVIVE_RADIUS, REVIVE_SQUAD_RATIO, REVIVE_TIME } from '../config';
import { ALIENS } from '../data/aliens';
import { START_SQUADS, type SoldierClassId } from '../data/classes';
import type { MapDef } from '../data/maps';
import type { ModeDef } from '../data/modes';
import { Arena } from './Arena';
import { Combat } from './Combat';
import type { AlienState, Corpse, FirePatch, Puddle, ReviveZone, SoldierState, Unit } from './entities';
import { Horde } from './Horde';
import { PowerUps } from './PowerUps';
import { Recruits } from './Recruits';
import { Xp } from './Xp';
import { WaveRunner } from './WaveRunner';
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
  /** Globes d'XP et montées de niveau (solo / bots). Faux en ligne : pas de pause possible pour choisir une upgrade. */
  xp?: boolean;
}

/** Durée (s) pendant laquelle la flaque d'un slime mort peut encore être ressuscitée. */
const CORPSE_TTL = 14;

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
  /** Flaques de slimes morts, que les chamans peuvent ressusciter. */
  readonly corpses: Corpse[] = [];
  /** Flaques de flammes laissées par les slimes de feu. */
  readonly fires: FirePatch[] = [];
  /** Coop : zones où un joueur mort peut être ramené par un équipier. */
  readonly reviveZones: ReviveZone[] = [];
  /** Ondes de choc en cours d'application (montée de niveau). */
  private readonly shockwaves: { x: number; y: number; r: number; speed: number; left: number }[] = [];
  /** Flaques de crachat : ralentissent les soldats dedans. */
  readonly puddles: Puddle[] = [];
  private burnCd = 0;
  /** Le boss final est mort : la partie (survie) est gagnée. */
  finalBossDead = false;
  readonly alienHash = new SpatialHash<AlienState>(64);
  readonly soldierHash = new SpatialHash<SoldierState>(64);
  readonly horde: Horde;
  readonly combat: Combat;
  readonly recruits: Recruits;
  readonly powerups: PowerUps;
  readonly xp: Xp;
  /** Tampon réutilisé pour les requêtes de voisinage (évite les allocations). */
  readonly scratchSoldiers: SoldierState[] = [];
  readonly waves: WaveRunner;
  alienHpMul = 1;
  tick = 0;
  private readonly blasts: { x: number; y: number; r: number; dmg: number; team: string; owner: PlayerId; knock: number; style?: 'slime' | 'fire' | 'spit' | 'acid' }[] = [];
  /** Explosions retardées (kamikaze mort) : le corps reste sur place jusqu'à la fin de la mèche. */
  private readonly fuses: { x: number; y: number; t: number; r: number; dmg: number; knock: number }[] = [];

  constructor(readonly config: SimConfig) {
    this.rng = new Rng(config.seed);
    this.map = config.mode.map(config.seed);
    this.arena = new Arena(this.map);
    this.horde = new Horde(this);
    this.combat = new Combat(this);
    this.recruits = new Recruits(this);
    this.powerups = new PowerUps(this);
    this.xp = new Xp(this);
    this.squads = config.players.map((id) => new Squad(this, id));
    this.waves = new WaveRunner(
      config.mode.waves,
      (type, count) => {
        // Difficulté dynamique : chaque squad vivante reçoit sa vague (2 joueurs = 2× plus d'ennemis, 1 seul vivant = retour à ×1).
        // Un boss, lui, n'apparaît qu'une fois, avec des PV × le nombre de squads vivantes.
        // Le plafond d'aliens est appliqué par type dans Horde.spawnNear (les costauds gardent une réserve de places).
        const squads = this.aliveSquads;
        if (squads.length === 0) return;
        if (ALIENS[type].boss) {
          this.horde.spawnNear(squads[Math.floor(this.rng.next() * squads.length)], type, count, SPAWN_DISTANCE, squads.length);
        } else for (const sq of squads) this.horde.spawnNear(sq, type, Math.round(count * DIFFICULTY.alienCountMul), SPAWN_DISTANCE);
      },
      this.rng,
    );
  }

  /** Nouvelle partie dans la même simulation (coop : tous les joueurs sont morts, ou le boss final est tombé). */
  restart(): void {
    this.aliens.length = 0;
    this.corpses.length = 0;
    this.fires.length = 0;
    this.reviveZones.length = 0;
    this.puddles.length = 0;
    this.shockwaves.length = 0;
    this.arena.rocks.length = 0;
    this.blasts.length = 0;
    this.fuses.length = 0;
    this.combat.clear();
    this.recruits.clear();
    this.powerups.clear();
    this.xp.clear();
    this.finalBossDead = false;
    this.waves.reset();
    for (const sq of this.squads) sq.resetRun();
    this.spawnSquads(() => this.rng.pick(START_SQUADS));
    for (const sq of this.squads) for (const s of sq.soldiers) s.invulnerable = 2.5;
    this.events.push({ t: 'restart' });
  }

  get xpEnabled(): boolean {
    return this.config.xp === true;
  }

  /** Le joueur `owner` choisit l'upgrade `index` parmi celles qui lui sont proposées. */
  chooseUpgrade(owner: PlayerId, index: number): boolean {
    return this.squadOf(owner)?.chooseUpgrade(index) ?? false;
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
    this.removeReviveZone(owner);
    this.events.push({ t: 'squadWiped', owner });
  }

  /**
   * (Re)place la squad d'un joueur à un endroit aléatoire de la carte, à distance des
   * autres squads vivantes (arrivée en cours de partie, ou réapparition après une mort).
   */
  spawnLate(owner: PlayerId, composition: SoldierClassId[], invulnerable = 2.5): void {
    const sq = this.addPlayer(owner);
    if (sq.alive) return;
    // coop : on arrive à côté de ses équipiers ; sinon (PvP) à l'écart des autres squads
    const mate = this.mode.pvp ? undefined : this.aliveSquads[0];
    const at = mate ? { x: mate.center.x + 90, y: mate.center.y } : this.randomSpawnPoint();
    sq.spawn(composition, at);
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
    if (this.xpEnabled) this.xp.update(dt);
    this.updateCorpsesAndRocks(dt);
    this.updateFires(dt);
    this.updateReviveZones(dt);
    for (let i = this.puddles.length - 1; i >= 0; i--) if ((this.puddles[i].ttl -= dt) <= 0) this.puddles.splice(i, 1);
    this.powerups.update(dt);
    this.updateShockwaves(dt);
    for (let i = this.fuses.length - 1; i >= 0; i--) {
      const f = this.fuses[i];
      f.t -= dt;
      if (f.t > 0) continue;
      this.addBlast(f.x, f.y, f.r, f.dmg, 'aliens', 'aliens', f.knock, 'fire');
      this.fuses.splice(i, 1);
    }
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
    if (u.captive) amount *= CAPTIVE_VULN; // une bulle qui digère un soldat est super vulnérable
    u.hp -= amount;
    u.kx += (dirX * 40) / u.mass;
    u.ky += (dirY * 40) / u.mass;
    this.events.push({ t: 'hit', id: u.id });
    if (u.hp <= 0) this.killAlien(u, attacker);
  }

  /** Une flaque disparaît (délai écoulé, trop nombreuses) ou sert : le chaman qui l'incante la ressuscite. */
  private endCorpse(c: Corpse, revived: boolean): void {
    const i = this.corpses.indexOf(c);
    if (i >= 0) this.corpses.splice(i, 1);
    this.events.push({ t: 'corpseEnd', id: c.id, x: c.x, y: c.y, revived });
  }

  /** Ressuscite le slime de la flaque `c` avec `hpFrac` de ses PV (il ne pourra pas l'être une seconde fois). */
  reviveCorpse(c: Corpse, hpFrac: number): void {
    this.endCorpse(c, true);
    this.horde.spawnAt(c.type, c.x, c.y, hpFrac, true);
  }

  /** Caillou lancé par un alien : obstacle au sol pendant `ttl` secondes. */
  addRock(x: number, y: number, radius: number, ttl: number): void {
    const rock = { id: this.ids.get(), x, y, radius, ttl };
    this.arena.rocks.push(rock);
    this.events.push({ t: 'rock', id: rock.id, x, y, r: radius, ttl });
    if (this.arena.rocks.length > 40) this.arena.rocks.shift(); // l'affichage se cale sur la liste (snapshot) : le visuel disparaît avec la collision
  }

  /**
   * Onde de choc : pendant `duration` s, tous les aliens du rayon `r` autour de (x, y) reculent à `speed` px/s (plus vite au
   * centre). Déplacement direct, pas une impulsion : un alien lourd (masse élevée) ou rapide est repoussé comme un léger.
   */
  shockwave(x: number, y: number, r: number, speed: number, duration: number): void {
    this.shockwaves.push({ x, y, r, speed, left: duration });
  }

  private updateShockwaves(dt: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const w = this.shockwaves[i];
      const step = Math.min(dt, w.left);
      for (const a of this.aliens) {
        const dx = a.x - w.x;
        const dy = a.y - w.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > w.r) continue;
        const k = (1 - (d / w.r) * 0.6) * w.speed * step * (a.def.capture ? 0.35 : 1); // les bulles sont difficiles à repousser
        a.x += (dx / d) * k;
        a.y += (dy / d) * k;
        this.arena.constrain(a);
      }
      w.left -= step;
      if (w.left <= 1e-6) this.shockwaves.splice(i, 1);
    }
  }

  /** Facteur de vitesse d'un alien à cet endroit (1 = libre ; globe de stase : très lent). */
  stasisAt(x: number, y: number): number {
    return this.powerups.fields.length > 0 ? this.powerups.stasisAt(x, y) : 1;
  }

  /** Flaque de crachat : les soldats dedans vont à `slow` × leur vitesse pendant `ttl` s. */
  addPuddle(x: number, y: number, r: number, ttl: number, slow: number): void {
    this.puddles.push({ id: this.ids.get(), x, y, r, ttl, slow });
    if (this.puddles.length > 40) this.puddles.shift();
  }

  /** Facteur de vitesse d'un soldat à cet endroit (1 = libre ; les flaques ne se cumulent pas : la plus forte l'emporte). */
  slowAt(x: number, y: number, radius: number): number {
    let k = 1;
    for (const p of this.puddles) {
      const rr = p.r + radius * 0.5;
      if ((x - p.x) ** 2 + (y - p.y) ** 2 < rr * rr) k = Math.min(k, p.slow);
    }
    return k;
  }

  /** Flaque de flammes : brûle les soldats dedans pendant `ttl` s. */
  addFire(x: number, y: number, r: number, ttl: number, dps: number): void {
    const f: FirePatch = { id: this.ids.get(), x, y, r, ttl, dps };
    this.fires.push(f);
    this.events.push({ t: 'fire', id: f.id, x, y, r, ttl });
    if (this.fires.length > 150) this.endFire(this.fires[0]);
  }

  private endFire(f: FirePatch): void {
    const i = this.fires.indexOf(f);
    if (i >= 0) this.fires.splice(i, 1);
    this.events.push({ t: 'fireEnd', id: f.id });
  }

  /** Durée des flammes, et brûlure des soldats qui marchent dedans (par petits coups toutes les 0,25 s). */
  private updateFires(dt: number): void {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.ttl -= dt;
      if (f.ttl <= 0) this.endFire(f);
    }
    this.burnCd -= dt;
    if (this.burnCd > 0) return;
    this.burnCd = 0.25;
    if (this.fires.length === 0) return;
    for (const sq of this.squads) {
      for (const s of sq.soldiers) {
        if (!s.alive) continue;
        let dps = 0;
        for (const f of this.fires) {
          const rr = f.r + s.radius * 0.5;
          if ((s.x - f.x) ** 2 + (s.y - f.y) ** 2 < rr * rr) dps = Math.max(dps, f.dps); // les flaques ne se cumulent pas
        }
        if (dps > 0) this.damageSoldier(s, dps * 0.25);
      }
    }
  }

  private removeReviveZone(owner: PlayerId): void {
    const i = this.reviveZones.findIndex((z) => z.owner === owner);
    if (i >= 0) this.reviveZones.splice(i, 1);
  }

  /** Un équipier vivant resté `REVIVE_TIME` s dans la zone ramène le joueur mort, avec une escouade de base (sa progression est conservée). */
  private updateReviveZones(dt: number): void {
    for (let i = this.reviveZones.length - 1; i >= 0; i--) {
      const z = this.reviveZones[i];
      const sq = this.squadOf(z.owner);
      if (!sq || sq.alive) {
        this.reviveZones.splice(i, 1);
        continue;
      }
      let inside = false;
      for (const mate of this.squads) {
        if (!mate.alive || mate === sq) continue;
        if (mate.soldiers.some((s) => s.alive && (s.x - z.x) ** 2 + (s.y - z.y) ** 2 <= (z.r + s.radius) ** 2)) {
          inside = true;
        }
      }
      z.progress = inside ? Math.min(REVIVE_TIME, z.progress + dt) : Math.max(0, z.progress - dt);
      if (z.progress < REVIVE_TIME) continue;
      this.reviveZones.splice(i, 1);
      // escouade de base, ramenée (ou complétée en gunners) à 60 % de la taille max atteinte par ce joueur
      const target = Math.max(1, Math.min(sq.maxSize, Math.round(sq.peakSize * REVIVE_SQUAD_RATIO)));
      const base = this.rng.pick(START_SQUADS);
      const comp = base.slice(0, target);
      while (comp.length < target) comp.push('gunner');
      sq.spawn(comp, { x: z.x, y: z.y });
      for (const s of sq.soldiers) s.invulnerable = 2.5;
    }
  }

  private updateCorpsesAndRocks(dt: number): void {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.ttl -= dt;
      if (c.claimed && !this.aliens.some((a) => a.alive && a.id === c.claimed)) c.claimed = 0; // le chaman est mort
      if (c.ttl <= 0) this.endCorpse(c, false);
    }
    for (let i = this.arena.rocks.length - 1; i >= 0; i--) {
      const r = this.arena.rocks[i];
      r.ttl -= dt;
      if (r.ttl > 0) continue;
      this.arena.rocks.splice(i, 1);
      this.events.push({ t: 'rockEnd', id: r.id });
    }
  }

  /** Explosion de zone (résolue en fin de tick, comme la mort d'un Flammeur). `team` / `owner` = camp épargné. */
  addBlast(x: number, y: number, r: number, dmg: number, team: string, owner: PlayerId, knock = 300, style?: 'slime' | 'fire' | 'spit' | 'acid'): void {
    this.blasts.push({ x, y, r, dmg, team, owner, knock, style });
  }

  /** `force` : dégâts qui passent même sur un soldat protégé (digestion par une bulle : c'est la seule source qui l'atteint). */
  damageSoldier(s: SoldierState, amount: number, attacker: PlayerId | null = null, force = false): void {
    if (!s.alive) return;
    if (!force && (s.invulnerable > 0 || s.capturedBy)) return;
    s.hp -= amount;
    if (!force) this.events.push({ t: 'hit', id: s.id });
    if (s.hp > 0) return;
    s.alive = false;
    if (attacker && attacker !== s.owner) {
      const k = this.squadOf(attacker);
      if (k) k.kills++;
    }
    const blast = s.def.deathBlast;
    if (blast) this.blasts.push({ x: s.x, y: s.y, r: blast.radius, dmg: blast.damage, team: s.team, owner: s.owner, knock: 300 });
  }

  private killAlien(a: AlienState, killer: PlayerId | null): void {
    a.alive = false;
    const squad = killer ? this.squadOf(killer) : undefined;
    if (squad) squad.kills++;
    this.events.push({ t: 'alienDied', id: a.id, x: a.x, y: a.y, alien: a.def.id, killer });
    if (a.def.boss) {
      this.events.push({ t: 'bossDown', alien: a.def.id, kind: a.def.boss.kind });
      if (a.def.boss.kind === 'final') this.finalBossDead = true;
    }
    if (a.captive) {
      // la bulle éclate : le soldat est libéré (brève protection, petit recul)
      const s = a.captive;
      a.captive = null;
      s.capturedBy = 0;
      s.invulnerable = 1.2;
      s.ky += 120;
      this.events.push({ t: 'release', soldier: s.id, x: s.x, y: s.y });
    }
    if (a.def.revivable && !a.revived) {
      const c: Corpse = { id: this.ids.get(), x: a.x, y: a.y, type: a.def.id, ttl: CORPSE_TTL, claimed: 0 };
      this.corpses.push(c);
      this.events.push({ t: 'corpse', id: c.id, x: c.x, y: c.y, alien: c.type, ttl: c.ttl });
      if (this.corpses.length > 60) this.endCorpse(this.corpses[0], false);
    }
    const bomb = a.def.deathBlast;
    if (bomb) {
      this.fuses.push({ x: a.x, y: a.y, t: bomb.delay, r: bomb.radius, dmg: bomb.damage, knock: bomb.knockback });
      this.events.push({ t: 'fuse', x: a.x, y: a.y, r: bomb.radius, delay: bomb.delay, alien: a.def.id });
    }
    this.recruits.maybeDrop(a, squad);
    if (this.xpEnabled) this.xp.drop(a);
  }

  /** Retire les morts en fin de tick (jamais pendant les itérations). */
  private cleanup(): void {
    // Explosions de Flammeurs morts (peuvent en tuer d'autres)
    while (this.blasts.length > 0) {
      const b = this.blasts.shift()!;
      const fromAlien = b.team === 'aliens';
      this.events.push({ t: 'explosion', x: b.x, y: b.y, r: b.r, style: b.style ?? (fromAlien ? 'slime' : undefined) });
      if (fromAlien) {
        // boule de slime : blesse tous les soldats (jamais les aliens), même hors PvP
        for (const sq of this.squads) for (const s of sq.soldiers) this.blastHit(s, b);
        continue;
      }
      for (const a of this.aliens) this.blastHit(a, b);
      if (this.mode.pvp) for (const sq of this.squads) if (sq.owner !== b.owner) for (const s of sq.soldiers) this.blastHit(s, b);
    }

    for (let i = this.aliens.length - 1; i >= 0; i--) if (!this.aliens[i].alive) this.aliens.splice(i, 1);

    for (const sq of this.squads) {
      const hadSoldiers = sq.size > 0;
      const deadOfSquad = sq.removeDead();
      for (const s of deadOfSquad) {
        this.events.push({ t: 'soldierDied', id: s.id, x: s.x, y: s.y, cls: s.def.id, owner: s.owner });
      }
      if (hadSoldiers && sq.size === 0) {
        this.events.push({ t: 'squadWiped', owner: sq.owner });
        if (this.mode.reviveZones && !this.reviveZones.some((z) => z.owner === sq.owner)) {
          const last = deadOfSquad[deadOfSquad.length - 1];
          this.reviveZones.push({ owner: sq.owner, x: last.x, y: last.y, r: REVIVE_RADIUS, progress: 0 });
        }
      }
    }
  }

  private blastHit(u: Unit, b: { x: number; y: number; r: number; dmg: number; owner: PlayerId; knock: number }): void {
    if (!u.alive) return;
    const dx = u.x - b.x;
    const dy = u.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > b.r + u.radius) return;
    u.kx += ((dx / d) * b.knock) / u.mass;
    u.ky += ((dy / d) * b.knock) / u.mass;
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
