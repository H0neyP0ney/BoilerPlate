import Phaser from 'phaser';
import { theme } from '@xiao/engine';
import { DEPTH } from '../config';
import { type UpgradeId } from '../data/progression';
import type { PowerUpKind } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import type { PlayerId } from '../sim/types';
import { createEnragedFlames } from './EnragedFx';

/** Décalage vertical (px) de la capsule du compteur au-dessus du barycentre de l'escouade. */
const CAPSULE_LIFT = 52;
/** Taille de la capsule du compteur (0,9 = 10 % plus petite). */
const CAPSULE_SCALE = 0.9;

/** Icône (emoji) de chaque upgrade, affichée dans son bouton de choix. */
export const UPGRADE_ICONS: Record<UpgradeId, string> = {
  damage: '💥',
  fireRate: '⚡',
  hp: '❤️',
  speed: '👟',
  maxSquad: '👥',
  magnet: '🧲',
  recruit: '📣',
  xpGain: '⭐',
  reinforce: '➕',
  range: '🎯',
  crit: '✨',
};

/** Jaune de la zone qui pulse sous les recrues (les power-ups gardent la couleur de leur bonus : `POWERUP_INFO`). */
export const RECRUIT_COLOR = 0xffe14a;

export const POWERUP_INFO: Record<PowerUpKind, { icon: string; color: number }> = {
  stim: { icon: '💉', color: 0xffd84a },
  magnet: { icon: '🧲', color: 0x4aa8ff },
  heal: { icon: '💚', color: 0x5dff84 },
  stasis: { icon: '❄️', color: 0x6fd8ff },
  rockets: { icon: '🚀', color: 0xff7a3a },
  shield: { icon: '🛡️', color: 0x4aa8ff },
};

/** Pastille d'un power-up (disque coloré + emoji), centrée sur (0, 0) ; partagée avec la visionneuse d'unités. */
export function makePowerUpIcon(scene: Phaser.Scene, kind: PowerUpKind): Phaser.GameObjects.Container {
  const info = POWERUP_INFO[kind];
  const g = scene.add.graphics();
  g.fillStyle(0x0a1422, 0.75).fillCircle(0, 0, 22);
  g.fillStyle(info.color, 0.3).fillCircle(0, 0, 22);
  g.lineStyle(3, info.color, 1).strokeCircle(0, 0, 22);
  const icon = scene.add.text(0, -1, info.icon, { fontFamily: theme.font, fontSize: '26px' }).setOrigin(0.5);
  return scene.add.container(0, 0, [g, icon]);
}

/** Globe persistant au sol (soin ou stase) de rayon `r`, d'opacité `a` ; partagé avec la visionneuse de bonus. */
export function drawField(g: Phaser.GameObjects.Graphics, kind: 'heal' | 'stasis', x: number, y: number, r: number, a: number, time: number): void {
  const beat = 0.5 + 0.5 * Math.sin(time * 4);
  const col = kind === 'heal' ? 0x5dff84 : 0x6fd8ff;
  g.fillStyle(col, (0.12 + 0.08 * beat) * a).fillEllipse(x, y, r * 2, r * 1.4);
  g.lineStyle(3, col, (0.5 + 0.3 * beat) * a).strokeEllipse(x, y, r * 2, r * 1.4);
  if (kind === 'stasis') g.lineStyle(2, 0xffffff, 0.3 * a).strokeEllipse(x, y, r * 2 * (0.4 + 0.5 * ((time * 0.8) % 1)), r * 1.4 * (0.4 + 0.5 * ((time * 0.8) % 1)));
  else g.fillStyle(0xffffff, 0.2 * a).fillEllipse(x, y - 8 * beat, 26, 16);
}

/**
 * Zone qui pulse posée au sol sous un objet à ramasser (power-up : sa couleur ; recrue : `RECRUIT_COLOR`) : disque translucide + anneau. `a` : opacité
 * globale (clignote en fin de vie).
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
  private readonly counts = new Map<PlayerId, { box: Phaser.GameObjects.Container; g: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; x: number; y: number; shown: string }>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Sim,
    /** Position affichée (interpolée) d'un soldat, par id. */
    private readonly posOf: (soldierId: number) => { x: number; y: number } | undefined,
  ) {}

  /** Appelé chaque frame (avant le dessin du sol) : crée / déplace / détruit les objets. */
  sync(time: number): void {
    this.syncPowerups(time);
    this.syncCounts();
    this.syncSyringes(time);
  }

  // ---------- Power-ups ----------

  private syncPowerups(time: number): void {
    const live = new Set<number>();
    for (const p of this.sim.powerups.items) {
      live.add(p.id);
      let box = this.powerups.get(p.id);
      if (!box) {
        box = makePowerUpIcon(this.scene, p.kind).setPosition(p.x, p.y).setScale(0.2);
        this.scene.tweens.add({ targets: box, scale: 1, duration: 220, ease: 'Back.Out' });
        this.powerups.set(p.id, box);
      }
      const blink = p.life < 3.5 && Math.sin(time * 18) > 0;
      box.setPosition(p.x, p.y - 14 + Math.sin(time * 4 + p.id) * 4).setDepth(DEPTH.fx + 2).setAlpha(blink ? 0.3 : 1);
    }
    for (const [id, box] of this.powerups) {
      if (live.has(id)) continue;
      this.powerups.delete(id);
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
    for (const p of this.sim.powerups.items) drawPickupSpot(g, p.x, p.y, POWERUP_INFO[p.kind].color, time, p.id);
    // bonus actifs
    for (const sq of this.sim.squads) {
      if (!sq.alive) continue;
    }
  }

  destroy(): void {
    for (const b of this.powerups.values()) b.destroy();
    for (const c of this.counts.values()) c.box.destroy();
    for (const fx of this.rageFx.values()) fx.destroy();
    this.rageFx.clear();
    this.powerups.clear();
    this.counts.clear();
  }
}
