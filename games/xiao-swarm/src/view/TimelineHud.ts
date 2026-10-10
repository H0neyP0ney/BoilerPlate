import Phaser from 'phaser';
import { sprites, theme } from '@xiao/engine';
import { ALIENS, type AlienId } from '../data/aliens';
import { entryTimes, nextBoss } from '../data/waves';
import { t } from '../i18n';
import type { Sim } from '../sim/Sim';
import { hudTop } from './hudLayout';

/**
 * Timeline des vagues + « Next boss » en haut de l'écran, avec l'habillage de `art-src/timeline_next_boss.png` (découpé par
 * `node tools/slice-timeline-ui.mjs` dans `public/assets/ui/timeline/`, déclaré dans `assets/manifest.ts`).
 *
 * Les mesures ci-dessous sont en pixels de la planche d'origine, relatives au coin haut gauche de l'image `frame` ; tout est ensuite mis à
 * l'échelle `u` (pixels d'écran par pixel de planche). Les images exportées sont réduites de `EXPORT` : elles s'affichent à `u / EXPORT`.
 */
export const TIMELINE_ART = {
  /** Réduction commune des images exportées (voir `tools/slice-timeline-ui.mjs`). */
  EXPORT: 0.8,
  /** Largeur du cadre complet (barre + capsule + disque) : c'est lui qui est centré à l'écran. */
  frameW: 991,
  /** Zone sombre de la barre (là où la jauge jaune et les crans s'affichent). */
  slot: { x0: 30, x1: 823, cy: 102, h: 38 },
  /** Cadre de la capsule « Next boss » (intérieur) : centre et largeur. */
  capsule: { cx: 743.5, cy: 41.5, w: 177 },
  /** Disque : centre du trou, diamètre de l'anneau, de l'icône du boss. */
  disc: { cx: 906, cy: 93, icon: 96 },
  /** Haut (pointe) de la flèche de position : elle mord un peu sur le bord bas du cadre. */
  arrowTop: 121,
  /** Largeur de la flèche de position (planche). */
  arrowW: 44,
  /** Décalage horizontal de la flèche (planche, < 0 : vers la gauche) pour que sa pointe vise le bout de la jauge jaune. */
  arrowDx: -10,
  /** Marge entre le bord de la zone sombre et la jauge jaune. */
  pad: 0,
  /** Coins du 9-slice de la jauge jaune (pixels de l'image exportée) : extrémités arrondies, bord haut / bas. */
  fillCap: { lr: 14, tb: 13 },
  /** Police du texte de la capsule (px de planche) et couleur du temps restant. */
  font: { size: 26, time: '#ffc247', timeGrow: 1.2 }, // timeGrow : le temps restant (jaune) est plus grand que « NEXT BOSS: »
};

const KEYS = {
  frame: 'ui_tl_frame',
  fill: 'ui_tl_fill',
  arrow: 'ui_tl_arrow',
  tickOff: 'ui_tl_tick_off',
  tickOn: 'ui_tl_tick_on',
  ring: 'ui_tl_ring',
} as const;
/** Texture canvas de la jauge circulaire : l'anneau découpé à l'angle courant (redessinée seulement quand l'angle change). */
const RING_LIVE = 'ui_tl_ring_live';
/** Échelle maximale (pixels d'écran par pixel de planche) : la barre fait alors ~390 px (0,58 réduit de 15 %). */
const U_MAX = 0.493;
/** La jauge jaune dépasse de la zone sombre de ce nombre de pixels d'écran à gauche et à droite. */
const FILL_GROW = 1;
/** Précision de l'angle de la jauge circulaire (pas par tour). */
const RING_STEPS = 360;

const ART = TIMELINE_ART;

/** Échelle d'affichage (pixels d'écran par pixel de planche) pour une largeur d'écran : le cadre complet doit tenir dans l'écran. */
const timelineScale = (width: number): number => Math.min(U_MAX, (width - 16) / ART.frameW);

/** Bas de la timeline (flèche de position comprise), en pixels d'écran : la barre de vie du boss se place dessous. */
export function timelineBottom(width: number): number {
  return hudTop() + 2 + (ART.arrowTop + (ART.arrowW * 43) / 50) * timelineScale(width);
}

export class TimelineHud {
  private readonly frame: Phaser.GameObjects.Image;
  private readonly fill: Phaser.GameObjects.NineSlice;
  private readonly arrow: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Image;
  private readonly ringCtx: CanvasRenderingContext2D;
  private readonly ringTex: Phaser.Textures.CanvasTexture;
  private readonly label: Phaser.GameObjects.Text;
  private readonly time: Phaser.GameObjects.Text;
  private readonly ticks: Phaser.GameObjects.Image[] = [];
  /** Icônes du disque : celle du prochain boss, ou les deux des rhinos jumeaux côte à côte. */
  private icons: Phaser.GameObjects.Sprite[] = [];
  private iconKey = '';
  private labelShown = '';
  private ringStep = -1;

  constructor(private readonly scene: Phaser.Scene) {
    const add = scene.add;
    this.frame = add.image(0, 0, KEYS.frame).setOrigin(0, 0).setDepth(0);
    this.fill = add.nineslice(0, 0, KEYS.fill, undefined, 60, scene.textures.get(KEYS.fill).getSourceImage().height, ART.fillCap.lr, ART.fillCap.lr, ART.fillCap.tb, ART.fillCap.tb).setOrigin(0, 0.5).setDepth(1);
    this.arrow = add.image(0, 0, KEYS.arrow).setOrigin(0.5, 0).setDepth(3);

    // jauge circulaire : un canvas de la taille de l'anneau, redessiné (anneau découpé en secteur) à chaque changement d'angle
    const src = scene.textures.get(KEYS.ring).getSourceImage() as CanvasImageSource & { width: number; height: number };
    const tex = scene.textures.exists(RING_LIVE) ? (scene.textures.get(RING_LIVE) as Phaser.Textures.CanvasTexture) : scene.textures.createCanvas(RING_LIVE, src.width, src.height);
    if (!tex) throw new Error('canvas indisponible');
    this.ringTex = tex;
    this.ringCtx = tex.getContext();
    this.ring = add.image(0, 0, RING_LIVE).setDepth(4);

    const style = { fontFamily: theme.font, fontSize: `${ART.font.size}px`, fontStyle: 'bold', stroke: '#0a1422', strokeThickness: 5 };
    this.label = add.text(0, 0, '', { ...style, color: '#ffffff' }).setOrigin(0, 0.5).setDepth(6);
    this.time = add.text(0, 0, '', { ...style, fontSize: `${ART.font.size * ART.font.timeGrow}px`, color: ART.font.time }).setOrigin(0, 0.5).setDepth(6);
    this.setVisible(false);
  }

  private setVisible(on: boolean): void {
    this.frame.setVisible(on);
    this.fill.setVisible(on);
    this.arrow.setVisible(on);
    this.ring.setVisible(on);
    this.label.setVisible(on);
    this.time.setVisible(on);
    for (const i of this.icons) i.setVisible(on);
    if (!on) for (const tk of this.ticks) tk.setVisible(false);
  }

  /** `hidden` : écran de fin ou onboarding (rien n'est affiché). */
  update(sim: Sim, hidden: boolean): void {
    const cursor = sim.waves.cursor; // position dans la timeline des vagues (suspendue / rejouée pendant un boss) : c'est elle qui mène au prochain boss
    const next = nextBoss(sim.mode.waves, cursor);
    if (!next || hidden) return this.setVisible(false);

    const { width } = this.scene.scale;
    const u = timelineScale(width);
    const k = u / ART.EXPORT; // échelle d'affichage des images exportées
    const x0 = (width - ART.frameW * u) / 2; // coin haut gauche du cadre : l'ensemble (barre, capsule, disque) est centré
    const y0 = hudTop() + 2;
    const slotL = x0 + ART.slot.x0 * u;
    const slotW = (ART.slot.x1 - ART.slot.x0) * u;
    const slotCy = y0 + ART.slot.cy * u;
    const discX = x0 + ART.disc.cx * u;
    const discY = y0 + ART.disc.cy * u;

    const bossAlive = sim.aliens.some((a) => a.alive && a.def.boss);
    const left = Math.max(0, next.at - cursor);
    // Compte à rebours caché pendant un combat de boss, sauf s'il reste moins d'une minute avant le suivant (la timeline, elle, reste).
    const showCountdown = !bossAlive || left < 60;
    const prev = sim.mode.waves.timeline.reduce((m, e) => (e.config !== undefined && e.at <= cursor ? Math.max(m, e.at) : m), 0);
    const span = Math.max(1, next.at - prev);
    const p = Math.max(0, Math.min(1, (cursor - prev) / span)); // avancement vers le prochain boss
    const final = ALIENS[next.type].boss?.kind === 'final';

    this.frame.setVisible(true).setPosition(x0, y0).setScale(k);

    // jauge jaune : toujours visible, elle démarre à sa largeur minimale (les deux extrémités arrondies) et atteint le bout de la zone sombre à p = 1 ;
    // la flèche est collée à son bout (donc jamais en avance sur la jauge)
    const fillL = slotL + ART.pad * u - FILL_GROW;
    const fillMax = slotW - 2 * ART.pad * u + 2 * FILL_GROW;
    const minW = 2 * ART.fillCap.lr * k;
    const fillW = minW + (fillMax - minW) * p;
    this.fill.setVisible(true).setScale(k).setPosition(fillL, slotCy).setSize(fillW / k, this.fill.height);
    if (final) this.fill.setTint(0xff7a7a);
    else this.fill.clearTint();
    const fillEnd = fillL + fillW;

    // crans de vague : gris à venir, blanc passés
    // (jamais deux crans collés : au moins 1 px d'écran de vide entre deux, quitte à en masquer)
    const times: number[] = [];
    for (const e of sim.mode.waves.timeline) {
      if (e.config !== undefined) continue;
      for (const at of entryTimes(e)) if (at > prev && at < next.at) times.push(at);
    }
    times.sort((x, y) => x - y);
    const tickW = this.scene.textures.get(KEYS.tickOff).getSourceImage().width * k;
    let n = 0;
    let lastX = -Infinity;
    for (const at of times) {
      const x = fillL + minW + (fillMax - minW) * ((at - prev) / span);
      if (x - lastX < tickW + 1) continue;
      lastX = x;
      const tick = this.tick(n++);
      tick.setTexture(at <= cursor ? KEYS.tickOn : KEYS.tickOff).setVisible(true).setScale(k).setPosition(x, slotCy);
    }
    for (let i = n; i < this.ticks.length; i++) this.ticks[i].setVisible(false);

    // flèche sur la position actuelle (sous la barre, pointe vers le haut)
    const arrowK = (ART.arrowW * u) / this.arrow.width;
    this.arrow.setVisible(true).setScale(arrowK).setPosition(fillEnd + ART.arrowDx * u, y0 + ART.arrowTop * u);

    // disque : icône du prochain boss ; la jauge circulaire se remplit jusqu'à son arrivée
    this.syncIcons(next.types, discX, discY, u);
    for (const i of this.icons) i.setVisible(true);
    this.ring.setVisible(showCountdown).setPosition(discX, discY).setScale(k);
    this.label.setVisible(showCountdown);
    this.time.setVisible(showCountdown);
    if (showCountdown) {
      const frac = Math.max(0, Math.min(1, 1 - left / span));
      const urgent = left < 10 && Math.sin(this.scene.time.now / 90) > 0;
      this.drawRing(frac);
      if (urgent) this.ring.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else this.ring.setTintMode(Phaser.TintModes.MULTIPLY).setTint(final ? 0xff6a6a : 0xffffff);

      const secs = Math.ceil(left);
      const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      if (clock !== this.labelShown) {
        this.labelShown = clock;
        this.label.setText(t('nextBoss')); // toujours « NEXT BOSS: », même pour le boss final
        this.time.setText(clock);
      }
      // « Next boss » (blanc) puis le temps (jaune), centrés dans la capsule ; réduits si la capsule est trop étroite
      const gap = ART.font.size * 0.3;
      const total = this.label.width + gap + this.time.width;
      const ts = Math.min(u, (ART.capsule.w * u * 0.92) / total);
      this.label.setScale(ts);
      this.time.setScale(ts);
      const tx = x0 + ART.capsule.cx * u - (total * ts) / 2;
      const ty = y0 + ART.capsule.cy * u;
      this.label.setPosition(tx, ty);
      this.time.setPosition(tx + (this.label.width + gap) * ts, ty);
    }
  }

  private tick(i: number): Phaser.GameObjects.Image {
    while (this.ticks.length <= i) this.ticks.push(this.scene.add.image(0, 0, KEYS.tickOff).setDepth(2));
    return this.ticks[i];
  }

  /** Dessine l'anneau découpé en secteur, de midi dans le sens des aiguilles d'une montre. */
  private drawRing(frac: number): void {
    const step = Math.round(frac * RING_STEPS);
    if (step === this.ringStep) return;
    this.ringStep = step;
    const ctx = this.ringCtx;
    const src = this.scene.textures.get(KEYS.ring).getSourceImage() as CanvasImageSource & { width: number; height: number };
    const c = src.width / 2;
    ctx.clearRect(0, 0, src.width, src.height);
    if (step > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, c, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * step) / RING_STEPS);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(src, 0, 0);
      ctx.restore();
    }
    this.ringTex.refresh();
  }

  /** Icônes animées du prochain boss au centre du disque (recréées quand le boss change) ; plusieurs boss (rhinos jumeaux) : côte à côte, plus petits. */
  private syncIcons(types: AlienId[], x: number, y: number, u: number): void {
    const key = types.join(',');
    if (this.iconKey !== key) {
      for (const i of this.icons) i.destroy();
      this.icons = types.map((type) => {
        const id = `alien_${type}`;
        const icon = sprites.add(this.scene, id, x, y);
        sprites.play(icon, id, 'idle');
        icon.setOrigin(0.5, 0.5).setDepth(5);
        const tint = ALIENS[type].tint;
        if (tint !== undefined) icon.setTint(tint);
        return icon;
      });
      this.iconKey = key;
    }
    const n = this.icons.length;
    const size = ART.disc.icon * u * (n > 1 ? 0.68 : 1); // chaque icône d'un duo est plus petite pour tenir dans le disque
    this.icons.forEach((icon, i) => {
      const dx = n > 1 ? (i - (n - 1) / 2) * ART.disc.icon * u * 0.34 : 0;
      icon.setPosition(x + dx, y + (n > 1 ? ART.disc.icon * u * 0.04 : 0)).setScale(size / Math.max(icon.width, icon.height));
    });
  }
}
