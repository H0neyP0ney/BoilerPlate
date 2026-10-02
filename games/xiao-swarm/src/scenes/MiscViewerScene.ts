import Phaser from 'phaser';
import { sprites, theme } from '@xiao/engine';
import { ALIENS } from '../data/aliens';
import { CLASSES, type SoldierClassId } from '../data/classes';
import { DEPTH, PALETTE, SCENES, VISUAL, VIEW_BG } from '../config';
import { checkbox, header, line, note, panel, select, slider } from '../dev/devUi';
import { ScaleRef } from '../dev/scaleRef';
import { Fx } from '../view/Fx';
import { RecruitView } from '../view/UnitViews';
import { LOB_HEIGHT, RIVAL_COLORS } from '../view/WorldView';

/**
 * Visionneuse « divers » (dev uniquement) : tout ce qui est graphique dans le jeu hors unités, particules et
 * obstacles — projectiles, bonus de recrutement, barres de vie, anneaux de squad, zone de soin, interface tactile,
 * sol et eau. Chaque aperçu rejoue la logique d'affichage du jeu (view/WorldView.ts, UnitViews.ts) ; les textures
 * sont dessinées dans art/fx.ts. Vue d'observation : les réglages des effets sont dans la vue Particules.
 */
interface Live {
  update?(time: number, dt: number): void;
  destroy?(): void;
}

interface Item {
  id: string;
  group: string;
  label: string;
  where: string;
  /** Zoom conseillé à l'ouverture de l'aperçu. */
  zoom: number;
  build(s: MiscViewerScene): Live;
}

const ZOOMS = [0.5, 1, 1.5, 2, 3, 4];
const FOOT = 0; // ligne de sol des aperçus

/** Taille (px) d'une texture pour l'info du panneau. */
function sizeOf(scene: Phaser.Scene, key: string): string {
  if (!scene.textures.exists(key)) return `${key} (absente)`;
  const f = scene.textures.getFrame(key);
  return `${key} ${f.width}×${f.height}`;
}

/** Projectile droit répété : texture, vitesse réelle du jeu (px/s), aperçu ralenti par le curseur. */
function straight(id: string, label: string, tex: string, speed: number, where: string): Item {
  return {
    id,
    group: 'Projectiles',
    label,
    where,
    zoom: 2,
    build(s) {
      const live: { img: Phaser.GameObjects.Image; x: number }[] = [];
      let cool = 0;
      s.guide(-170, 170);
      s.big(tex, 130, 70);
      return {
        update(_t, dt) {
          cool -= dt;
          if (cool <= 0) {
            cool = 0.6;
            live.push({ img: s.track(s.add.image(-170, -17, tex).setDepth(10)), x: -170 });
          }
          for (let i = live.length - 1; i >= 0; i--) {
            const p = live[i];
            p.x += speed * dt * s.slow;
            p.img.setPosition(p.x, -17);
            if (p.x > 170) {
              p.img.destroy();
              live.splice(i, 1);
            }
          }
        },
      };
    },
  };
}

const ITEMS: Item[] = [
  straight('bullet', 'Balle jaune (fx_bullet)', 'fx_bullet', 760, 'Balle « classique » : plus utilisée par le Gunner (blaster bleu), disponible pour d\'autres armes. Vitesse de référence 760 px/s.'),
  straight('blaster', 'Blaster bleu (Gunner)', 'fx_blaster_blue', 760, 'Tir du Gunner : 760 px/s, orienté selon sa trajectoire, portée 290 px.'),
  straight('bolt', 'Éclair vert (Medic)', 'fx_bolt_green', 620, 'Tir du Medic : 620 px/s, portée 240 px.'),
  {
    id: 'grenade',
    group: 'Projectiles',
    label: 'Grenade en cloche (Grenadier)',
    where: 'Trajectoire droite au sol + arc (hauteur max 55 px), ombre au sol, rotation et grossissement en vol, explosion à l\'impact (rayon 70).',
    zoom: 1.5,
    build(s) {
      const fx = new Fx(s);
      const shadow = s.track(s.add.graphics().setDepth(1));
      const img = s.track(s.add.image(0, 0, 'fx_grenade').setDepth(10));
      let k = 0;
      let wait = 0;
      s.guide(-150, 150);
      return {
        update(_t, dt) {
          shadow.clear();
          if (wait > 0) {
            wait -= dt;
            img.setVisible(false);
            return;
          }
          img.setVisible(true);
          k += (dt * s.slow) / 1;
          if (k >= 1) {
            fx.explosion(150, FOOT, 70, false);
            k = 0;
            wait = 1.2;
            return;
          }
          const x = -150 + 300 * k;
          const ground = -17 * (1 - k);
          const h = 4 * LOB_HEIGHT * k * (1 - k);
          const f = 1 - Math.min(1, h / LOB_HEIGHT) * 0.4;
          shadow.fillStyle(0x2a1d2e, 0.3 * f).fillEllipse(x, ground, 16 * f, 7 * f);
          img.setPosition(x, ground - h).setRotation(k * 14).setScale(1 + (h / LOB_HEIGHT) * 0.3);
        },
        destroy: () => fx.destroy(),
      };
    },
  },
  {
    id: 'flame',
    group: 'Projectiles',
    label: 'Flamme (Flammeur)',
    where: 'Particules de flamme additives qui grossissent (×0,35 → ×1,65), s\'estompent et ralentissent ; vitesse 420 px/s, durée 0,38 s.',
    zoom: 2,
    build(s) {
      const live: { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; life: number }[] = [];
      let cool = 0;
      let phase = 0;
      return {
        update(_t, dt) {
          const d = dt * s.slow;
          phase += d;
          cool -= d;
          if (phase % 2 < 1.2 && cool <= 0) {
            cool = 0.06;
            const a = (Math.random() - 0.5) * 0.56; // dispersion du jeu : ±0,28 rad
            const img = s.track(s.add.image(-100, -17, 'fx_flame').setDepth(10).setBlendMode(Phaser.BlendModes.ADD));
            live.push({ img, x: -100, y: -17, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, life: 0.38 });
          }
          for (let i = live.length - 1; i >= 0; i--) {
            const p = live[i];
            p.life -= d;
            if (p.life <= 0) {
              p.img.destroy();
              live.splice(i, 1);
              continue;
            }
            p.vx *= 1 - 2.2 * d;
            p.vy *= 1 - 2.2 * d;
            p.x += p.vx * d;
            p.y += p.vy * d;
            const k = 1 - p.life / 0.38;
            p.img.setPosition(p.x, p.y).setScale(0.35 + k * 1.3).setAlpha(1 - k * k);
          }
        },
      };
    },
  },
  {
    id: 'beam',
    group: 'Projectiles',
    label: 'Traçante (Sniper)',
    where: 'Faisceau instantané (deux traits vert clair, durée 0,12 s) + éclaboussure à l\'impact ; portée 520 px.',
    zoom: 1,
    build(s) {
      const fx = new Fx(s);
      const g = s.track(s.add.graphics().setDepth(10));
      let life = 0;
      let wait = 0;
      return {
        update(_t, dt) {
          wait -= dt * s.slow;
          if (wait <= 0) {
            wait = 1.3;
            life = 0.12;
            fx.burst(260, -10, 0xb8ffb8, 6);
          }
          g.clear();
          if (life <= 0) return;
          life -= dt * s.slow;
          const k = Math.max(0, life / 0.12);
          g.lineStyle(6 * k, 0x7dff9a, 0.35 * k).lineBetween(-260, -17, 260, -10);
          g.lineStyle(2.5 * k, 0xeaffea, k).lineBetween(-260, -17, 260, -10);
        },
        destroy: () => fx.destroy(),
      };
    },
  },
  {
    id: 'recruits',
    group: 'Bonus',
    label: 'Recrues à ramasser',
    where: 'Bonus de recrutement lâché par les aliens : sprite de la classe, halo additif pulsant de sa couleur, rebond, clignotement sous 4 s de vie (rangée du bas).',
    zoom: 1.5,
    build(s) {
      const classes = Object.keys(CLASSES) as SoldierClassId[];
      const views: { v: RecruitView; state: { id: number; cls: SoldierClassId; x: number; y: number; px: number; py: number; life: number } }[] = [];
      [10, 2].forEach((life, row) => {
        classes.forEach((cls, i) => {
          const x = (i - (classes.length - 1) / 2) * 80;
          const y = row * 110 - 40;
          const state = { id: row * 10 + i, cls, x, y, px: x, py: y, life };
          views.push({ v: new RecruitView(s, state, CLASSES[cls].color), state });
          if (row === 0) s.track(s.add.text(x, y + 26, cls, { fontFamily: theme.font, fontSize: '11px', color: PALETTE.textDim }).setOrigin(0.5, 0));
        });
      });
      return {
        update(time) {
          for (const r of views) r.v.sync(1, time);
        },
        destroy: () => views.forEach((r) => r.v.destroy()),
      };
    },
  },
  {
    id: 'bars',
    group: 'Interface du jeu',
    label: 'Barres de vie',
    where: 'Soldats (vert pour soi, couleur de l\'anneau pour un rival, 30 px) et aliens (rouge, largeur propre à l\'espèce) ; fond sombre arrondi, 5 px de haut.',
    zoom: 2,
    build(s) {
      const g = s.track(s.add.graphics().setDepth(10));
      const bar = (x: number, y: number, w: number, ratio: number, color: number) => {
        g.fillStyle(PALETTE.hpBack, 0.85).fillRoundedRect(x - w / 2 - 1.5, y - 1.5, w + 3, 5 + 3, 3);
        g.fillStyle(color, 1).fillRect(x - w / 2, y, Math.max(0, w * ratio), 5);
      };
      const label = (x: number, y: number, t: string) => s.track(s.add.text(x, y, t, { fontFamily: theme.font, fontSize: '10px', color: PALETTE.textDim }).setOrigin(0.5, 0));
      [1, 0.6, 0.25].forEach((r, i) => {
        bar(-110 + i * 50, -30, 30, r, PALETTE.hpAlly);
        label(-110 + i * 50, -20, `soi ${Math.round(r * 100)} %`);
      });
      RIVAL_COLORS.slice(0, 3).forEach((c, i) => {
        bar(-110 + i * 50, 10, 30, 0.7, c);
        label(-110 + i * 50, 20, `rival ${i + 1}`);
      });
      (Object.keys(ALIENS) as (keyof typeof ALIENS)[]).forEach((id, i) => {
        const w = ALIENS[id].hpBarWidth;
        bar(40 + (i % 3) * 70, -30 + Math.floor(i / 3) * 40, w, 0.6, PALETTE.hpEnemy);
        label(40 + (i % 3) * 70, -20 + Math.floor(i / 3) * 40, `${id} (${w})`);
      });
      return {};
    },
  },
  {
    id: 'rings',
    group: 'Interface du jeu',
    label: 'Ombre et anneau de squad',
    where: 'Ombre ovale sous chaque soldat + anneau de la couleur de son joueur : bleu pour soi, une couleur par rival (9 en battle royale).',
    zoom: 1.5,
    build(s) {
      const g = s.track(s.add.graphics().setDepth(1));
      const colors = [PALETTE.allyRing, ...RIVAL_COLORS];
      const r = CLASSES.trooper.radius;
      colors.forEach((c, i) => {
        const x = ((i % 5) - 2) * 70;
        const y = Math.floor(i / 5) * 70 - 20;
        g.fillStyle(0x2a1d2e, 0.3).fillEllipse(x, y, r * 2.2, r);
        g.lineStyle(3, c, 0.9).strokeEllipse(x, y, r * 2.6, r * 1.3);
        if (s.textures.exists('soldier_trooper')) {
          const u = sprites.add(s, 'soldier_trooper', x, y).setDepth(5);
          sprites.play(u, 'soldier_trooper', 'idle');
          s.track(u);
        }
      });
      return {};
    },
  },
  {
    id: 'heal',
    group: 'Interface du jeu',
    label: 'Zone de soin (Medic)',
    where: 'Ellipse verte pulsante (rayon 230 px ± 5 %) autour du Medic quand la squad est immobile, avec des « + » qui montent.',
    zoom: 0.5,
    build(s) {
      const fx = new Fx(s);
      const g = s.track(s.add.graphics().setDepth(1));
      const medic = s.textures.exists('soldier_medic') ? s.track(sprites.add(s, 'soldier_medic', 0, 0).setDepth(5)) : undefined;
      let cool = 0;
      return {
        update(t, dt) {
          const heal = CLASSES.medic.heal!;
          const r = heal.radius * (0.95 + Math.sin(t * 4) * 0.05);
          g.clear();
          g.fillStyle(0x5eff8a, 0.08).fillEllipse(0, 0, r * 2, r * 1.4);
          g.lineStyle(2, 0x5eff8a, 0.35).strokeEllipse(0, 0, r * 2, r * 1.4);
          cool -= dt;
          if (cool <= 0) {
            cool = 0.25;
            fx.heal((Math.random() - 0.5) * 240, (Math.random() - 0.5) * 120);
          }
          void medic;
        },
        destroy: () => fx.destroy(),
      };
    },
  },
  {
    id: 'joystick',
    group: 'Interface du jeu',
    label: 'Joystick tactile',
    where: 'Base (rayon 70) et bouton (31 px) ; le cercle pointillé à 105 px est la marge au-delà de laquelle la base suit le doigt.',
    zoom: 1.5,
    build(s) {
      const R = 70;
      s.track(s.add.circle(0, -20, R, 0xffffff, 0.12).setStrokeStyle(3, 0xffffff, 0.35));
      const margin = s.track(s.add.circle(0, -20, R * 1.5, 0xffffff, 0).setStrokeStyle(1.5, 0xffd166, 0.6));
      const knob = s.track(s.add.circle(0, -20, R * 0.45, 0xffffff, 0.45));
      void margin;
      return {
        update(t) {
          const k = (Math.sin(t * 0.8) * 0.5 + 0.5) * R;
          knob.setPosition(Math.cos(t * 1.3) * k, -20 + Math.sin(t * 1.3) * k);
        },
      };
    },
  },
  {
    id: 'hand',
    group: 'Interface du jeu',
    label: 'Main du tutoriel',
    where: 'Consigne « glisse pour déplacer » (mobile) : va-et-vient horizontal de 120 px en 0,9 s.',
    zoom: 2,
    build(s) {
      const hand = s.track(s.add.image(-60, -10, 'hand').setScale(0.8).setDepth(10));
      const tw = s.tweens.add({ targets: hand, x: 60, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      return { destroy: () => tw.remove() };
    },
  },
  {
    id: 'ground',
    group: 'Terrain',
    label: 'Sol (ground_tile)',
    where: 'Texture qui se raccorde répétée sur la carte ; échelle réglable dans le menu Réglages (Visuel → Échelle du sol).',
    zoom: 0.5,
    build(s) {
      s.track(s.add.tileSprite(0, 0, 900, 600, 'ground_tile').setTileScale(VISUAL.groundScale).setDepth(1));
      s.track(s.add.text(0, 320, sizeOf(s, 'ground_tile'), { fontFamily: theme.font, fontSize: '16px', color: PALETTE.textDim }).setOrigin(0.5));
      return {};
    },
  },
  {
    id: 'water',
    group: 'Terrain',
    label: 'Eau animée',
    where: 'Bordure infranchissable de la carte : tuile qui glisse doucement (décalage 0,012 / 0,006 px par ms).',
    zoom: 1,
    build(s) {
      const water = s.track(s.add.tileSprite(0, 0, 600, 400, 'water').setDepth(1));
      return { update: () => water.setTilePosition(s.time.now * 0.012, s.time.now * 0.006) };
    },
  },
  {
    id: 'textures',
    group: 'Terrain',
    label: "Textures d'effets",
    where: 'Les petites textures partagées par les effets : halo, point, anneau, croix de soin, flamme, projectiles.',
    zoom: 1.5,
    build(s) {
      const keys = ['fx_glow', 'fx_dot', 'fx_ring', 'fx_plus', 'fx_flame', 'fx_bullet', 'fx_blaster_blue', 'fx_bolt_green', 'fx_grenade', 'hand'];
      keys.forEach((k, i) => {
        const x = ((i % 5) - 2) * 90;
        const y = Math.floor(i / 5) * 90 - 40;
        if (!s.textures.exists(k)) return;
        s.track(s.add.rectangle(x, y, 74, 64, 0x000000, 0.25).setDepth(1));
        const img = s.track(s.add.image(x, y, k).setDepth(2));
        img.setScale(Math.min(1.6, 56 / Math.max(img.width, img.height)));
        s.track(s.add.text(x, y + 36, k.replace('fx_', ''), { fontFamily: theme.font, fontSize: '10px', color: PALETTE.textDim }).setOrigin(0.5, 0));
      });
      return {};
    },
  },
];

export class MiscViewerScene extends Phaser.Scene {
  /** Ralenti des aperçus animés (1 = vitesse réelle). */
  slow = 1;
  private item: Item = ITEMS[0];
  private live: Live = {};
  private objs: Phaser.GameObjects.GameObject[] = [];
  private zoom = 2;
  private panel?: HTMLDivElement;
  private info!: HTMLDivElement;
  private itemSelect!: HTMLSelectElement;
  private zoomSelect!: HTMLSelectElement;

  constructor() {
    super(SCENES.misc);
  }

  /** Trooper de référence (échelle) + bouton pour le masquer. */
  private scaleRef?: ScaleRef;

  create(): void {
    this.scaleRef = new ScaleRef(this);
    this.cameras.main.setBackgroundColor(VIEW_BG);
    this.drawGrid();
    this.buildPanel();
    this.open(this.item);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fit);
      this.live.destroy?.();
      this.panel?.remove();
      this.scaleRef?.destroy();
    });
  }

  update(time: number, delta: number): void {
    this.scaleRef?.place();
    this.live.update?.(time / 1000, delta / 1000);
  }

  // ---------- Utilitaires pour les aperçus ----------

  /** Enregistre un objet pour le détruire au changement d'aperçu. */
  track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  /** Ligne de départ / d'arrivée d'un projectile. */
  guide(x0: number, x1: number): void {
    const g = this.track(this.add.graphics().setDepth(0));
    g.lineStyle(1, 0xffffff, 0.15).lineBetween(x0, FOOT, x1, FOOT);
    g.lineStyle(1, 0xffd166, 0.5).lineBetween(x0, FOOT - 6, x0, FOOT + 6).lineBetween(x1, FOOT - 6, x1, FOOT + 6);
  }

  /** Texture agrandie (4×) avec sa taille, à côté de l'aperçu animé. */
  big(key: string, x: number, y: number): void {
    if (!this.textures.exists(key)) return;
    const img = this.track(this.add.image(x, y, key).setScale(4).setDepth(2));
    this.track(this.add.text(x, y + img.displayHeight / 2 + 10, sizeOf(this, key), { fontFamily: theme.font, fontSize: '10px', color: PALETTE.textDim }).setOrigin(0.5, 0));
  }

  // ---------- Aperçu courant ----------

  private open(item: Item): void {
    this.live.destroy?.();
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.item = item;
    this.live = item.build(this);
    this.itemSelect.value = item.id;
    this.zoom = item.zoom;
    this.zoomSelect.value = String(item.zoom);
    this.info.textContent = item.where;
    this.fit();
  }

  private buildPanel(): void {
    const p = panel(310);
    const groups = [...new Set(ITEMS.map((i) => i.group))];
    const items = select(
      'Élément',
      groups.map((g) => ({ group: g, options: ITEMS.filter((i) => i.group === g).map((i) => [i.id, i.label] as [string, string]) })),
    );
    this.itemSelect = items.select;
    items.select.addEventListener('change', () => this.open(ITEMS.find((i) => i.id === items.select.value)!));

    const zoom = select('Zoom', ZOOMS.map((z) => [String(z), `${z * 100} %`] as [string, string]));
    this.zoomSelect = zoom.select;
    zoom.select.addEventListener('change', () => {
      this.zoom = Number(zoom.select.value);
      this.fit();
    });

    this.info = document.createElement('div');
    this.info.style.cssText = 'font-size:12px;color:#9fe;white-space:pre-wrap;min-height:3em';

    p.append(
      header('Visionneuse divers', () => this.scene.start(SCENES.game)),
      note('Projectiles, bonus, interface et terrain. Les effets de particules se règlent dans la vue Particules.'),
      items.row,
      zoom.row,
      slider('Vitesse de l\'aperçu', { min: 0.1, max: 1, step: 0.05, get: () => this.slow, set: (v) => (this.slow = v), hint: '1 = vitesse réelle du jeu' }).row,
      this.info,
      line(checkbox('Fond sombre', false, (v) => this.cameras.main.setBackgroundColor(v ? 0x10161c : VIEW_BG))),
    );
    document.body.append(p);
    this.panel = p;
  }

  private readonly fit = (): void => {
    const cam = this.cameras.main;
    cam.setZoom(this.zoom);
    cam.centerOn(-(330 / 2) / this.zoom + 60, 0); // décalé pour laisser la place au panneau
  };

  private drawGrid(): void {
    const g = this.add.graphics().setDepth(DEPTH.ground - 3);
    g.lineStyle(1, 0xffffff, 0.05);
    for (let i = -40; i <= 40; i++) g.lineBetween(i * 50, -2000, i * 50, 2000).lineBetween(-2000, i * 50, 2000, i * 50);
  }
}
