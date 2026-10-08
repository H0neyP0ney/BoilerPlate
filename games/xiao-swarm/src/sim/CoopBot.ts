import { Rng } from '@xiao/engine/sim';
import { BOT_LEVELS, BOT_UPGRADE_PRIORITY, type BotLevel, type BotLevelDef } from '../data/bots';
import type { AlienState } from './entities';
import type { Sim } from './Sim';
import type { Squad } from './Squad';
import type { PlayerId, PlayerInput } from './types';

/** Nombre de directions candidates évaluées à chaque décision (+ « rester sur place »). */
const DIRS = 16;
const COS: number[] = [];
const SIN: number[] = [];
for (let i = 0; i < DIRS; i++) {
  COS.push(Math.cos((i / DIRS) * Math.PI * 2));
  SIN.push(Math.sin((i / DIRS) * Math.PI * 2));
}
/** Indice du candidat « rester sur place ». */
const STAY = DIRS;

/** Distance (px) à partir de laquelle l'arène repousse la squad vers l'intérieur. */
const EDGE = 220;
/** Fenêtre (s) de mesure pour détecter une squad coincée contre le décor. */
const STUCK_WINDOW = 0.5;
/** Durée (s) du contournement une fois coincé. */
const STUCK_ESCAPE = 0.9;
/** Bonus du candidat choisi à la décision précédente (et de ses voisins) : évite de zigzaguer entre deux directions proches. */
const KEEP_BONUS = 0.18;

/**
 * Coéquipier IA du coop : produit un `PlayerInput` (déplacement) et choisit ses upgrades, exactement comme un joueur humain.
 * Le tir est automatique (voir Combat), donc tout le jeu du bot est de placer sa squad.
 *
 * À chaque décision il évalue 16 directions (+ rester sur place) : pour chacune, où sera la squad dans `probes` secondes,
 * et combien de danger il y trouve (aliens, projectiles, flaques, attaques annoncées, décor, bords), moins ce qu'il y gagne
 * (globe d'XP, recrue, power-up, équipier à relever, rapprochement des équipiers). Il prend le meilleur candidat : face à
 * un encerclement il fonce par la brèche la plus mince au lieu de se faire écraser au milieu.
 * Pur (aucun Phaser ni DOM) ; son aléa vient d'un `Rng` seedé. Réglages par niveau : `data/bots.ts`.
 */
export class CoopBot {
  private readonly rng: Rng;
  private cfg: BotLevelDef;
  private levelId: BotLevel;
  private readonly input: PlayerInput = { mx: 0, my: 0 };
  /** Vecteur voulu à la dernière décision, et vecteur lissé effectivement envoyé. */
  private wantX = 0;
  private wantY = 0;
  private outX = 0;
  private outY = 0;
  private timer = 0;
  private wanderAngle: number;
  private wanderT = 0;
  private gatherId = -1;
  private lastDir = STAY;
  private readonly near: AlienState[] = [];
  private readonly threats: AlienState[] = [];
  private readonly far: AlienState[] = [];
  private readonly nearFar: AlienState[] = [];
  private readonly cost = new Array<number>(DIRS + 1).fill(0);
  // détection de blocage
  private stuckClock = 0;
  private stuckFromX = 0;
  private stuckFromY = 0;
  private stuckT = 0;
  private stuckSign = 1;
  /** Dernière décision, pour l'affichage de debug (menace 0 → 1, cible de ramassage). */
  readonly info = { threat: 0, targetX: 0, targetY: 0, hasTarget: false, holding: false };

  constructor(
    readonly owner: PlayerId,
    seed: number,
    level: BotLevel = 'standard',
  ) {
    this.rng = new Rng(seed);
    this.wanderAngle = this.rng.range(0, Math.PI * 2);
    this.levelId = level;
    this.cfg = BOT_LEVELS[level];
  }

  get level(): BotLevel {
    return this.levelId;
  }

  setLevel(level: BotLevel): void {
    this.levelId = level;
    this.cfg = BOT_LEVELS[level];
  }

  /** Dernier déplacement envoyé (debug). */
  get lastMoveX(): number {
    return this.input.mx;
  }

  get lastMoveY(): number {
    return this.input.my;
  }

  /** Le déplacement de ce tick. */
  think(sim: Sim, dt: number): PlayerInput {
    const sq = sim.squadOf(this.owner);
    if (!sq || !sq.alive || sim.choiceT > 0) {
      this.wantX = this.wantY = this.outX = this.outY = 0;
      this.timer = 0;
      this.input.mx = this.input.my = 0;
      this.info.hasTarget = false;
      return this.input;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.cfg.decisionEvery;
      this.decide(sim, sq, Math.max(dt, this.cfg.decisionEvery));
    }
    const k = Math.min(1, dt / Math.max(0.001, this.cfg.smooth));
    this.outX += (this.wantX - this.outX) * k;
    this.outY += (this.wantY - this.outY) * k;
    const len = Math.hypot(this.outX, this.outY);
    const dead = len < 0.08; // sous le seuil : immobile (la squad se soigne et tire, au lieu de trembler)
    this.input.mx = dead ? 0 : len > 1 ? this.outX / len : this.outX;
    this.input.my = dead ? 0 : len > 1 ? this.outY / len : this.outY;
    return this.input;
  }

  /** Indice de l'upgrade à prendre parmi celles proposées, ou -1 s'il n'y a pas de choix ouvert. */
  pickUpgrade(sim: Sim): number {
    const sq = sim.squadOf(this.owner);
    const offer = sq?.offer;
    if (!sq || !offer || offer.length === 0) return -1;
    if (!this.cfg.smartUpgrades) return this.rng.int(0, offer.length - 1);
    let best = 0;
    let bestScore = -Infinity;
    offer.forEach((id, i) => {
      let score = BOT_UPGRADE_PRIORITY[id] * (sq.offerPrism[i] ? 2 : 1);
      if (id === 'reinforce' && sq.size < sq.maxSize * 0.5) score *= 1.5; // squad décimée : des soldats d'abord
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  // ---------- Décision ----------

  private decide(sim: Sim, sq: Squad, dt: number): void {
    const cfg = this.cfg;
    const info = this.info;
    const c = sq.center;
    const speed = sq.moveSpeed;
    const hurt = averageHurt(sq);
    const cost = this.cost;
    cost.fill(0);

    // Aliens qui comptent : ceux à portée de vue.
    const threats = this.threats;
    threats.length = 0;
    for (const a of sim.alienHash.query(c.x, c.y, cfg.sight + 100, this.near)) {
      if (!a.alive) continue;
      if (Math.hypot(a.x - c.x, a.y - c.y) - a.radius < cfg.sight) threats.push(a);
    }

    // Vision lointaine : densité d'aliens dans le secteur de chaque direction (anneau d'apparition, encerclement qui se referme).
    if (cfg.farSight > 0) this.addFarCost(sim, c.x, c.y);

    // --- Danger de chaque candidat : on y sera, à chaque instant sonde, avec ce qui s'y trouve alors ---
    for (const t of cfg.probes) {
      for (let i = 0; i <= DIRS; i++) {
        const px = i === STAY ? c.x : c.x + COS[i] * speed * t;
        const py = i === STAY ? c.y : c.y + SIN[i] * speed * t;
        cost[i] += this.dangerAt(sim, sq, px, py, t, i === STAY);
      }
    }
    // Le danger de rester sur place compte autant que celui d'une direction (mêmes instants sonde).

    // --- Gains : ramassage / réanimation / cohésion ---
    const reward = this.rewards(sim, sq, hurt);

    // --- Choix ---
    let best = STAY;
    let bestScore = Infinity;
    let worst = 0;
    for (let i = 0; i <= DIRS; i++) {
      let score = cost[i] - reward[i];
      if (i === this.lastDir) score -= KEEP_BONUS;
      else if (i !== STAY && this.lastDir !== STAY && (Math.abs(i - this.lastDir) === 1 || Math.abs(i - this.lastDir) === DIRS - 1)) score -= KEEP_BONUS * 0.5;
      if (cost[i] > worst) worst = cost[i];
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    this.lastDir = best;
    info.threat = Math.min(1, cost[STAY] / (cfg.probes.length * 2.5));

    let mx = best === STAY ? 0 : COS[best];
    let my = best === STAY ? 0 : SIN[best];

    // --- Rien à faire : errer doucement (standard), les experts restent en place ---
    if (best === STAY && !info.holding && !cfg.medicStops) {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = this.rng.range(1, 3);
        this.wanderAngle += this.rng.range(-1.2, 1.2);
      }
      mx = Math.cos(this.wanderAngle) * 0.4;
      my = Math.sin(this.wanderAngle) * 0.4;
    }

    // --- Blocage contre le décor : on contourne ---
    this.stuckClock += dt;
    if (this.stuckT > 0) {
      this.stuckT -= dt;
      const a = 1.2 * this.stuckSign;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const rx = mx * cs - my * sn;
      const ry = mx * sn + my * cs;
      mx = rx;
      my = ry;
    }
    if (this.stuckClock >= STUCK_WINDOW) {
      const moved = Math.hypot(c.x - this.stuckFromX, c.y - this.stuckFromY);
      const wanted = Math.hypot(this.input.mx, this.input.my) * speed * this.stuckClock;
      if (this.stuckT <= 0 && wanted > 40 && moved < wanted * 0.25) {
        this.stuckT = STUCK_ESCAPE;
        this.stuckSign = this.rng.chance(0.5) ? 1 : -1;
      }
      this.stuckClock = 0;
      this.stuckFromX = c.x;
      this.stuckFromY = c.y;
    }

    this.wantX = mx;
    this.wantY = my;
  }

  /**
   * Coût lointain de chaque direction : somme des aliens (entre 150 px et `farSight`) dans un secteur d'environ ±40°, pondérée
   * par la proximité, écrasée vers 0 → 1. Une direction « mince » (peu d'aliens loin devant) l'emporte sur celle qui fonce dans la horde.
   */
  private addFarCost(sim: Sim, cx: number, cy: number): void {
    const cfg = this.cfg;
    const far = this.far;
    far.length = 0;
    for (const a of sim.alienHash.query(cx, cy, cfg.farSight, this.nearFar)) if (a.alive) far.push(a);
    if (far.length === 0) return;
    for (let i = 0; i < DIRS; i++) {
      let sum = 0;
      for (const a of far) {
        const dx = a.x - cx;
        const dy = a.y - cy;
        const d = Math.hypot(dx, dy);
        if (d < 150 || d > cfg.farSight) continue;
        const cos = (dx * COS[i] + dy * SIN[i]) / d;
        if (cos < 0.75) continue;
        sum += threatWeight(a) * (1 - d / cfg.farSight) * ((cos - 0.75) / 0.25);
      }
      this.cost[i] += cfg.farWeight * (1 - Math.exp(-sum / 3));
    }
  }

  /** Danger (≥ 0) d'être en (px, py) à l'instant `t` : aliens, tirs, flaques, attaques annoncées, décor, bords. */
  private dangerAt(sim: Sim, sq: Squad, px: number, py: number, t: number, staying: boolean): number {
    const cfg = this.cfg;
    const pr = sq.radius * 0.5; // marge : la squad occupe de la place
    let danger = 0;

    for (const a of this.threats) {
      const ax = a.x + a.vx * t * cfg.lead;
      const ay = a.y + a.vy * t * cfg.lead;
      const reach = cfg.keepDist + a.radius + pr * 0.4;
      const dx = px - ax;
      const dy = py - ay;
      if (Math.abs(dx) >= reach || Math.abs(dy) >= reach) continue;
      const d = Math.hypot(dx, dy);
      if (d >= reach) continue;
      danger += (1 - d / reach) ** 2 * threatWeight(a);
    }

    if (cfg.dodge) {
      for (const p of sim.combat.projectiles.active) {
        if (p.team !== 'aliens') continue;
        if (p.lob) {
          const lx = p.x + p.vx * p.life;
          const ly = p.y + p.vy * p.life;
          const r = p.aoe + pr + 20;
          if (Math.hypot(px - lx, py - ly) < r) danger += 1.6;
          continue;
        }
        const reach = pr + 22;
        const dx = px - (p.x + p.vx * t);
        const dy = py - (p.y + p.vy * t);
        if (dx * dx + dy * dy < reach * reach) danger += 0.9;
      }
      for (const a of this.threats) danger += this.telegraph(a, px, py, pr);
    }

    for (const f of sim.fires) {
      const r = f.r + pr + 20;
      if (Math.hypot(px - f.x, py - f.y) < r) danger += 1.2;
    }
    for (const p of sim.puddles) {
      const r = p.r + pr * 0.6 + 12;
      if (Math.hypot(px - p.x, py - p.y) < r) danger += p.frost ? 2.5 : 0.6; // nuage de glace : gelé si on y entre
    }

    if (!staying && !this.freeAt(sim, px, py, sq.anchor.radius + 6)) danger += 2; // décor : cette direction est bouchée
    const b = sim.arena.bounds;
    danger += edgeCost(px - b.minX) + edgeCost(b.maxX - px) + edgeCost(py - b.minY) + edgeCost(b.maxY - py);
    return danger;
  }

  /** Attaques annoncées d'un alien (expert) : couloir de charge, saut écrasant, slam, explosion de kamikaze. */
  private telegraph(a: AlienState, px: number, py: number, pr: number): number {
    const def = a.def;
    let danger = 0;
    if (def.rush && (a.rushWind > 0 || a.rushT > 0)) {
      const rx = px - a.rushX;
      const ry = py - a.rushY;
      const along = rx * a.rushDx + ry * a.rushDy;
      const across = -rx * a.rushDy + ry * a.rushDx;
      if (along > -80 && along < def.rush.length + 80 && Math.abs(across) < def.rush.width / 2 + pr + 25) danger += 3;
    }
    if (def.leap && a.leapT > 0 && Math.hypot(px - a.leapX, py - a.leapY) < def.leap.radius + pr + 35) danger += 3;
    if (def.slam && a.slamWind > 0 && Math.hypot(px - a.x, py - a.y) < def.slam.radius + pr + 30) danger += 2;
    if (def.deathBlast && Math.hypot(px - a.x, py - a.y) < def.deathBlast.radius + pr + 25) danger += 1.4;
    return danger;
  }

  /** Gain de chaque candidat (indices 0..DIRS-1 = directions, DIRS = rester) : ramassage, réanimation, cohésion. */
  private rewards(sim: Sim, sq: Squad, hurt: number): number[] {
    const cfg = this.cfg;
    const info = this.info;
    const c = sq.center;
    const rew = this.reward;
    rew.fill(0);
    info.holding = false;
    info.hasTarget = false;
    const toward = (tx: number, ty: number, w: number): void => {
      const d = Math.hypot(tx - c.x, ty - c.y) || 0.001;
      const ux = (tx - c.x) / d;
      const uy = (ty - c.y) / d;
      for (let i = 0; i < DIRS; i++) rew[i] += w * Math.max(0, COS[i] * ux + SIN[i] * uy);
    };

    // Relever un équipier à terre : on file à sa zone, puis on y reste.
    let reviving = false;
    let zone: { x: number; y: number; r: number } | null = null;
    let zoneD = cfg.reviveRange;
    for (const z of sim.reviveZones) {
      if (z.owner === this.owner) continue;
      const d = Math.hypot(z.x - c.x, z.y - c.y);
      if (d < zoneD) {
        zoneD = d;
        zone = z;
      }
    }
    if (zone) {
      reviving = true;
      info.hasTarget = true;
      info.targetX = zone.x;
      info.targetY = zone.y;
      if (zoneD > zone.r * 0.45) toward(zone.x, zone.y, 1.4);
      else {
        info.holding = true;
        rew[STAY] += 2;
      }
    }

    // Ramassage : le meilleur globe d'XP / recrue / power-up.
    if (!reviving) {
      let bestScore = 0;
      let bx = 0;
      let by = 0;
      let bid = -1;
      const consider = (id: number, x: number, y: number, value: number): void => {
        const d = Math.hypot(x - c.x, y - c.y);
        if (d > cfg.gather) return;
        let score = value / (d + 80);
        if (id === this.gatherId) score *= 1.3; // fidélité à la cible : pas d'hésitation entre deux globes
        if (score > bestScore) {
          bestScore = score;
          bx = x;
          by = y;
          bid = id;
        }
      };
      for (const o of sim.xp.orbs) consider(o.id, o.x, o.y, o.value);
      for (const r of sim.recruits.items) consider(r.id, r.x, r.y, 14);
      if (cfg.powerups) {
        for (const p of sim.powerups.items) {
          const v = p.kind === 'heal' ? (hurt > 0.3 ? 30 : 2) : p.kind === 'stim' ? 12 : p.kind === 'rockets' ? 14 : p.kind === 'stasis' ? 10 : p.kind === 'reroll' ? 9 : 8;
          consider(p.id, p.x, p.y, v);
        }
      }
      this.gatherId = bid;
      if (bid >= 0) {
        info.hasTarget = true;
        info.targetX = bx;
        info.targetY = by;
        toward(bx, by, cfg.gatherWeight);
      }
    }

    // Cohésion avec l'équipier vivant le plus proche.
    let mate: Squad | undefined;
    let mateD = Infinity;
    for (const o of sim.squads) {
      if (o === sq || !o.alive) continue;
      const d = Math.hypot(o.center.x - c.x, o.center.y - c.y);
      if (d < mateD) {
        mateD = d;
        mate = o;
      }
    }
    if (mate) {
      if (mateD > cfg.leash) toward(mate.center.x, mate.center.y, Math.min(1.3, (mateD - cfg.leash) / cfg.leash + 0.4));
      else {
        const minD = sq.radius + mate.radius + 20; // pas de formations qui se chevauchent
        if (mateD < minD) toward(mate.center.x, mate.center.y, -0.5 * (1 - mateD / minD));
      }
    } else {
      // seul : on se replie vers le centre de la carte plutôt que de traîner dans un coin
      const dx = sim.map.width / 2 - c.x;
      const dy = sim.map.height / 2 - c.y;
      if (Math.hypot(dx, dy) > 500) toward(sim.map.width / 2, sim.map.height / 2, 0.4);
    }

    // Se laisser soigner par un Medic quand tout est calme.
    if (cfg.medicStops && !reviving && hurt > 0.25 && sq.soldiers.some((s) => s.def.heal)) rew[STAY] += 0.9;
    return rew;
  }

  private readonly reward = new Array<number>(DIRS + 1).fill(0);
  private readonly probePoint = { x: 0, y: 0 };

  private freeAt(sim: Sim, x: number, y: number, r: number): boolean {
    this.probePoint.x = x;
    this.probePoint.y = y;
    return sim.arena.isFree(this.probePoint, r);
  }
}

/** Importance d'un alien comme menace (1 = ordinaire). */
function threatWeight(a: AlienState): number {
  const d = a.def;
  if (d.boss) return 1.8;
  if (d.deathBlast || d.rush || d.leap || d.capture) return 1.4;
  return 1;
}

/** Part moyenne de PV manquants des soldats de la squad (0 = tous en pleine forme). */
function averageHurt(sq: Squad): number {
  let missing = 0;
  let n = 0;
  for (const s of sq.soldiers) {
    missing += 1 - s.hp / s.maxHp;
    n++;
  }
  return n ? missing / n : 0;
}

/** Coût (0 → 1,5) d'être à `d` px d'un bord de l'arène. */
function edgeCost(d: number): number {
  return d >= EDGE ? 0 : 1.5 * (1 - Math.max(0, d) / EDGE) ** 2;
}
