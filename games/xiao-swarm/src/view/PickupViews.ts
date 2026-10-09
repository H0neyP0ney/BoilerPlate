import Phaser from 'phaser';
import { lerp, theme } from '@xiao/engine';
import { DEPTH } from '../config';
import { FX } from '../fxParams';
import type { PowerUpKind } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import type { PlayerId } from '../sim/types';
import { ensureGlobeTexture, ensureStarTexture, powerUpGlobeKey } from '../art/upgradeOrbs';
import { createEnragedFlames } from './EnragedFx';
import { soldierOffsetY } from './spriteOffset';
import { createGlobeGlitter, GLOBE_LIFT, POWERUP_GREEN, RECRUIT_COLOR, UPGRADE_PINK, type GlobeGlitter } from './GlobeGlitter';
import type { Fx } from './Fx';

/** Décalage vertical (px) de la capsule du compteur au-dessus du barycentre de l'escouade. */
const CAPSULE_LIFT = 52;
/** Taille de la capsule du compteur (0,9 = 10 % plus petite). */
const CAPSULE_SCALE = 0.9;


/**
 * `icon` : emoji de repli, utilisé seulement si l'image `powerup_icon_<kind>` (art-src/powerups.png) n'est pas chargée.
 * `color` : couleur du power-up (rond au sol, onde et éclats du ramassage) ; `hue` : décalage de teinte (°) du globe doré de la recrue et de son étoile
 * (0 = doré, 75 = vert, 165 = bleu, 330 = rouge orangé, 350 = jaune orangé) ; `light` : éclaircissement vers le blanc (0 à 1, absent = 0). Chaque power-up a sa couleur (08/10 : tous verts avant).
 */
export const POWERUP_INFO: Record<PowerUpKind, { icon: string; color: number; hue: number; light?: number }> = {
  stim: { icon: '💉', color: 0xff5a2a, hue: 330 }, // rouge orangé
  magnet: { icon: '🧲', color: 0xcfe6ff, hue: 165, light: 0.7 }, // blanc légèrement bleuté
  heal: { icon: '💚', color: POWERUP_GREEN, hue: 75 }, // vert
  stasis: { icon: '❄️', color: 0x4aa8ff, hue: 165 }, // bleu
  rockets: { icon: '🚀', color: 0xffb02a, hue: 350 }, // jaune orangé
  reroll: { icon: '🎲', color: RECRUIT_COLOR, hue: 0 }, // jaune, comme les recrues
};

/** Drone (medivac / freezebot) qui plane au centre d'un globe de soin / de stase : largeur (px monde) de l'image, hauteur de vol au-dessus du centre du globe, amplitude et vitesse du balancement. */
const BOT = { width: 52, lift: 85, bob: 6, bobSpeed: 2.6 };
/** Largeur (px monde) du medibot : son image est plus haute que celle du freezebot à largeur égale, on la réduit pour que les deux robots paraissent de même taille. */
const MEDIBOT_WIDTH = 46;

/** Clé de texture de l'icône d'un power-up. */
export const powerUpIconKey = (kind: PowerUpKind): string => `powerup_icon_${kind}`;

// couleurs et hauteur communes à tous les globes au sol : voir `GlobeGlitter.ts`
export { GLOBE_LIFT, POWERUP_GREEN, RECRUIT_COLOR, UPGRADE_PINK };

/**
 * Power-up : globe à la couleur du bonus (pièces du bonus recrue décalées de `POWERUP_INFO[kind].hue`) avec l'icône du bonus au centre, centré sur (0, 0) ;
 * partagé avec la visionneuse de bonus. Sans les pièces d'art, repli sur un disque dessiné.
 */
export function makePowerUpIcon(scene: Phaser.Scene, kind: PowerUpKind): Phaser.GameObjects.Container {
  const info = POWERUP_INFO[kind];
  const scale = FX.recruit.displayScale; // même taille que les recrues et les globes d'upgrade
  const parts: Phaser.GameObjects.GameObject[] = [];
  const globeKey = powerUpGlobeKey(kind);
  if (ensureGlobeTexture(scene, globeKey, info.hue, undefined, info.light ?? 0)) {
    parts.push(scene.add.image(0, 0, globeKey).setScale(scale));
  } else {
    const g = scene.add.graphics();
    g.fillStyle(0x0a1422, 0.75).fillCircle(0, 0, 160 * scale * 0.5);
    g.fillStyle(info.color, 0.4).fillCircle(0, 0, 160 * scale * 0.5);
    g.lineStyle(4, info.color, 1).strokeCircle(0, 0, 160 * scale * 0.5);
    parts.push(g);
  }
  const key = powerUpIconKey(kind);
  if (scene.textures.exists(key)) {
    const img = scene.add.image(0, -1, key);
    parts.push(img.setScale((160 * scale * 0.62) / Math.max(img.width, img.height))); // tient dans le globe (diamètre 160 × scale)
  } else {
    parts.push(scene.add.text(0, -1, info.icon, { fontFamily: theme.font, fontSize: `${Math.round(80 * scale)}px` }).setOrigin(0.5));
  }
  return scene.add.container(0, 0, parts);
}

/** Globe persistant au sol (soin ou stase) de rayon `r`, d'opacité `a` ; partagé avec la visionneuse de bonus. */
export function drawField(g: Phaser.GameObjects.Graphics, kind: 'heal' | 'stasis', x: number, y: number, r: number, a: number, time: number): void {
  const beat = 0.5 + 0.5 * Math.sin(time * 4);
  const col = kind === 'heal' ? 0x5dff84 : 0x6fd8ff;
  g.fillStyle(col, (0.12 + 0.08 * beat) * a).fillEllipse(x, y, r * 2, r * 1.4);
  g.lineStyle(3, col, (0.5 + 0.3 * beat) * a).strokeEllipse(x, y, r * 2, r * 1.4);
  if (kind === 'stasis') {
    g.lineStyle(2, 0xffffff, 0.3 * a).strokeEllipse(x, y, r * 2 * (0.4 + 0.5 * ((time * 0.8) % 1)), r * 1.4 * (0.4 + 0.5 * ((time * 0.8) % 1)));
    // les petits flocons qui montent sont des particules (`Fx.stasisFlake`, posées par PickupViews.syncFieldParticles)
  }
  else g.fillStyle(0xffffff, 0.2 * a).fillEllipse(x, y - 8 * beat, 26, 16);
}

/**
 * Rond posé au sol sous un globe à ramasser (recrue : `RECRUIT_COLOR` jaune, power-up : `POWERUP_GREEN`, globe d'upgrade : `UPGRADE_PINK`) : disque, anneau
 * et anneau qui pulse, celui de la recrue pour tous. `a` : opacité globale (clignote en fin de vie) ; `k` : échelle (visionneuse de bonus, où les globes sont agrandis).
 */
export function drawPickupSpot(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, time: number, id: number, a = 1, k = 1): void {
  const beat = 0.5 + 0.5 * Math.sin(time * 5 + id);
  g.fillStyle(color, (0.16 + 0.12 * beat) * a).fillEllipse(x, y, 70 * k, 38 * k);
  g.lineStyle(2, color, 0.6 * a).strokeEllipse(x, y, (58 + beat * 10) * k, (30 + beat * 6) * k);
}

/** Zone de réanimation (coop) de rayon `r` ; `k` = progression de la réanimation (0 → 1). */
export function drawReviveZone(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, k: number, time: number): void {
  const beat = 0.5 + 0.5 * Math.sin(time * 6); // pulsation 0 → 1
  const rr = r * (1 + beat * 0.12);
  g.fillStyle(0x3dff6a, 0.12 + 0.16 * beat + 0.12 * k).fillEllipse(x, y, rr * 2, rr * 1.4);
  g.fillStyle(0x7dff9a, 0.2 + 0.25 * k).fillEllipse(x, y, r * 2 * k, r * 1.4 * k);
  g.lineStyle(4, 0x8dffa8, 0.5 + 0.5 * beat).strokeEllipse(x, y, rr * 2, rr * 1.4);
  g.lineStyle(2, 0xffffff, 0.25 + 0.3 * beat).strokeEllipse(x, y, r * 2 * 0.6, r * 1.4 * 0.6);
}

/**
 * Éléments posés au sol et pilotés par la simulation : power-ups, globes persistants (soin / stase), auras des bonus actifs, compteur « soldats / max » au
 * centre de chaque squad. Tout est recalé chaque frame sur l'état de la simulation (snapshot en ligne) : pas d'image orpheline.
 */
export class PickupViews {
  /** Flammes d'enragé de chaque soldat sous stimpack (même effet que les aliens ressuscités). */
  private readonly rageFx = new Map<number, Phaser.GameObjects.Particles.ParticleEmitter>();
  private readonly powerups = new Map<number, Phaser.GameObjects.Container>();
  /** Étoiles et paillettes vertes qui montent autour de chaque power-up (même effet que les recrues et les globes d'upgrade). */
  private readonly powerupGlitter = new Map<number, GlobeGlitter>();
  /** Position de simulation du tick courant et du précédent, par power-up : la simulation ne le déplace qu'à 30 Hz (aspiration), l'affichage l'interpole. */
  private readonly powerupPos = new Map<number, { px: number; py: number; x: number; y: number }>();
  /** Position affichée (interpolée) de chaque power-up, pour le cercle au sol. */
  private readonly powerupShown = new Map<number, { x: number; y: number }>();
  /** Drone qui plane au centre de chaque globe de soin (medivac) ou de stase (freezebot), par id de champ, et son échelle d'apparition (0 → 1, rebond). */
  private readonly bots = new Map<number, Phaser.GameObjects.Image>();
  private readonly botScale = new Map<number, { v: number }>();
  private readonly counts = new Map<PlayerId, { box: Phaser.GameObjects.Container; g: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; x: number; y: number; shown: string }>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Sim,
    /** Position affichée (interpolée) d'un soldat, par id. */
    private readonly posOf: (soldierId: number) => { x: number; y: number } | undefined,
    /** Effets partagés (croix de soin des globes). */
    private readonly fx: Fx,
  ) {}

  /** Appelé chaque frame (avant le dessin du sol) : crée / déplace / détruit les objets. */
  sync(time: number, alpha = 1): void {
    this.syncPowerups(time, alpha);
    this.syncFieldParticles();
    this.syncBots(time);
    this.syncCounts();
    this.syncSyringes(time);
  }

  // ---------- Globes de soin : croix vertes ----------

  /** Prochain instant (ms de la scène) où chaque globe lâche une particule. */
  private readonly zoneNext = new Map<number, number>();

  /**
   * Particules des globes au sol, nées au hasard dans la zone, qui montent en s'effaçant : croix vertes du globe de soin (FX.healZone),
   * petits flocons du globe de stase (FX.stasis).
   */
  private syncFieldParticles(): void {
    const now = this.scene.time.now;
    const live = new Set<number>();
    for (const f of this.sim.powerups.fields) {
      live.add(f.id);
      if (now < (this.zoneNext.get(f.id) ?? 0)) continue;
      const heal = f.kind === 'heal';
      this.zoneNext.set(f.id, now + (heal ? FX.healZone.everyMs : FX.stasis.everyMs) * (0.6 + Math.random() * 0.8));
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * f.r * 0.92; // dans l'ellipse du globe (demi-axes r et 0,7 r, comme `drawField`)
      const x = f.x + Math.cos(a) * d;
      const y = f.y + Math.sin(a) * d * 0.7;
      if (heal) this.fx.healZoneCross(x, y, Math.min(1, f.ttl / 1.2));
      else this.fx.stasisFlake(x, y, Math.min(1, f.ttl / 1.2));
    }
    for (const id of this.zoneNext.keys()) if (!live.has(id)) this.zoneNext.delete(id);
  }

  /**
   * Un drone vole au centre de chaque globe de soin (medivac) ou de stase (freezebot) : il « pop » à l'apparition du globe (rebond), se balance,
   * puis disparaît en fondu avec lui ; l'ombre est dessinée au sol (`drawGround`).
   */
  private syncBots(time: number): void {
    const live = new Set<number>();
    for (const f of this.sim.powerups.fields) {
      const key = f.kind === 'heal' ? powerUpIconKey('heal') : 'fx_freezebot';
      if (!this.scene.textures.exists(key)) continue;
      live.add(f.id);
      let img = this.bots.get(f.id);
      if (!img) {
        img = this.scene.add.image(f.x, f.y, key);
        img.setDepth(DEPTH.fx + 1);
        this.botScale.set(f.id, { v: 0 });
        this.scene.tweens.add({ targets: this.botScale.get(f.id), v: 1, duration: 320, ease: 'Back.Out' });
        this.bots.set(f.id, img);
      }
      const k = Math.min(1, f.ttl / 1.2);
      const bob = Math.sin(time * BOT.bobSpeed + f.id) * BOT.bob;
      img.setScale(((f.kind === 'heal' ? MEDIBOT_WIDTH : BOT.width) / img.width) * (this.botScale.get(f.id)?.v ?? 1)).setPosition(f.x, f.y - BOT.lift + bob).setAlpha(k).setRotation(Math.sin(time * 1.7 + f.id) * 0.06);
    }
    for (const [id, img] of this.bots) {
      if (live.has(id)) continue;
      img.destroy();
      this.bots.delete(id);
      this.botScale.delete(id);
    }
  }

  // ---------- Power-ups ----------

  private syncPowerups(time: number, alpha: number): void {
    const live = new Set<number>();
    for (const p of this.sim.powerups.items) {
      live.add(p.id);
      let box = this.powerups.get(p.id);
      if (!box) {
        box = makePowerUpIcon(this.scene, p.kind).setPosition(p.x, p.y).setScale(0.2);
        this.scene.tweens.add({ targets: box, scale: 1, duration: 220, ease: 'Back.Out' });
        this.powerups.set(p.id, box);
        this.powerupPos.set(p.id, { px: p.x, py: p.y, x: p.x, y: p.y });
      }
      const pos = this.powerupPos.get(p.id)!;
      if (pos.x !== p.x || pos.y !== p.y) {
        pos.px = pos.x;
        pos.py = pos.y;
        pos.x = p.x;
        pos.y = p.y;
      }
      const x = lerp(pos.px, pos.x, alpha);
      const y = lerp(pos.py, pos.y, alpha);
      this.powerupShown.set(p.id, { x, y });
      const blink = p.life < 3.5 && Math.sin(time * 18) > 0;
      const cy = y - GLOBE_LIFT * FX.recruit.displayScale + Math.sin(time * 4 + p.id) * 4;
      box.setPosition(x, cy).setDepth(DEPTH.fx + 2).setAlpha(blink ? 0.3 : 1);
      let glitter = this.powerupGlitter.get(p.id);
      if (!glitter) {
        const tex = ensureStarTexture(this.scene, POWERUP_INFO[p.kind].hue, POWERUP_INFO[p.kind].light ?? 0); // l'étoile de la recrue, à la teinte du power-up
        const made = tex ? createGlobeGlitter(this.scene, x, cy, tex) : null;
        if (made) this.powerupGlitter.set(p.id, (glitter = made));
      }
      glitter?.setPosition(x, cy, DEPTH.fx + 3, blink ? 0.3 : 1);
    }
    for (const [id, box] of this.powerups) {
      if (live.has(id)) continue;
      this.powerups.delete(id);
      this.powerupPos.delete(id);
      this.powerupShown.delete(id);
      this.powerupGlitter.get(id)?.destroy();
      this.powerupGlitter.delete(id);
      this.scene.tweens.add({ targets: box, alpha: 0, scale: 1.6, duration: 240, onComplete: () => box.destroy() });
    }
  }

  // ---------- Stimpack : les soldats boostés sont enragés (flammes rouges) ----------

  private syncSyringes(time: number): void {
    const seen = new Set<number>();
    for (const sq of this.sim.squads) {
      if (!sq.alive || sq.buffs.stim <= 0) continue;
      const blink = sq.buffs.stim < 1.2 && Math.sin(time * 20) > 0; // clignote juste avant la fin
      for (const s of sq.soldiers) {
        seen.add(s.id);
        let fx = this.rageFx.get(s.id);
        if (!fx) {
          fx = createEnragedFlames(this.scene, s.def.radius, 45); // plus espacées que sur un alien : toute une escouade en porte
          this.rageFx.set(s.id, fx);
        }
        const p = this.posOf(s.id) ?? s;
        fx.setPosition(p.x, p.y + soldierOffsetY(s.def.id) - s.def.radius * 0.6).setVisible(!blink); // flammes sur le sprite décalé
      }
    }
    for (const [id, fx] of this.rageFx) {
      if (seen.has(id)) continue;
      fx.destroy();
      this.rageFx.delete(id);
    }
  }

  // ---------- Compteur d'escouade ----------

  /**
   * Capsule bleu foncé « soldats / max » posée sur le barycentre de l'escouade. Le barycentre est la moyenne des positions
   * AFFICHÉES (interpolées) des soldats, puis lissée : le centre de la simulation (centroïde robuste) sautait d'un tick à l'autre.
   */
  private syncCounts(): void {
    const seen = new Set<PlayerId>();
    for (const sq of this.sim.squads) {
      if (!sq.alive) continue;
      seen.add(sq.owner);
      let cap = this.counts.get(sq.owner);
      if (!cap) {
        const g = this.scene.add.graphics();
        const label = this.scene.add.text(0, 0, '', { fontFamily: theme.font, fontSize: '18px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
        cap = { box: this.scene.add.container(0, 0, [g, label]).setDepth(DEPTH.bars + 1), g, label, x: NaN, y: NaN, shown: '' };
        this.counts.set(sq.owner, cap);
      }
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const s of sq.soldiers) {
        const p = this.posOf(s.id) ?? s;
        sx += p.x;
        sy += p.y;
        n++;
      }
      const bx = sx / n;
      const by = sy / n;
      if (Number.isNaN(cap.x) || Math.hypot(bx - cap.x, by - cap.y) > 200) {
        cap.x = bx;
        cap.y = by;
      } else {
        cap.x += (bx - cap.x) * 0.25; // lissage : la capsule ne tremble plus
        cap.y += (by - cap.y) * 0.25;
      }
      const text = `${sq.size}/${sq.maxSize}`;
      if (text !== cap.shown) {
        cap.shown = text;
        cap.label.setText(text).setColor(sq.size >= sq.maxSize ? '#ffe066' : '#ffffff');
        const w = cap.label.width + 18;
        cap.g.clear();
        cap.g.fillStyle(0x0b1a4d, 0.92).fillRoundedRect(-w / 2, -13, w, 26, 13);
        cap.g.lineStyle(2, 0x3f6fe0, 0.9).strokeRoundedRect(-w / 2, -13, w, 26, 13);
      }
      cap.box.setPosition(cap.x, cap.y - CAPSULE_LIFT).setScale(CAPSULE_SCALE);
    }
    for (const [owner, cap] of this.counts) {
      if (seen.has(owner)) continue;
      cap.box.destroy();
      this.counts.delete(owner);
    }
  }

  // ---------- Sol ----------

  /** Dessins au sol (globes de soin / stase, ombres et halos des bulles et power-ups, dôme de répulsion, auras). */
  drawGround(g: Phaser.GameObjects.Graphics, time: number): void {
    for (const f of this.sim.powerups.fields) {
      drawField(g, f.kind as 'heal' | 'stasis', f.x, f.y, f.r, Math.min(1, f.ttl / 1.2), time);
      if (this.bots.has(f.id)) {
        const k = Math.min(1, f.ttl / 1.2);
        const sway = Math.sin(time * BOT.bobSpeed + f.id); // l'ombre rétrécit quand le drone monte
        g.fillStyle(0x000000, 0.28 * k).fillEllipse(f.x, f.y + 6, BOT.width * (0.62 - 0.05 * sway), BOT.width * (0.2 - 0.02 * sway));
      }
    }
    for (const p of this.sim.powerups.items) {
      const at = this.powerupShown.get(p.id) ?? p;
      drawPickupSpot(g, at.x, at.y, POWERUP_INFO[p.kind].color, time, p.id, p.life < 3.5 && Math.sin(time * 18) > 0 ? 0.3 : 1); // rond au sol à la couleur du power-up (clignote avec le power-up en fin de vie)
    }
    // bonus actifs
    for (const sq of this.sim.squads) {
      if (!sq.alive) continue;
    }
  }

  destroy(): void {
    for (const b of this.powerups.values()) b.destroy();
    for (const m of this.bots.values()) m.destroy();
    this.bots.clear();
    this.botScale.clear();
    for (const g of this.powerupGlitter.values()) g.destroy();
    this.powerupGlitter.clear();
    for (const c of this.counts.values()) c.box.destroy();
    for (const fx of this.rageFx.values()) fx.destroy();
    this.rageFx.clear();
    this.powerups.clear();
    this.powerupPos.clear();
    this.powerupShown.clear();
    this.counts.clear();
  }
}
