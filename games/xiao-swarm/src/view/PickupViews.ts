import Phaser from 'phaser';
import { lerp, theme } from '@xiao/engine';
import { DEPTH } from '../config';
import { FX } from '../fxParams';
import type { PowerUpKind } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import type { PlayerId } from '../sim/types';
import { ensureGlobeTexture, ensureStarTexture, POWERUP_GLOBE } from '../art/upgradeOrbs';
import { createEnragedFlames } from './EnragedFx';
import { createGlobeGlitter, GLOBE_LIFT, POWERUP_GREEN, RECRUIT_COLOR, UPGRADE_PINK, type GlobeGlitter } from './GlobeGlitter';
import type { Fx } from './Fx';

/** Décalage vertical (px) de la capsule du compteur au-dessus du barycentre de l'escouade. */
const CAPSULE_LIFT = 52;
/** Taille de la capsule du compteur (0,9 = 10 % plus petite). */
const CAPSULE_SCALE = 0.9;


export const POWERUP_INFO: Record<PowerUpKind, { icon: string; color: number }> = {
  stim: { icon: '💉', color: 0xffd84a },
  magnet: { icon: '🧲', color: 0x4aa8ff },
  heal: { icon: '💚', color: 0x5dff84 },
  stasis: { icon: '❄️', color: 0x6fd8ff },
  rockets: { icon: '🚀', color: 0xff7a3a },
  reroll: { icon: '🎲', color: 0xc78bff },
};

// couleurs et hauteur communes à tous les globes au sol : voir `GlobeGlitter.ts`
export { GLOBE_LIFT, POWERUP_GREEN, RECRUIT_COLOR, UPGRADE_PINK };

/**
 * Power-up : globe vert (pièces du bonus recrue décalées en vert, `FX.powerUp`) avec l'icône du bonus au centre, centré sur (0, 0) ; partagé avec la
 * visionneuse de bonus. Sans les pièces d'art, repli sur un disque vert dessiné.
 */
export function makePowerUpIcon(scene: Phaser.Scene, kind: PowerUpKind): Phaser.GameObjects.Container {
  const info = POWERUP_INFO[kind];
  const f = FX.powerUp;
  const scale = FX.recruit.displayScale; // même taille que les recrues et les globes d'upgrade
  const parts: Phaser.GameObjects.GameObject[] = [];
  if (ensureGlobeTexture(scene, POWERUP_GLOBE, f.hue)) {
    parts.push(scene.add.image(0, 0, POWERUP_GLOBE).setScale(scale));
  } else {
    const g = scene.add.graphics();
    g.fillStyle(0x0a1422, 0.75).fillCircle(0, 0, 160 * scale * 0.5);
    g.fillStyle(POWERUP_GREEN, 0.4).fillCircle(0, 0, 160 * scale * 0.5);
    g.lineStyle(4, POWERUP_GREEN, 1).strokeCircle(0, 0, 160 * scale * 0.5);
    parts.push(g);
  }
  parts.push(scene.add.text(0, -1, info.icon, { fontFamily: theme.font, fontSize: `${Math.round(80 * scale)}px` }).setOrigin(0.5));
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
 * et anneau qui pulse, celui de la recrue pour tous. `a` : opacité globale (clignote en fin de vie).
 */
export function drawPickupSpot(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, time: number, id: number, a = 1): void {
  const beat = 0.5 + 0.5 * Math.sin(time * 5 + id);
  g.fillStyle(color, (0.16 + 0.12 * beat) * a).fillEllipse(x, y, 70, 38);
  g.lineStyle(2, color, 0.6 * a).strokeEllipse(x, y, 58 + beat * 10, 30 + beat * 6);
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
        const tex = ensureStarTexture(this.scene, FX.powerUp.hue); // l'étoile de la recrue, en vert
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
        fx.setPosition(p.x, p.y - s.def.radius * 0.6).setVisible(!blink);
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
    }
    for (const p of this.sim.powerups.items) {
      const at = this.powerupShown.get(p.id) ?? p;
      drawPickupSpot(g, at.x, at.y, POWERUP_GREEN, time, p.id, p.life < 3.5 && Math.sin(time * 18) > 0 ? 0.3 : 1); // rond vert au sol (clignote avec le power-up en fin de vie)
    }
    // bonus actifs
    for (const sq of this.sim.squads) {
      if (!sq.alive) continue;
    }
  }

  destroy(): void {
    for (const b of this.powerups.values()) b.destroy();
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
