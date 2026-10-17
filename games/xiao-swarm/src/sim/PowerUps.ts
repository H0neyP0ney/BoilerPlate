import { Rng } from '@xiao/engine/sim';
import { DIFFICULTY, POWERUP_LIFE, RECRUIT } from '../config';
import type { AlienState, Field, PowerUpKind, PowerUpState } from './entities';
import { catchItem, chase, findAttractor, inPickRange, pulledAttractor } from './Pickup';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

/** Distance (px) de la chute de la relance autour de l'alien tué : la même que celle des globes d'upgrade autour de l'œuf (`Chests.ts`). */
const REROLL_FALL_DIST: [number, number] = [50, 100];
const KINDS: PowerUpKind[] = ['stim', 'magnet', 'heal', 'stasis', 'rockets']; // la relance n'est pas tirée au hasard : c'est un loot d'alien (`maybeDropReroll`)
/** Stimpack : durée (s), facteur de vitesse de déplacement et de cadence. */
/** Aimant (coup unique) : rayon (px) autour de la squad dans lequel XP, recrues et power-ups sont aspirés : toute la carte (08/10 ; 1000 avant). */
const MAGNET_RADIUS = Infinity;
/**
 * Globe de soin : rayon, durée (s) et part des PV max rendue par seconde. `overheal` : part des PV max qu'il peut ajouter AU-DELÀ du max
 * (1 = jusqu'à 200 %) ; ce surplus ne redescend jamais tout seul, seuls les dégâts l'entament.
 */
export const HEAL_FIELD = { r: 184, ttl: 10, perSec: 0.264, overheal: 1 }; // 09/10 : soin et rayon +10 % (0,24 et 167 avant), overheal ; overheal 1 = jusqu'à 200 % des PV max (0,3 avant le 11/10, 0,5 le 11/10)
/** Globe de stase : rayon, durée (s) et facteur de vitesse des aliens dedans. */
const STASIS_FIELD = { r: 382.5, ttl: 8, slow: 0.2 };
/** Les globes de soin et de stase sont dessinés en ellipse (demi-axes r et r × 0,7, `drawField` de view/PickupViews.ts) : ils agissent exactement sur ce qui est dedans (centre de l'unité). */
const FIELD_ASPECT = 0.7; // rayon −15 % (450 avant le 08/10)
const ROCKETS = 30;
/** Un power-up n'apparaît jamais à moins de ce nombre de px (en plus du rayon) d'une escouade vivante. */
const SPAWN_CLEARANCE = 50;

/**
 * Power-ups : de temps en temps un petit boost apparaît près d'une squad vivante et disparaît vite si personne ne le prend.
 * Ramassé par un soldat, il applique son effet à sa squad : stimpack, aimant à XP (coup unique), globe de soin (persistant), globe de
 * stase (persistant), rafale de roquettes. Seul l'hôte / le solo simule ; l'état passe dans les snapshots.
 * La relance (+1 relance des choix d'upgrade) n'est PAS un power-up tiré au hasard : c'est un loot rare, lâché par un alien tué comme une
 * recrue (`maybeDropReroll`) ; il réutilise l'entité et le ramassage des power-ups (kind `reroll`).
 */
export class PowerUps {
  readonly items: PowerUpState[] = [];
  readonly fields: Field[] = [];
  private timer: number = DIFFICULTY.powerupFirst;
  /** Relance (loot) : aliens à tuer (toutes squads) avant la prochaine, puis `rerollReady` = elle sort de l'alien tué suivant (14/10 : au nombre d'aliens, plus au temps : plus de loot avec plus de joueurs). */
  private rerollLeft = -1; // -1 : pas encore tiré (premier seuil = `rerollLootFirst` ± 20 %, tiré au premier alien compté)
  private rerollReady = false;
  /** Booster prismatique (loot) : même mécanique que la relance, en plus rare. */
  private prismLeft = -1;
  private prismReady = false;

  constructor(private readonly sim: Sim) {}

  /** Pose un power-up à un endroit précis (tutoriel : `forced` = il ne disparaît pas tant qu'il n'est pas ramassé). */
  drop(kind: PowerUpKind, x: number, y: number, forced = false): PowerUpState {
    const p: PowerUpState = { id: this.sim.ids.get(), kind, x, y, life: forced ? 1e6 : POWERUP_LIFE };
    this.items.push(p);
    return p;
  }

  /**
   * Relance (loot) : si une relance est « prête » (compte à rebours écoulé), l'alien tué la laisse : elle retombe en cloche à l'écart, dans une
   * direction au hasard à 50-100 px de l'alien (comme les globes d'upgrade, PAS vers la squad comme une recrue). Pas pendant le tutoriel, ni pour un
   * alien invoqué / ressuscité, ni pour l'œuf d'un boss.
   */
  maybeDropReroll(a: AlienState, killer: Squad | undefined): void {
    // un alien qui ne donne pas d'XP (invoqué, ressuscité, rejeu de vague pendant un boss, orbe) ne compte pas et ne laisse jamais de loot
    if (this.sim.tutorial?.active || a.noRecruit || a.noXp || !a.def.xp || a.def.egg) return;
    // chaque alien tué (hors invoqué / ressuscité / œuf / sans XP) fait avancer les deux compteurs ; à zéro, le loot est « prêt » et sort de cet alien
    if (this.rerollLeft < 0) this.rerollLeft = this.jitter(DIFFICULTY.rerollLootFirst); // seuils aléatoires (± 20 %), le premier comme les suivants
    if (this.prismLeft < 0) this.prismLeft = this.jitter(DIFFICULTY.prismLootFirst);
    if (!this.rerollReady && --this.rerollLeft <= 0) this.rerollReady = true;
    if (!this.prismReady && --this.prismLeft <= 0) this.prismReady = true;
    if (!this.rerollReady && !this.prismReady) return;
    const squad = killer ?? this.sim.nearestSquad(a.x, a.y);
    if (!squad) return;
    // le booster prismatique (le plus rare) passe avant la relance quand les deux sont prêts ; un seul loot par alien tué
    const kind: PowerUpKind = this.prismReady ? 'prism' : 'reroll';
    if (kind === 'prism') {
      this.prismReady = false;
      this.prismLeft = this.jitter(DIFFICULTY.prismLootEvery);
    } else {
      this.rerollReady = false;
      this.rerollLeft = this.jitter(DIFFICULTY.rerollLootEvery);
    }
    const p = this.drop(kind, a.x, a.y, true); // forcé : ces loots n'expirent jamais
    p.age = 0; // imprenable la première seconde, comme les globes d'upgrade
    const rng = new Rng((p.id * 2654435761) >>> 0); // propre au loot : ne décale pas la séquence aléatoire de la simulation
    const ang = rng.range(0, Math.PI * 2);
    const dist = rng.range(REROLL_FALL_DIST[0], REROLL_FALL_DIST[1]);
    p.hop = { vx: (Math.cos(ang) * dist) / RECRUIT.hopTime, vy: (Math.sin(ang) * dist) / RECRUIT.hopTime, t: RECRUIT.hopTime };
  }

  /** Nombre d'aliens à tuer avant le prochain loot : `n` ± 20 % (tirage de `sim.rng`), au moins 1. */
  private jitter(n: number): number {
    return Math.max(1, Math.round(n * this.sim.rng.range(0.8, 1.2)));
  }

  update(dt: number): void {
    const { rng } = this.sim;
    if (!this.sim.tutorial?.active && !this.sim.ending) {
      // pendant le tutoriel, aucun power-up au hasard (ni pendant la séquence de fin) : seuls ceux du script apparaissent
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = rng.range(DIFFICULTY.powerupEveryMin, Math.max(DIFFICULTY.powerupEveryMin, DIFFICULTY.powerupEveryMax));
        this.spawn();
      }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      if (!p.caught) p.life -= dt; // attrapé : il ne disparaît plus
      if (p.age !== undefined) p.age += dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      // saut en cloche à la sortie de l'alien (loot de relance) : en l'air, ni aimant ni ramassage
      if (p.hop) {
        const { minX, maxX, minY, maxY } = this.sim.arena.bounds;
        p.x = Math.min(maxX, Math.max(minX, p.x + p.hop.vx * dt));
        p.y = Math.min(maxY, Math.max(minY, p.y + p.hop.vy * dt));
        p.hop.t -= dt;
        if (p.hop.t <= 0) p.hop = undefined;
        continue;
      }
      if (p.age !== undefined && p.age < DIFFICULTY.chestOrbGrace) continue; // imprenable la première seconde : on le voit d'abord retomber
      // attiré par le soldat le plus proche dont la squad a l'aimant (stat `magnet` : rayon d'attraction, de ramassage et vitesse)
      const pulled = p.pulled ? pulledAttractor(this.sim, p.x, p.y, p.pulled) : undefined; // aspiré par le power-up aimant : vole vers la squad
      if (p.pulled && !pulled) p.pulled = undefined;
      const a = pulled ?? findAttractor(this.sim, p.x, p.y);
      if (!a) continue;
      catchItem(p, a.squad.owner); // attiré : il ne disparaît plus ni ne clignote, et suit cette squad
      if (!inPickRange(a)) {
        chase(p, a.soldier.x, a.soldier.y, a.dist, a.stat, dt); // accélère jusqu'à une vitesse max très rapide
        continue;
      }
      this.items.splice(i, 1);
      this.apply(p, a.squad);
    }
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      f.ttl -= dt;
      if (f.ttl <= 0) {
        this.fields.splice(i, 1);
        continue;
      }
      if (f.kind !== 'heal') continue;
      for (const sq of this.sim.squads) {
        for (const s of sq.soldiers) {
          if (!s.alive || ((s.x - f.x) / f.r) ** 2 + ((s.y - f.y) / (f.r * FIELD_ASPECT)) ** 2 >= 1) continue; // centre du soldat dans l'ellipse dessinée au sol
          const cap = s.maxHp * (1 + HEAL_FIELD.overheal);
          if (s.hp < cap) s.hp = Math.min(cap, s.hp + s.maxHp * HEAL_FIELD.perSec * dt);
        }
      }
    }
  }

  /** Apparition près d'une squad vivante au hasard, à distance de marche, sur un point libre. */
  private spawn(): void {
    if (this.items.length >= Math.round(DIFFICULTY.powerupMax)) return;
    const { rng, arena } = this.sim;
    const squads = this.sim.aliveSquads;
    if (squads.length === 0) return;
    const sq = rng.pick(squads);
    for (let tries = 0; tries < 20; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(200, 420);
      const p = { x: sq.center.x + Math.cos(a) * d, y: sq.center.y + Math.sin(a) * d };
      if (!arena.isFree(p, 30)) continue;
      if (squads.some((o) => Math.hypot(o.center.x - p.x, o.center.y - p.y) < o.radius + SPAWN_CLEARANCE)) continue; // jamais sur une escouade (la sienne ou une autre) : au moins 50 px au-delà de son rayon
      const b = arena.bounds;
      if (p.x < b.minX + 60 || p.x > b.maxX - 60 || p.y < b.minY + 60 || p.y > b.maxY - 60) continue;
      // apparaît tel quel : la vue joue un petit scale « Back.Out » (pas de saut)
      this.items.push({ id: this.sim.ids.get(), kind: rng.pick(KINDS), x: p.x, y: p.y, life: POWERUP_LIFE });
      return;
    }
  }

  private apply(p: PowerUpState, squad: Squad): void {
    this.sim.events.push({ t: 'powerup', owner: squad.owner, kind: p.kind, x: p.x, y: p.y });
    switch (p.kind) {
      case 'stim':
        squad.buffs.stim = DIFFICULTY.stimTime;
        break;
      case 'magnet':
        this.sim.xp.magnetize(squad, MAGNET_RADIUS); // coup unique : aspire tout l'XP, les recrues et les autres power-ups alentour, ne reste pas actif
        this.sim.recruits.magnetize(squad, MAGNET_RADIUS);
        this.sim.upgradeOrbs.magnetize(squad, MAGNET_RADIUS);
        this.sim.gems.magnetize(squad, MAGNET_RADIUS);
        this.magnetize(squad, MAGNET_RADIUS);
        break;
      case 'heal':
        this.fields.push({ id: this.sim.ids.get(), kind: 'heal', x: p.x, y: p.y, r: HEAL_FIELD.r, ttl: HEAL_FIELD.ttl });
        break;
      case 'stasis':
        this.fields.push({ id: this.sim.ids.get(), kind: 'stasis', x: p.x, y: p.y, r: STASIS_FIELD.r, ttl: STASIS_FIELD.ttl });
        break;
      case 'rockets':
        this.sim.combat.barrage(squad, ROCKETS);
        break;
      case 'prism':
        squad.prismBoost = true; // le prochain level-up de ce joueur propose 3 cartes prismatiques (pas après une relance)
        break;
      case 'reroll':
        squad.rerolls++; // une relance de plus pour les choix d'upgrade
        break;
    }
  }

  /** Aimant : les power-ups à moins de `radius` px de la squad sont aspirés vers elle (le power-up aimant lui-même vient d'être ramassé). */
  private magnetize(squad: Squad, radius: number): void {
    for (const p of this.items) {
      if (p.hop || (p.age !== undefined && p.age < DIFFICULTY.chestOrbGrace) || Math.hypot(squad.center.x - p.x, squad.center.y - p.y) > radius) continue; // en l'air ou imprenable : l'aimant ne l'aspire pas
      p.pulled = squad.owner;
      catchItem(p); // il ne disparaît pas en route
    }
  }

  /** Facteur de vitesse d'un alien à cet endroit (globes de stase : le plus fort l'emporte). */
  stasisAt(x: number, y: number): number {
    let k = 1;
    for (const f of this.fields) {
      // centre de l'alien (point au sol) dans l'ellipse dessinée au sol, comme l'affichage (et non dans le cercle de rayon r, qui débordait en haut et en bas)
      if (f.kind === 'stasis' && ((x - f.x) / f.r) ** 2 + ((y - f.y) / (f.r * FIELD_ASPECT)) ** 2 < 1) k = Math.min(k, STASIS_FIELD.slow);
    }
    return k;
  }

  clear(): void {
    this.items.length = 0;
    this.fields.length = 0;
    this.timer = DIFFICULTY.powerupFirst;
    this.rerollLeft = -1;
    this.rerollReady = false;
    this.prismLeft = -1;
    this.prismReady = false;
  }
}
