import Phaser from 'phaser';
import { sprites, theme } from '@xiao/engine';
import { ACTIVE_CLASSES, CLASSES, type SoldierClassId } from '../data/classes';
import { PALETTE, REVIVE_RADIUS, REVIVE_TIME, SCENES, VIEW_BG } from '../config';
import { getName } from '../debugNames';
import { button, colorInput, header, line, note, panel, select } from '../dev/devUi';
import { saveToCode } from '../dev/devSave';
import { ScaleRef } from '../dev/scaleRef';
import { GLOBE_KINDS, GLOBE_TINTS, GLOBE_TINT_DEFAULTS, type GlobeKind } from '../art/globeTints';
import { clearGlobeKind, starTexture } from '../art/upgradeOrbs';
import { drawField, drawPickupSpot, drawReviveZone, GLOBE_LIFT, globeKind, makePowerUpIcon, POWERUP_INFO, RECRUIT_COLOR } from '../view/PickupViews';
import { TINT_SWATCHES } from './UpgradeViewerScene';
import { FX } from '../fxParams';
import type { PowerUpKind } from '../sim/entities';
import { ORB_SCALE, orbSize } from '../view/WorldView';

/**
 * Visionneuse « bonus » (dev uniquement) : les bonus ramassés par les soldats — recrues (une par classe) et power-ups (stimpack, aimant,
 * globes de soin / stase, roquettes). Vue d'observation : les recrues et les power-ups se règlent dans le code (art/recruits.ts,
 * view/PickupViews.ts), leurs effets dans la vue Particules.
 */
const COL_GAP = 150;
const ROW_GAP = 260;
/** Agrandissement commun à tous les bonus de cette vue (pour les lire) : les proportions sont celles du jeu (recrue et power-up de même taille). */
const VIEW_SCALE = 1.6;

interface Item {
  node: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
  phase: number;
  /** Décalage (monde) de l'étiquette sous l'élément. */
  dy?: number;
}

export class BonusViewerScene extends Phaser.Scene {
  private panel?: HTMLDivElement;
  private items: Item[] = [];
  /** Zones au sol (globes de soin / stase, réanimation) : redessinées à chaque frame (elles pulsent). */
  private ground?: Phaser.GameObjects.Graphics;
  private zones: { kind: 'heal' | 'stasis' | 'revive'; x: number; y: number }[] = [];
  /** Ronds colorés posés au sol sous les globes à ramasser (recrues : jaune ; power-ups : couleur de chaque bonus), comme en jeu. */
  private spots: { x: number; y: number; color: number; k: number }[] = [];
  private titles: { text: Phaser.GameObjects.Text; y: number }[] = [];
  /** Étoiles de couleur posées à côté des globes de power-up (aperçu de la teinte de l'étoile). */
  private stars: Phaser.GameObjects.Image[] = [];

  constructor() {
    super(SCENES.bonus);
  }

  /** Trooper de référence (échelle) + bouton pour le masquer. */
  private scaleRef?: ScaleRef;

  create(): void {
    this.scaleRef = new ScaleRef(this);
    this.cameras.main.setBackgroundColor(VIEW_BG);
    this.drawGrid();
    this.buildPanel();
    this.build();
    this.fit();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fit);
      this.panel?.remove();
      this.scaleRef?.destroy();
      this.items = [];
      this.titles = [];
    });
  }

  update(time: number): void {
    this.scaleRef?.place();
    const t = time / 1000;
    for (const it of this.items) it.node.y = it.y + Math.sin(t * 3 + it.phase) * 4;
    const g = this.ground;
    if (!g) return;
    g.clear();
    // rond au sol sous chaque globe (à l'échelle de l'affichage ; le globe, lui, flotte au-dessus)
    this.spots.forEach((s, i) => drawPickupSpot(g, s.x, s.y, s.color, t, i, 1, s.k));
    for (const z of this.zones) {
      if (z.kind === 'revive') drawReviveZone(g, z.x, z.y, REVIVE_RADIUS, (t % (REVIVE_TIME + 0.5)) / REVIVE_TIME > 1 ? 1 : (t % (REVIVE_TIME + 0.5)) / REVIVE_TIME, t);
      else drawField(g, z.kind, z.x, z.y, 70, 1, t);
    }
  }

  private label(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, { fontFamily: theme.font, fontSize: '13px', color: PALETTE.textDim, align: 'center' })
      .setOrigin(0.5, 0);
  }

  private sectionTitle(y: number, text: string): void {
    const t = this.add.text(0, y, text, { fontFamily: theme.font, fontSize: '18px', fontStyle: 'bold', color: '#ffd166' }).setOrigin(0.5, 1);
    this.titles.push({ text: t, y });
  }

  private build(): void {
    const classes = Object.keys(CLASSES) as SoldierClassId[];
    const kinds = Object.keys(POWERUP_INFO) as PowerUpKind[];
    const y0 = -1.5 * ROW_GAP;
    const y1 = -0.5 * ROW_GAP;
    const y2 = 0.5 * ROW_GAP;
    const y3 = 1.5 * ROW_GAP;
    this.sectionTitle(y0 - 70, 'Bonus recrue');
    this.sectionTitle(y1 - 70, 'Power-ups');
    this.sectionTitle(y2 - 70, "Globes d'XP");
    this.sectionTitle(y3 - 80, 'Zones au sol');

    classes.forEach((cls, c) => {
      const id = `recruit_${cls}`;
      const x = (c - (classes.length - 1) / 2) * COL_GAP;
      const img = sprites.add(this, id, x, y0).setScale(sprites.scaleOf(id) * VIEW_SCALE);
      const name = getName(`class_${cls}`, 'en') || cls;
      const inactive = ACTIVE_CLASSES.includes(cls) ? '' : '\n(inactif)';
      if (inactive) img.setAlpha(0.25);
      this.spots.push({ x, y: y0 + GLOBE_LIFT * FX.recruit.displayScale * VIEW_SCALE, color: RECRUIT_COLOR, k: VIEW_SCALE });
      this.items.push({ node: img, label: this.label(x, y0 + 40, `${name}\n${id}${inactive}`).setAlpha(inactive ? 0.25 : 1), x, y: y0, phase: c });
    });
    kinds.forEach((kind, c) => {
      const x = (c - (kinds.length - 1) / 2) * COL_GAP;
      const box = makePowerUpIcon(this, kind).setPosition(x, y1).setScale(VIEW_SCALE);
      this.spots.push({ x, y: y1 + GLOBE_LIFT * FX.recruit.displayScale * VIEW_SCALE, color: POWERUP_INFO[kind].color, k: VIEW_SCALE });
      const name = getName(`pu_${kind}`, 'en') || kind;
      this.items.push({ node: box, label: this.label(x, y1 + 40, `${name}\npu_${kind}`), x, y: y1, phase: c });
      const starKey = starTexture(this, globeKind(kind));
      if (starKey) {
        const star = this.add.image(x + 46, y1 - 34, starKey).setBlendMode(Phaser.BlendModes.ADD);
        this.stars.push(star.setScale(26 / star.width));
      }
    });

    // globes d'XP : trois tailles selon la valeur, comme WorldView.syncOrbs
    const orbTex = 'xp_orb';
    const orbBase = 32 / this.textures.get(orbTex).getSourceImage().width;
    const orbs = [{ value: 1, name: 'Petit' }, { value: 3, name: 'Moyen' }, { value: 8, name: 'Gros' }];
    orbs.forEach((o, c) => {
      const x = (c - (orbs.length - 1) / 2) * COL_GAP;
      const img = this.add.image(x, y2, orbTex).setScale(orbSize(o.value) * ORB_SCALE * orbBase * VIEW_SCALE);
      this.items.push({ node: img, label: this.label(x, y2 + 40, `${o.name}
xp_orb (valeur ${o.value})`), x, y: y2, phase: c });
    });

    // zones au sol : globes persistants (soin, stase) et zone de réanimation, dessinées comme en jeu (rayon réduit pour tenir dans la grille)
    this.ground = this.add.graphics().setDepth(-0.5); // sous les globes et les sprites (la grille de fond est à -1), comme les ronds au sol en jeu
    const zones = [
      { kind: 'heal' as const, name: 'Healing field', id: 'field_heal' },
      { kind: 'stasis' as const, name: 'Stasis field', id: 'field_stasis' },
      { kind: 'revive' as const, name: 'Revive zone', id: 'revive_zone' },
    ];
    zones.forEach((z, c) => {
      const x = (c - (zones.length - 1) / 2) * COL_GAP * 1.4;
      this.zones.push({ kind: z.kind, x, y: y3 });
      this.items.push({ node: this.add.container(x, y3), label: this.label(x, y3 + 70, `${z.name}
${z.id}`), x, y: y3, phase: 0, dy: 70 });
    });
  }

  /** Zoom adapté à la largeur de la fenêtre ; étiquettes de taille constante à l'écran. */
  private readonly fit = (): void => {
    const cam = this.cameras.main;
    const cols = Math.max(Object.keys(CLASSES).length, Object.keys(POWERUP_INFO).length);
    const zoom = Math.min(1, (this.scale.width - 340) / (cols * COL_GAP), (this.scale.height - 80) / (3 * ROW_GAP + 240));
    cam.setZoom(zoom);
    for (const it of this.items) it.label.setScale(1 / zoom).setY(it.y + (it.dy ?? 40) / zoom);
    for (const t of this.titles) t.text.setScale(1 / zoom);
    cam.centerOn(-(300 / 2) / zoom, 0); // décalé pour laisser la place au panneau
  };

  private drawGrid(): void {
    const g = this.add.graphics().setDepth(-1);
    g.lineStyle(1, 0xffffff, 0.06);
    for (let i = -40; i <= 40; i++) g.lineBetween(i * 50, -2000, i * 50, 2000).lineBetween(-2000, i * 50, 2000, i * 50);
  }

  /** Défait les objets de la vue et la remonte (teinte d'un globe modifiée : les textures du globe et de l'étoile sont refaites au besoin). */
  private rebuild(kinds: readonly GlobeKind[]): void {
    for (const it of this.items) {
      it.node.destroy();
      it.label.destroy();
    }
    for (const s of this.stars) s.destroy();
    for (const t of this.titles) t.text.destroy();
    this.ground?.destroy();
    this.items = [];
    this.stars = [];
    this.titles = [];
    this.spots = [];
    this.zones = [];
    for (const k of kinds) clearGlobeKind(this, k);
    this.build();
    this.fit();
  }

  private buildPanel(): void {
    const p = panel(290);
    // Teinte des globes : l'or de la recrue est recoloré à cette couleur (globe, anneau et étoile), qui est aussi celle du rond au sol, de l'onde et des éclats. Save écrit art/globeTints.ts.
    let kind: GlobeKind = 'stim';
    const hexOf = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
    const info = document.createElement('div');
    info.style.cssText = 'font-size:12px;color:#9fe;white-space:pre-wrap';
    const picker = select('Globe', GLOBE_KINDS.map((k): [string, string] => [k, k === 'upgrade' ? 'upgrade (globe d’upgrade, relance)' : k]));
    const hex = document.createElement('input');
    hex.type = 'text';
    hex.maxLength = 7;
    hex.style.cssText = 'width:72px;font:12px monospace';
    const apply = (c: number): void => {
      GLOBE_TINTS[kind] = c;
      this.rebuild([kind]);
      col.sync();
    };
    const col = colorInput('Teinte du globe', () => GLOBE_TINTS[kind], apply);
    const syncColor = col.sync;
    col.sync = (): void => {
      syncColor();
      hex.value = hexOf(GLOBE_TINTS[kind]);
    };
    hex.addEventListener('change', () => {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex.value.trim());
      if (m) apply(parseInt(m[1], 16));
      else col.sync();
    });
    col.row.append(hex);
    col.sync();
    picker.select.addEventListener('change', () => {
      kind = picker.select.value as GlobeKind;
      col.sync();
    });
    const swatches = document.createElement('div');
    swatches.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';
    for (const [name, c] of TINT_SWATCHES) {
      const b = document.createElement('button');
      b.title = `${name} ${hexOf(c)}`;
      b.style.cssText = `width:24px;height:24px;border:1px solid #fff8;border-radius:4px;cursor:pointer;background:${hexOf(c)}`;
      b.addEventListener('click', () => apply(c));
      swatches.append(b);
    }
    p.append(
      header('Visionneuse de bonus', () => this.scene.start(SCENES.game)),
      note("Bonus ramassés par les soldats : recrues (une par classe), power-ups et globes d'XP. Vue d'observation."),
      note("Teinte des globes : l'or de la recrue est recoloré au lancement (globe, anneau, étoile) ; la même couleur sert au rond au sol, à l'onde et aux éclats. Save écrit art/globeTints.ts."),
      line(
        button('Save', () => void saveToCode('globetints', { ...GLOBE_TINTS }).then((msg) => {
          info.textContent = msg;
          if (msg.startsWith('✔')) Object.assign(GLOBE_TINT_DEFAULTS, GLOBE_TINTS);
        })),
        button('Reset', () => {
          Object.assign(GLOBE_TINTS, GLOBE_TINT_DEFAULTS);
          this.rebuild(GLOBE_KINDS);
          col.sync();
          info.textContent = 'Retour à la dernière sauvegarde.';
        }),
      ),
      info,
      picker.row,
      col.row,
      swatches,
    );
    document.body.append(p);
    this.panel = p;
  }
}
