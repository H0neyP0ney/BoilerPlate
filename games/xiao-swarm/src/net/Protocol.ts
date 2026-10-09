import { DIFFICULTY, ORB_BLINK_TIME, REVIVE_TIME } from '../config';
import { ALIENS, type AlienId } from '../data/aliens';
import { CLASSES, type SoldierClassId } from '../data/classes';
import { DAMAGE_TIERS } from '../data/damageTiers';
import { UPGRADE_IDS } from '../data/progression';
import type { PowerUpKind } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import { ROCKET_TEXTURE } from '../sim/Combat';
import type { PlayerId, SimEvent } from '../sim/types';

/** Version du protocole : hôte et client doivent être identiques. */
export const PROTOCOL_VERSION = 48; // 48 : bit 64 des drapeaux d'alien = apparaît sur place, sans trou (araignées du chaman) ; 47 : alien `spider` (ajouté en fin de liste, l'essaim de la Gling Mère le fait apparaître à la place du gling) ; 46 : power-up `reroll`, upgrades teamSpirit / lastStand / bossHunter (liste `picked` allongée), Dernier rempart actif = bit 2 de l'octet `healing` ; 45 : rhinos jumeaux (boss_rhino_fire / boss_rhino_ice) et orbe de feu (liste des aliens changée) ; 44 : coffres de boss et globes d'upgrade réservés à leur joueur (listes après les stalactites) ; 43 : aliens compressés (id sur 24 bits, plus de vitesse : le client la déduit des snapshots, PV max en u16 sauf drapeau 32 → f32) ; 42 : modes survie et coop fusionnés (le welcome annonce 'survival') ; 41 : orbe de glace = alien-projectile `ice_orb` (liste des aliens et des textures changée) ; 40 : stalactites du Scarab (liste après les flammes) ; 39 : alien qui s'enterre avant le recyclage (bit 16 des drapeaux) ; 38 : positions en 16 bits, effets de tir (shot / impact / hit) en binaire dans le snapshot, numéro de séquence ; 37 : flammes dans le snapshot

/** Un snapshot toutes les N ticks de simulation (30 Hz / N). */
export const SNAPSHOT_EVERY = 2;

// ---------- Messages de contrôle (JSON, en texte) ----------

/** Client → hôte. */
export type ClientMessage =
  | { t: 'hello'; v: number }
  /** `n` : numéro du tick client (prédiction) ; l'hôte renvoie le dernier reçu dans le snapshot (`ack`). */
  | { t: 'input'; mx: number; my: number; n: number }
  /** Choix d'upgrade au level up (index dans les propositions de sa squad). */
  | { t: 'upgrade'; index: number }
  /** Relance des propositions d'upgrade. */
  | { t: 'reroll' };

/** Hôte → client. */
export type HostMessage =
  | { t: 'welcome'; v: number; mode: string; seed: number; you: PlayerId; host: PlayerId }
  /** `seq` : numéro du snapshot envoyé avec ces événements (le client les joue en même temps que lui, après son tampon d'interpolation). */
  | { t: 'events'; seq: number; list: SimEvent[] }
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
  /** Bouclier (power-up) : part restante du bouclier max (0 → 1, 0 = aucun). */
  shield: number;
  aim: number;
  facing: number;
  target: boolean;
  invulnerable: boolean;
  /** Étourdi (slam du Scarab) : icône de tourbillon. */
  stunned: boolean;
  /** Id de la bulle qui le tient captif (0 = libre). */
  capturedBy: number;
  /** PV de gel restants (0 = libre) : glaçon affiché sur le soldat. */
  frozen: number;
}

export interface SquadSnap {
  owner: PlayerId;
  /** Ancre de la squad, vitesse de l'ancre (px/s) et dernier input client pris en compte (`n`) : base de la prédiction du joueur local. */
  anchorX: number;
  anchorY: number;
  speed: number;
  ack: number;
  kills: number;
  /** Emplacement du joueur (couleur). */
  slot: number;
  /** Dégâts totaux infligés aux aliens (sans overkill) : scoreboard de fin de partie. */
  dealt: number;
  maxSize: number;
  healing: boolean;
  /** Dernier rempart actif (upgrade `lastStand`) : aura et texte chez tous les joueurs. */
  lastStand: boolean;
  /** Progression (XP) : niveau, XP dans le niveau, propositions d'upgrade (index dans UPGRADE_IDS) et nombre de prises de chacune. */
  level: number;
  xp: number;
  offer: number[];
  /** Upgrades prismatiques (mêmes indices que `offer`). */
  offerPrism: boolean[];
  picked: number[];
  /** Relances d'upgrade restantes. */
  rerolls: number;
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
  /** Aliens à `def.shield` seulement (champ écrit selon le type) : part restante du bouclier max (0 → 1). */
  shield: number;
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
  /** S'enterre avant d'être déplacé (recyclage des traînards, v39 : bit 16 des drapeaux de l'alien). */
  sinking: boolean;
  /** Surgit sur place, sans trou d'apparition (`AlienState.instant`). */
  instant: boolean;
  /** Niveau d'enragement d'un boss (0 à 2). */
  enraged: number;
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
  /** Identifiant stable (modulo 65536) : le client retrouve le même projectile d'un snapshot à l'autre pour lisser son mouvement. */
  id: number;
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
  /** Numéro d'envoi (compteur de frames de l'hôte) : ordonne le tampon d'interpolation du client (`tick` se fige pendant l'écran de fin). */
  seq: number;
  tick: number;
  time: number;
  /** Position dans la timeline des vagues (s) : peut différer de `time` (suspendue, boucle de boss). */
  cursor: number;
  /** Choix d'upgrade en cours (s restantes, 0 = aucun) : le jeu est en pause chez tout le monde. */
  choiceT: number;
  squads: SquadSnap[];
  aliens: AlienSnap[];
  recruits: RecruitSnap[];
  projectiles: ProjectileSnap[];
  /** Globes d'XP au sol. */
  /** `id` : identifiant stable (modulo 65536) du globe, pour que sa teinte ne change pas chez le client quand d'autres globes disparaissent. */
  /** `blink` : le globe est dans ses dernières secondes de vie (il clignote ; codé dans le bit de poids fort de l'octet de valeur). */
  orbs: { id: number; x: number; y: number; value: number; blink: boolean }[];
  /** Coop : zones de réanimation (progression 0 → 1). */
  zones: { owner: PlayerId; x: number; y: number; r: number; progress: number }[];
  /** Flaques de crachat (id, position, rayon, durée restante, facteur de vitesse) et cailloux posés (l'affichage se cale dessus). */
  powerups: { id: number; kind: PowerUpKind; x: number; y: number; life: number }[];
  fields: { id: number; kind: 'heal' | 'stasis'; x: number; y: number; r: number; ttl: number }[];
  puddles: { id: number; x: number; y: number; r: number; ttl: number; slow: number; frost?: boolean }[];
  rocks: { id: number; x: number; y: number; r: number; ttl: number }[];
  /** Murs annoncés (télégraphe jaune) : centre, direction, longueur, demi-largeur, temps restant et durée du télégraphe. */
  walls: { id: number; x: number; y: number; angle: number; length: number; r: number; ttl: number; t: number; dur: number }[];
  /**
   * Flammes au sol (traînée des burners) : identifiant modulo 65536, position au pixel, rayon. Dans le snapshot et pas en événements :
   * un `fireEnd` perdu (canal non fiable) laissait chez le client une flamme affichée pour toujours.
   */
  fires: { id: number; x: number; y: number; r: number }[];
  /** Stalactites annoncées par le Scarab (v40) : zone, temps restant avant l'impact et durée du télégraphe (s). */
  stalactites: { id: number; x: number; y: number; r: number; t: number; dur: number }[];
  /** Coffres laissés par les boss tués (v44) : position et progression d'ouverture (0 → 1). */
  chests: { id: number; x: number; y: number; progress: number }[];
  /** Globes d'upgrade des coffres (v44), chacun réservé à `owner`, `upgrade` = index dans `UPGRADE_IDS` (son icône) ; `fall` = temps de chute restant en cloche (s, 0 = posé au sol). */
  upgradeOrbs: { id: number; owner: PlayerId; upgrade: number; x: number; y: number; fall: number }[];
  /**
   * Effets de tir depuis le snapshot précédent, en binaire au lieu d'événements JSON (v38 : c'était l'essentiel du débit des événements) :
   * tirs de soldats (id du tireur, position du tir ; la classe et la visée se lisent sur le soldat), impacts de balle (texture du tir) et
   * unités touchées (id). Remplis par `HostSession`, rejoués en `SimEvent` par `ClientSession`.
   */
  shots: { id: number; x: number; y: number }[];
  impacts: { x: number; y: number; texture: string }[];
  hits: number[];
}

const CLASS_IDS = Object.keys(CLASSES) as SoldierClassId[];
const ALIEN_IDS = Object.keys(ALIENS) as AlienId[];
const TEXTURES = [
  ...new Set([ROCKET_TEXTURE, ...Object.values(CLASSES).map((c) => c.weapon.texture), ...DAMAGE_TIERS.map((t) => t.texture), ...Object.values(ALIENS).flatMap((a) => (a.lob ? [a.lob.texture] : a.spray ? [a.spray.texture] : []))]),
];

const SNAPSHOT_TAG = 0x53;
/** Précision des positions (`Writer.pos`) : 4 crans par pixel. Les cartes doivent rester sous 8192 px (jungle 3802, royale 4800). */
const POS_SCALE = 4;
const POWERUP_KINDS: PowerUpKind[] = ['stim', 'magnet', 'heal', 'stasis', 'rockets', 'reroll'];

/** Photographie de l'état visible d'une partie (ce qu'un client doit connaître pour afficher). */
export function takeSnapshot(sim: Sim, acks?: ReadonlyMap<PlayerId, number>): Snapshot {
  return {
    seq: sim.tick,
    shots: [],
    impacts: [],
    hits: [],
    tick: sim.tick,
    time: sim.time,
    cursor: sim.waves.cursor,
    choiceT: sim.choiceT,
    squads: sim.squads.map((sq) => ({
      owner: sq.owner,
      anchorX: sq.anchor.x,
      anchorY: sq.anchor.y,
      speed: sq.moveSpeed,
      ack: acks?.get(sq.owner) ?? 0,
      kills: sq.kills,
      slot: sq.slot,
      dealt: sq.dealt,
      maxSize: sq.maxSize,
      healing: sq.isHealing,
      lastStand: sq.lastStand,
      level: sq.level,
      xp: sq.xp,
      offer: sq.offer ? sq.offer.map((id) => UPGRADE_IDS.indexOf(id)) : [],
      offerPrism: sq.offer ? sq.offerPrism.slice() : [],
      picked: UPGRADE_IDS.map((id) => sq.picked[id] ?? 0),
      rerolls: sq.rerolls,
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
        shield: s.maxShield > 0 ? s.shield / s.maxShield : 0,
        aim: s.aim,
        facing: s.facing,
        target: s.target !== null,
        invulnerable: s.invulnerable > 0,
        stunned: s.stun > 0,
        capturedBy: s.capturedBy,
        frozen: s.frozen,
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
      shield: a.maxShield > 0 ? a.shield / a.maxShield : 0,
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
      sinking: a.sinkT > 0,
      instant: a.instant,
      enraged: a.enraged,
      lurkPhase: a.lurkPhase,
      lurkT: a.lurkT,
      spikeAng: a.spikeAng,
    })),
    recruits: sim.recruits.items.map((r) => ({ id: r.id, cls: r.cls, x: r.x, y: r.y, life: r.life })),
    projectiles: sim.combat.projectiles.active.map((p) => ({
      id: p.id & 0xffff,
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
    orbs: sim.xp.orbs.map((o) => ({ id: o.id & 0xffff, x: o.x, y: o.y, value: o.value, blink: o.life < ORB_BLINK_TIME })),
    powerups: sim.powerups.items.map((p) => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, life: p.life })),
    fields: sim.powerups.fields.map((f) => ({ id: f.id, kind: f.kind, x: f.x, y: f.y, r: f.r, ttl: f.ttl })),
    puddles: sim.puddles.map((p) => ({ id: p.id, x: p.x, y: p.y, r: p.r, ttl: p.ttl, slow: p.slow, frost: p.frost })),
    rocks: sim.arena.rocks.map((k) => ({ id: k.id, x: k.x, y: k.y, r: k.radius, ttl: k.ttl })),
    walls: sim.walls.map((w) => ({ id: w.id, x: w.x, y: w.y, angle: w.angle, length: w.length, r: w.rockR, ttl: w.ttl, t: w.t, dur: w.dur })),
    fires: sim.fires.map((f) => ({ id: f.id, x: f.x, y: f.y, r: f.r })),
    stalactites: sim.stalactites.map((k) => ({ id: k.id & 0xffff, x: k.x, y: k.y, r: k.r, t: k.t, dur: k.dur })),
    chests: sim.chests.items.map((c) => ({ id: c.id, x: c.x, y: c.y, progress: Math.min(1, c.progress / Math.max(0.1, DIFFICULTY.chestTime)) })),
    upgradeOrbs: sim.upgradeOrbs.items.map((o) => ({ id: o.id, owner: o.owner, upgrade: Math.max(0, UPGRADE_IDS.indexOf(o.upgrade)), x: o.x, y: o.y, fall: o.hop?.t ?? 0 })),
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
  /** Entier sur 24 bits (ids d'entité : < 16,7 millions dans une partie). */
  u24(v: number): void {
    this.u8(v & 0xff);
    this.u16((v >>> 8) & 0xffff);
  }
  i16(v: number): void {
    this.need(2);
    this.view.setInt16(this.o, Math.max(-32768, Math.min(32767, Math.round(v))), true);
    this.o += 2;
  }
  /** Coordonnée de carte au 1/4 de pixel sur 16 bits (−8192 → 8191 px, v38 ; f32 avant) : 2 octets de moins par coordonnée. */
  pos(v: number): void {
    this.i16(v * POS_SCALE);
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
  /** Octets écrits jusqu'ici. */
  get size(): number {
    return this.o;
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
  u24(): number {
    return this.u8() | (this.u16() << 8);
  }
  i16(): number {
    const v = this.view.getInt16(this.o, true);
    this.o += 2;
    return v;
  }
  pos(): number {
    return this.i16() / POS_SCALE;
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

/** `sizes` (mesure, dev) : reçoit les octets écrits par catégorie (en-tête, squads, aliens…), compteurs de chaque liste compris. */
export function encodeSnapshot(s: Snapshot, sizes?: Record<string, number>): ArrayBuffer {
  const w = new Writer();
  let from = 0;
  const mark = (name: string): void => {
    if (sizes) sizes[name] = w.size - from;
    from = w.size;
  };
  w.u8(SNAPSHOT_TAG);
  w.u32(s.seq);
  w.u32(s.tick);
  w.f32(s.time);
  w.f32(s.cursor);
  w.u8(Math.min(255, Math.round(s.choiceT * 40)));
  mark('header');

  w.u8(s.squads.length);
  for (const sq of s.squads) {
    w.str(sq.owner);
    w.f32(sq.anchorX);
    w.f32(sq.anchorY);
    w.u16(Math.min(65535, Math.round(sq.speed)));
    w.u32(sq.ack);
    w.u16(sq.kills);
    w.u8(sq.slot);
    w.u32(Math.round(sq.dealt));
    w.u8(sq.maxSize);
    w.u8((sq.healing ? 1 : 0) | (sq.lastStand ? 2 : 0));
    w.u8(Math.min(255, sq.level));
    w.u16(Math.min(65535, Math.round(sq.xp * 10)));
    w.u8(sq.offer.length);
    sq.offer.forEach((i, k) => w.u8(i | (sq.offerPrism[k] ? 128 : 0)));
    for (const c of sq.picked) w.u8(Math.min(255, c));
    w.u8(Math.min(255, Math.max(0, sq.rerolls)));
    w.u8(Math.min(255, Math.round(sq.stim * 10)));
    w.u16(sq.soldiers.length);
    for (const u of sq.soldiers) {
      w.u32(u.id);
      w.u8(CLASS_IDS.indexOf(u.cls));
      w.pos(u.x);
      w.pos(u.y);
      w.i16(u.vx);
      w.i16(u.vy);
      w.u16(Math.max(0, u.hp));
      w.u16(u.maxHp);
      w.u8(u.shield * 255); // part du bouclier max (0 → 255) ; `u8` borne et arrondit
      w.i16(u.aim * 10000);
      const ice = Math.min(255, Math.ceil(u.frozen)); // octet écrit (borné) : c'est lui qui décide du champ conditionnel
      w.u8((u.facing > 0 ? 1 : 0) | (u.target ? 2 : 0) | (u.invulnerable ? 4 : 0) | (u.capturedBy ? 8 : 0) | (u.stunned ? 16 : 0) | (ice > 0 ? 32 : 0));
      if (u.capturedBy) w.u32(u.capturedBy);
      if (ice > 0) w.u8(ice);
    }
  }

  mark('squads');
  w.u16(s.aliens.length);
  for (const a of s.aliens) {
    // v43 : id sur 24 bits, pas de vitesse (le client la déduit de deux snapshots : `Mirror.upsertAlien`), PV max en u16 (drapeau 32 : f32, boss)
    const bigHp = a.maxHp > 65535;
    w.u24(a.id);
    w.u8(ALIEN_IDS.indexOf(a.type));
    w.pos(a.x);
    w.pos(a.y);
    w.u8((a.rushing ? 1 : 0) | (a.zombie ? 2 : 0) | (Math.min(a.enraged, 3) << 2) | (a.sinking ? 16 : 0) | (bigHp ? 32 : 0) | (a.instant ? 64 : 0));
    if (bigHp) w.f32(a.maxHp);
    else w.u16(a.maxHp);
    w.u16(Math.round(Math.max(0, Math.min(1, a.hp / a.maxHp)) * 65535));
    w.u8(Math.min(255, Math.round(a.slamWind * 200)));
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
    if (def.leap || def.burrow) {
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
    if (def.lurk || def.burrow) {
      w.u8(a.lurkPhase);
      w.u8(Math.min(255, Math.round(a.lurkT * 30)));
      w.f32(a.spikeAng);
    }
    if (def.shield) w.u8(a.shield * 255); // champ écrit selon le TYPE (pas la valeur) : le décodeur teste la même chose
  }

  mark('aliens');
  w.u16(s.recruits.length);
  for (const r of s.recruits) {
    w.u32(r.id);
    w.u8(CLASS_IDS.indexOf(r.cls));
    w.pos(r.x);
    w.pos(r.y);
    w.u8(Math.min(255, Math.round(r.life * 10)));
  }

  mark('recruits');
  w.u16(s.projectiles.length);
  for (const p of s.projectiles) {
    w.u16(p.id);
    w.pos(p.x);
    w.pos(p.y);
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

  mark('projectiles');
  w.u16(s.orbs.length);
  for (const o of s.orbs) {
    w.u16(o.id);
    w.pos(o.x);
    w.pos(o.y);
    w.u8((Math.min(127, o.value) & 0x7f) | (o.blink ? 0x80 : 0)); // valeur ≤ 127 (borné), bit 7 = clignote
  }

  mark('orbs');
  w.u8(s.zones.length);
  for (const z of s.zones) {
    w.str(z.owner);
    w.f32(z.x);
    w.f32(z.y);
    w.u16(Math.round(z.r));
    w.u8(Math.round(Math.min(1, z.progress) * 255));
  }

  mark('zones');
  w.u8(Math.min(255, s.powerups.length));
  for (const p of s.powerups.slice(0, 255)) {
    w.u32(p.id);
    w.u8(POWERUP_KINDS.indexOf(p.kind));
    w.f32(p.x);
    w.f32(p.y);
    w.u8(Math.min(255, Math.round(p.life * 10)));
  }
  mark('powerups');
  w.u8(Math.min(255, s.fields.length));
  for (const f of s.fields.slice(0, 255)) {
    w.u32(f.id);
    w.u8(f.kind === 'heal' ? 0 : 1);
    w.f32(f.x);
    w.f32(f.y);
    w.u16(Math.round(f.r));
    w.u8(Math.min(255, Math.round(f.ttl * 10)));
  }

  mark('fields');
  w.u8(Math.min(255, s.puddles.length));
  for (const p of s.puddles.slice(0, 255)) {
    w.u32(p.id);
    w.f32(p.x);
    w.f32(p.y);
    w.u16(Math.round(p.r));
    w.u8(Math.min(255, Math.round(p.ttl * 10)));
    w.u8(p.frost ? 255 : Math.min(100, Math.round(p.slow * 100))); // 255 = nuage de glace (flocons du chaman)
  }
  mark('puddles');
  w.u8(Math.min(255, s.rocks.length));
  for (const k of s.rocks.slice(0, 255)) {
    w.u32(k.id);
    w.f32(k.x);
    w.f32(k.y);
    w.u16(Math.round(k.r));
    w.u8(Math.min(255, Math.round(k.ttl * 10)));
  }
  mark('rocks');
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
  mark('walls');
  w.u8(Math.min(255, s.fires.length));
  for (const f of s.fires.slice(0, 255)) {
    w.u16(f.id & 0xffff);
    w.u16(Math.max(0, Math.min(65535, Math.round(f.x))));
    w.u16(Math.max(0, Math.min(65535, Math.round(f.y))));
    w.u8(Math.min(255, Math.round(f.r)));
  }
  mark('fires');
  w.u8(Math.min(255, s.stalactites.length));
  for (const k of s.stalactites.slice(0, 255)) {
    w.u16(k.id);
    w.pos(k.x);
    w.pos(k.y);
    w.u8(Math.round(k.r));
    w.u8(Math.round(k.t * 50));
    w.u8(Math.round(k.dur * 50));
  }
  mark('stalactites');
  w.u8(Math.min(255, s.chests.length));
  for (const c of s.chests.slice(0, 255)) {
    w.u32(c.id);
    w.pos(c.x);
    w.pos(c.y);
    w.u8(Math.round(Math.min(1, c.progress) * 255));
  }
  w.u8(Math.min(255, s.upgradeOrbs.length));
  for (const o of s.upgradeOrbs.slice(0, 255)) {
    w.u32(o.id);
    w.str(o.owner);
    w.u8(o.upgrade);
    w.pos(o.x);
    w.pos(o.y);
    w.u8(Math.min(255, Math.round(o.fall * 100)));
  }
  mark('loot');
  w.u16(s.shots.length);
  for (const f of s.shots) {
    w.u32(f.id);
    w.pos(f.x);
    w.pos(f.y);
  }
  w.u16(s.impacts.length);
  for (const f of s.impacts) {
    w.pos(f.x);
    w.pos(f.y);
    w.u8(TEXTURES.indexOf(f.texture));
  }
  w.u16(s.hits.length);
  for (const id of s.hits) w.u32(id);
  mark('fx');
  return w.result();
}

/** null si le buffer n'est pas un snapshot valide (version différente, corrompu…). */
export function decodeSnapshot(buf: ArrayBuffer): Snapshot | null {
  try {
    const r = new Reader(buf);
    if (r.u8() !== SNAPSHOT_TAG) return null;
    const seq = r.u32();
    const snap: Snapshot = { seq, shots: [], impacts: [], hits: [], tick: r.u32(), time: r.f32(), cursor: r.f32(), choiceT: 0, squads: [], aliens: [], recruits: [], projectiles: [], orbs: [], zones: [], powerups: [], fields: [], puddles: [], rocks: [], walls: [], fires: [], stalactites: [], chests: [], upgradeOrbs: [] };
    snap.choiceT = r.u8() / 40;

    const nSquads = r.u8();
    for (let i = 0; i < nSquads; i++) {
      const sq: SquadSnap = { owner: r.str(), anchorX: r.f32(), anchorY: r.f32(), speed: r.u16(), ack: r.u32(), kills: r.u16(), slot: r.u8(), dealt: r.u32(), maxSize: r.u8(), healing: false, lastStand: false, level: 1, xp: 0, offer: [], offerPrism: [], picked: [], rerolls: 0, stim: 0, soldiers: [] };
      const flags = r.u8();
      sq.healing = (flags & 1) !== 0;
      sq.lastStand = (flags & 2) !== 0;
      sq.level = r.u8();
      sq.xp = r.u16() / 10;
      const nOffer = r.u8();
      for (let k = 0; k < nOffer; k++) {
        const v = r.u8();
        sq.offer.push(v & 127);
        sq.offerPrism.push((v & 128) !== 0);
      }
      for (let k = 0; k < UPGRADE_IDS.length; k++) sq.picked.push(r.u8());
      sq.rerolls = r.u8();
      sq.stim = r.u8() / 10;
      const n = r.u16();
      for (let j = 0; j < n; j++) {
        const id = r.u32();
        const cls = CLASS_IDS[r.u8()];
        const x = r.pos();
        const y = r.pos();
        const vx = r.i16();
        const vy = r.i16();
        const hp = r.u16();
        const maxHp = r.u16();
        const shield = r.u8() / 255;
        const aim = r.i16() / 10000;
        const flags = r.u8();
        const capturedBy = flags & 8 ? r.u32() : 0;
        const frozen = flags & 32 ? r.u8() : 0;
        sq.soldiers.push({ id, cls, x, y, vx, vy, hp, maxHp, shield, aim, facing: flags & 1 ? 1 : -1, target: !!(flags & 2), invulnerable: !!(flags & 4), stunned: !!(flags & 16), capturedBy, frozen });
      }
      snap.squads.push(sq);
    }

    const nAliens = r.u16();
    for (let i = 0; i < nAliens; i++) {
      const id = r.u24();
      const type = ALIEN_IDS[r.u8()];
      const x = r.pos();
      const y = r.pos();
      const vx = 0; // déduite chez le client (`Mirror.upsertAlien`)
      const vy = 0;
      const aflags = r.u8();
      const maxHp = aflags & 32 ? r.f32() : r.u16();
      const hp = (r.u16() / 65535) * maxHp;
      const slamWind = r.u8() / 200;
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
      if (def.leap || def.burrow) {
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
      if (def.lurk || def.burrow) {
        lurkPhase = r.u8();
        lurkT = r.u8() / 30;
        spikeAng = r.f32();
      }
      const shield = def.shield ? r.u8() / 255 : 0;
      snap.aliens.push({ id, type, x, y, vx, vy, hp, maxHp, shield, slamWind, rushWind, rushing: !!(aflags & 1), rushDx, rushDy, rushX, rushY, leapT, leapX, leapY, castT, castCorpse, zombie: !!(aflags & 2), sinking: !!(aflags & 16), instant: !!(aflags & 64), enraged: (aflags >> 2) & 3, lurkPhase, lurkT, spikeAng });
    }

    const nRecruits = r.u16();
    for (let i = 0; i < nRecruits; i++) {
      snap.recruits.push({ id: r.u32(), cls: CLASS_IDS[r.u8()], x: r.pos(), y: r.pos(), life: r.u8() / 10 });
    }

    const nProj = r.u16();
    for (let i = 0; i < nProj; i++) {
      const id = r.u16();
      const x = r.pos();
      const y = r.pos();
      const vx = r.i16();
      const vy = r.i16();
      const texture = TEXTURES[r.u8()];
      const flags = r.u8();
      const lob = !!(flags & 2);
      const aoe = lob ? r.u8() : 0;
      const flight = lob ? r.u8() / 50 : 1;
      const alien = lob ? r.u8() === 1 : false;
      snap.projectiles.push({ id, x, y, vx, vy, texture, flame: !!(flags & 1), lob, age: (flags >> 3) / 31, aoe, flight, alien });
    }

    const nOrbs = r.u16();
    for (let i = 0; i < nOrbs; i++) {
      const id = r.u16();
      const x = r.pos();
      const y = r.pos();
      const v = r.u8();
      snap.orbs.push({ id, x, y, value: v & 0x7f, blink: (v & 0x80) !== 0 });
    }

    const nZones = r.u8();
    for (let i = 0; i < nZones; i++) snap.zones.push({ owner: r.str(), x: r.f32(), y: r.f32(), r: r.u16(), progress: r.u8() / 255 });

    const nPowerups = r.u8();
    for (let i = 0; i < nPowerups; i++) snap.powerups.push({ id: r.u32(), kind: POWERUP_KINDS[r.u8()], x: r.f32(), y: r.f32(), life: r.u8() / 10 });
    const nFields = r.u8();
    for (let i = 0; i < nFields; i++) snap.fields.push({ id: r.u32(), kind: r.u8() === 0 ? 'heal' : 'stasis', x: r.f32(), y: r.f32(), r: r.u16(), ttl: r.u8() / 10 });

    const nPuddles = r.u8();
    for (let i = 0; i < nPuddles; i++) {
      const p = { id: r.u32(), x: r.f32(), y: r.f32(), r: r.u16(), ttl: r.u8() / 10 };
      const slow = r.u8();
      snap.puddles.push(slow === 255 ? { ...p, slow: 1, frost: true } : { ...p, slow: slow / 100 });
    }
    const nRocks = r.u8();
    for (let i = 0; i < nRocks; i++) snap.rocks.push({ id: r.u32(), x: r.f32(), y: r.f32(), r: r.u16(), ttl: r.u8() / 10 });
    const nWalls = r.u8();
    for (let i = 0; i < nWalls; i++) snap.walls.push({ id: r.u32(), x: r.f32(), y: r.f32(), angle: r.f32(), length: r.u16(), r: r.u16(), ttl: r.u8() / 10, t: r.u8() / 50, dur: r.u8() / 50 });
    const nFires = r.u8();
    for (let i = 0; i < nFires; i++) snap.fires.push({ id: r.u16(), x: r.u16(), y: r.u16(), r: r.u8() });
    const nStal = r.u8();
    for (let i = 0; i < nStal; i++) snap.stalactites.push({ id: r.u16(), x: r.pos(), y: r.pos(), r: r.u8(), t: r.u8() / 50, dur: r.u8() / 50 });
    const nChests = r.u8();
    for (let i = 0; i < nChests; i++) snap.chests.push({ id: r.u32(), x: r.pos(), y: r.pos(), progress: r.u8() / 255 });
    const nUpOrbs = r.u8();
    for (let i = 0; i < nUpOrbs; i++) snap.upgradeOrbs.push({ id: r.u32(), owner: r.str(), upgrade: r.u8(), x: r.pos(), y: r.pos(), fall: r.u8() / 100 });
    const nShots = r.u16();
    for (let i = 0; i < nShots; i++) snap.shots.push({ id: r.u32(), x: r.pos(), y: r.pos() });
    const nImpacts = r.u16();
    for (let i = 0; i < nImpacts; i++) snap.impacts.push({ x: r.pos(), y: r.pos(), texture: TEXTURES[r.u8()] ?? TEXTURES[0] });
    const nHits = r.u16();
    for (let i = 0; i < nHits; i++) snap.hits.push(r.u32());
    return snap;
  } catch {
    return null;
  }
}
