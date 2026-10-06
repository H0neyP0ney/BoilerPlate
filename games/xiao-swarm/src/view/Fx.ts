import Phaser from 'phaser';
import { Pool, theme } from '@xiao/engine';
import { CRACK_SIZE, CRACK_VARIANTS, SCORCH_VARIANTS } from '../art/fx';
import { DEPTH } from '../config';
import { FX } from '../fxParams';
import { t as tr } from '../i18n';

/**
 * Effets visuels déclenchés par les événements de la simulation :
 * éclaboussures, explosions, ondes de choc, textes flottants, soins.
 * Tous les réglages viennent de `fxParams.ts` (éditables dans la visionneuse de particules).
 */

/** Flaques de mort groupées : au-delà de `PUDDLE_MAX_BATCHES` lots de même couleur dans ce rayon (px) et cette durée (ms), on n'en pose plus. */
/** Rayon d'explosion (px) pour lequel la secousse vaut `FX.explosion.shakeAmount` ; plus petit = plus léger, plus grand = plus fort. */
const SHAKE_REF_RADIUS = 120;
const PUDDLE_MERGE_RADIUS = 45;
const PUDDLE_MERGE_MS = 700;
const PUDDLE_MAX_BATCHES = 2;
/** Fissures de sol visibles en même temps au maximum : une pluie de kamikazes ne couvre pas tout l'écran de noir. */
const MAX_CRACKS = 24;
/** Traces de brûlure visibles en même temps au maximum (elles durent plus longtemps que les fissures). */
const MAX_SCORCH = 30;

export class Fx {
  private splat!: Phaser.GameObjects.Particles.ParticleEmitter;
  private gloopBig!: Phaser.GameObjects.Particles.ParticleEmitter;
  private gloopSmall!: Phaser.GameObjects.Particles.ParticleEmitter;
  private spark!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fire!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Traînée des roquettes (fx_smoke, FX.rocket). */
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustPuff!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Éclats de glace (fx_dot bleu clair, retombent) : coups sur un glaçon et rupture (FX.ice). */
  private shards!: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly texts: Pool<Phaser.GameObjects.Text>;
  private readonly followed: { obj: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform; pos: () => { x: number; y: number } | null; last: { x: number; y: number } | null; until: number }[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.build();
    this.texts = new Pool(
      () =>
        scene.add
          .text(0, 0, '', { fontFamily: theme.font, fontSize: '22px', fontStyle: 'bold', color: '#fff', stroke: '#2a1d2e', strokeThickness: 5 })
          .setOrigin(0.5)
          .setDepth(DEPTH.bars + 1),
      (t) => t.setVisible(true).setAlpha(1),
      (t) => t.setVisible(false),
    );
  }

  /** (Re)crée les émetteurs de particules depuis `FX` : à rappeler après un changement de réglage. */
  build(): void {
    this.splat?.destroy();
    this.spark?.destroy();
    this.gloopBig?.destroy();
    this.gloopSmall?.destroy();
    this.fire?.destroy();
    this.smoke?.destroy();
    this.dustPuff?.destroy();
    this.shards?.destroy();
    const ic = FX.ice;
    this.shards = this.scene.add
      .particles(0, 0, 'fx_dot', {
        speed: { min: ic.shardSpeedMin, max: ic.shardSpeedMax },
        scale: { start: ic.shardScale, end: 0 },
        lifespan: { min: ic.shardLifeMin, max: Math.max(ic.shardLifeMin, ic.shardLifeMax) },
        gravityY: ic.shardGravity,
        tint: [0xeaf9ff, 0x9fe3ff, 0x6fd8ff],
        emitting: false,
      })
      .setDepth(DEPTH.fx);
    const d = FX.dust;
    this.dustPuff = this.scene.add
      .particles(0, 0, 'fx_smoke', {
        speed: { min: d.speedMin, max: d.speedMax },
        scale: { start: d.scaleStart, end: d.scaleEnd },
        alpha: { start: d.alpha, end: 0 },
        tint: d.color,
        lifespan: { min: d.lifeMin, max: Math.max(d.lifeMin, d.lifeMax) },
        emitting: false,
      })
      .setDepth(DEPTH.fx - 2);
    const k = FX.rocket;
    this.smoke = this.scene.add
      .particles(0, 0, 'fx_smoke', {
        speed: { min: 0, max: k.smokeSpeed },
        scale: { start: k.smokeScale, end: 0 },
        alpha: 1,
        lifespan: { min: k.smokeLifeMin, max: Math.max(k.smokeLifeMin, k.smokeLifeMax) },
        emitting: false,
      })
      .setDepth(DEPTH.fx - 2);
    const b = FX.burst;
    this.splat = this.scene.add
      .particles(0, 0, 'fx_dot', {
        speed: { min: b.speedMin, max: b.speedMax },
        scale: { start: b.scaleStart, end: b.scaleEnd },
        lifespan: { min: b.lifeMin, max: b.lifeMax },
        emitting: false,
      })
      .setDepth(DEPTH.fx);
    const q = FX.gloop;
    this.gloopBig = this.scene.add
      .particles(0, 0, 'fx_dot', {
        speed: { min: q.speedMin, max: q.speedMax },
        scale: { start: q.scaleStart, end: q.scaleEnd },
        lifespan: { min: q.lifeMin, max: q.lifeMax },
        gravityY: q.gravity,
        emitting: false,
      })
      .setDepth(DEPTH.fx);
    this.gloopSmall = this.scene.add
      .particles(0, 0, 'fx_dot', {
        speed: { min: q.speedMax * 0.6, max: q.speedMax * 1.5 },
        scale: { start: q.scaleStart * 0.45, end: 0 },
        lifespan: { min: q.lifeMin * 0.6, max: q.lifeMax * 0.8 },
        gravityY: q.gravity * 0.5,
        emitting: false,
      })
      .setDepth(DEPTH.fx);
    const i = FX.impact;
    this.spark = this.scene.add
      .particles(0, 0, 'fx_dot', {
        speed: { min: i.speedMin, max: i.speedMax },
        scale: { start: i.scaleStart, end: i.scaleEnd },
        lifespan: { min: i.lifeMin, max: i.lifeMax },
        emitting: false,
      })
      .setDepth(DEPTH.fx);
    const e = FX.explosion;
    this.fire =this.scene.add
      .particles(0, 0, 'fx_flame', {
        speed: { min: e.speedMin, max: e.speedMax },
        scale: { start: e.scaleStart, end: e.scaleEnd },
        alpha: { start: e.alphaStart, end: e.alphaEnd },
        lifespan: { min: e.lifeMin, max: e.lifeMax },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(DEPTH.fx);
  }

  /** Nuage de poussière quand une unité sort du sol (trou d'apparition, lurker, Scarab) : à n'appeler que si l'unité est à l'écran. */
  dust(x: number, y: number, radius: number): void {
    const n = Math.round(FX.dust.countBase + radius * FX.dust.countPerRadius);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * radius;
      this.dustPuff.emitParticleAt(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.5, 1);
    }
  }

  /** Une bouffée de fumée de roquette en (x, y) (traînée : appelée à chaque frame derrière la fusée). */
  rocketSmoke(x: number, y: number): void {
    const s = FX.rocket.smokeSpread;
    this.smoke.emitParticleAt(x + Phaser.Math.FloatBetween(-s, s), y + Phaser.Math.FloatBetween(-s, s), 1);
  }

  burst(x: number, y: number, color: number, count = 10): void {
    this.splat.setParticleTint(color);
    this.splat.explode(Math.max(1, Math.round(count * FX.burst.countMul)), x, y);
  }

  impact(x: number, y: number, color: number): void {
    this.spark.setParticleTint(color);
    this.spark.explode(FX.impact.count, x, y);
  }

  /** Flash de tir ; l'appelant le repositionne à chaque frame tant qu'il est actif (il se détruit seul). */
  /** Dernières flaques posées (position, couleur, instant, nombre de lots) : sert à ne pas empiler des dizaines de flaques identiques au même endroit. */
  private readonly recentPuddles: { x: number; y: number; color: number; at: number; batches: number }[] = [];

  /** Faux si ≥ `PUDDLE_MAX_BATCHES` lots de la même couleur viennent d'être posés dans `PUDDLE_MERGE_RADIUS` px (morts groupées : une grosse tache suffit). */
  private puddleRoom(x: number, y: number, color: number): boolean {
    const now = this.scene.time.now;
    const list = this.recentPuddles;
    for (let i = list.length - 1; i >= 0; i--) if (now - list[i].at > PUDDLE_MERGE_MS) list.splice(i, 1);
    const near = list.find((r) => r.color === color && Math.hypot(r.x - x, r.y - y) < PUDDLE_MERGE_RADIUS);
    if (near) {
      if (near.batches >= PUDDLE_MAX_BATCHES) return false;
      near.batches++;
      return true;
    }
    list.push({ x, y, color, at: now, batches: 1 });
    return true;
  }

  /** Quelques flaques au sol (nombre, position, taille, orientation et durée aléatoires) qui rétrécissent et s'effacent lentement. */
  puddles(x: number, y: number, color: number, size = 1): void {
    if (!this.puddleRoom(x, y, color)) return;
    const p = FX.puddle;
    const n = Phaser.Math.Between(p.countMin, p.countMax);
    for (let i = 0; i < n; i++) {
      const scale = Phaser.Math.FloatBetween(p.scaleMin, p.scaleMax) * size;
      const img = this.scene.add
        .image(x + Phaser.Math.FloatBetween(-p.spread, p.spread), y + Phaser.Math.FloatBetween(-p.spread, p.spread) * 0.5, 'fx_puddle')
        .setTint(color)
        .setDepth(DEPTH.groundFx - 0.4)
        .setFlipX(Math.random() < 0.5)
        .setScale(scale, scale * Phaser.Math.FloatBetween(0.55, 0.75))
        .setAlpha(p.alpha * Phaser.Math.FloatBetween(0.7, 1));
      this.scene.tweens.add({
        targets: img,
        alpha: 0,
        scaleX: scale * p.endScale,
        scaleY: img.scaleY * p.endScale,
        delay: Phaser.Math.Between(300, 900),
        duration: Phaser.Math.Between(p.lifeMinMs, p.lifeMaxMs),
        ease: 'Sine.In',
        onComplete: () => img.destroy(),
      });
    }
  }

  /** Éclatement de gelée : grosses gouttes qui retombent (gravité) + fines gouttelettes, teintes `color` et `colorLight`. */
  gloop(x: number, y: number, color: number, colorLight: number, size = 1): void {
    const g = FX.gloop;
    this.gloopBig.setParticleTint(color);
    this.gloopBig.explode(Math.max(1, Math.round(g.count * size)), x, y);
    this.gloopSmall.setParticleTint(colorLight);
    this.gloopSmall.explode(Math.max(1, Math.round(g.count * 1.5 * size)), x, y);
  }

  /** Flash de tir à la bouche du canon ; `color` : teinte (celle de FX.muzzle par défaut, celle de l'alien pour ses tirs). */
  muzzleFlash(x: number, y: number, color: number = FX.muzzle.color): Phaser.GameObjects.Image {
    const m = FX.muzzle;
    const img = this.scene.add.image(x, y, 'fx_glow').setBlendMode(Phaser.BlendModes.ADD).setTint(color).setDepth(DEPTH.fx).setScale(m.scale);
    this.scene.tweens.add({ targets: img, alpha: 0, scale: m.scale * 0.6, duration: m.durationMs, onComplete: () => img.destroy() });
    return img;
  }

  explosion(x: number, y: number, radius: number, shake: boolean): void {
    const e = FX.explosion;
    this.fire.explode(e.count, x, y);
    this.ring(x, y, radius, e.ringColor);
    if (radius >= FX.cracks.minRadius) this.cracks(x, y, radius);
    // l'amplitude suit le rayon : `shakeAmount` vaut pour un rayon de référence (120 = le Flamer), bornée pour rester lisible (kamikaze 95 ≈ ×0,8, crabe 160 ≈ ×1,3)
    if (shake && e.shakeAmount > 0) this.scene.cameras.main.shake(e.shakeMs, e.shakeAmount * Math.max(0.5, Math.min(1.6, radius / SHAKE_REF_RADIUS)));
  }

  private activeCracks = 0;

  /**
   * Fissures noires au sol sous une explosion : l'une des `CRACK_VARIANTS` textures, miroir au hasard, écrasée comme l'onde de choc (vue de dessus
   * en perspective), sous les flaques. Elles restent `FX.cracks.holdMs` puis s'effacent en alpha ; au plus `MAX_CRACKS` en même temps.
   */
  cracks(x: number, y: number, radius: number): void {
    const c = FX.cracks;
    this.scorch(x, y, radius);
    if (c.alpha <= 0 || this.activeCracks >= MAX_CRACKS) return;
    this.activeCracks++;
    const k = (radius * 2 * c.scale) / CRACK_SIZE;
    const img = this.scene.add
      .image(x, y, `fx_cracks_${Phaser.Math.Between(0, CRACK_VARIANTS - 1)}`)
      .setDepth(DEPTH.groundFx - 0.6)
      .setFlip(Math.random() < 0.5, Math.random() < 0.5)
      .setScale(k, k * FX.ring.squash)
      .setAlpha(c.alpha);
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      delay: c.holdMs,
      duration: c.fadeMs,
      ease: 'Sine.In',
      onComplete: () => {
        this.activeCracks--;
        img.destroy();
      },
    });
  }

  private activeScorch = 0;

  /** Trace de brûlure noir / gris sous les fissures : plus large, elle reste plus longtemps puis s'efface (FX.cracks.scorch*) ; au plus `MAX_SCORCH` en même temps. */
  private scorch(x: number, y: number, radius: number): void {
    const c = FX.cracks;
    if (c.scorchAlpha <= 0 || this.activeScorch >= MAX_SCORCH) return;
    this.activeScorch++;
    const k = (radius * 2 * c.scorchScale) / CRACK_SIZE;
    const img = this.scene.add
      .image(x, y, `fx_scorch_${Phaser.Math.Between(0, SCORCH_VARIANTS - 1)}`)
      .setDepth(DEPTH.groundFx - 0.7)
      .setFlip(Math.random() < 0.5, Math.random() < 0.5)
      .setScale(k, k * FX.ring.squash)
      .setAlpha(c.scorchAlpha);
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      delay: c.scorchHoldMs,
      duration: c.scorchFadeMs,
      ease: 'Sine.In',
      onComplete: () => {
        this.activeScorch--;
        img.destroy();
      },
    });
  }

  /** Éclats de glace à l'impact sur un glaçon (`count` : `FX.ice.shardCount` par défaut, × `breakMul` à la rupture). */
  iceShards(x: number, y: number, count = FX.ice.shardCount): void {
    this.shards.explode(Math.max(1, Math.round(count)), x, y);
  }

  /** Une croix verte qui monte dans un globe de soin (point choisi par l'appelant) ; `a` : opacité du globe (il s'efface à la fin). */
  healZoneCross(x: number, y: number, a = 1): void {
    const h = FX.healZone;
    const img = this.scene.add.image(x, y, 'fx_plus').setDepth(DEPTH.fx).setScale(h.scale * 0.5).setAlpha(h.alpha * a);
    this.scene.tweens.add({ targets: img, scale: h.scale, duration: Math.min(220, h.durationMs * 0.25), ease: 'Back.Out' });
    this.scene.tweens.add({ targets: img, y: y - h.rise, alpha: 0, delay: h.durationMs * 0.25, duration: h.durationMs * 0.75, ease: 'Sine.In', onComplete: () => img.destroy() });
  }

  ring(x: number, y: number, radius: number, color: number, durationMs = FX.ring.durationMs): Phaser.GameObjects.Image {
    const r = FX.ring;
    const img = this.scene.add.image(x, y, 'fx_ring').setTint(color).setDepth(DEPTH.fx).setScale(r.startScaleX, r.startScaleY).setAlpha(r.alpha);
    this.scene.tweens.add({
      targets: img,
      scaleX: (radius * 2) / 128,
      scaleY: (radius * 2 * r.squash) / 128,
      alpha: 0,
      duration: durationMs,
      ease: 'Cubic.Out',
      onComplete: () => img.destroy(),
    });
    return img;
  }

  /**
   * Particules en spirale : `arms` bras de lumière qui tournent en s'écartant du centre jusqu'à `radius` (px) en `durationMs`.
   * Chaque particule part avec un léger retard le long de son bras (elles dessinent une spirale), rétrécit et s'estompe en
   * arrivant. Même aplatissement que les anneaux (`FX.ring.squash`) pour rester posé sur le sol. Onde de montée de niveau.
   */
  spiral(x: number, y: number, radius: number, color: number, durationMs = FX.spiral.durationMs, arms = FX.spiral.arms, perArm = FX.spiral.perArm, turns = FX.spiral.turns): void {
    const squash = FX.ring.squash;
    for (let a = 0; a < arms; a++) {
      for (let i = 0; i < perArm; i++) {
        const base = (a / arms) * Math.PI * 2;
        const img = this.scene.add.image(x, y, 'fx_glow').setTint(color).setDepth(DEPTH.fx + 1).setAlpha(0); // blend normal : en additif le bleu virait au blanc sur le sol clair
        const state = { k: 0 };
        const life = durationMs * 0.62;
        this.scene.tweens.add({
          targets: state,
          k: 1,
          delay: (i / perArm) * durationMs * 0.38,
          duration: life,
          ease: 'Cubic.Out',
          onStart: () => img.setAlpha(1),
          onUpdate: () => {
            const r = radius * state.k;
            const ang = base + state.k * turns * Math.PI * 2;
            img.setPosition(x + Math.cos(ang) * r, y + Math.sin(ang) * r * squash).setScale(FX.spiral.size * (1 - state.k * 0.65)).setAlpha(1 - state.k * state.k);
          },
          onComplete: () => img.destroy(),
        });
      }
    }
  }

  /** Colonne de lumière qui monte et s'estompe (nouvelle recrue dans la squad, mort d'un soldat…). */
  column(x: number, y: number, color: number, height = FX.column.height, durationMs = FX.column.durationMs): { img: Phaser.GameObjects.Image; dy: number }[] {
    const img = this.scene.add.image(x, y + 6, 'fx_column').setOrigin(0.5, 1).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx);
    const k = height / 220;
    img.setScale(k * 1.5, k * 0.6).setAlpha(1);
    this.scene.tweens.add({ targets: img, scaleX: k * 0.5, scaleY: k * 1.3, duration: durationMs, ease: 'Cubic.Out' });
    this.scene.tweens.add({ targets: img, alpha: 0, delay: durationMs * 0.25, duration: durationMs * 0.75, onComplete: () => img.destroy() });
    const glow = this.scene.add.image(x, y, 'fx_glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx).setScale(FX.column.glowScale);
    this.scene.tweens.add({ targets: glow, alpha: 0, scale: FX.column.glowEnd, duration: durationMs * 0.7, onComplete: () => glow.destroy() });
    return [
      { img, dy: 6 },
      { img: glow, dy: 0 },
    ];
  }

  /** Perte d'un soldat : gros éclat, gerbe de gouttes, flaque, double onde de choc, flash blanc, colonne rouge et croix qui s'élève. */
  death(x: number, y: number, color: number): void {
    const d = FX.death;
    this.burst(x, y - 20, color, d.burstCount);
    this.burst(x, y - 24, 0xffffff, d.flashCount);
    this.gloop(x, y - 16, color, 0xffffff, d.gloopSize);
    this.puddles(x, y, color, d.puddleSize);
    this.ring(x, y, d.ringBig, color);
    this.ring(x, y, d.ringSmall, 0xffffff);
    const flash = this.scene.add.image(x, y - 16, 'fx_glow').setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx + 1).setScale(d.flashScale);
    this.scene.tweens.add({ targets: flash, alpha: 0, scale: 1.2, duration: d.flashMs, onComplete: () => flash.destroy() });
    this.column(x, y, 0xff4a4a, d.columnHeight, d.columnMs);
    this.text(x, y - 46, '✖', '#ff5a5a', d.crossSize);
  }

  /**
   * « LEVEL UP! » : texte vert cerné de sombre qui jaillit de la squad ; il joue l'animation commune des textes flottants (`text`, réglée par FX.text).
   * Part en même temps que l'onde de choc, avant la pause qui ouvre l'écran des cartes.
   */
  levelUpText(x: number, y: number): Phaser.GameObjects.Text {
    return this.text(x, y - 40, tr('levelUpPop'), '#5dff84', 46, '#2a1d2e', 8); // même animation que les autres textes de la squad (FX.text)
  }

  /**
   * Fait suivre `obj` au point renvoyé par `pos` (ex. le centre de la squad) pendant `ms` ms : à chaque image, il est décalé du déplacement
   * du point depuis l'image précédente (les tweens de montée / fondu de l'objet continuent normalement).
   */
  follow(obj: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform, pos: () => { x: number; y: number } | null, ms: number): void {
    this.followed.push({ obj, pos, last: pos(), until: this.scene.time.now + ms });
  }

  /** À appeler à chaque image (WorldView.render) : applique le déplacement des points suivis aux textes qui les suivent. */
  updateFollowers(): void {
    const now = this.scene.time.now;
    for (let i = this.followed.length - 1; i >= 0; i--) {
      const f = this.followed[i];
      if (now >= f.until || !f.obj.active) {
        this.followed.splice(i, 1);
        continue;
      }
      const p = f.pos();
      if (!p) continue;
      if (f.last) f.obj.setPosition(f.obj.x + p.x - f.last.x, f.obj.y + p.y - f.last.y);
      f.last = p;
    }
  }

  /**
   * Montée + fondu d'un texte flottant (attente `FX.text.holdMs`, puis `fadeMs`). La montée est ADDITIVE : un décalage animé qu'on ajoute à la
   * position courante, au lieu d'un tween sur `y` qui réécrirait la position à chaque image et écraserait le suivi de la squad (`follow`) :
   * le texte se figerait dans le monde pendant la montée et la squad qui avance le laisserait derrière elle.
   */
  private rise(obj: Phaser.GameObjects.Text | Phaser.GameObjects.Container, onComplete: () => void): void {
    const f = FX.text;
    const offset = { v: 0 };
    let last = 0;
    this.scene.tweens.add({
      targets: offset,
      v: -f.rise,
      delay: f.holdMs,
      duration: f.fadeMs,
      onUpdate: () => {
        obj.y += offset.v - last;
        last = offset.v;
      },
    });
    this.scene.tweens.add({ targets: obj, alpha: 0, delay: f.holdMs, duration: f.fadeMs, onComplete });
  }

  /** Texte flottant précédé d'une icône (image `iconKey`) : même animation que `text`, le tout dans un conteneur détruit à la fin. */
  iconText(x: number, y: number, iconKey: string, value: string, color = '#ffffff', size = 22, stroke = '#2a1d2e'): Phaser.GameObjects.Container {
    const f = FX.text;
    const box = this.scene.add.container(x, y).setDepth(DEPTH.bars + 1).setScale(f.popFrom);
    const label = this.scene.add.text(0, 0, value, { fontFamily: theme.font, fontSize: `${size}px`, fontStyle: 'bold', color, stroke, strokeThickness: 5 }).setOrigin(0, 0.5);
    const icon = this.scene.add.image(0, 0, iconKey);
    icon.setScale((size * 1.5) / Math.max(icon.width, icon.height));
    const gap = size * 0.25;
    const total = icon.displayWidth + gap + label.width;
    icon.setPosition(-total / 2 + icon.displayWidth / 2, 0);
    label.setPosition(-total / 2 + icon.displayWidth + gap, 0);
    box.add([icon, label]);
    this.scene.tweens.add({ targets: box, scale: 1, duration: f.popMs, ease: 'Back.Out' });
    this.rise(box, () => box.destroy());
    return box;
  }

  text(x: number, y: number, value: string, color = '#ffffff', size = 22, stroke = '#2a1d2e', strokeWidth = 5): Phaser.GameObjects.Text {
    const f = FX.text;
    const t = this.texts.acquire();
    // le texte vient du pool : on coupe ce qui restait d'un usage précédent (animations pas terminées, suivi de la squad), sinon elles se
    // mélangent à la nouvelle et le texte s'anime de travers
    this.scene.tweens.killTweensOf(t);
    for (let i = this.followed.length - 1; i >= 0; i--) if (this.followed[i].obj === t) this.followed.splice(i, 1);
    t.setText(value).setColor(color).setFontSize(size).setStroke(stroke, strokeWidth).setPosition(x, y).setScale(f.popFrom);
    this.scene.tweens.add({ targets: t, scale: 1, duration: f.popMs, ease: 'Back.Out' });
    this.rise(t, () => this.texts.release(t));
    return t;
  }

  /**
   * Coup critique : bulle d'explosion jaune avec « ! » et les dégâts infligés en chiffres dorés (glyphes `crit_*` du manifeste) ;
   * l'ensemble pop (Back.Out), monte et s'efface. Sans ces images, repli sur du texte.
   */
  crit(x: number, y: number, dmg: number): void {
    const txt = String(Math.round(dmg));
    const glyphs = [...txt.split(''), 'bang'].map((g) => `crit_${g}`);
    const box = this.scene.add.container(x + Phaser.Math.Between(-8, 8), y - 22).setDepth(DEPTH.bars + 2).setScale(0.3 * FX.crit.scale);
    if (glyphs.every((g) => this.scene.textures.exists(g)) && this.scene.textures.exists('crit_bubble')) {
      const SCALE = 0.7;
      const gap = -7; // chiffres serrés (les glyphes ont une marge transparente)
      const imgs = glyphs.map((g) => this.scene.add.image(0, 0, g).setScale(SCALE * FX.crit.textGrow));
      const total = imgs.reduce((n, im) => n + im.displayWidth + gap, -gap);
      const bubble = this.scene.add.image(0, 0, 'crit_bubble').setScale(Math.max(0.62, (total / FX.crit.textGrow + 40) / 136), 0.7); // la bulle garde sa taille : seul le texte grossit
      let cx = -total / 2;
      for (const im of imgs) {
        im.setPosition(cx + im.displayWidth / 2, 1);
        cx += im.displayWidth + gap;
      }
      box.add([bubble, ...imgs]);
    } else {
      box.add(this.scene.add.text(0, 0, `! ${txt}`, { fontFamily: theme.font, fontSize: '26px', fontStyle: 'bold', color: '#ffe14a', stroke: '#8a1a00', strokeThickness: 5 }).setOrigin(0.5));
    }
    this.scene.tweens.add({ targets: box, scale: FX.crit.scale, duration: FX.crit.popMs, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: box, y: box.y - FX.crit.rise, alpha: 0, delay: FX.crit.holdMs, duration: FX.crit.riseMs, onComplete: () => box.destroy() });
  }

  heal(x: number, y: number): void {
    const h = FX.heal;
    const img = this.scene.add.image(x + Phaser.Math.Between(-h.jitter, h.jitter), y, 'fx_plus').setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: img, y: y - h.rise, alpha: 0, duration: h.durationMs, onComplete: () => img.destroy() });
  }

  destroy(): void {
    this.splat.destroy();
    this.spark.destroy();
    this.gloopBig.destroy();
    this.gloopSmall.destroy();
    this.fire.destroy();
    this.smoke.destroy();
    this.shards.destroy();
  }
}
