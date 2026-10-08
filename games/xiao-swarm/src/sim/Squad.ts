import { assignSlotsOptimal, damp, robustCentroid, Stats, sunflowerSlots, type Circle, type Point } from '@xiao/engine/sim';
import { CROWD, DETACH_EXTRA, DIFFICULTY, GRAB_IMMUNE, GRAB_OUT, GRAB_SLOW, GRAB_SLOW_TIME, PRISM_CHANCE, REINFORCE_MAX_OVERCAP, REJOIN_EXTRA, REROLLS_PER_RUN, SQUAD, SQUAD_BASE, STIM_SPEED, UPGRADE_REPEL } from '../config';
import { CLASSES, type SoldierClassId } from '../data/classes';
import { OFFER_SIZE, UPGRADE_IDS, UPGRADES, xpToNext, type UpgradeId } from '../data/progression';
import type { Arena } from './Arena';
import type { SoldierState } from './entities';
import type { Sim } from './Sim';
import type { PlayerId, PlayerInput } from './types';

const anchorV = { x: 0, y: 0 };

/**
 * Avance l'ancre d'un tick selon l'input (norme ≤ 1) : obstacles et bords compris.
 * Partagé par `Squad.update` (hôte) et par la prédiction du client (`net/Prediction.ts`) : même code, même résultat.
 */
export function stepAnchor(arena: Arena, anchor: Circle, mx: number, my: number, speed: number, dt: number): void {
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  anchorV.x = mx * speed;
  anchorV.y = my * speed;
  arena.steer(anchor.x, anchor.y, anchor.radius, anchorV);
  anchor.x += anchorV.x * dt;
  anchor.y += anchorV.y * dt;
  arena.constrain(anchor);
}

export type SquadStat ='damage' | 'fireRate' | 'hp' | 'speed' | 'maxSquad' | 'magnet' | 'recruit' | 'xpGain' | 'range' | 'crit';

/**
 * La squad d'un joueur = une "entité vivante" (GDD §4-6) :
 *  - une ancre suit l'input immédiatement (c'est elle qu'on prédira côté client en réseau) ;
 *  - chaque soldat rejoint son slot dans une spirale de tournesol avec un retard individuel ;
 *  - séparation + obstacles → la formation se déforme puis se reforme ;
 *  - l'ancre est tenue en laisse autour du coeur de la squad.
 */
export class Squad {
  readonly soldiers: SoldierState[] = [];
  /** Composition de la squad quand elle a été à son effectif maximal de la partie (base du revive : `REVIVE_SQUAD_FRACTION`). */
  peakComposition: SoldierClassId[] = [];
  readonly anchor = { x: 0, y: 0, radius: 18 };
  private readonly steerV = { x: 0, y: 0 };
  private readonly slotTarget = { x: 0, y: 0, radius: 0 };
  readonly center: Point = { x: 0, y: 0 };
  /** Upgrades propres à ce joueur. */
  /** Emplacement du joueur (0, 1, 2…) : détermine sa couleur chez tous les joueurs ; attribué par `Sim`. */
  slot = 0;
  readonly stats = new Stats<SquadStat>({ damage: SQUAD_BASE.damage, fireRate: SQUAD_BASE.fireRate, hp: SQUAD_BASE.hp, speed: SQUAD_BASE.speed, maxSquad: SQUAD.baseMaxSize, magnet: 1, recruit: SQUAD_BASE.recruit, xpGain: 1, range: 1, crit: 0 });
  /** Progression (globes d'XP) : niveau, XP dans le niveau en cours, upgrades proposées (pause du jeu tant qu'on n'a pas choisi). */
  xp = 0;
  level = 1;
  /** Les 3 upgrades à choisir, ou null. */
  offer: UpgradeId[] | null = null;
  /** Pour chaque upgrade proposée : prismatique (bonus doublé) ? */
  offerPrism: boolean[] = [];
  /** Relances restantes de la partie. */
  rerolls = REROLLS_PER_RUN;
  /** Plus grande taille atteinte par la squad depuis le début de la partie (la réanimation en rend 60 %). */
  peakSize = 0;
  /** Bonus temporaires (s restantes) des power-ups : stimpack (vitesse et cadence ×2),  */
  readonly buffs = { stim: 0 };
  private pendingLevels = 0;
  readonly picked: Partial<Record<UpgradeId, number>> = {};
  moving = false;
  stillTime = 0;
  kills = 0;
  /** Dégâts totaux infligés aux aliens par cette squad (PV et boucliers réellement retirés, sans overkill). */
  dealt = 0;
  private slots: Point[] = [];
  /** Soldats qui comptent pour le mouvement de foule (hors prisonniers d'une bulle et unités tirées par une langue). */
  private readonly crowd: SoldierState[] = [];
  private crowdSize = 0;
  /** Recrues qui viennent d'arriver : elles gardent leur place (voir `recruit`). */
  private readonly newcomers: SoldierState[] = [];
  private slotSpacing: number = CROWD.spacing;
  private dirty = true;
  private healFx = 0;

  constructor(
    private readonly sim: Sim,
    readonly owner: PlayerId,
  ) {}

  get size(): number {
    return this.soldiers.length;
  }

  get alive(): boolean {
    return this.soldiers.length > 0;
  }

  get maxSize(): number {
    return Math.floor(this.stats.get('maxSquad'));
  }

  /** Vitesse de l'ancre (px/s) : upgrades et stimpack compris. Passe dans le snapshot pour la prédiction client. */
  get moveSpeed(): number {
    return CROWD.speed * this.stats.get('speed') * (this.buffs.stim > 0 ? STIM_SPEED : 1);
  }

  /** Nouvelle partie : plus de soldats, progression (XP, niveau, upgrades) et bonus remis à zéro. */
  resetRun(): void {
    this.soldiers.length = 0;
    this.detached.clear();
    this.crowd.length = 0;
    this.newcomers.length = 0;
    this.stats.reset();
    this.xp = 0;
    this.level = 1;
    this.offer = null;
    this.offerPrism = [];
    this.rerolls = REROLLS_PER_RUN;
    this.peakSize = 0;
    this.buffs.stim = 0;
    this.pendingLevels = 0;
    for (const k of Object.keys(this.picked)) delete this.picked[k as UpgradeId];
    this.kills = 0;
    this.dealt = 0;
    this.stillTime = 0;
    this.dirty = true;
  }

  /** XP nécessaire pour le prochain niveau (XP partagée : × nombre de joueurs). */
  get xpNeeded(): number {
    return xpToNext(this.level) * this.sim.xpScale;
  }

  /** Ajoute de l'XP (le bonus `xpGain` agit à la chute des globes, voir `Xp.drop`, pas ici) ; chaque niveau franchi prépare un choix d'upgrade. Coop : barre commune. */
  gainXp(value: number): void {
    if (this.sim.sharedXp) {
      this.sim.gainSharedXp(this, value);
      return;
    }
    this.xp += value;
    const before = this.level;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.pendingLevels++;
      this.sim.events.push({ t: 'levelUp', owner: this.owner, level: this.level });
    }
    // Onde de choc à CHAQUE montée de niveau (même si un choix d'upgrade est déjà ouvert ou qu'il n'y a plus rien à proposer) :
    // calée sur l'anneau affiché par l'événement `levelUp` ; une seule onde même si plusieurs niveaux d'un coup.
    if (this.level > before) this.sim.shockwave(this.center.x, this.center.y, UPGRADE_REPEL.radius, UPGRADE_REPEL.speed, UPGRADE_REPEL.duration, UPGRADE_REPEL.reach);
    if (this.pendingLevels > 0 && !this.offer) this.rollOffer();
  }

  /** XP partagée : recopie la barre commune ; `levels` niveaux viennent d'être franchis (un choix d'upgrade pour chacun). */
  syncSharedXp(xp: number, level: number, levels: number): void {
    this.xp = xp;
    this.level = level;
    if (levels <= 0) return;
    this.pendingLevels += levels;
    for (let l = level - levels + 1; l <= level; l++) this.sim.events.push({ t: 'levelUp', owner: this.owner, level: l });
    if (this.alive) this.sim.shockwave(this.center.x, this.center.y, UPGRADE_REPEL.radius, UPGRADE_REPEL.speed, UPGRADE_REPEL.duration, UPGRADE_REPEL.reach);
    if (!this.offer) this.rollOffer();
  }

  /** Niveau encore en attente sans proposition ouverte : en prépare une (nouvelle manche de choix). Vrai s'il y en a une. */
  rollPending(): boolean {
    if (this.pendingLevels > 0 && !this.offer) this.rollOffer();
    return !!this.offer;
  }

  /** Remplace les propositions ouvertes par un nouveau tirage (si possible sans les mêmes upgrades). Vrai si la relance a eu lieu. */
  rerollOffer(): boolean {
    if (!this.offer || this.rerolls <= 0 || this.sim.tutorial?.active) return false; // pas de relance pendant l'onboarding (offre imposée)
    this.rerolls--;
    this.rollOffer(this.offer);
    return true;
  }

  private rollOffer(avoid: readonly UpgradeId[] = []): void {
    let eligible = UPGRADE_IDS.filter((id) => (this.picked[id] ?? 0) < UPGRADES[id].maxStacks && (id !== 'reinforce' || this.size - this.maxSize < REINFORCE_MAX_OVERCAP));
    const fresh = eligible.filter((id) => !avoid.includes(id));
    if (fresh.length >= OFFER_SIZE) eligible = fresh;
    const forced = this.sim.tutorial?.forcedOffer() ?? null; // onboarding : offre imposée, jamais prismatique
    const offer = forced ?? (eligible.length ? this.sim.rng.sample(eligible, OFFER_SIZE) : null);
    this.offer = offer;
    if (!offer) {
      this.pendingLevels = 0;
      this.offerPrism = [];
        return;
    }
    this.offerPrism = offer.map(() => (forced ? false : this.sim.rng.chance(PRISM_CHANCE)));
    this.sim.beginUpgradeChoice(); // pause du jeu le temps du choix
  }

  /** Choisit l'upgrade `index` parmi les propositions. Le niveau suivant éventuel est proposé à la manche suivante (Sim.afterChoice). */
  chooseUpgrade(index: number): boolean {
    const id = this.offer?.[index];
    if (!id) return false;
    const prism = this.offerPrism[index] === true;
    this.applyUpgrade(id, prism);
    this.sim.events.push({ t: 'upgradePicked', owner: this.owner, x: this.center.x, y: this.center.y, id, prism }); // texte flottant + onde sur la squad (view/WorldView.ts)
    this.offer = null;
    this.offerPrism = [];
    this.pendingLevels--;
    return true;
  }

  /**
   * Dev (panneau Triche) : progression d'une partie avancée. La squad est vidée (sans morts : à refaire avec `Sim.respawnSquad`), les
   * upgrades remises à zéro puis un choix par niveau franchi jusqu'à `level`, comme en jeu : vraie offre de 3 cartes (mêmes règles
   * d'éligibilité, prismatique possible) et carte retenue selon `weight` (préférences du joueur ; absent = au hasard). Les renforts
   * comptent comme pris mais leurs Gunners sont renvoyés (à ajouter à la squad refaite). XP du niveau à zéro, aucun choix en attente.
   */
  fastForward(level: number, weight: (id: UpgradeId) => number = () => 1): number {
    this.soldiers.length = 0;
    this.detached.clear();
    this.crowd.length = 0;
    this.newcomers.length = 0;
    this.peakComposition = [];
    this.peakSize = 0;
    this.dirty = true;
    this.stats.reset();
    for (const k of Object.keys(this.picked)) delete this.picked[k as UpgradeId];
    this.offer = null;
    this.offerPrism = [];
    this.pendingLevels = 0;
    const { rng } = this.sim;
    let reinforcements = 0;
    for (let l = 1; l < level; l++) {
      // squad supposée pleine : seuls les Gunners des renforts déjà pris la font dépasser son max
      const eligible = UPGRADE_IDS.filter((id) => (this.picked[id] ?? 0) < UPGRADES[id].maxStacks && (id !== 'reinforce' || reinforcements < REINFORCE_MAX_OVERCAP));
      if (eligible.length === 0) break;
      const offer = rng.sample(eligible, OFFER_SIZE);
      const id = rng.weighted(offer, weight) ?? rng.pick(offer);
      const prism = rng.chance(PRISM_CHANCE);
      if (id === 'reinforce') {
        this.picked[id] = (this.picked[id] ?? 0) + 1;
        reinforcements += UPGRADES.reinforce.value * (prism ? 2 : 1);
      } else this.applyUpgrade(id, prism);
    }
    this.level = level;
    this.xp = 0;
    return reinforcements;
  }

  /** Applique la stat `hp` aux soldats déjà là : PV max et PV courants augmentent du même montant (silencieux). */
  refreshMaxHp(): void {
    for (const s of this.soldiers) {
      const max = s.def.hp * DIFFICULTY.soldierHpMul * this.stats.get('hp');
      s.hp += max - s.maxHp;
      s.maxHp = max;
    }
  }

  /** `prism` : upgrade prismatique, bonus habituel doublé. */
  private applyUpgrade(id: UpgradeId, prism: boolean): void {
    const def = UPGRADES[id];
    const mult = prism ? 2 : 1;
    this.picked[id] = (this.picked[id] ?? 0) + 1;
    if (def.stat && def.mod) for (let i = 0; i < mult; i++) this.stats.add(def.stat, def.mod);
    if (id === 'hp') {
      // les soldats déjà là gagnent les PV max supplémentaires, et autant de PV courants (50/100 + 20 % → 70/120)
      for (const s of this.soldiers) {
        const max = s.def.hp * DIFFICULTY.soldierHpMul * this.stats.get('hp');
        s.hp += max - s.maxHp;
        s.maxHp = max;
        this.sim.events.push({ t: 'heal', x: s.x, y: s.y - 50 });
      }
    } else if (id === 'reinforce') {
      // proposée même squad pleine : elle dépasse alors temporairement la taille max (14/12), seuls les ramassages sont bloqués
      for (let i = 0; i < def.value * mult; i++) {
        const a = this.sim.rng.range(0, Math.PI * 2);
        const r = this.radius * 0.5;
        const s = this.recruit('trooper', { x: this.center.x + Math.cos(a) * r, y: this.center.y + Math.sin(a) * r });
        s.invulnerable = 1;
      }
    }
  }

  get isHealing(): boolean {
    return this.stillTime > CROWD.stillDelay && this.soldiers.some((s) => s.def.heal);
  }

  countOf(id: SoldierClassId): number {
    let n = 0;
    for (const s of this.soldiers) if (s.def.id === id) n++;
    return n;
  }

  /** Taille de la formation, utile pour la caméra et le spawn. */
  get radius(): number {
    return CROWD.spacing * 0.55 * Math.sqrt(this.soldiers.length + 0.5) + CROWD.spacing;
  }

  spawn(ids: SoldierClassId[], at: Point): void {
    this.anchor.x = at.x;
    this.anchor.y = at.y;
    this.stillTime = 0;
    this.crowd.length = 0; // repère de la vie précédente (joueur réanimé)
    const slots = sunflowerSlots(ids.length, CROWD.spacing);
    ids.forEach((id, i) => this.add(id, { x: at.x + slots[i].x, y: at.y + slots[i].y }));
    this.updateCenter();
    this.sim.events.push({ t: 'squadSpawned', owner: this.owner, x: at.x, y: at.y });
  }

  add(id: SoldierClassId, at: Point): SoldierState {
    const def = CLASSES[id];
    const maxHp = def.hp * DIFFICULTY.soldierHpMul * this.stats.get('hp');
    const s: SoldierState = {
      kind: 'soldier',
      id: this.sim.ids.get(),
      owner: this.owner,
      team: this.owner,
      def,
      x: at.x,
      y: at.y,
      px: at.x,
      py: at.y,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      radius: def.radius,
      mass: def.mass,
      hp: maxHp,
      maxHp,
      shield: 0,
      maxShield: 0,
      alive: true,
      slotX: 0,
      slotY: 0,
      gain: this.sim.rng.next(),
      cooldown: this.sim.rng.next() * def.weapon.cooldown,
      retarget: 0,
      target: null,
      facing: 1,
      aim: 0,
      invulnerable: 0,
      capturedBy: 0,
      frozen: 0,
      iceInvuln: 0,
      stun: 0,
      grabbed: 0,
    };
    this.soldiers.push(s);
    if (this.soldiers.length > this.peakSize) this.peakSize = this.soldiers.length;
    this.dirty = true;
    return s;
  }

  /**
   * Un soldat rejoint la squad en cours de route (ramassage). Il prend dans la formation la place la plus proche
   * de l'endroit où il a été ramassé, et les autres se décalent au besoin : le joueur choisit où s'insère la
   * recrue en choisissant quel côté de la squad passe dessus.
   */
  recruit(id: SoldierClassId, at: Point): SoldierState {
    const s = this.add(id, at);
    this.newcomers.push(s);
    return s;
  }

  /** Retire les soldats morts (appelé en fin de tick). */
  removeDead(): SoldierState[] {
    const dead: SoldierState[] = [];
    for (let i = this.soldiers.length - 1; i >= 0; i--) {
      if (this.soldiers[i].alive) continue;
      dead.push(this.soldiers[i]);
      this.soldiers.splice(i, 1);
      this.dirty = true;
    }
    if (this.soldiers.length > this.peakComposition.length) this.peakComposition = this.soldiers.map((s) => s.def.id);
    return dead;
  }

  /** Soldats isolés de la squad (voir `DETACH_EXTRA`) : hors du mouvement de foule jusqu'à leur retour au contact. */
  private readonly detached = new Set<SoldierState>();

  /** Hors formation : avalé par une bulle, fraîchement tiré par une langue, ou isolé loin de la squad (il ne compte alors ni pour le centre, ni pour les slots). */
  private isOut(s: SoldierState): boolean {
    return s.capturedBy !== 0 || s.frozen > 0 || s.grabbed > GRAB_IMMUNE - GRAB_OUT || this.detached.has(s);
  }

  /** Met à jour les soldats isolés : sortie au-delà de `radius + DETACH_EXTRA`, retour sous `radius + REJOIN_EXTRA` (hystérésis, d'après le centre du tick précédent). */
  private updateDetached(): void {
    const far = this.radius + DETACH_EXTRA;
    const near = this.radius + REJOIN_EXTRA;
    for (const s of this.soldiers) {
      const d = Math.hypot(s.x - this.center.x, s.y - this.center.y);
      if (this.detached.has(s)) {
        if (d < near || !s.alive) this.detached.delete(s);
      } else if (d > far && s.alive && this.soldiers.length > 1) this.detached.add(s);
    }
    for (const s of this.detached) if (!this.soldiers.includes(s)) this.detached.delete(s);
    if (this.detached.size >= this.soldiers.length) this.detached.clear(); // tous isolés : la squad entière sert de repère
  }

  update(dt: number, input: PlayerInput): void {
    if (this.buffs.stim > 0) this.buffs.stim -= dt;
    const total = this.soldiers.length;
    if (total === 0) return;
    this.updateDetached();
    this.crowd.length = 0;
    for (const s of this.soldiers) if (!this.isOut(s)) this.crowd.push(s);
    if (this.crowd.length === 0) this.crowd.push(...this.soldiers); // tous hors formation : on garde la squad entière comme repère
    const n = this.crowd.length;
    if (n !== this.crowdSize) {
      this.crowdSize = n;
      this.dirty = true; // la formation change de taille : slots recalculés
    }
    this.moving = Math.hypot(input.mx, input.my) > 0.1;
    this.stillTime = this.moving ? 0 : this.stillTime + dt;
    const speed = this.moveSpeed;

    // 1. Ancre : réponse immédiate à l'input
    stepAnchor(this.sim.arena, this.anchor, input.mx, input.my, speed, dt);

    // 2. Laisse autour du coeur de la squad
    this.updateCenter();
    const dx = this.anchor.x - this.center.x;
    const dy = this.anchor.y - this.center.y;
    const d = Math.hypot(dx, dy);
    const leash = CROWD.leash + Math.sqrt(n) * CROWD.leashPerRoot;
    if (d > leash) {
      this.anchor.x = this.center.x + (dx / d) * leash;
      this.anchor.y = this.center.y + (dy / d) * leash;
    }

    // 3. Slots (recalculés quand la taille ou l'espacement change)
    if (this.dirty || this.slotSpacing !== CROWD.spacing) this.reassign();

    // 4. Chaque soldat rejoint son slot avec inertie
    const maxSpeed = speed * CROWD.maxSpeedMul;
    for (const s of this.soldiers) {
      // prisonnier d'une bulle : elle le porte ; si la bulle a disparu, il est libre
      // gelé : immobile sur place (aucun recul), hors formation, jusqu'à ce que les tirs alliés aient brisé la glace
      if (s.frozen > 0) {
        if (s.invulnerable > 0) s.invulnerable -= dt;
        if (s.iceInvuln > 0) s.iceInvuln -= dt;
        s.vx = s.vy = s.kx = s.ky = 0;
        continue;
      }
      if (s.capturedBy) {
        if (s.invulnerable > 0) s.invulnerable -= dt; // décompté aussi dans une bulle
        if (this.sim.aliens.some((x) => x.alive && x.id === s.capturedBy)) continue;
        s.capturedBy = 0;
      }
      if (s.stun > 0) {
        // étourdi : immobile (seul le recul agit), ne rejoint pas son slot
        s.stun -= dt;
        s.vx = s.vy = 0;
        s.x += s.kx * dt;
        s.y += s.ky * dt;
        s.kx = damp(s.kx, 0, CROWD.knockDamp, dt);
        s.ky = damp(s.ky, 0, CROWD.knockDamp, dt);
        if (s.invulnerable > 0) s.invulnerable -= dt;
        continue;
      }
      if (s.grabbed > 0) s.grabbed -= dt;
      const gain = CROWD.gainMin + s.gain * CROWD.gainSpread;
      // le slot visé est ramené hors du décor : un slot dans un obstacle plaquerait le soldat contre lui
      this.slotTarget.x = this.anchor.x + s.slotX;
      this.slotTarget.y = this.anchor.y + s.slotY;
      this.slotTarget.radius = s.radius + CROWD.wallMargin * 0.4;
      this.sim.arena.constrain(this.slotTarget);
      let desiredX = (this.slotTarget.x - s.x) * gain;
      let desiredY = (this.slotTarget.y - s.y) * gain;
      const l = Math.hypot(desiredX, desiredY);
      if (l > maxSpeed) {
        desiredX = (desiredX / l) * maxSpeed;
        desiredY = (desiredY / l) * maxSpeed;
      }
      const slow = this.sim.puddles.length > 0 ? this.sim.slowAt(s.x, s.y, s.radius) : 1; // flaque de crachat
      const grabSlow = s.grabbed > GRAB_IMMUNE - GRAB_SLOW_TIME ? GRAB_SLOW : 1; // vient de se faire grab : ralentie un moment
      desiredX *= slow * grabSlow;
      desiredY *= slow * grabSlow;
      s.vx = damp(s.vx, desiredX, CROWD.velDamp, dt);
      s.vy = damp(s.vy, desiredY, CROWD.velDamp, dt);
      this.steerV.x = s.vx;
      this.steerV.y = s.vy;
      this.sim.arena.steer(s.x, s.y, s.radius, this.steerV);
      s.vx = this.steerV.x;
      s.vy = this.steerV.y;
      s.x += (s.vx + s.kx) * dt;
      s.y += (s.vy + s.ky) * dt;
      s.kx = damp(s.kx, 0, CROWD.knockDamp, dt);
      s.ky = damp(s.ky, 0, CROWD.knockDamp, dt);
      if (s.invulnerable > 0) s.invulnerable -= dt;
    }

    // 5. Séparation douce entre soldats (n ≤ ~30 : O(n²) suffit)
    for (let i = 0; i < total; i++) {
      const a = this.soldiers[i];
      for (let j = i + 1; j < total; j++) {
        const b = this.soldiers[j];
        if (a.capturedBy || b.capturedBy || a.frozen > 0 || b.frozen > 0) continue;
        const ddx = b.x - a.x;
        const ddy = b.y - a.y;
        const min = (a.radius + b.radius) * 1.05;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= min * min || d2 === 0) continue;
        const dd = Math.sqrt(d2);
        const push = ((min - dd) / dd) * CROWD.separation;
        const wa = b.mass / (a.mass + b.mass);
        const wb = a.mass / (a.mass + b.mass);
        a.x -= ddx * push * wa;
        a.y -= ddy * push * wa;
        b.x += ddx * push * wb;
        b.y += ddy * push * wb;
      }
    }

    // 6. Obstacles & bords
    for (const s of this.soldiers) if (!s.capturedBy) this.sim.arena.constrain(s);

    this.updateHealing(dt);
  }

  /** Medic : soigne la squad quand elle est à l'arrêt (GDD §8). */
  private updateHealing(dt: number): void {
    if (!this.isHealing) return;
    this.healFx -= dt;
    const fx = this.healFx <= 0;
    if (fx) this.healFx = 0.35;
    for (const m of this.soldiers) {
      const heal = m.def.heal;
      if (!heal) continue;
      for (const s of this.soldiers) {
        if (s.hp >= s.maxHp || Math.hypot(s.x - m.x, s.y - m.y) > heal.radius) continue;
        s.hp = Math.min(s.maxHp, s.hp + heal.perSecond * dt);
        if (fx && this.sim.rng.chance(0.5)) this.sim.events.push({ t: 'heal', x: s.x, y: s.y - 50 });
      }
    }
  }

  private updateCenter(): void {
    robustCentroid(this.crowd.length > 0 ? this.crowd : this.soldiers, this.radius * 1.6, this.center);
  }

  private reassign(): void {
    this.dirty = false;
    this.slotSpacing = CROWD.spacing;
    const members = this.crowd.length > 0 ? this.crowd : this.soldiers;
    this.slots = sunflowerSlots(members.length, CROWD.spacing, this.slots);
    const relOf = (s: SoldierState): Point => ({ x: s.x - this.anchor.x, y: s.y - this.anchor.y });

    // 1. Les recrues prennent d'abord la place libre la plus proche de leur point de ramassage.
    const slotOf = new Map<SoldierState, number>();
    const taken = new Set<number>();
    for (const s of this.newcomers) {
      if (!members.includes(s)) continue;
      const p = relOf(s);
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < this.slots.length; i++) {
        if (taken.has(i)) continue;
        const d = (this.slots[i].x - p.x) ** 2 + (this.slots[i].y - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      slotOf.set(s, best);
      taken.add(best);
    }
    this.newcomers.length = 0;

    // 2. Les autres soldats se répartissent les places restantes en se déplaçant le moins possible.
    const others = members.filter((s) => !slotOf.has(s));
    const free = this.slots.map((_, i) => i).filter((i) => !taken.has(i));
    const assignment = assignSlotsOptimal(
      others.map(relOf),
      free.map((i) => this.slots[i]),
    );
    others.forEach((s, i) => slotOf.set(s, free[assignment[i]]));

    for (const s of members) {
      const slot = this.slots[slotOf.get(s)!];
      s.slotX = slot.x;
      s.slotY = slot.y;
    }
  }
}
