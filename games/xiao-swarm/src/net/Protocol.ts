import { REVIVE_TIME } from '../config';
import { ALIENS, type AlienId } from '../data/aliens';
import { CLASSES, type SoldierClassId } from '../data/classes';
import { UPGRADE_IDS } from '../data/progression';
import type { PowerUpKind } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import { ROCKET_TEXTURE } from '../sim/Combat';
import type { PlayerId, SimEvent } from '../sim/types';

/** Version du protocole : hôte et client doivent être identiques. */
export const PROTOCOL_VERSION = 20;

/** Un snapshot toutes les N ticks de simulation (30 Hz / N). */
export const SNAPSHOT_EVERY = 2;

// ---------- Messages de contrôle (JSON, en texte) ----------

/** Client → hôte. */
export type ClientMessage =
  | { t: 'hello'; v: number }
  /** `n` : numéro du tick client (prédiction) ; l'hôte renvoie le dernier reçu dans le snapshot (`ack`). */
  | { t: 'input'; mx: number; my: number; n: number }
  /** Choix d'upgrade au level up (index dans les propositions de sa squad). */
  | { t: 'upgrade'; index: number };

/** Hôte → client. */
export type HostMessage =
  | { t: 'welcome'; v: number; mode: string; seed: number; you: PlayerId; host: PlayerId }
  | { t: 'events'; list: SimEvent[] }
  | { t: 'refused'; reason: string };

export function parseMessage<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

// ---------- Snapshots (binaire) ----------

export interface SoldierSnap {
  id: number;
  cls: SoldierClassId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  aim: number;
  facing: number;
  target: boolean;
  invulnerable: boolean;
  /** Id de la bulle qui le tient captif (0 = libre). */
  capturedBy: number;
}

export interface SquadSnap {
  owner: PlayerId;
  /** Ancre de la squad, vitesse de l'ancre (px/s) et dernier input client pris en compte (`n`) : base de la prédiction du joueur local. */
  anchorX: number;
  anchorY: number;
  speed: number;
  ack: number;
  kills: number;
  maxSize: number;
  healing: boolean;
  /** Progression (XP) : niveau, XP dans le niveau, propositions d'upgrade (index dans UPGRADE_IDS) et nombre de prises de chacune. */
  level: number;
  xp: number;
  offer: number[];
  /** Upgrades prismatiques (mêmes indices que `offer`). */
  offerPrism: boolean[];
  picked: number[];
  /** Power-ups actifs : secondes restantes de stimpack et d'aimant à XP. */
  stim: number;
  soldiers: SoldierSnap[];
}

export interface AlienSnap {
  id: number;
  type: AlienId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  slamWind: number;
  /** Rhinocéros : préparation de la charge (s), charge en cours, direction verrouillée. */
  rushWind: number;
  rushing: boolean;
  rushDx: number;
  rushDy: number;
  /** Point de départ du couloir de charge (télégraphe). */
  rushX: number;
  rushY: number;
  /** Saut écrasant : temps restant de la séquence (s, 0 = au sol) et point d'impact (télégraphe). */
  leapT: number;
  leapX: number;
  leapY: number;
  /** Chaman : incantation en cours (s restantes) et flaque visée. */
  castT: number;
  castCorpse: number;
  /** Zombie (ressuscité par un chaman). */
  zombie: boolean;
  /** Lurker : phase, temps restant dans la phase (s) et direction des pics. */
  lurkPhase: number;
  lurkT: number;
  spikeAng: number;
}

export interface RecruitSnap {
  id: number;
  cls: SoldierClassId;
  x: number;
  y: number;
  life: number;
}

export interface ProjectileSnap {
  x: number;
  y: number;
  vx: number;
  vy: number;
  texture: string;
  flame: boolean;
  /** Grenade en cloche (l'affichage ajoute l'arc). */
  lob: boolean;
  /** life / maxLife, 0 → 1. */
  age: number;
  /** Grenade / boule en cloche seulement : rayon d'explosion, durée du vol (s) et camp (télégraphe rouge des boules ennemies). */
  aoe: number;
  flight: number;
  alien: boolean;
}

export interface Snapshot {
  tick: number;
  time: number;
  /** Choix d'upgrade en cours (s restantes, 0 = aucun) : le jeu est en pause chez tout le monde. */
  choiceT: number;
  squads: SquadSnap[];
  aliens: AlienSnap[];
  recruits: RecruitSnap[];
  projectiles: ProjectileSnap[];
  /** Globes d'XP au sol. */
  orbs: { x: number; y: number; value: number }[];
  /** Coop : zones de réanimation (progression 0 → 1). */
  zones: { owner: PlayerId; x: number; y: number; r: number; progress: number }[];
  /** Flaques de crachat (id, position, rayon, durée restante, facteur de vitesse) et cailloux posés (l'affichage se cale dessus). */
  powerups: { id: number; kind: PowerUpKind; x: number; y: number; life: number }[];
  fields: { id: number; kind: 'heal' | 'stasis'; x: number; y: number; r: number; ttl: number }[];
  puddles: { id: number; x: number; y: number; r: number; ttl: number; slow: number }[];
  rocks: { id: number; x: number; y: number; r: number; ttl: number }[];
  /** Murs annoncés (télégraphe jaune) : centre, direction, longueur, demi-largeur, temps restant et durée du télégraphe. */
  walls: { id: number; x: number; y: number; angle: number; length: number; r: number; ttl: number; t: number; dur: number }[];
}

const CLASS_IDS = Object.keys(CLASSES) as SoldierClassId[];
const ALIEN_IDS = Object.keys(ALIENS) as AlienId[];
const TEXTURES = [
  ...new Set([ROCKET_TEXTURE, ...Object.values(CLASSES).map((c) => c.weapon.texture), ...Object.values(ALIENS).flatMap((a) => (a.lob ? [a.lob.texture] : a.spray ? [a.spray.texture] : []))]),
];

const SNAPSHOT_TAG = 0x53;
const POWERUP_KINDS: PowerUpKind[] = ['stim', 'magnet', 'heal', 'stasis', 'rockets'];

/** Photographie de l'état visible d'une partie (ce qu'un client doit connaître pour afficher). */
export function takeSnapshot(sim: Sim, acks?: ReadonlyMap<PlayerId, number>): Snapshot {
  return {
    tick: sim.tick,
    time: sim.time,
    choiceT: sim.choiceT,
    squads: sim.squads.map((sq) => ({
      owner: sq.owner,
      anchorX: sq.anchor.x,
      anchorY: sq.anchor.y,
      speed: sq.moveSpeed,
      ack: acks?.get(sq.owner) ?? 0,
      kills: sq.kills,
      maxSize: sq.maxSize,
      healing: sq.isHealing,
      level: sq.level,
      xp: sq.xp,
      offer: sq.offer ? sq.offer.map((id) => UPGRADE_IDS.indexOf(id)) : [],
      offerPrism: sq.offer ? sq.offerPrism.slice() : [],
      picked: UPGRADE_IDS.map((id) => sq.picked[id] ?? 0),
      stim: Math.max(0, sq.buffs.stim),
      soldiers: sq.soldiers.map((s) => ({
        id: s.id,
        cls: s.def.id,
        x: s.x,
        y: s.y,
        vx: s.vx,
        vy: s.vy,
        hp: s.hp,
        maxHp: s.maxHp,
        aim: s.aim,
        facing: s.facing,
        target: s.target !== null,
        invulnerable: s.invulnerable > 0,
        capturedBy: s.capturedBy,
      })),
    })),
    aliens: sim.aliens.map((a) => ({
      id: a.id,
      type: a.def.id,
      x: a.x,
      y: a.y,
      vx: a.vx,
      vy: a.vy,
      hp: a.hp,
      maxHp: a.maxHp,
      slamWind: a.slamWind,
      rushWind: a.rushWind,
      rushing: a.rushT > 0,
      rushDx: a.rushDx,
      rushDy: a.rushDy,
      rushX: a.rushX,
      rushY: a.rushY,
      leapT: a.leapT,
      leapX: a.leapX,
      leapY: a.leapY,
      castT: a.castT,
      castCorpse: a.castCorpse,
      zombie: a.revived,
      lurkPhase: a.lurkPhase,
      lurkT: a.lurkT,
      spikeAng: a.spikeAng,
    })),
    recruits: sim.recruits.items.map((r) => ({ id: r.id, cls: r.cls, x: r.x, y: r.y, life: r.life })),
    projectiles: sim.combat.projectiles.active.map((p) => ({
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      texture: p.texture,
      flame: p.flame,
      lob: p.lob,
      age: p.life / p.maxLife,
      aoe: p.aoe,
      flight: p.maxLife,
      alien: p.team === 'aliens',
    })),
    orbs: sim.xp.orbs.map((o) => ({ x: o.x, y: o.y, value: o.value })),
    powerups: sim.powerups.items.map((p) => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, life: p.life })),
    fields: sim.powerups.fields.map((f) => ({ id: f.id, kind: f.kind, x: f.x, y: f.y, r: f.r, ttl: f.ttl })),
    puddles: sim.puddles.map((p) => ({ id: p.id, x: p.x, y: p.y, r: p.r, ttl: p.ttl, slow: p.slow })),
    rocks: sim.arena.rocks.map((k) => ({ id: k.id, x: k.x, y: k.y, r: k.radius, ttl: k.ttl })),
    walls: sim.walls.map((w) => ({ id: w.id, x: w.x, y: w.y, angle: w.angle, length: w.length, r: w.rockR, ttl: w.ttl, t: w.t, dur: w.dur })),
    zones: sim.reviveZones.map((z) => ({ owner: z.owner, x: z.x, y: z.y, r: z.r, progress: z.progress / REVIVE_TIME })),
  };
}

class Writer {
  private buf = new ArrayBuffer(1024);
  private view = new DataView(this.buf);
  private o = 0;

  private need(n: number): void {
    if (this.o + n <= this.buf.byteLength) return;
    const next = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.o + n));
    new Uint8Array(next).set(new Uint8Array(this.buf));
    this.buf = next;
    this.view = new DataView(next);
  }

  /** Borné à 0..255 : un compteur de sim peut passer sous zéro (ex. `rushWind` après la charge), et un octet qui déborde reviendrait de l'autre côté (-6 → 250) et désynchroniserait le décodeur. */
  u8(v: number): void {
    this.need(1);
    this.view.setUint8(this.o, Math.max(0, Math.min(255, Math.round(v))));
    this.o += 1;
  }
  u16(v: number): void {
    this.need(2);
    this.view.setUint16(this.o, Math.max(0, Math.min(65535, Math.round(v))), true);
    this.o += 2;
  }
  i16(v: number): void {
    this.need(2);
    this.view.setInt16(this.o, Math.max(-32768, Math.min(32767, Math.round(v))), true);
    this.o += 2;
  }
  u32(v: number): void {
    this.need(4);
    this.view.setUint32(this.o, v, true);
    this.o += 4;
  }
  f32(v: number): void {
    this.need(4);
    this.view.setFloat32(this.o, v, true);
    this.o += 4;
  }
  str(s: string): void {
    this.u8(s.length);
    for (let i = 0; i < s.length; i++) this.u16(s.charCodeAt(i));
  }
  result(): ArrayBuffer {
    return this.buf.slice(0, this.o);
  }
}

class Reader {
  private readonly view: DataView;
  private o = 0;
  constructor(buf: ArrayBuffer) {
    this.view = new DataView(buf);
  }
  u8(): number {
    const v = this.view.getUint8(this.o);
    this.o += 1;
    return v;
  }
  u16(): number {
    const v = this.view.getUint16(this.o, true);
    this.o += 2;
    return v;
  }
  i16(): number {
    const v = this.view.getInt16(this.o, true);
    this.o += 2;
    return v;
  }
  u32(): number {
    const v = this.view.getUint32(this.o, true);
    this.o += 4;
    return v;
  }
  f32(): number {
    const v = this.view.getFloat32(this.o, true);
    this.o += 4;
    return v;
  }
  str(): string {
    const n = this.u8();
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u16());
    return s;
  }
}

export function encodeSnapshot(s: Snapshot): ArrayBuffer {
  const w = new Writer();
  w.u8(SNAPSHOT_TAG);
  w.u32(s.tick);
  w.f32(s.time);
  w.u8(Math.min(255, Math.round(s.choiceT * 40)));

  w.u8(s.squads.length);
  for (const sq of s.squads) {
    w.str(sq.owner);
    w.f32(sq.anchorX);
    w.f32(sq.anchorY);
    w.u16(Math.min(65535, Math.round(sq.speed)));
    w.u32(sq.ack);
    w.u16(sq.kills);
    w.u8(sq.maxSize);
    w.u8(sq.healing ? 1 : 0);
    w.u8(Math.min(255, sq.level));
    w.u16(Math.min(65535, Math.round(sq.xp * 10)));
    w.u8(sq.offer.length);
    sq.offer.forEach((i, k) => w.u8(i | (sq.offerPrism[k] ? 128 : 0)));
    for (const c of sq.picked) w.u8(Math.min(255, c));
    w.u8(Math.min(255, Math.round(sq.stim * 10)));
    w.u16(sq.soldiers.length);
    for (const u of sq.soldiers) {
      w.u32(u.id);
      w.u8(CLASS_IDS.indexOf(u.cls));
      w.f32(u.x);
      w.f32(u.y);
      w.i16(u.vx);
      w.i16(u.vy);
      w.u16(Math.max(0, u.hp));
      w.u16(u.maxHp);
      w.i16(u.aim * 10000);
      w.u8((u.facing > 0 ? 1 : 0) | (u.target ? 2 : 0) | (u.invulnerable ? 4 : 0) | (u.capturedBy ? 8 : 0));
      if (u.capturedBy) w.u32(u.capturedBy);
    }
  }

  w.u16(s.aliens.length);
  for (const a of s.aliens) {
    w.u32(a.id);
    w.u8(ALIEN_IDS.indexOf(a.type));
    w.f32(a.x);
    w.f32(a.y);
    w.i16(a.vx);
    w.i16(a.vy);
    w.f32(a.maxHp); // les boss dépassent 65535 PV : PV max en f32, PV courants en part du max
    w.u16(Math.round(Math.max(0, Math.min(1, a.hp / a.maxHp)) * 65535));
    w.u8(Math.min(255, Math.round(a.slamWind * 200)));
    w.u8((a.rushing ? 1 : 0) | (a.zombie ? 2 : 0));
    const def = ALIENS[a.type];
    if (def.rush) {
      w.u8(Math.min(255, Math.round(a.rushWind * 200)));
      w.u8(Math.round(a.rushDx * 100 + 100));
      w.u8(Math.round(a.rushDy * 100 + 100));
      if (Math.round(a.rushWind * 200) > 0 || a.rushing) {
        w.f32(a.rushX);
        w.f32(a.rushY);
      }
    }
    if (def.leap) {
      const leapByte = Math.max(0, Math.min(255, Math.round(a.leapT * 50)));
      w.u8(leapByte);
      if (leapByte > 0) { // même test que le décodeur (octet arrondi, pas la valeur brute)
        w.f32(a.leapX);
        w.f32(a.leapY);
      }
    }
    if (def.revive) {
      const castByte = Math.max(0, Math.min(255, Math.round(a.castT * 100)));
      w.u8(castByte);
      if (castByte > 0) w.u32(a.castCorpse);
    }
    if (def.lurk) {
      w.u8(a.lurkPhase);
      w.u8(Math.min(255, Math.round(a.lurkT * 30)));
      w.f32(a.spikeAng);
    }
  }

  w.u16(s.recruits.length);
  for (const r of s.recruits) {
    w.u32(r.id);
    w.u8(CLASS_IDS.indexOf(r.cls));
    w.f32(r.x);
    w.f32(r.y);
    w.u8(Math.min(255, Math.round(r.life * 10)));
  }

  w.u16(s.projectiles.length);
  for (const p of s.projectiles) {
    w.f32(p.x);
    w.f32(p.y);
    w.i16(p.vx);
    w.i16(p.vy);
    w.u8(TEXTURES.indexOf(p.texture));
    w.u8((p.flame ? 1 : 0) | (p.lob ? 2 : 0) | (Math.round(p.age * 31) << 3));
    if (p.lob) {
      w.u8(Math.min(255, Math.round(p.aoe)));
      w.u8(Math.min(255, Math.round(p.flight * 50)));
      w.u8(p.alien ? 1 : 0);
    }
  }

  w.u16(s.orbs.length);
  for (const o of s.orbs) {
    w.f32(o.x);
    w.f32(o.y);
    w.u8(o.value);
  }

  w.u8(s.zones.length);
  for (const z of s.zones) {
    w.str(z.owner);
    w.f32(z.x);
    w.f32(z.y);
    w.u16(Math.round(z.r));
    w.u8(Math.round(Math.min(1, z.progress) * 255));
  }

  w.u8(Math.min(255, s.powerups.length));
  for (const p of s.powerups.slice(0, 255)) {
    w.u32(p.id);
    w.u8(POWERUP_KINDS.indexOf(p.kind));
    w.f32(p.x);
    w.f32(p.y);
    w.u8(Math.min(255, Math.round(p.life * 10)));
  }
  w.u8(Math.min(255, s.fields.length));
  for (const f of s.fields.slice(0, 255)) {
    w.u32(f.id);
    w.u8(f.kind === 'heal' ? 0 : 1);
    w.f32(f.x);
    w.f32(f.y);
    w.u16(Math.round(f.r));
    w.u8(Math.min(255, Math.round(f.ttl * 10)));
  }

  w.u8(Math.min(255, s.puddles.length));
  for (const p of s.puddles.slice(0, 255)) {
    w.u32(p.id);
    w.f32(p.x);
    w.f32(p.y);
    w.u16(Math.round(p.r));
    w.u8(Math.min(255, Math.round(p.ttl * 10)));
    w.u8(Math.round(p.slow * 100));
  }
  w.u8(Math.min(255, s.rocks.length));
  for (const k of s.rocks.slice(0, 255)) {
    w.u32(k.id);
    w.f32(k.x);
    w.f32(k.y);
    w.u16(Math.round(k.r));
    w.u8(Math.min(255, Math.round(k.ttl * 10)));
  }
  w.u8(Math.min(255, s.walls.length));
  for (const k of s.walls.slice(0, 255)) {
    w.u32(k.id);
    w.f32(k.x);
    w.f32(k.y);
    w.f32(k.angle);
    w.u16(Math.round(k.length));
    w.u16(Math.round(k.r));
    w.u8(Math.min(255, Math.round(k.ttl * 10)));
    w.u8(Math.min(255, Math.round(k.t * 50)));
    w.u8(Math.min(255, Math.round(k.dur * 50)));
  }
  return w.result();
}

/** null si le buffer n'est pas un snapshot valide (version différente, corrompu…). */
export function decodeSnapshot(buf: ArrayBuffer): Snapshot | null {
  try {
    const r = new Reader(buf);
    if (r.u8() !== SNAPSHOT_TAG) return null;
    const snap: Snapshot = { tick: r.u32(), time: r.f32(), choiceT: 0, squads: [], aliens: [], recruits: [], projectiles: [], orbs: [], zones: [], powerups: [], fields: [], puddles: [], rocks: [], walls: [] };
    snap.choiceT = r.u8() / 40;

    const nSquads = r.u8();
    for (let i = 0; i < nSquads; i++) {
      const sq: SquadSnap = { owner: r.str(), anchorX: r.f32(), anchorY: r.f32(), speed: r.u16(), ack: r.u32(), kills: r.u16(), maxSize: r.u8(), healing: r.u8() === 1, level: 1, xp: 0, offer: [], offerPrism: [], picked: [], stim: 0, soldiers: [] };
      sq.level = r.u8();
      sq.xp = r.u16() / 10;
      const nOffer = r.u8();
      for (let k = 0; k < nOffer; k++) {
        const v = r.u8();
        sq.offer.push(v & 127);
        sq.offerPrism.push((v & 128) !== 0);
      }
      for (let k = 0; k < UPGRADE_IDS.length; k++) sq.picked.push(r.u8());
      sq.stim = r.u8() / 10;
      const n = r.u16();
      for (let j = 0; j < n; j++) {
        const id = r.u32();
        const cls = CLASS_IDS[r.u8()];
        const x = r.f32();
        const y = r.f32();
        const vx = r.i16();
        const vy = r.i16();
        const hp = r.u16();
        const maxHp = r.u16();
        const aim = r.i16() / 10000;
        const flags = r.u8();
        const capturedBy = flags & 8 ? r.u32() : 0;
        sq.soldiers.push({ id, cls, x, y, vx, vy, hp, maxHp, aim, facing: flags & 1 ? 1 : -1, target: !!(flags & 2), invulnerable: !!(flags & 4), capturedBy });
      }
      snap.squads.push(sq);
    }

    const nAliens = r.u16();
    for (let i = 0; i < nAliens; i++) {
      const id = r.u32();
      const type = ALIEN_IDS[r.u8()];
      const x = r.f32();
      const y = r.f32();
      const vx = r.i16();
      const vy = r.i16();
      const maxHp = r.f32();
      const hp = (r.u16() / 65535) * maxHp;
      const slamWind = r.u8() / 200;
      const aflags = r.u8();
      const def = ALIENS[type];
      let rushWind = 0;
      let rushDx = 0;
      let rushDy = 0;
      let rushX = x;
      let rushY = y;
      let castT = 0;
      let castCorpse = 0;
      let leapT = 0;
      let leapX = x;
      let leapY = y;
      if (def.rush) {
        rushWind = r.u8() / 200;
        rushDx = (r.u8() - 100) / 100;
        rushDy = (r.u8() - 100) / 100;
        if (rushWind > 0 || aflags & 1) {
          rushX = r.f32();
          rushY = r.f32();
        }
      }
      if (def.leap) {
        leapT = r.u8() / 50;
        if (leapT > 0) {
          leapX = r.f32();
          leapY = r.f32();
        }
      }
      if (def.revive) {
        castT = r.u8() / 100;
        if (castT > 0) castCorpse = r.u32();
      }
      let lurkPhase = 0;
      let lurkT = 0;
      let spikeAng = 0;
      if (def.lurk) {
        lurkPhase = r.u8();
        lurkT = r.u8() / 30;
        spikeAng = r.f32();
      }
      snap.aliens.push({ id, type, x, y, vx, vy, hp, maxHp, slamWind, rushWind, rushing: !!(aflags & 1), rushDx, rushDy, rushX, rushY, leapT, leapX, leapY, castT, castCorpse, zombie: !!(aflags & 2), lurkPhase, lurkT, spikeAng });
    }

    const nRecruits = r.u16();
    for (let i = 0; i < nRecruits; i++) {
      snap.recruits.push({ id: r.u32(), cls: CLASS_IDS[r.u8()], x: r.f32(), y: r.f32(), life: r.u8() / 10 });
    }

    const nProj = r.u16();
    for (let i = 0; i < nProj; i++) {
      const x = r.f32();
      const y = r.f32();
      const vx = r.i16();
      const vy = r.i16();
      const texture = TEXTURES[r.u8()];
      const flags = r.u8();
      const lob = !!(flags & 2);
      const aoe = lob ? r.u8() : 0;
      const flight = lob ? r.u8() / 50 : 1;
      const alien = lob ? r.u8() === 1 : false;
      snap.projectiles.push({ x, y, vx, vy, texture, flame: !!(flags & 1), lob, age: (flags >> 3) / 31, aoe, flight, alien });
    }

    const nOrbs = r.u16();
    for (let i = 0; i < nOrbs; i++) snap.orbs.push({ x: r.f32(), y: r.f32(), value: r.u8() });

    const nZones = r.u8();
    for (let i = 0; i < nZones; i++) snap.zones.push({ owner: r.str(), x: r.f32(), y: r.f32(), r: r.u16(), progress: r.u8() / 255 });

    const nPowerups = r.u8();
    for (let i = 0; i < nPowerups; i++) snap.powerups.push({ id: r.u32(), kind: POWERUP_KINDS[r.u8()], x: r.f32(), y: r.f32(), life: r.u8() / 10 });
    const nFields = r.u8();
    for (let i = 0; i < nFields; i++) snap.fields.push({ id: r.u32(), kind: r.u8() === 0 ? 'heal' : 'stasis', x: r.f32(), y: r.f32(), r: r.u16(), ttl: r.u8() / 10 });

    const nPuddles = r.u8();
    for (let i = 0; i < nPuddles; i++) snap.puddles.push({ id: r.u32(), x: r.f32(), y: r.f32(), r: r.u16(), ttl: r.u8() / 10, slow: r.u8() / 100 });
    const nRocks = r.u8();
    for (let i = 0; i < nRocks; i++) snap.rocks.push({ id: r.u32(), x: r.f32(), y: r.f32(), r: r.u16(), ttl: r.u8() / 10 });
    const nWalls = r.u8();
    for (let i = 0; i < nWalls; i++) snap.walls.push({ id: r.u32(), x: r.f32(), y: r.f32(), angle: r.f32(), length: r.u16(), r: r.u16(), ttl: r.u8() / 10, t: r.u8() / 50, dur: r.u8() / 50 });
    return snap;
  } catch {
    return null;
  }
}
