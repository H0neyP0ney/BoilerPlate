import Phaser from 'phaser';
import { lerp, sfx, sprites, theme } from '@xiao/engine';
import { DEPTH, FREEZE, ORB_BLINK_TIME, PALETTE, PLAYER_COLORS, REVIVE_TIME, SHADOW_ALPHA, UPGRADE_REPEL, XP_ORB_LIFE, XP_ORB_POP } from '../config';
import { TICK_RATE } from '../net/Session';
import { ALIENS, type AlienId } from '../data/aliens';
import { soldierSpriteId } from '../art/playerVariants';
import { SPIKE3, SPIKE_BINS } from '../art/fx';
import { CLASSES, type SoldierClassId } from '../data/classes';
import { tierOfTexture } from '../data/damageTiers';
import { TUTORIAL } from '../data/tutorial';
import { t } from '../i18n';
import { SFX } from '../settings';
import { UPGRADES, type UpgradeId } from '../data/progression';
import type { Projectile } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import type { PlayerId, SimEvent } from '../sim/types';
import { ArenaView } from './ArenaView';
import { ShockDistort } from './ShockDistort';
import { Fx } from './Fx';
import { FX } from '../fxParams';
import { teleColor, teleInner, teleOuter } from './telegraph';
import { ROCKET_TEXTURE } from '../sim/Combat';
import { CHEST_GOLD, LootViews } from './LootViews';
import { HEAL_FIELD } from '../sim/PowerUps';
import { drawPickupSpot, drawReviveZone, PickupViews, POWERUP_INFO, powerUpIconKey, RECRUIT_COLOR } from './PickupViews';
import { upgradeIconKey } from './upgradeIcons';
import { AlienView, RecruitView, SoldierView } from './UnitViews';
import { alienOffsetY, soldierOffsetY } from './spriteOffset';

/** Couleurs d'anneau des autres joueurs (battle royale) ; le joueur local est toujours bleu. */
export const RIVAL_COLORS = [0xff5a5a, 0xffb938, 0xc77dff, 0x7dff9a, 0xff7ad9, 0xffffff, 0x3de0c0, 0xff8a3a, 0x9aa0ff];

/** Hauteur maximale (px) de l'arc d'une grenade en cloche (effet d'affichage uniquement). */
export const LOB_HEIGHT = 55;
// Télégraphes des attaques d'aliens : couleur par type et remplissage commun dans `view/telegraph.ts` (réglages `FX.telegraph`).
/** Barre des PV du glaçon d'un soldat gelé (au-dessus de sa barre de vie). */
const ICE_BAR_COLOR = 0x6fd8ff;
/** Explosion de la boule du shooter (bordeaux) : couleur de l'éclaboussure, des flaques et de l'onde, et reflet clair des gouttes. */
const SHOOTER_BLAST = 0xa82846;
const SHOOTER_BLAST_LIGHT = 0xf4b9c8;
/** Durée (s) avant l'impact pendant laquelle la zone d'une boule ennemie est signalée en rouge. */
const TELEGRAPH_S = 1; // 0,8 avant le 07/10
/** Largeur (px) de la flaque `fx_puddle` (art/fx.ts) à l'échelle 1 : sert à caler les flaques de mort sur l'ombre portée. */
const PUDDLE_TEX_W = 50;

/** Largeur (px) de l'ombre portée d'un alien (rayon, réduite s'il flotte, × réglage d'ombre de son visuel) ; ses flaques de mort ont la même. */
/**
 * Trou dans le sol (apparition, lurker, Scarab, recyclage) : rebord de terre de largeur `w` (= largeur de l'ombre portée de l'alien quand il
 * est ouvert), centré sur (`x`, `y`) comme l'ombre ; `alpha` pour qu'il se rebouche.
 */
function drawHole(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, alpha: number): void {
  if (w <= 0 || alpha <= 0) return;
  g.fillStyle(0x6a4a30, 0.9 * alpha).fillEllipse(x, y, w, w * 0.54); // rebord de terre
  g.fillStyle(0x1a0f0a, 0.95 * alpha).fillEllipse(x, y + 1, w * 0.78, w * 0.41); // trou
  g.fillStyle(0x000000, 0.7 * alpha).fillEllipse(x, y + 3, w * 0.48, w * 0.24);
}

function shadowWidth(id: AlienId): number {
  const def = ALIENS[id];
  return (sprites.get(`alien_${id}`).shadow ?? def.radius) * (def.floats ? 0.7 : 1) * 2.1; // `shadow` = rayon de l'ombre (px), indépendant du rayon de collision ; à défaut, le rayon de collision
}

/** Échelle de la flaque de mort (et de cadavre) d'un alien : largeur de son ombre portée × `FX.puddle.shadowMul` (le même pour tous). */
function puddleSize(id: AlienId): number {
  return (shadowWidth(id) / PUDDLE_TEX_W) * FX.puddle.shadowMul;
}

/** Durée (s) du « pop » d'apparition d'un nuage ralentissant du cracheur. */
const CLOUD_POP = 0.3;
/** Distance (px) de vol sur laquelle une balle rejoint sa trajectoire depuis la bouche du canon dessinée. */
const MUZZLE_BLEND_PX = 40;
/** Taille des globes d'XP en jeu, en multiple de la taille d'origine (1,3 = +30 %). */
export const ORB_SCALE = 1.3;
/** Montée de niveau : nombre d'ondes de choc blanches successives et délai (ms) entre deux. */
/** PV de base à partir desquels la mort d'un alien secoue l'écran (charger 390, lurker 360, bulle 2160, mini-boss ; hors slimes, gling…). */
const BIG_KILL_HP = 300;
/** Barre de vie : la part blanche attend ce temps (s) sur l'ancienne vie après un coup, puis rejoint la barre colorée à cette vitesse (part de la barre par seconde). */
export const BAR_GHOST_HOLD = 0.5; // 0,15 avant le 08/10
/** Sous le feu, chaque coup relance l'attente de la part blanche mais ×`BAR_GHOST_HOLD_DECAY` de moins que le précédent (elle finit par rejoindre la rouge). */
export const BAR_GHOST_HOLD_DECAY = 0.7; // 0,6 avant le 08/10
export interface BarGhost { last: number; ghost: number; hold: number; hits: number }
/** Un coup vient d'être pris (`ratio` < `st.last`) : relance l'attente de la part blanche, de plus en plus courte au fil de la rafale. */
export function ghostHit(st: BarGhost, ratio: number): void {
  if (ratio >= st.last - 1e-4) return;
  if (st.ghost <= st.last + 1e-4) st.hits = 0; // la blanche avait rattrapé la rouge : nouvelle rafale
  st.hold = BAR_GHOST_HOLD * BAR_GHOST_HOLD_DECAY ** st.hits;
  st.hits++;
}
export const BAR_GHOST_SPEED = 4.5; // +70 % de plus
/** Taille relative d'un globe d'XP selon sa valeur (petit, moyen, gros). */
export const orbSize = (value: number): number => (value >= 8 ? 1.25 : value >= 3 ? 0.85 : 0.55);

interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
}

/**
 * Pont entre la simulation et Phaser : crée/détruit les vues au fil des entités
 * (par id), interpole leurs positions, dessine l'overlay (ombres, anneaux,
 * barres de vie, traçantes) et transforme les événements en effets.
 *
 * En réseau côté client, la même vue lira un état reconstruit depuis les snapshots.
 */
export class WorldView {
  readonly arena: ArenaView;
  readonly fx: Fx;
  private readonly soldiers = new Map<number, SoldierView>();
  private readonly aliens = new Map<number, AlienView>();
  private readonly recruits = new Map<number, RecruitView>();
  /** Le mot « BOSS » au-dessus de la barre de vie de chaque boss (par id d'alien). */
  private readonly bossTags = new Map<number, Phaser.GameObjects.Text>();
  private readonly bullets: Phaser.GameObjects.Image[] = [];
  private readonly tracers: Tracer[] = [];
  /** Flashes de tir en cours : ils suivent la bouche du canon de leur soldat (dx, dy : repli si la planche n'en définit pas). */
  private readonly flashes: { img: Phaser.GameObjects.Image; view: SoldierView | AlienView; dx: number; dy: number }[] = [];
  /**
   * Balles fraîchement tirées : décalage (dx, dy) entre l'origine simulée (sx, sy) et la bouche du canon dessinée.
   * Affichage seulement : la balle part visuellement du flash de tir puis rejoint sa vraie trajectoire.
   */
  private readonly muzzleShift = new Map<Projectile, { sx: number; sy: number; dx: number; dy: number }>();
  /** Globes d'XP : pool d'images réutilisées dans l'ordre (comme les projectiles). */
  private readonly orbImgs: Phaser.GameObjects.Image[] = [];
  /** Kamikazes morts : le corps reste sur place, clignote puis explose (l'explosion elle-même vient de la simulation). */
  /** Instant (s) où chaque nuage ralentissant est apparu à l'écran (animation de « pop »). */
  private readonly cloudBorn = new Map<number, number>();
  private readonly fuses: { x: number; y: number; r: number; t: number; dur: number; img: Phaser.GameObjects.Sprite; base: number }[] = [];
  /** Langues en cours : elles relient une grenouille au soldat attrapé pendant `dur` secondes. */
  private readonly tongues: { alien: number; target: number; t: number; dur: number }[] = [];
  /** Préparation de charge vue la dernière fois (valeur reçue et heure locale) : chez un client, `rushWind` n'arrive qu'à chaque snapshot, on la fait décroître entre deux pour un remplissage fluide. */
  private readonly rushWindSeen = new Map<number, { v: number; at: number }>();
  /** Flaques de slimes morts (ressuscitables) et cailloux au sol, par id de simulation. */
  private readonly corpseImgs = new Map<number, Phaser.GameObjects.Image>();
  private readonly rockImgs = new Map<number, Phaser.GameObjects.Image>();
  /** Flammes au sol (traînées des slimes de feu), par id de simulation. */
  private readonly fireImgs = new Map<number, { img: Phaser.GameObjects.Image; base: number; seed: number; r: number }>();
  private readonly liveFires = new Set<number>();
  private readonly lobShadows: { x: number; y: number; h: number }[] = [];
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly beams: Phaser.GameObjects.Graphics;
  /** Sprites des rangées de pics du lurker (un par colonne de 3 pics, réutilisés d'une frame à l'autre). */
  private readonly spikeSprites: Phaser.GameObjects.Image[] = [];
  private readonly colors = new Map<PlayerId, number>();
  /** Bulles d'upgrade, power-ups, globes, compteurs d'escouade. */
  private readonly pickups: PickupViews;
  /** Coffres des boss et globes d'upgrade. */
  private readonly loot: LootViews;
  /** Halos d'apparition en cours : ils suivent leur soldat / leur squad au lieu de rester à l'endroit où ils sont nés. */
  private readonly followers: { parts: { img: Phaser.GameObjects.Image; dy: number }[]; pos: () => { x: number; y: number } | null }[] = [];
  /** Barres de vie : part blanche qui traîne derrière la part colorée (voir `bar`), par id d'unité ; `barsSeen` = ids dessinés cette frame. */
  private readonly barGhosts = new Map<number, BarGhost>();
  private readonly barsSeen = new Set<number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Sim,
    readonly localPlayer: PlayerId,
  ) {
    this.arena = new ArenaView(scene, sim.map);
    this.fx = new Fx(scene);
    this.shock = new ShockDistort(scene);
    this.ground = scene.add.graphics().setDepth(DEPTH.groundFx);
    this.bars = scene.add.graphics().setDepth(DEPTH.bars);
    this.beams = scene.add.graphics().setDepth(DEPTH.fx);
    this.pickups = new PickupViews(
      scene,
      sim,
      (id) => {
        const v = this.soldiers.get(id);
        return v ? { x: v.rx, y: v.ry } : undefined;
      },
      this.fx,
    );
    this.loot = new LootViews(scene, sim, localPlayer);
    for (const sq of sim.squads) this.colorOf(sq.owner);
    this.quietUntil = scene.time.now + 1000; // les soldats déjà présents au chargement n'ont pas de colonne d'arrivée
  }

  /** Pas de colonne d'arrivée avant cet instant (ms) : départ de partie, réapparition, relance. */
  private quietUntil = 0;

  /** Le point (x, y) est-il dans la vue de la caméra (marge `m` px) ? Sert à ne dessiner / animer que ce qu'on voit. */
  private onScreen(x: number, y: number, m = 0): boolean {
    const v = this.scene.cameras.main.worldView;
    return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m;
  }

  /** Couleur d'anneau d'un joueur, attribuée à sa première apparition (arrivée en cours de partie comprise). */
  colorOf(owner: PlayerId): number {
    let c = this.colors.get(owner);
    if (c === undefined) {
      c = PLAYER_COLORS[(this.sim.squadOf(owner)?.slot ?? 0) % PLAYER_COLORS.length]; // même couleur chez tous les joueurs
      this.colors.set(owner, c);
    }
    return c;
  }

  // ---------- Événements ----------

  handle(e: SimEvent): void {
    const nearCam = (x: number, y: number) => {
      const v = this.scene.cameras.main.worldView;
      return x > v.x - 200 && x < v.right + 200 && y > v.y - 200 && y < v.bottom + 200;
    };
    switch (e.t) {
      case 'hit': {
        const v = this.soldiers.get(e.id) ?? this.aliens.get(e.id);
        v?.hit(v instanceof SoldierView ? 0.1 : 0.06);
        break;
      }
      case 'crit':
        if (nearCam(e.x, e.y)) this.fx.crit(e.x, e.y, e.dmg);
        break;
      case 'beam':
        this.tracers.push({ ...e, life: 0.12 });
        this.fx.burst(e.x2, e.y2, 0xb8ffb8, 6);
        break;
      case 'alienDied': {
        if (ALIENS[e.alien].projectile) {
          // orbe de glace détruit par la squad : il vole en éclats (ni gelée ni flaque)
          if (nearCam(e.x, e.y)) this.fx.iceShards(e.x, e.y - 20, FX.ice.breakMul);
          this.fx.ring(e.x, e.y, 50, 0xbfeaff);
          break;
        }
        const def = ALIENS[e.alien];
        const goo = def.goo ?? def.color; // couleur de ses restes (shooter : bleu foncé, son tir reste rouge)
        const oyA = alienOffsetY(e.alien); // restes posés sous le sprite décalé
        this.fx.burst(e.x, e.y + oyA - def.radius * 0.6, goo, e.alien === 'boss_crab' ? 40 : 10);
        // gelée : vrais slimes seulement (`gling` est désormais un petit cafard : simple éclaboussure)
        if (e.alien === 'slime' || e.alien === 'shooter') {
          const size = e.alien === 'shooter' ? 1.6 : 1;
          const light = e.alien === 'shooter' ? 0x9fb8ff : 0xc8ffb0;
          this.fx.gloop(e.x, e.y + oyA - def.radius * 0.6, goo, light, size);
        }
        // flaque au sol de la couleur de ses restes, pour tous : largeur de son ombre portée × `FX.puddle.shadowMul`
        if (nearCam(e.x, e.y)) this.fx.puddles(e.x, e.y + oyA, goo, puddleSize(e.alien));
        // gros alien (charger, lurker, bulle, mini-boss) : légère secousse rapide ; le crabe final a déjà celle de son explosion
        if (e.alien !== 'boss_crab' && def.hp >= BIG_KILL_HP && nearCam(e.x, e.y)) this.scene.cameras.main.shake(FX.shake.bigKillMs, FX.shake.bigKillAmount);
        if (e.alien === 'boss_crab') {
          this.fx.explosion(e.x, e.y, 160, nearCam(e.x, e.y));
          sfx.play(this.scene, SFX.blast.key, SFX.blast);
          this.fx.text(e.x, e.y - 90, 'BOSS DOWN!', '#ffe066', 34);
        }
        break;
      }
      case 'soldierDied': {
        this.corpse(e.id, e.cls, e.x, e.y, this.sim.squadOf(e.owner)?.slot ?? 0);
        this.fx.death(e.x, e.y + soldierOffsetY(e.cls), CLASSES[e.cls].color);
        if (e.owner === this.localPlayer && !CLASSES[e.cls].deathBlast) this.scene.cameras.main.shake(FX.shake.deathMs, FX.shake.deathAmount);
        break;
      }
      case 'shot':
        if (sprites.get(`soldier_${e.cls}`)?.muzzleFlash && nearCam(e.x, e.y)) {
          const view = this.soldiers.get(e.id);
          const mp = view?.muzzlePoint();
          const p = mp ?? e;
          if (mp) this.shiftFreshBullets(e.x, e.y, mp.x - e.x, mp.y - e.y);
          const img = this.fx.muzzleFlash(p.x, p.y);
          if (view) this.flashes.push({ img, view, dx: e.x - view.rx, dy: e.y - view.ry });
          sfx.play(this.scene, SFX.blaster.key, SFX.blaster); // cadence limitée : une escouade entière ne sature pas le son
        }
        break;
      case 'alienShot': {
        // shooter, spitter (et crabe) : flash teinté à la bouche du canon, les boules en cloche en partent visuellement
        if (!sprites.get(`alien_${e.alien}`)?.muzzleFlash || !nearCam(e.x, e.y)) {
          // pas de bouche posée : la boule part du point au sol ; si le sprite est décalé en Y, elle part visuellement de lui
          const off = alienOffsetY(e.alien);
          if (off && nearCam(e.x, e.y)) this.shiftFreshBullets(e.x, e.y, 0, off, !ALIENS[e.alien].ice);
          break;
        }
        const view = this.aliens.get(e.id);
        const mp = view?.muzzlePoint();
        const p = mp ?? e;
        if (mp) this.shiftFreshBullets(e.x, e.y, mp.x - e.x, mp.y - e.y, !ALIENS[e.alien].ice); // le flocon (tir droit) part de la pupille, les boules en cloche de la bouche
        const img = this.fx.muzzleFlash(p.x, p.y, ALIENS[e.alien].color);
        if (view) this.flashes.push({ img, view, dx: e.x - view.rx, dy: e.y - view.ry });
        break;
      }
      case 'impact':
      {
        const tier = tierOfTexture(e.texture); // blaster : l'étincelle suit la couleur du palier de dégâts
        if (tier && nearCam(e.x, e.y)) this.fx.impact(e.x, e.y, tier.impact);
      }
        break;
      case 'restart': {
        this.quietUntil = this.scene.time.now + 1000;
        // nouvelle partie : on efface tout ce qui reste au sol
        for (const img of this.corpseImgs.values()) img.destroy();
        this.pendingWaves.length = 0;
        for (const img of this.rockImgs.values()) img.destroy();
        for (const f of this.fireImgs.values()) f.img.destroy();
        for (const f of this.fuses) f.img.destroy();
        this.corpseImgs.clear();
        this.rockImgs.clear();
        this.fireImgs.clear();
        this.fuses.length = 0;
        this.tongues.length = 0;
        break;
      }
      case 'fuse': {
        const id = `alien_${e.alien}`;
        const img = sprites.add(this.scene, id, e.x, e.y + alienOffsetY(e.alien)).setDepth(DEPTH.actors + e.y);
        sprites.place(img, id);
        const base = sprites.scaleOf(id);
        img.setScale(base);
        this.fuses.push({ x: e.x, y: e.y, r: e.r, t: e.delay, dur: e.delay, img, base });
        break;
      }
      case 'corpse': {
        const color = ALIENS[e.alien].goo ?? ALIENS[e.alien].color;
        const img = this.scene.add
          .image(e.x, e.y + alienOffsetY(e.alien), 'fx_puddle')
          .setTint(color)
          .setDepth(DEPTH.groundFx - 0.3)
          .setScale(puddleSize(e.alien), puddleSize(e.alien) * 0.65) // largeur de son ombre portée × `FX.puddle.shadowMul`
          .setFlipX(Math.random() < 0.5)
          .setAlpha(0.8);
        this.corpseImgs.set(e.id, img);
        break;
      }
      case 'corpseEnd': {
        const img = this.corpseImgs.get(e.id);
        this.corpseImgs.delete(e.id);
        if (e.revived) {
          img?.destroy();
          this.fx.ring(e.x, e.y, 70, 0xffe14a);
          this.fx.gloop(e.x, e.y - 8, 0xffd84a, 0xfff6c0, 0.9);
        } else if (img) {
          this.scene.tweens.add({ targets: img, alpha: 0, duration: 400, onComplete: () => img.destroy() });
        }
        break;
      }
      case 'rock':
        // l'image du caillou est créée / retirée par `syncRocks` (qui suit la liste de la simulation) ; ici, seulement la poussière
        if (nearCam(e.x, e.y)) this.fx.burst(e.x, e.y, 0x8a7d74, 8);
        break;
      case 'capture': {
        const v = this.aliens.get(e.alien);
        if (v) this.fx.ring(v.rx, v.ry, 60, 0x8fe0ff);
        break;
      }
      case 'freeze':
        // la boucle de glace éclate : onde et éclats bleus sur la zone gelée
        this.fx.ring(e.x, e.y, e.r * 1.6, 0xbfeaff);
        this.fx.burst(e.x, e.y - 14, 0x9fe0ff, 24);
        break;
      case 'thaw':
        // un soldat sort de la glace (dégelé, ou mort dedans) : elle vole en éclats
        {
          const oyS = soldierOffsetY(this.sim.squads.flatMap((q) => q.soldiers).find((q) => q.id === e.soldier)?.def.id ?? ''); // glaçon centré sur le sprite décalé
          if (this.onScreen(e.x, e.y, 120)) this.fx.iceShards(e.x, e.y + oyS - 8, FX.ice.breakMul);
          this.fx.ring(e.x, e.y + oyS, 60, 0xbfeaff);
        }
        break;
      case 'release':
        this.fx.ring(e.x, e.y, 80, 0xffffff);
        this.fx.burst(e.x, e.y - 14, 0x8fe0ff, 16);
        break;
      case 'tongue': {
        this.tongues.push({ alien: e.alien, target: e.target, t: e.dur, dur: e.dur });
        // fx (pas de flash de tir) à l'origine de la langue : petite gerbe rose à la bouche, dessinée par le point de la planche
        const mouth = this.aliens.get(e.alien)?.muzzlePoint();
        if (mouth && nearCam(mouth.x, mouth.y)) {
          this.fx.burst(mouth.x, mouth.y, 0xff7fa8, 10);
          this.fx.ring(mouth.x, mouth.y, 26, 0xff7fa8, 220);
        }
        break;
      }
      case 'explosion':
        if (e.style === 'spit') {
          // crachat du cracheur : éclaboussure verte (son nuage ralentissant, violet, est dessiné par drawOverlay)
          this.fx.gloop(e.x, e.y, 0x62d04a, 0xe6ffd0, e.r / 50);
          this.fx.ring(e.x, e.y, e.r, 0x62d04a);
          break;
        }
        if (e.style === 'acid') {
          // blob du crabe : éclaboussure verte acide
          this.fx.gloop(e.x, e.y, 0x5ed02a, 0xe6ffb8, e.r / 55);
          this.fx.puddles(e.x, e.y, 0x5ed02a, e.r / 70);
          this.fx.ring(e.x, e.y, e.r, 0x7be23a);
          break;
        }
        if (e.style === 'slime') {
          // boule rouge (bordeaux) du shooter : éclaboussure de la même couleur au sol plutôt que des flammes
          this.fx.gloop(e.x, e.y, SHOOTER_BLAST, SHOOTER_BLAST_LIGHT, e.r / 60);
          this.fx.puddles(e.x, e.y, SHOOTER_BLAST, e.r / 70);
          this.fx.ring(e.x, e.y, e.r, SHOOTER_BLAST);
          break;
        }
        // pas de secousse pour les petites explosions (grenades, roquettes), sinon l'écran tremble en permanence ; 95 = le kamikaze y est
        this.fx.explosion(e.x, e.y, e.r, e.r >= 95 && nearCam(e.x, e.y));
        if (nearCam(e.x, e.y)) sfx.play(this.scene, SFX.blast.key, SFX.blast); // superposition max : voir `SFX.blast.maxVoices`
        break;
      case 'cleave':
        // mêlée en zone (chargeur) : anneau discret, sans secousse (il y en a beaucoup)
        if (nearCam(e.x, e.y)) this.fx.ring(e.x, e.y, e.r, 0xff6a6a, 160);
        break;
      case 'stalactite':
        if (!nearCam(e.x, e.y)) break;
        this.fx.burst(e.x, e.y - 10, 0x9fb6c8, 16); // éclats de glace / roche
        this.fx.ring(e.x, e.y, e.r, 0xc8e0f0);
        this.scene.cameras.main.shake(FX.shake.slamMs * 0.5, FX.shake.slamAmount * 0.5);
        break;
      case 'slam':
        this.fx.ring(e.x, e.y, e.r, 0xff6a6a);
        if (nearCam(e.x, e.y)) this.scene.cameras.main.shake(FX.shake.slamMs, FX.shake.slamAmount);
        break;
      case 'recruited':
        // le halo d'arrivée (colonne) est créé avec le nouveau soldat et le suit ; ici, éclat et texte
        this.fx.gain(e.x, e.y, CLASSES[e.cls].color);
        if (e.owner === this.localPlayer) {
          const tx = this.fx.text(e.x, e.y - 100, t('recruit', { name: t(`class_${e.cls}`) }), '#ffe066', 26);
          const owner = e.owner; // copié : l'événement ne doit pas être relu à chaque image
          this.fx.follow(tx, () => this.squadFocus(owner), FX.text.holdMs + FX.text.fadeMs); // le texte suit la squad (positions interpolées : fluide) tout en montant
        }
        break;
      case 'chestOpened':
        // le coffre se brise : gerbe dorée, onde et colonne de lumière, petite secousse ; les globes retombent autour
        this.fx.burst(e.x, e.y - 30, CHEST_GOLD, 40);
        this.fx.ring(e.x, e.y, 150, CHEST_GOLD);
        this.fx.column(e.x, e.y, CHEST_GOLD, 170, 700);
        if (this.onScreen(e.x, e.y, 200)) this.scene.cameras.main.shake(140, 0.004);
        break;
      case 'upgradePicked': {
        const col = e.prism ? 0xfff3a0 : 0x7fc8ff;
        this.fx.burst(e.x, e.y - 20, col, 30);
        this.fx.ring(e.x, e.y, 120, col);
        this.fx.column(e.x, e.y, col, 150, 700);
        // texte flottant sur l'escouade : nom de l'upgrade prise (aussi pour les équipiers)
        const up = UPGRADES[e.id as UpgradeId];
        if (up) {
          const tx = this.fx.iconText(e.x, e.y - 70, upgradeIconKey(e.id as UpgradeId), `${t(`up_${e.id}` as 'up_damage')}${e.prism ? ' ×2' : ''}`, `#${(e.prism ? 0xfff3a0 : up.color).toString(16).padStart(6, '0')}`, 40);
          const owner = e.owner;
          this.fx.follow(tx, () => this.squadFocus(owner), FX.text.holdMs + FX.text.fadeMs); // le texte suit la squad qui bouge
        }
        break;
      }
      case 'powerup': {
        const info = POWERUP_INFO[e.kind as keyof typeof POWERUP_INFO];
        if (!info) break;
        this.fx.ring(e.x, e.y, 110, info.color);
        this.fx.burst(e.x, e.y - 14, info.color, 22);
        const label = t(`pu_${e.kind}` as 'pu_stim');
        const iconKey = powerUpIconKey(e.kind as Parameters<typeof powerUpIconKey>[0]);
        const tx = this.scene.textures.exists(iconKey) ? this.fx.iconText(e.x, e.y - 46, iconKey, label, '#ffffff', 22) : this.fx.text(e.x, e.y - 46, `${info.icon} ${label}`, '#ffffff', 22);
        const owner = e.owner;
        this.fx.follow(tx, () => this.squadFocus(owner), FX.text.holdMs + FX.text.fadeMs); // idem : suit la squad qui bouge
        break;
      }
      case 'heal':
        if (nearCam(e.x, e.y)) this.fx.heal(e.x, e.y);
        break;
      case 'squadSpawned': {
        this.quietUntil = this.scene.time.now + 1000;
        const ring = this.fx.ring(e.x, e.y, 200, this.colorOf(e.owner));
        const owner = e.owner;
        this.followers.push({ parts: [{ img: ring, dy: 0 }], pos: () => this.squadFocus(owner) }); // l'onde suit la squad qui bouge
        break;
      }
      case 'levelUp': {
        // tous les soldats de la squad qui monte de niveau flashent en blanc puis repassent à leur couleur (FX.levelFlash)
        for (const s of this.sim.squadOf(e.owner)?.soldiers ?? []) this.soldiers.get(s.id)?.levelFlash();
        if (e.owner !== this.localPlayer) break;
        const c = this.sim.squadOf(e.owner)?.center;
        if (!c) break;
        // l'onde de choc (repoussement, sim) part tout de suite, avant la pause des cartes : l'effet aussi (voir fireLevelWaves)
        this.pendingWaves.push({ x: c.x, y: c.y, level: e.level, owner: e.owner });
        break;
      }
      case 'repel':
        this.pendingWaves.push({ x: e.x, y: e.y, level: 0 }); // mêmes ondes que le level up, sans texte
        break;
      case 'squadWiped':
        break;
    }
  }

  /** Animation de mort (si la planche en a une) : le corps reste un instant puis s'efface. */
  private corpse(soldierId: number, cls: SoldierClassId, x: number, y: number, slot: number): void {
    const id = soldierSpriteId(cls, slot); // à la couleur du joueur
    if (!sprites.hasAnim(id, 'die')) return;
    const c = sprites.add(this.scene, id, x, y + soldierOffsetY(cls)).setDepth(DEPTH.actors + y - 1);
    c.setFlipX(this.soldiers.get(soldierId)?.flipX ?? false);
    sprites.play(c, id, 'die');
    sprites.place(c, id);
    this.scene.tweens.add({ targets: c, alpha: 0, delay: 1400, duration: 600, onComplete: () => c.destroy() });
  }

  // ---------- Rendu ----------

  /** Déformation de l'écran des ondes de montée de niveau. */
  private readonly shock: ShockDistort;

  /** Montées de niveau de ce tick : l'effet part tout de suite (la pause des cartes ne s'ouvre que `LEVEL_UP_DELAY` s plus tard). */
  private readonly pendingWaves: { x: number; y: number; level: number; owner?: PlayerId }[] = [];

  /** Lance l'effet de montée de niveau (ondes de choc + « LEVEL UP! ») ; une seule fois même si plusieurs niveaux d'un coup. */
  private fireLevelWaves(): void {
    if (this.pendingWaves.length === 0) return;
    const w = this.pendingWaves[0];
    this.pendingWaves.length = 0;
    const ms = UPGRADE_REPEL.reach * 1000;
    const owner = w.owner;
    const follow = owner ? () => this.squadFocus(owner) : undefined;
    // onde de choc BLANCHE répétée `FX.levelWave.waves` fois (la première est celle qui repousse les aliens quand son front les touche) + déformation de l'écran
    for (let i = 0; i < FX.levelWave.waves; i++) {
      const draw = (): void => {
        const at = follow?.() ?? w; // l'onde part du centre ACTUEL de la squad, et le suit tant qu'elle grossit
        const ring = this.fx.ring(at.x, at.y, UPGRADE_REPEL.radius, 0xffffff, ms);
        if (follow) this.followers.push({ parts: [{ img: ring, dy: 0 }], pos: follow });
      };
      if (i === 0) draw();
      else this.scene.time.delayedCall(i * FX.levelWave.gapMs, draw);
    }
    this.shock.start(w.x, w.y, UPGRADE_REPEL.radius, ms, FX.levelWave.waves, FX.levelWave.gapMs, FX.ring.squash, follow);
    if (w.level > 0) {
      const tx = this.fx.levelUpText(w.x, w.y);
      if (follow) this.fx.follow(tx, follow, FX.text.holdMs + FX.text.fadeMs); // « LEVEL UP! » suit la squad qui bouge, comme les autres textes
    }
  }

  render(alpha: number, dt: number, time: number): void {
    this.fireLevelWaves();
    this.shock.update();
    this.syncUnits(alpha, dt, time);
    this.followFlashes();
    this.fx.updateFollowers();
    this.syncProjectiles(alpha);
    this.syncOrbs(alpha, time);
    this.syncRocks();
    this.syncFires();
    this.pickups.sync(time, alpha);
    this.loot.sync(time, alpha);
    this.followHalos();
    this.updateFuses(dt, time);
    this.updateFires(time);
    this.drawOverlay(time, dt);
    this.arena.update(this.scene.cameras.main.worldView);
  }

  destroyPickups(): void {
    this.pickups.destroy();
    this.loot.destroy();
    for (const tag of this.bossTags.values()) tag.destroy();
    this.bossTags.clear();
  }

  /** Centre affiché (interpolé) de la squad d'un joueur, pour la caméra. */
  squadFocus(owner: PlayerId): { x: number; y: number } | null {
    const sq = this.sim.squadOf(owner);
    if (!sq || !sq.alive) return null;
    // moyenne des positions AFFICHÉES (interpolées à chaque image) des soldats : le centre de la simulation ne bouge qu'à 30 Hz, les textes et
    // ondes qui le suivent saccaderaient
    let x = 0;
    let y = 0;
    let n = 0;
    for (const s of sq.soldiers) {
      const v = this.soldiers.get(s.id);
      if (!v || !s.alive) continue;
      x += v.rx;
      y += v.ry;
      n++;
    }
    if (n > 0) return { x: x / n, y: y / n };
    const c = sq.center;
    return { x: c.x, y: c.y };
  }

  private syncUnits(alpha: number, dt: number, time: number): void {
    for (const v of this.soldiers.values()) v.seen = false;
    for (const sq of this.sim.squads) {
      for (const s of sq.soldiers) {
        let v = this.soldiers.get(s.id);
        if (!v) {
          v = new SoldierView(this.scene, s, this.colorOf(s.owner), sq.slot);
          v.onIceHit = (x, y) => {
            if (this.onScreen(x, y, 120)) this.fx.iceShards(x, y); // glaçon touché par un allié : éclats et petits blocs de glace
          };
          this.soldiers.set(s.id, v);
          if (this.scene.time.now > this.quietUntil) {
            // nouvelle unité dans une squad : la colonne bleue suit le soldat
            const view = v;
            this.followers.push({ parts: this.fx.column(s.x, s.y, 0x4aa8ff, FX.gain.columnHeight, FX.gain.columnMs), pos: () => ({ x: view.rx, y: view.ry }) });
          }
        }
        v.seen = true;
        v.sync(alpha, dt, time);
        if (v.healTick(dt)) this.fx.heal(v.rx, v.ry - 30);
      }
    }
    this.prune(this.soldiers);

    for (const v of this.aliens.values()) v.seen = false;
    for (const a of this.sim.aliens) {
      let v = this.aliens.get(a.id);
      if (!v) {
        v = new AlienView(this.scene, a, this.scene.time.now > this.quietUntil); // départ de partie / arrivée d'un client : pas de trou
        v.onPop = (x, y, r) => {
          if (this.onScreen(x, y, 120)) this.fx.dust(x, y, r); // poussière seulement si c'est à l'écran
        };
        this.aliens.set(a.id, v);
      }
      v.seen = true;
      if (a.def.projectile && this.onScreen(v.rx, v.ry, 60)) (a.def.projectile.kind === 'fire' ? this.fx.fireTrail(v.rx, v.ry - 30, dt) : this.fx.iceTrail(v.rx, v.ry - 30, dt)); // orbe de feu : étincelles ; orbe de glace : flocons
      v.lookAt = a.def.lurk && a.lurkPhase > 0 ? this.nearestSoldierX(a.x, a.y) : null; // lurker enterré : regarde toujours sa proie
      v.sync(alpha, dt, time);
    }
    this.prune(this.aliens);

    for (const v of this.recruits.values()) v.seen = false;
    for (const r of this.sim.recruits.items) {
      let v = this.recruits.get(r.id);
      if (!v) {
        v = new RecruitView(this.scene, r, CLASSES[r.cls].color, this.sim.squadOf(this.localPlayer)?.slot ?? 0);
        this.recruits.set(r.id, v);
      }
      v.seen = true;
      v.sync(alpha, time);
    }
    this.prune(this.recruits);
  }

  /** Abscisse affichée du soldat vivant le plus proche de (`x`, `y`) (null : aucun). */
  private nearestSoldierX(x: number, y: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (const sq of this.sim.squads) {
      for (const s of sq.soldiers) {
        if (!s.alive) continue;
        const d = (s.x - x) ** 2 + (s.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = this.soldiers.get(s.id)?.rx ?? s.x;
        }
      }
    }
    return best;
  }

  private prune<V extends { seen: boolean; destroy(): void }>(map: Map<number, V>): void {
    for (const [id, v] of map) {
      if (v.seen) continue;
      v.destroy();
      map.delete(id);
    }
  }

  /**
   * Onboarding : le point vert à atteindre, dessiné sur le sol — disque et anneau qui pulsent, plus un curseur (chevron vers le bas)
   * qui rebondit au-dessus. (Hors écran, le HUD dessine une flèche au bord de l'écran.)
   */
  private drawTutorialMarker(g: Phaser.GameObjects.Graphics, time: number): void {
    const tut = this.sim.tutorial;
    if (!tut?.active) return;
    const beat = 0.5 + 0.5 * Math.sin(time * 5);
    // petite flèche verte autour de l'escouade, tournée vers le point vert à rejoindre
    const sq = this.sim.squadOf(this.localPlayer);
    const goal = tut.targets().find((m) => m.kind === 'marker');
    // centre AFFICHÉ de la squad (positions interpolées) : `sq.center` ne bouge qu'à 30 Hz, la flèche tremblait pendant le déplacement
    const at = sq ? this.squadFocus(this.localPlayer) : null;
    if (sq && goal && at) {
      const d = Math.hypot(goal.x - at.x, goal.y - at.y);
      if (d > TUTORIAL.markerRadius + sq.radius + 30) {
        const ang = Math.atan2(goal.y - at.y, goal.x - at.x);
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const dist = sq.radius + 20 + beat * 5;
        const px = at.x + c * dist;
        const py = at.y + s * dist * 0.8;
        g.fillStyle(0x5dff84, 0.95).fillTriangle(px + c * 16, py + s * 13, px - c * 8 - s * 12, py - s * 7 + c * 10, px - c * 8 + s * 12, py - s * 7 - c * 10);
        g.lineStyle(2, 0x0a2210, 0.9).strokeTriangle(px + c * 16, py + s * 13, px - c * 8 - s * 12, py - s * 7 + c * 10, px - c * 8 + s * 12, py - s * 7 - c * 10);
      }
    }
    for (const m of tut.targets()) {
      if (m.kind === 'orbs' && m.radius) {
        // zone bleue qui englobe tous les globes d'XP restants
        g.fillStyle(0x5ac8ff, 0.08 + 0.1 * beat).fillEllipse(m.x, m.y, m.radius * 2, m.radius * 1.3);
        g.lineStyle(3, 0x5ac8ff, 0.5 + 0.4 * beat).strokeEllipse(m.x, m.y, m.radius * 2, m.radius * 1.3);
        continue;
      }
      if (m.kind !== 'marker') continue;
      const r = TUTORIAL.markerRadius;
      g.fillStyle(0x5dff84, 0.1 + 0.14 * beat).fillEllipse(m.x, m.y, r * 2, r * 1.3);
      g.lineStyle(4, 0x5dff84, 0.55 + 0.4 * beat).strokeEllipse(m.x, m.y, r * (1.7 + 0.5 * beat), r * (1.7 + 0.5 * beat) * 0.65);
      g.lineStyle(2, 0xd9ffe3, 0.9).strokeEllipse(m.x, m.y, r * 2, r * 1.3);
      // curseur : chevron plein pointant vers le bas, qui rebondit
      const y = m.y - 44 - beat * 14;
      g.fillStyle(0x5dff84, 1).fillTriangle(m.x - 15, y - 18, m.x + 15, y - 18, m.x, y + 4);
      g.lineStyle(3, 0x0a2210, 1).strokeTriangle(m.x - 15, y - 18, m.x + 15, y - 18, m.x, y + 4);
    }
  }

  /** Les projectiles n'ont pas d'id : on réutilise un pool d'images, dans l'ordre. */
  private syncProjectiles(alpha: number): void {
    const list = this.sim.combat.projectiles.active;
    this.lobShadows.length = 0;
    while (this.bullets.length < list.length) this.bullets.push(this.scene.add.image(0, 0, 'fx_bullet').setDepth(DEPTH.fx - 1));
    for (let i = 0; i < this.bullets.length; i++) {
      const img = this.bullets[i];
      const p = list[i];
      if (!p) {
        img.setVisible(false);
        continue;
      }
      const x = lerp(p.px, p.x, alpha);
      const y = lerp(p.py, p.y, alpha);
      if (img.texture.key !== p.texture) img.setTexture(p.texture);
      img.setDepth(DEPTH.fx - 1);
      if (p.lob) {
        // grenade : trajectoire au sol + arc vertical ; l'ombre reste au sol
        const k = Math.min(1, Math.max(0, 1 - p.life / p.maxLife));
        const h = 4 * LOB_HEIGHT * k * (1 - k);
        this.lobShadows.push({ x, y, h });
        // les boules ennemies passent au-dessus des acteurs (le crabe géant les cachait) ; le blob vert du crabe est plus gros
        const big = p.texture === 'fx_blob_green' || p.texture === 'fx_blob_red' ? 1.9 : 1;
        let lx = x;
        let ly = y;
        const lsh = this.muzzleShift.get(p); // boule d'alien : elle part de la bouche du canon dessinée, puis rejoint sa trajectoire
        if (lsh) {
          const kk = 1 - Math.hypot(x - lsh.sx, y - lsh.sy) / MUZZLE_BLEND_PX;
          if (kk > 0) {
            lx += lsh.dx * kk;
            ly += lsh.dy * kk;
          } else this.muzzleShift.delete(p);
        }
        img.setVisible(true).setPosition(lx, ly - h).setRotation(k * 14).setScale((1 + (h / LOB_HEIGHT) * 0.3) * big).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
        if (p.team === 'aliens') img.setDepth(DEPTH.fx + 3);
      } else if (p.flame) {
        img.setVisible(true).setPosition(x, y).setRotation(Math.atan2(p.vy, p.vx));
        const k = 1 - p.life / p.maxLife;
        img.setScale(0.35 + k * 1.3).setAlpha(1 - k * k).setBlendMode(Phaser.BlendModes.ADD);
      } else {
        let bx = x;
        let by = y;
        const sh = this.muzzleShift.get(p);
        if (sh) {
          const k = 1 - Math.hypot(x - sh.sx, y - sh.sy) / MUZZLE_BLEND_PX;
          if (k > 0) {
            bx += sh.dx * k;
            by += sh.dy * k;
          } else this.muzzleShift.delete(p);
        }
        const snowflake = p.texture === 'fx_ice_ball'; // le flocon de glace tourne sur lui-même au lieu de pointer dans le sens du tir
        const rot = snowflake ? (this.scene.time.now / 1000) * 7 + p.id : Math.atan2(p.vy, p.vx);
        img.setVisible(true).setPosition(bx, by).setRotation(rot);
        const rocket = p.texture === ROCKET_TEXTURE;
        img.setScale(rocket ? FX.rocket.scale : 1).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
        if (rocket) this.fx.rocketSmoke(bx - Math.cos(rot) * 24, by - Math.sin(rot) * 24); // fumée derrière la flamme de la fusée
      }
    }
  }

  /**
   * Les projectiles nés à (sx, sy) ce tick partent visuellement de la bouche du canon (décalage dx, dy, résorbé en vol) :
   * les balles des soldats, ou (`lobs`) les boules en cloche des aliens.
   */
  private shiftFreshBullets(sx: number, sy: number, dx: number, dy: number, lobs = false): void {
    if (this.muzzleShift.size > 200) this.muzzleShift.clear();
    for (const p of this.sim.combat.projectiles.active) {
      if (p.lob !== lobs || p.flame || Math.abs(p.px - sx) > 0.5 || Math.abs(p.py - sy) > 0.5) continue;
      this.muzzleShift.set(p, { sx, sy, dx, dy });
    }
  }

  /**
   * Cailloux lancés par les aliens : les images suivent la liste de la simulation (snapshot en ligne), jamais les événements
   * seuls — un événement perdu ou une éviction silencieuse laissait un visuel sans collision.
   */
  private syncRocks(): void {
    const live = new Set<number>();
    for (const k of this.sim.arena.rocks) {
      live.add(k.id);
      if (this.rockImgs.has(k.id)) continue;
      const img = this.scene.add.image(k.x, k.y, 'fx_rock').setOrigin(0.5, 0.6).setDepth(DEPTH.actors + k.y);
      const target = (k.radius * 2.1) / 48;
      img.setScale(target * 0.4);
      this.scene.tweens.add({ targets: img, scale: target, duration: 160, ease: 'Back.Out' });
      this.rockImgs.set(k.id, img);
    }
    for (const [id, img] of this.rockImgs) {
      if (live.has(id)) continue;
      this.rockImgs.delete(id);
      this.scene.tweens.add({ targets: img, alpha: 0, scale: img.scale * 0.6, duration: 350, onComplete: () => img.destroy() });
    }
  }

  /**
   * Flammes des burners : les images suivent la liste de la simulation (`Sim.fires`, snapshot en ligne), jamais des événements —
   * un `fireEnd` perdu laissait une flamme affichée (et animée) pour toujours chez le client.
   */
  private syncFires(): void {
    const live = this.liveFires;
    live.clear();
    for (const f of this.sim.fires) {
      live.add(f.id);
      if (this.fireImgs.has(f.id)) continue;
      const img = this.scene.add.image(f.x, f.y - 6, 'fx_flame').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.groundFx + 0.3);
      const base = (f.r * 2.4) / 40;
      img.setScale(base * 0.3);
      this.fireImgs.set(f.id, { img, base, seed: Math.random() * 10, r: f.r });
    }
    for (const [id, f] of this.fireImgs) {
      if (live.has(id)) continue;
      this.fireImgs.delete(id);
      this.scene.tweens.add({ targets: f.img, alpha: 0, scale: f.base * 0.3, duration: 300, onComplete: () => f.img.destroy() });
    }
  }

  /** Globes d'XP : taille selon la valeur (× `ORB_SCALE`), léger flottement, clignote avant de disparaître ; masqués hors caméra. */
  private syncOrbs(alpha: number, time: number): void {
    const orbs = this.sim.xp.orbs;
    const view = this.scene.cameras.main.worldView;
    // image fournie (assets/manifest.ts `xp_orb`) sinon orbe procédural ; blend normal : en additif le bleu virait au blanc
    const orbTex = this.scene.textures.exists('xp_orb') ? 'xp_orb' : 'fx_xp';
    const orbBase = orbTex === 'xp_orb' ? 32 / this.scene.textures.get('xp_orb').getSourceImage().width : 1;
    while (this.orbImgs.length < orbs.length) this.orbImgs.push(this.scene.add.image(0, 0, orbTex).setDepth(DEPTH.groundFx + 0.2));
    for (let i = 0; i < this.orbImgs.length; i++) {
      const img = this.orbImgs[i];
      const o = orbs[i];
      if (!o) {
        img.setVisible(false);
        continue;
      }
      const x = lerp(o.px, o.x, alpha);
      const y = lerp(o.py, o.y, alpha);
      if (x < view.x - 40 || x > view.right + 40 || y < view.y - 40 || y > view.bottom + 40) {
        img.setVisible(false);
        continue;
      }
      const size = orbSize(o.value);
      const bob = Math.sin(time * 4 + o.id) * 2.5;
      const blink = o.life < ORB_BLINK_TIME && Math.sin(time * 18) > 0;
      // apparition : petite animation d'échelle Back.Out sur les premières 0,3 s de vie (âge interpolé comme la position : `life` change par ticks de 30 Hz)
      const age = XP_ORB_LIFE - o.life - (1 - alpha) / TICK_RATE;
      const pop = age >= XP_ORB_POP ? 1 : Phaser.Math.Easing.Back.Out(Math.max(0, age) / XP_ORB_POP);
      img.setVisible(true).setPosition(x, y - 8 + bob).setScale(size * ORB_SCALE * orbBase * pop * (1 + Math.sin(time * 6 + o.id) * 0.06)).setAlpha(blink ? 0.35 : 1);
    }
  }

  /** Flammes : elles vacillent (taille, transparence) ; cachées hors de la caméra. */
  private updateFires(time: number): void {
    const view = this.scene.cameras.main.worldView;
    for (const f of this.fireImgs.values()) {
      const { img } = f;
      if (!img.active) continue;
      if (img.x < view.x - 40 || img.x > view.right + 40 || img.y < view.y - 40 || img.y > view.bottom + 40) {
        img.setVisible(false);
        continue;
      }
      const w = 1 + Math.sin(time * 11 + f.seed) * 0.12 + Math.sin(time * 23 + f.seed * 2) * 0.06;
      img.setVisible(true).setScale(Math.min(f.base, img.scaleX + f.base * 0.12) * w, Math.min(f.base, img.scaleY + f.base * 0.12) * w * 0.9).setAlpha(0.75 + Math.sin(time * 15 + f.seed) * 0.2);
    }
  }

  /** Corps de kamikaze en attente d'explosion : clignote de plus en plus vite, enfle un peu. */
  private updateFuses(dt: number, time: number): void {
    for (let i = this.fuses.length - 1; i >= 0; i--) {
      const f = this.fuses[i];
      f.t -= dt;
      if (f.t <= 0) {
        f.img.destroy();
        this.fuses.splice(i, 1);
        continue;
      }
      const k = 1 - f.t / f.dur;
      if (Math.sin(time * (14 + 34 * k)) > 0) f.img.setTint(0xff3a2a).setTintMode(Phaser.TintModes.FILL);
      else f.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      // pulsations d'échelle de plus en plus rapides et amples (étirement / écrasement en opposition de phase)
      const pulse = Math.sin(time * (30 + 60 * k)) * (0.05 + 0.13 * k) * 1.15; // variations d'échelle +15 %
      f.img.setScale(f.base * (1 + 0.12 * k + pulse), f.base * (1 + 0.12 * k - pulse * 0.8));
    }
  }

  /** Stalactites qui tombent du ciel (au-dessus des unités) : visibles dans les `FALL` dernières secondes, elles accélèrent jusqu'au sol. */
  private drawStalactites(l: Phaser.GameObjects.Graphics): void {
    const FALL = 0.35;
    for (const k of this.sim.stalactites) {
      if (k.t > FALL || !this.onScreen(k.x, k.y, 400)) continue;
      const p = k.t / FALL; // 1 → 0 : de haut en bas
      const tipY = k.y - 420 * p * p; // chute accélérée
      const w = k.r * 0.55;
      const h = k.r * 2.2;
      l.fillStyle(0x6f8296, 1).fillTriangle(k.x - w, tipY - h, k.x + w, tipY - h, k.x, tipY);
      l.fillStyle(0xb9d2e6, 0.9).fillTriangle(k.x - w * 0.35, tipY - h, k.x + w * 0.15, tipY - h, k.x - w * 0.05, tipY - h * 0.2); // reflet
      l.lineStyle(3, 0x2c3440, 1).strokeTriangle(k.x - w, tipY - h, k.x + w, tipY - h, k.x, tipY);
    }
  }

  /** Incantations des chamans : un fil magique pulsé jusqu'à la flaque visée, qui se referme en cercle jusqu'à la résurrection. */
  private drawCasts(l: Phaser.GameObjects.Graphics, time: number): void {
    for (const v of this.aliens.values()) {
      const a = v.state;
      const rv = a.def.revive;
      if (!rv || a.castT <= 0) continue;
      const ci = this.corpseImgs.get(a.castCorpse);
      if (!ci?.active) continue;
      const c = { x: ci.x, y: ci.y };
      const k = 1 - a.castT / rv.cast;
      const sx = v.rx;
      const sy = v.ry - a.radius;
      const steps = 14;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 0.55) / steps;
        const wob = (t: number) => Math.sin(time * 9 + t * 8) * 7 * Math.sin(t * Math.PI);
        l.lineStyle(3, 0xffe14a, 0.35 + 0.5 * k).lineBetween(
          sx + (c.x - sx) * t0,
          sy + (c.y - sy) * t0 + wob(t0),
          sx + (c.x - sx) * t1,
          sy + (c.y - sy) * t1 + wob(t1),
        );
      }
      l.lineStyle(3, 0xffe14a, 0.4 + 0.5 * k).strokeCircle(c.x, c.y, 34 * (1 - 0.6 * k) + 6);
      l.fillStyle(0xffe14a, 0.12 + 0.25 * k).fillCircle(c.x, c.y, 26 * k + 4);
      l.lineStyle(2, 0xffe14a, 0.5).strokeCircle(sx, sy, a.radius + 6 + Math.sin(time * 10) * 3);
    }
  }

  /** Langues des grenouilles : elles jaillissent vite, suivent le soldat tiré, puis s'effacent. */
  private drawTongues(l: Phaser.GameObjects.Graphics, dt: number): void {
    for (let i = this.tongues.length - 1; i >= 0; i--) {
      const tg = this.tongues[i];
      tg.t -= dt;
      const av = this.aliens.get(tg.alien);
      const sv = this.soldiers.get(tg.target);
      if (tg.t <= 0 || !av || !sv) {
        this.tongues.splice(i, 1);
        continue;
      }
      const mouth = av.muzzlePoint(); // la langue part de la bouche posée dans la visionneuse (repli : le milieu du corps)
      const sx = mouth ? mouth.x : av.rx;
      const sy = mouth ? mouth.y : av.ry - av.state.radius * 0.6;
      const ext = Math.min(1, (tg.dur - tg.t) / 0.1); // part de la longueur déjà sortie
      const ex = sx + (sv.rx - sx) * ext;
      const ey = sy + (sv.ry - 12 - sy) * ext;
      const a = Math.min(1, tg.t / 0.12);
      l.lineStyle(7, 0xc23a6a, a).lineBetween(sx, sy, ex, ey);
      l.lineStyle(4, 0xff7fa8, a).lineBetween(sx, sy, ex, ey);
      l.fillStyle(0xff7fa8, a).fillCircle(ex, ey, 6);
    }
  }

  /** Halos d'apparition : recalés chaque frame sur leur soldat / squad, retirés quand leur animation est finie. */
  private followHalos(): void {
    for (let i = this.followers.length - 1; i >= 0; i--) {
      const f = this.followers[i];
      const alive = f.parts.filter((p) => p.img.active);
      if (alive.length === 0) {
        this.followers.splice(i, 1);
        continue;
      }
      const p = f.pos();
      if (!p) continue;
      for (const part of alive) part.img.setPosition(p.x, p.y + part.dy);
    }
  }

  private followFlashes(): void {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      if (!f.img.active) {
        this.flashes.splice(i, 1);
        continue;
      }
      const p = f.view.muzzlePoint() ?? { x: f.view.rx + f.dx, y: f.view.ry + f.dy };
      f.img.setPosition(p.x, p.y);
    }
  }

  private drawOverlay(time: number, dt: number): void {
    const g = this.ground;
    g.clear();
    this.pickups.drawGround(g, time);
    this.loot.drawGround(g, time);
    // recrues : la même zone qui pulse que sous les power-ups, en jaune, posée sur la position au sol de la recrue
    for (const r of this.recruits.values()) drawPickupSpot(g, r.rx, r.ry, RECRUIT_COLOR, time, r.state.id, r.dim ? 0.3 : 1);
    this.drawTutorialMarker(g, time);
    // trous d'apparition des aliens (et d'enfouissement du recyclage) : se creusent, l'alien en sort, puis le trou s'efface ; taille de son ombre
    for (const v of this.aliens.values()) {
      const h = v.hole();
      if (!h || !this.onScreen(h.x, h.y, h.radius + 60)) continue;
      drawHole(g, h.x, h.y, shadowWidth(v.state.def.id) * h.open, h.alpha);
    }
    for (const v of this.aliens.values()) {
      // ombre portée (largeur : `shadowWidth`, sur laquelle les flaques sont calées) ;
      // opacité selon la part de l'alien hors du sol (`outOfGround`) : fondu quand il s'enfonce ou ressort (lurker, Scarab, recyclage),
      // pas d'ombre sous terre ni avant la sortie de son trou d'apparition
      const out = v.outOfGround;
      if (out <= 0.01) continue;
      const w = shadowWidth(v.state.def.id);
      g.fillStyle(0x2a1d2e, SHADOW_ALPHA * out).fillEllipse(v.rx, v.ry + alienOffsetY(v.state.def.id), w, w * (0.9 / 2.1));
    }
    // Dernier rempart (upgrade) : aura rouge qui pulse sous chaque soldat dès qu'il manque un soldat, plus intense quand il en manque davantage
    for (const sq of this.sim.squads) {
      if (!sq.lastStand || sq.maxSize <= 0) continue;
      const k = Math.min(1, sq.missing / sq.maxSize); // part de la squad perdue
      const pulse = 0.5 + Math.sin(time * 6) * 0.5;
      for (const s of sq.soldiers) {
        const v = this.soldiers.get(s.id);
        if (!v || !this.onScreen(v.rx, v.ry, 60)) continue;
        const oy = soldierOffsetY(s.def.id); // suit le décalage du sprite et de l'ombre
        g.fillStyle(UPGRADES.lastStand.color, (0.05 + pulse * 0.05) + k * 0.2).fillEllipse(v.rx, v.ry + oy, 58, 26);
        g.lineStyle(2, UPGRADES.lastStand.color, (0.15 + pulse * 0.15) + k * 0.5).strokeEllipse(v.rx, v.ry + oy, 58, 26);
      }
    }
    for (const sq of this.sim.squads) {
      if (!sq.isHealing) continue;
      for (const s of sq.soldiers) {
        const heal = s.def.heal;
        const v = this.soldiers.get(s.id);
        if (!heal || !v) continue;
        const r = heal.radius * (0.95 + Math.sin(time * 4) * 0.05);
        g.fillStyle(0x5eff8a, 0.08).fillEllipse(v.rx, v.ry, r * 2, r * 1.4);
        g.lineStyle(2, 0x5eff8a, 0.35).strokeEllipse(v.rx, v.ry, r * 2, r * 1.4);
      }
    }
    // Zones de réanimation (coop) : cercle au sol qui se remplit tant qu'un équipier y reste
    for (const z of this.sim.reviveZones) {
      drawReviveZone(g, z.x, z.y, z.r, z.progress / REVIVE_TIME, time);
    }
    // Nuages ralentissants (cracheur) : violets ; nuages de glace (chaman) : bleus, ils gèlent. Tous ils « poppent » (léger rebond d'échelle) puis s'effacent dans la dernière seconde
    const seen = new Set<number>();
    for (const p of this.sim.puddles) {
      seen.add(p.id);
      let born = this.cloudBorn.get(p.id);
      if (born === undefined) this.cloudBorn.set(p.id, (born = time));
      if (!this.onScreen(p.x, p.y, p.r * 1.5)) continue;
      const age = time - born; // `time` en secondes
      const pop = age >= CLOUD_POP ? 1 : Phaser.Math.Easing.Back.Out(age / CLOUD_POP);
      const a = Math.min(1, p.ttl, age / 0.12);
      const r = p.r * pop;
      if (p.frost) {
        // nuage de glace (flocons du chaman) : bleu glacé, bouffées blanches et flocons qui tournent ; y entrer = gelé
        g.fillStyle(0x3a8ad8, 0.3 * a).fillEllipse(p.x, p.y, r * 2, r * 1.3);
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 + p.id;
          g.fillStyle(i % 2 ? 0xbfe8ff : 0x8fd0ff, 0.42 * a).fillCircle(p.x + Math.cos(ang) * r * 0.55, p.y + Math.sin(ang) * r * 0.36 - r * 0.1, r * (0.42 + 0.05 * Math.sin(time * 3.3 + i)));
        }
        const spin = time * 1.1 + p.id;
        g.lineStyle(2, 0xffffff, 0.85 * a);
        for (let k = 0; k < 3; k++) {
          const fx = p.x + Math.cos(spin + k * 2.1) * r * 0.45;
          const fy = p.y + Math.sin(spin + k * 2.1) * r * 0.28 - r * 0.15;
          const s = r * 0.22;
          for (let j = 0; j < 3; j++) {
            const t = spin * 1.5 + (j * Math.PI) / 3;
            g.lineBetween(fx - Math.cos(t) * s, fy - Math.sin(t) * s, fx + Math.cos(t) * s, fy + Math.sin(t) * s);
          }
        }
        g.lineStyle(3, 0xff3a3a, 0.9 * a).strokeEllipse(p.x, p.y, r * 2, r * 1.3); // contour rouge (danger : y entrer = gelé) au lieu de blanc
        continue;
      }
      g.fillStyle(0x6a2aa8, 0.32 * a).fillEllipse(p.x, p.y, r * 2, r * 1.3);
      // bouffées autour du centre (placement fixe par nuage, légère respiration)
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2 + p.id;
        const br = r * (0.36 + 0.06 * Math.sin(time * 2.6 + i * 1.7));
        g.fillStyle(i % 2 ? 0x9a4ad0 : 0xb060e0, 0.3 * a).fillCircle(p.x + Math.cos(ang) * r * 0.62, p.y + Math.sin(ang) * r * 0.4 - r * 0.08, br);
      }
      g.fillStyle(0xd9a0ff, 0.22 * a).fillEllipse(p.x, p.y - r * 0.12, r * 1.1, r * 0.6);
      g.lineStyle(2, 0xd9a0ff, 0.5 * a).strokeEllipse(p.x, p.y, r * 2, r * 1.3);
    }
    for (const id of this.cloudBorn.keys()) if (!seen.has(id)) this.cloudBorn.delete(id);
    // Lurker : trou dans le sol tant qu'il est enterré (il se creuse puis se rebouche), et ligne rouge avant les pics
    for (const v of this.aliens.values()) {
      const a = v.state;
      const L = a.def.lurk;
      if (!L || a.lurkPhase === 0 || !this.onScreen(a.x, a.y, a.radius * 2 + L.length + 60)) continue; // hors écran (télégraphe des pics compris) : rien à dessiner
      const open = a.lurkPhase === 1 ? 1 - a.lurkT / L.digTime : a.lurkPhase === 5 ? a.lurkT / L.rise : 1;
      drawHole(g, v.rx, v.ry + alienOffsetY(a.def.id), shadowWidth(a.def.id) * open, 1); // trou de la taille de son ombre, sous sa position affichée
      if (a.lurkPhase === 3) {
        const k = 1 - a.lurkT / L.aim;
        const cos = Math.cos(a.spikeAng);
        const sin = Math.sin(a.spikeAng);
        const hw = L.width / 2;
        const quad = (len: number, wd: number): Phaser.Math.Vector2[] =>
          [[0, -wd], [len, -wd], [len, wd], [0, wd]].map(([u, w]) => new Phaser.Math.Vector2(a.x + cos * u - sin * w, a.y + sin * u + cos * w));
        g.fillStyle(teleColor('lurk'), teleOuter(k)).fillPoints(quad(L.length, hw), true);
        g.fillStyle(teleColor('lurk'), teleInner(k)).fillPoints(quad(L.length * k, hw * k), true);
        g.lineStyle(3, teleColor('lurk'), 0.5 + 0.4 * k).strokePoints(quad(L.length, hw), true);
      }
    }
    // Giant Crab : couronne de pics, les lignes rouges de chaque direction se remplissent pendant le télégraphe
    for (const v of this.aliens.values()) {
      const a = v.state;
      const R = a.def.spikeRing;
      if (!R || a.lurkPhase !== 3 || !this.onScreen(a.x, a.y, R.length + 60)) continue;
      const k = 1 - a.lurkT / R.aim;
      const hw = R.width / 2;
      for (let i = 0; i < R.rays; i++) {
        const ang = a.spikeAng + (i * Math.PI * 2) / R.rays;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        const quad = (len: number, wd: number): Phaser.Math.Vector2[] =>
          [[0, -wd], [len, -wd], [len, wd], [0, wd]].map(([u, w]) => new Phaser.Math.Vector2(a.x + cos * u - sin * w, a.y + sin * u + cos * w));
        g.fillStyle(teleColor('lurk'), teleOuter(k)).fillPoints(quad(R.length, hw), true);
        g.fillStyle(teleColor('lurk'), teleInner(k)).fillPoints(quad(R.length * k, hw * k), true);
        g.lineStyle(3, teleColor('lurk'), 0.5 + 0.4 * k).strokePoints(quad(R.length, hw), true);
      }
    }
    // Scarab : trou sous lui qui se creuse puis se rebouche, et trou d'arrivée DERRIÈRE la squad qui se forme (zone rouge qui se remplit) avant sa sortie
    for (const v of this.aliens.values()) {
      const a = v.state;
      const B = a.def.burrow;
      if (!B || a.lurkPhase === 0) continue;
      const hole = (x: number, y: number, w: number, alpha: number): void => {
        if (this.onScreen(x, y, w + 40)) drawHole(g, x, y, w, alpha); // hors écran : pas de trou
      };
      const R = shadowWidth(a.def.id); // trous de la taille de son ombre portée
      const oy = alienOffsetY(a.def.id); // et au même décalage vertical
      if (a.lurkPhase === 1) hole(a.x, a.y + oy, R * (1 - a.lurkT / B.dig), 1);
      if (a.lurkPhase === 2) {
        const el = B.wait - a.lurkT; // temps écoulé sous terre
        hole(a.x, a.y + oy, R, Math.max(0, 1 - el / 0.6)); // le trou de départ se rebouche
        // tant qu'il suit la squad : zone pâle, pas de trou ; verrouillé (`lock` s avant la sortie) : le trou se forme et la zone se remplit
        const locked = a.lurkT <= B.lock;
        const f = locked ? Math.min(1, (B.lock - a.lurkT) / B.lock) : 0;
        if (locked) hole(a.leapX, a.leapY, R * f, 1); // le trou d'arrivée se forme
        const pulse = a.lurkT < 0.6 && Math.sin(this.scene.time.now / 45) > 0 ? 0.15 : 0;
        g.fillStyle(teleColor('burrow'), (locked ? teleOuter(f) : 0.08) + pulse).fillEllipse(a.leapX, a.leapY, B.radius * 2, B.radius * 1.4);
        if (locked) g.fillStyle(teleColor('burrow'), teleInner(f)).fillEllipse(a.leapX, a.leapY, B.radius * 2 * f, B.radius * 1.4 * f);
        g.lineStyle(locked ? 4 : 2, teleColor('burrow'), locked ? 0.7 + 0.3 * f : 0.45).strokeEllipse(a.leapX, a.leapY, B.radius * 2, B.radius * 1.4);
      }
      if (a.lurkPhase === 3) hole(a.x, a.y + oy, R, a.lurkT / B.rise); // le boss ressort : le trou s'efface
    }
    // Stalactites du Scarab : zone rouge qui se remplit jusqu'à l'impact (clignote dans les 0,4 dernières secondes), ombre qui grossit
    for (const k of this.sim.stalactites) {
      if (!this.onScreen(k.x, k.y, k.r * 2)) continue;
      const f = Math.max(0, Math.min(1, 1 - k.t / k.dur));
      const pulse = k.t < 0.4 && Math.sin(this.scene.time.now / 40) > 0 ? 0.15 : 0;
      g.fillStyle(teleColor('stalactite'), teleOuter(f) + pulse).fillEllipse(k.x, k.y, k.r * 2, k.r * 1.4);
      g.fillStyle(teleColor('stalactite'), teleInner(f)).fillEllipse(k.x, k.y, k.r * 2 * f, k.r * 1.4 * f);
      g.lineStyle(3, teleColor('stalactite'), 0.6 + 0.4 * f).strokeEllipse(k.x, k.y, k.r * 2, k.r * 1.4);
      g.fillStyle(0x000000, 0.25 * f).fillEllipse(k.x, k.y + 2, k.r * 0.9 * f, k.r * 0.5 * f); // ombre de la stalactite qui arrive
    }
    // Murs du bâtisseur : télégraphe jaune (rectangle allongé qui se remplit) avant que les rochers ne surgissent
    for (const w of this.sim.walls) {
      const k = 1 - w.t / w.dur;
      const cos = Math.cos(w.angle);
      const sin = Math.sin(w.angle);
      const hl = w.length / 2;
      const hw = w.rockR;
      const quad = (l: number, wd: number): Phaser.Math.Vector2[] =>
        [[-l, -wd], [l, -wd], [l, wd], [-l, wd]].map(([u, v]) => new Phaser.Math.Vector2(w.x + cos * u - sin * v, w.y + sin * u + cos * v));
      g.fillStyle(teleColor('wall'), 0.1 + 0.2 * k).fillPoints(quad(hl + hw * 0.6, hw), true);
      g.fillStyle(teleColor('wall'), 0.15 + 0.25 * k).fillPoints(quad((hl + hw * 0.6) * k, hw * k), true);
      g.lineStyle(3, teleColor('wall'), 0.5 + 0.4 * k).strokePoints(quad(hl + hw * 0.6, hw), true);
    }
    // Télégraphe : zone d'impact des boules ennemies, en rouge, pendant la dernière partie du vol. Aussi chez le client réseau :
    // le snapshot transmet rayon, durée de vol et temps écoulé (`Mirror.upsertProjectile`, décompte local ; vérifié par `sim:net`).
    for (const p of this.sim.combat.projectiles.active) {
      if (!p.lob || p.team !== 'aliens' || p.aoe <= 0 || p.life >= TELEGRAPH_S) continue;
      const k = 1 - p.life / TELEGRAPH_S; // 0 → 1 jusqu'à l'impact
      const ix = p.x + p.vx * p.life;
      const iy = p.y + p.vy * p.life;
      g.fillStyle(teleColor('lob'), teleOuter(k)).fillEllipse(ix, iy, p.aoe * 2, p.aoe * 1.4);
      g.fillStyle(teleColor('lob'), teleInner(k)).fillEllipse(ix, iy, p.aoe * 2 * k, p.aoe * 1.4 * k);
      g.lineStyle(3, teleColor('lob'), 0.5 + 0.4 * k).strokeEllipse(ix, iy, p.aoe * 2, p.aoe * 1.4);
    }
    // Télégraphes rouges : explosion retardée d'un kamikaze (zone qui se remplit) et couloir de charge du rhinocéros
    for (const f of this.fuses) {
      const k = 1 - f.t / f.dur;
      g.fillStyle(teleColor('fuse'), teleOuter(k)).fillEllipse(f.x, f.y, f.r * 2, f.r * 1.4);
      g.fillStyle(teleColor('fuse'), teleInner(k)).fillEllipse(f.x, f.y, f.r * 2 * k, f.r * 1.4 * k);
      g.lineStyle(3, teleColor('fuse'), 0.5 + 0.4 * k).strokeEllipse(f.x, f.y, f.r * 2, f.r * 1.4);
    }
    // Saut écrasant (crabe) : zone d'impact qui se remplit jusqu'à l'atterrissage
    for (const v of this.aliens.values()) {
      const a = v.state;
      const L = a.def.leap;
      if (!L || a.leapT <= 0) continue;
      const toLand = a.leapT - L.recover; // s avant l'impact (négatif : déjà atterri)
      if (toLand <= 0) continue;
      const k = 1 - toLand / (L.windup + L.flight);
      const pulse = toLand < 0.35 && Math.sin(this.scene.time.now / 45) > 0 ? 0.15 : 0;
      g.fillStyle(teleColor('leap'), teleOuter(k) + pulse).fillEllipse(a.leapX, a.leapY, L.radius * 2, L.radius * 1.4);
      g.fillStyle(teleColor('leap'), teleInner(k)).fillEllipse(a.leapX, a.leapY, L.radius * 2 * k, L.radius * 1.4 * k);
      g.lineStyle(4, teleColor('leap'), 0.6 + 0.4 * k).strokeEllipse(a.leapX, a.leapY, L.radius * 2, L.radius * 1.4);
    }
    for (const v of this.aliens.values()) {
      const a = v.state;
      const rush = a.def.rush;
      if (!rush || !(a.rushWind > 0 || a.rushT > 0)) {
        this.rushWindSeen.delete(a.id);
        continue;
      }
      // préparation restante : la valeur reçue, décomptée localement jusqu'au snapshot suivant (sans quoi le remplissage avance par à-coups)
      const now = this.scene.time.now / 1000;
      let seen = this.rushWindSeen.get(a.id);
      if (!seen || seen.v !== a.rushWind) {
        seen = { v: a.rushWind, at: now };
        this.rushWindSeen.set(a.id, seen);
      }
      const wind = a.rushWind > 0 ? Math.max(0.001, seen.v - (now - seen.at)) : 0;
      const k = wind > 0 ? 1 - wind / rush.windup : 1;
      const dx = a.rushDx;
      const dy = a.rushDy;
      const nx = -dy * (rush.width / 2);
      const ny = dx * (rush.width / 2);
      const L = rush.length;
      // La zone reste au sol à l'endroit où la charge a été annoncée (fourni par la simulation, donc identique chez l'hôte et chez les clients) : elle ne suit pas l'alien pendant la charge.
      const x0 = a.rushX;
      const y0 = a.rushY;
      const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
      const lane = (len: number) => [V(x0 + nx, y0 + ny), V(x0 - nx, y0 - ny), V(x0 - nx + dx * len, y0 - ny + dy * len), V(x0 + nx + dx * len, y0 + ny + dy * len)];
      // préparation : le couloir se remplit ; pendant la charge (k = 1) il est plein
      g.fillStyle(teleColor('rush'), teleOuter(k)).fillPoints(lane(L), true);
      g.fillStyle(teleColor('rush'), teleInner(k)).fillPoints(lane(L * k), true);
      g.lineStyle(3, teleColor('rush'), 0.5 + 0.4 * k).strokePoints(lane(L), true);
    }
    // traces de brûlure au sol sous les flammes
    for (const f of this.fireImgs.values()) {
      if (!f.img.active) continue;
      g.fillStyle(0x3a1408, 0.3).fillEllipse(f.img.x, f.img.y + 8, f.r * 2.1, f.r * 1.3);
      g.fillStyle(0xff5a1a, 0.1).fillEllipse(f.img.x, f.img.y + 8, f.r * 1.7, f.r * 1.05);
    }
    for (const s of this.lobShadows) {
      const k = 1 - Math.min(1, s.h / LOB_HEIGHT) * 0.4;
      g.fillStyle(0x2a1d2e, 0.3 * k).fillEllipse(s.x, s.y, 16 * k, 7 * k);
    }
    for (const v of this.soldiers.values()) {
      const r = v.state.radius;
      const sr = sprites.get(`soldier_${v.state.def.id}`).shadow ?? r; // rayon de l'ombre, indépendant du rayon de collision
      const oy = soldierOffsetY(v.state.def.id);
      g.fillStyle(0x2a1d2e, SHADOW_ALPHA).fillEllipse(v.rx, v.ry + oy, sr * 2.2, sr);
      g.lineStyle(3, v.ringColor, 0.9).strokeEllipse(v.rx, v.ry + oy, r * 2.6, r * 1.3); // cercle d'équipe (bleu pour le joueur local) : centré sous le sprite décalé
    }

    const b = this.bars;
    b.clear();
    this.barsSeen.clear();
    for (const v of this.soldiers.values()) {
      const s = v.state;
      const y = v.ry + soldierOffsetY(s.def.id) - (s.def.id === 'bruiser' ? 66 : 58); // la barre suit le sprite décalé
      const frozen = s.frozen > 0;
      const over = s.hp > s.maxHp; // overheal (globe de soin) : barre toujours affichée tant qu'il dure
      if (s.hp < s.maxHp || frozen || over) {
        // gelé : sa barre de vie reste affichée (il est attaquable dans son glaçon), même pleine
        const color = s.owner === this.localPlayer ? PALETTE.hpAlly : v.ringColor;
        // overheal : même largeur de barre, qui représente alors le max de l'overheal ; cran blanc au niveau du max normal, surplus plus foncé
        const scale = over ? s.maxHp * (1 + HEAL_FIELD.overheal) : s.maxHp;
        this.bar(b, v.rx, y, 30, s.hp / scale, color, s.id, dt);
        if (over) {
          const x0 = v.rx - 15;
          const notch = 30 * (s.maxHp / scale);
          b.fillStyle(darken(color, 0.55), 1).fillRect(x0 + notch, y, 30 * Math.min(1, s.hp / scale) - notch, 5);
          b.fillStyle(0xffffff, 1).fillRect(x0 + notch - 0.75, y - 1.5, 1.5, 8);
        }
      }
      // PV du glaçon (gel, `FREEZE.hp`) : barre bleue au-dessus de la barre de vie ; les tirs alliés la vident
      if (frozen) this.bar(b, v.rx, y - 8, 30, Math.min(1, s.frozen / FREEZE.hp), ICE_BAR_COLOR);
    }
    const bossSeen = new Set<number>();
    for (const v of this.aliens.values()) {
      const a = v.state;
      // lurker enterré : il reste touchable, sa barre reste donc affichée (au-dessus de son trou : le corps écrasé la fait descendre)
      if (a.def.burrow && a.lurkPhase === 2) continue; // Scarab sous terre : pas de barre de vie
      const top = v.body.displayHeight * v.body.originY + 8;
      const boss = !!a.def.boss; // la barre d'un boss est toujours affichée, même pleine, avec le mot « BOSS » au-dessus
      const hurt = a.hp < a.maxHp || boss || !!a.def.projectile; // orbe de glace : barre toujours affichée (on peut le détruire)
      const by = v.ry + alienOffsetY(a.def.id) - top; // la barre suit le sprite décalé
      if (hurt) this.bar(b, v.rx, by, a.def.hpBarWidth, a.hp / a.maxHp, PALETTE.hpEnemy, a.id, dt);
      const shielded = a.maxShield > 0 && (hurt || a.shield < a.maxShield);
      if (shielded) this.bar(b, v.rx, by - 8, a.def.hpBarWidth, a.shield / a.maxShield, PALETTE.shield);
      if (boss) {
        let tag = this.bossTags.get(a.id);
        if (!tag) {
          tag = this.scene.add
            .text(0, 0, t('boss'), { fontFamily: theme.font, fontSize: '20px', fontStyle: 'bold', color: '#ff3a3a', stroke: '#2a0a08', strokeThickness: 5 })
            .setOrigin(0.5, 1)
            .setDepth(DEPTH.bars);
          this.bossTags.set(a.id, tag);
        }
        tag.setPosition(v.rx, by - (shielded ? 8 : 0) - 4);
        bossSeen.add(a.id);
      }
    }
    for (const [id, tag] of this.bossTags) {
      if (bossSeen.has(id)) continue;
      tag.destroy();
      this.bossTags.delete(id);
    }
    for (const id of this.barGhosts.keys()) if (!this.barsSeen.has(id)) this.barGhosts.delete(id); // barre plus affichée : le traînard est oublié

    const l = this.beams;
    l.clear();
    this.drawTongues(l, dt);
    this.drawSpikes();
    this.drawCasts(l, time);
    this.drawStalactites(l);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.tracers.splice(i, 1);
        continue;
      }
      const k = tr.life / 0.12;
      l.lineStyle(6 * k, 0x7dff9a, 0.35 * k).lineBetween(tr.x1, tr.y1, tr.x2, tr.y2);
      l.lineStyle(2.5 * k, 0xeaffea, k).lineBetween(tr.x1, tr.y1, tr.x2, tr.y2);
    }
  }

  /**
   * Lignes de pics du lurker : des pointes d'os qui jaillissent du sol de proche en proche, le front avance avec la phase 4. Chaque colonne de 3 pics est UN
   * sprite (texture pré-dessinée `fx_spike3_k` selon la direction de la ligne, voir `art/fx.ts`), étiré en hauteur quand le front passe : aucun tracé par frame.
   */
  private drawSpikes(): void {
    let n = 0;
    const step = 28;
    for (const v of this.aliens.values()) {
      const a = v.state;
      const L = a.def.lurk ?? a.def.spikeRing;
      if (!L || a.lurkPhase !== 4) continue;
      if (!this.onScreen(a.x, a.y, L.length + 80)) continue; // hors écran : rien à dessiner
      const p = 1 - a.lurkT / L.sweep;
      const front = p * L.length;
      const fade = p > 0.75 ? 1 - (p - 0.75) / 0.25 * 0.6 : 1;
      const rays = a.def.spikeRing ? a.def.spikeRing.rays : 1;
      for (let i = 0; i < rays; i++) {
        const ang = a.spikeAng + (i * Math.PI * 2) / rays;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        const bin = Math.round((((ang % Math.PI) + Math.PI) % Math.PI) / (Math.PI / SPIKE_BINS)) % SPIKE_BINS; // direction de la rangée, à un demi-tour près
        const key = `fx_spike3_${bin}`;
        for (let d = 18, col = 0; d <= front; d += step, col++) {
          const rise = Math.min(1, (front - d) / 70 + 0.25); // la pointe sort du sol quand le front passe
          const off = col % 2 ? 4 : -4; // quinconce d'une colonne à l'autre
          let img = this.spikeSprites[n];
          if (!img) {
            img = this.scene.add.image(0, 0, key).setOrigin(0.5, SPIKE3.baseY / SPIKE3.h);
            this.spikeSprites[n] = img;
          }
          const px = a.x + cos * d - sin * off;
          const py = a.y + sin * d + cos * off;
          img
            .setTexture(key)
            .setVisible(true)
            .setAlpha(fade)
            .setScale(1, rise)
            .setPosition(px, py)
            .setDepth(DEPTH.actors + py); // triés en profondeur avec les unités (par la base de la pointe) : un soldat devant une pointe la cache, derrière elle, c'est la pointe qui passe devant
          n++;
        }
      }
    }
    for (let i = n; i < this.spikeSprites.length; i++) this.spikeSprites[i].setVisible(false);
  }

  /**
   * Barre de vie « jeu de combat » : la barre colorée descend tout de suite du montant des dégâts, une barre blanche dessous reste sur la
   * vie d'avant le coup (`BAR_GHOST_HOLD` s) puis rejoint vite la barre colorée. Sans `id` (bouclier), barre simple.
   */
  private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, ratio: number, color: number, id?: number, dt = 0): void {
    const h = 5;
    const r = Math.max(0, Math.min(1, ratio));
    let ghost = r;
    if (id !== undefined) {
      this.barsSeen.add(id);
      const st = this.barGhosts.get(id) ?? { last: r, ghost: r, hold: 0, hits: 0 };
      ghostHit(st, r); // nouveau coup : la barre blanche attend un instant sur l'ancienne vie (de moins en moins sous le feu)
      if (r >= st.ghost) st.ghost = r; // soin : pas de traînard
      else if (st.hold > 0) st.hold -= dt;
      else st.ghost = Math.max(r, st.ghost - BAR_GHOST_SPEED * dt);
      st.last = r;
      this.barGhosts.set(id, st);
      ghost = st.ghost;
    }
    g.fillStyle(PALETTE.hpBack, 0.85).fillRoundedRect(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3, 3);
    if (ghost > r) g.fillStyle(0xffffff, 0.95).fillRect(x - w / 2, y, w * ghost, h);
    g.fillStyle(color, 1).fillRect(x - w / 2, y, w * r, h);
  }
}

/** Couleur 0xRRGGBB assombrie (`k` < 1). */
function darken(color: number, k: number): number {
  return (Math.round(((color >> 16) & 255) * k) << 16) | (Math.round(((color >> 8) & 255) * k) << 8) | Math.round((color & 255) * k);
}
