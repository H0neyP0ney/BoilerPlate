import Phaser from 'phaser';
import { sprites } from '@xiao/engine';
import { SCENES, VISUAL } from '../config';
import { fxSnippet, resetFx, saveFxToCode, setFx } from '../debugFx';
import { button, checkbox, colorInput, header, heading, line, note, panel, select, slider } from '../dev/devUi';
import { FX, type FxName, type FxParams } from '../fxParams';
import { Fx } from '../view/Fx';
import { RecruitView } from '../view/UnitViews';
import { makeRecruitTextures } from '../art/recruits';
import { CLASSES } from '../data/classes';

/**
 * Visionneuse de particules (dev uniquement) : joue chaque effet du jeu et permet d'en régler les paramètres
 * en direct. Les réglages sont mémorisés dans le navigateur (debugFx.ts) et s'appliquent au jeu ; « Copier le code »
 * donne le bloc à coller dans FX_DEFAULTS (fxParams.ts).
 * Un clic sur la scène rejoue l'effet à cet endroit.
 */
interface Spec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  color?: boolean;
  hint?: string;
}

interface EffectDef {
  id: FxName;
  label: string;
  where: string;
  specs: Spec[];
}

const EFFECTS: EffectDef[] = [
  {
    id: 'burst',
    label: 'Éclaboussure (touche, mort, recrutement)',
    where: 'Touche du boss, mort d\'un alien / soldat, recrutement ; teinte = couleur de l\'unité.',
    specs: [
      { key: 'countMul', label: 'Quantité (×)', min: 0.1, max: 4, step: 0.05, hint: 'Multiplie le nombre de particules demandé par chaque événement' },
      { key: 'speedMin', label: 'Vitesse min', min: 0, max: 500, step: 5 },
      { key: 'speedMax', label: 'Vitesse max', min: 0, max: 700, step: 5 },
      { key: 'scaleStart', label: 'Taille au départ', min: 0, max: 3, step: 0.05 },
      { key: 'scaleEnd', label: 'Taille à la fin', min: 0, max: 3, step: 0.05 },
      { key: 'lifeMin', label: 'Durée min (ms)', min: 50, max: 1500, step: 10 },
      { key: 'lifeMax', label: 'Durée max (ms)', min: 50, max: 2000, step: 10 },
    ],
  },
  {
    id: 'explosion',
    label: 'Explosion (flammes + onde)',
    where: 'Grenade, mort du Flammeur, mort du boss ; la taille de l\'onde vient de l\'événement.',
    specs: [
      { key: 'count', label: 'Particules', min: 1, max: 100, step: 1 },
      { key: 'speedMin', label: 'Vitesse min', min: 0, max: 500, step: 5 },
      { key: 'speedMax', label: 'Vitesse max', min: 0, max: 700, step: 5 },
      { key: 'scaleStart', label: 'Taille au départ', min: 0, max: 4, step: 0.05 },
      { key: 'scaleEnd', label: 'Taille à la fin', min: 0, max: 4, step: 0.05 },
      { key: 'alphaStart', label: 'Opacité au départ', min: 0, max: 1, step: 0.05 },
      { key: 'alphaEnd', label: 'Opacité à la fin', min: 0, max: 1, step: 0.05 },
      { key: 'lifeMin', label: 'Durée min (ms)', min: 50, max: 1500, step: 10 },
      { key: 'lifeMax', label: 'Durée max (ms)', min: 50, max: 2000, step: 10 },
      { key: 'ringColor', label: "Couleur de l'onde", min: 0, max: 0, step: 1, color: true },
      { key: 'shakeAmount', label: 'Secousse (amplitude)', min: 0, max: 0.03, step: 0.001, hint: '0 = pas de secousse' },
      { key: 'shakeMs', label: 'Secousse (ms)', min: 0, max: 800, step: 10 },
    ],
  },
  {
    id: 'ring',
    label: 'Onde de choc au sol',
    where: 'Explosion, slam du crabe, recrutement, apparition de squad ; couleur et rayon viennent de l\'événement.',
    specs: [
      { key: 'durationMs', label: 'Durée (ms)', min: 50, max: 1500, step: 10 },
      { key: 'startScaleX', label: 'Taille de départ X', min: 0, max: 1, step: 0.01 },
      { key: 'startScaleY', label: 'Taille de départ Y', min: 0, max: 1, step: 0.01 },
      { key: 'alpha', label: 'Opacité de départ', min: 0, max: 1, step: 0.05 },
      { key: 'squash', label: 'Aplatissement (Y / X)', min: 0.2, max: 1.2, step: 0.05, hint: '1 = cercle, < 1 = ellipse couchée (vue de dessus)' },
    ],
  },
  {
    id: 'heal',
    label: 'Soin (+ qui monte)',
    where: 'Soin du Medic, sur chaque soldat soigné.',
    specs: [
      { key: 'rise', label: 'Montée (px)', min: 0, max: 120, step: 1 },
      { key: 'durationMs', label: 'Durée (ms)', min: 100, max: 2000, step: 10 },
      { key: 'jitter', label: 'Dispersion X (px)', min: 0, max: 40, step: 1 },
    ],
  },
  {
    id: 'text',
    label: 'Texte flottant',
    where: '« +1 Gunner ! » au recrutement, « BOSS DOWN! ».',
    specs: [
      { key: 'popFrom', label: "Taille d'apparition", min: 0, max: 1.5, step: 0.05 },
      { key: 'popMs', label: 'Apparition (ms)', min: 0, max: 600, step: 10 },
      { key: 'holdMs', label: 'Pause avant de monter (ms)', min: 0, max: 2000, step: 10 },
      { key: 'fadeMs', label: 'Disparition (ms)', min: 50, max: 2000, step: 10 },
      { key: 'rise', label: 'Montée (px)', min: 0, max: 150, step: 1 },
    ],
  },
  {
    id: 'recruit',
    label: 'Recrue gunner (bonus +1)',
    where: "Recrue à ramasser : globe, anneau, tête et « +1 » assemblés en une image (art/recruits.ts), plus les étoiles qui scintillent autour. Position = part de la taille du globe, depuis son centre.",
    specs: [
      { key: 'displayScale', label: 'Taille affichée', min: 0.1, max: 1, step: 0.01, hint: "0,34 ≈ 55 px de globe à l'écran (zoom 1)" },
      { key: 'globeScale', label: 'Globe : taille', min: 0.3, max: 1.3, step: 0.01 },
      { key: 'globeAlpha', label: 'Globe : opacité', min: 0, max: 1, step: 0.05 },
      { key: 'ringScale', label: 'Anneau : taille', min: 0.3, max: 1.3, step: 0.01 },
      { key: 'ringAlpha', label: 'Anneau : opacité', min: 0, max: 1, step: 0.05 },
      { key: 'headX', label: 'Tête : position X', min: -0.5, max: 0.5, step: 0.01 },
      { key: 'headY', label: 'Tête : position Y', min: -0.5, max: 0.5, step: 0.01 },
      { key: 'headScale', label: 'Tête : taille', min: 0.1, max: 1.2, step: 0.01 },
      { key: 'plusX', label: '+1 : position X', min: -0.5, max: 0.5, step: 0.01 },
      { key: 'plusY', label: '+1 : position Y', min: -0.5, max: 0.5, step: 0.01 },
      { key: 'plusScale', label: '+1 : taille', min: 0.1, max: 1, step: 0.01 },
      { key: 'starEvery', label: 'Étoiles : une toutes les (ms)', min: 30, max: 1000, step: 10 },
      { key: 'starLifeMin', label: 'Étoiles : durée min (ms)', min: 100, max: 2000, step: 10 },
      { key: 'starLifeMax', label: 'Étoiles : durée max (ms)', min: 100, max: 3000, step: 10 },
      { key: 'starRadius', label: 'Étoiles : rayon de la zone (px)', min: 0, max: 80, step: 1 },
      { key: 'starScale', label: 'Étoiles : taille', min: 0.05, max: 1, step: 0.01 },
      { key: 'starRise', label: 'Étoiles : montée (px/s)', min: 0, max: 80, step: 1 },
      { key: 'starY', label: 'Étoiles : position Y (px)', min: -60, max: 60, step: 1, hint: 'Décalage vertical de la zone des étoiles par rapport au centre du globe (négatif = plus haut)' },
    ],
  },
];

const ZOOMS = [1, 1.5, 2, 3];

export class ParticleViewerScene extends Phaser.Scene {
  private fx!: Fx;
  private effect: EffectDef = EFFECTS[0];
  private zoom = 1.5;
  private panel?: HTMLDivElement;
  private paramBox!: HTMLDivElement;
  private info!: HTMLDivElement;
  private syncs: (() => void)[] = [];
  private loopTimer?: Phaser.Time.TimerEvent;
  private ground?: Phaser.GameObjects.TileSprite;
  /** Gunner de référence pour l'échelle (masquable). */
  private gunner?: Phaser.GameObjects.Sprite;
  // réglages d'aperçu (pas ceux du jeu)
  private tint = 0xe84a4a;
  private burstCount = 14;
  private radius = 100;
  private ringColor = 0xff6a6a;
  private shakePreview = true;
  /** Aperçu de la recrue gunner composée (effet « recruit »). */
  private recruit?: RecruitView;
  private recruitAt = { x: 0, y: 0 };

  constructor() {
    super(SCENES.particles);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x2b3a2e);
    this.fx = new Fx(this);
    this.buildPanel();
    this.setBackground(true);
    if (this.textures.exists('soldier_gunner')) {
      this.gunner = sprites.add(this, 'soldier_gunner', 190, 40).setDepth(5);
      sprites.play(this.gunner, 'soldier_gunner', 'idle');
    }
    this.selectEffect(this.effect);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.play(p.worldX, p.worldY));
    this.input.keyboard!.on('keydown-SPACE', () => this.play(0, 0));
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fit);
      this.panel?.remove();
      this.loopTimer?.remove();
      this.recruit?.destroy();
    });
    this.fit();
  }

  // ---------- Lecture ----------

  /** Joue l'effet courant en (x, y) ; (0, 0) = centre de la scène. */
  private play(x = 0, y = 0): void {
    switch (this.effect.id) {
      case 'burst':
        this.fx.burst(x, y - 20, this.tint, this.burstCount);
        break;
      case 'explosion':
        this.fx.explosion(x, y, this.radius, this.shakePreview);
        break;
      case 'ring':
        this.fx.ring(x, y, this.radius, this.ringColor);
        break;
      case 'heal':
        for (let i = 0; i < 4; i++) this.time.delayedCall(i * 120, () => this.fx.heal(x + (i - 1.5) * 18, y));
        break;
      case 'text':
        this.fx.text(x, y - 20, '+1 Gunner !', '#ffe066', 24);
        break;
      case 'recruit':
        this.showRecruit(x, y);
        break;
    }
  }

  /** (Re)crée l'aperçu de la recrue en (x, y), avec les réglages courants (texture redessinée, étoiles recréées). */
  private showRecruit(x: number, y: number): void {
    this.recruit?.destroy();
    this.recruitAt = { x, y };
    makeRecruitTextures(this);
    const state = { id: 1, cls: 'gunner' as const, x, y, px: x, py: y, life: 1e9 };
    this.recruit = new RecruitView(this, state, CLASSES.gunner.color);
  }

  update(time: number): void {
    this.recruit?.sync(1, time / 1000);
  }

  private setLoop(on: boolean): void {
    this.loopTimer?.remove();
    this.loopTimer = on ? this.time.addEvent({ delay: 1400, loop: true, callback: () => this.play(0, 0) }) : undefined;
  }

  // ---------- Interface ----------

  private selectEffect(e: EffectDef): void {
    this.effect = e;
    if (e.id !== 'recruit') {
      this.recruit?.destroy();
      this.recruit = undefined;
    }
    this.paramBox.replaceChildren();
    this.syncs = [];
    this.paramBox.append(note(e.where));

    // réglages d'aperçu propres à l'effet (non enregistrés : ce sont ceux de l'événement en jeu)
    if (e.id === 'burst') {
      this.paramBox.append(
        colorInput('Teinte (aperçu)', () => this.tint, (v) => (this.tint = v)).row,
        slider('Particules demandées (aperçu)', { min: 1, max: 60, step: 1, get: () => this.burstCount, set: (v) => (this.burstCount = v), hint: '10 touche, 14 mort de soldat, 16 recrutement, 40 boss' }).row,
      );
    }
    if (e.id === 'explosion' || e.id === 'ring') {
      this.paramBox.append(
        slider('Rayon (aperçu)', { min: 30, max: 260, step: 5, get: () => this.radius, set: (v) => (this.radius = v), hint: '70 grenade, 120 mort du Flammeur, 160 boss' }).row,
      );
    }
    if (e.id === 'ring') this.paramBox.append(colorInput('Couleur (aperçu)', () => this.ringColor, (v) => (this.ringColor = v)).row);
    if (e.id === 'explosion') this.paramBox.append(checkbox("Secousse d'écran dans l'aperçu", this.shakePreview, (v) => (this.shakePreview = v)));

    this.paramBox.append(heading('Réglages de l\'effet (appliqués au jeu)'));
    const block = FX[e.id] as Record<string, number>;
    for (const s of e.specs) {
      const get = () => block[s.key];
      const set = (v: number) => {
        setFx(e.id, s.key as keyof FxParams[typeof e.id], v);
        if (e.id === 'burst' || e.id === 'explosion') this.fx.build(); // émetteurs recréés avec les nouvelles valeurs
        if (e.id === 'recruit') this.showRecruit(this.recruitAt.x, this.recruitAt.y); // image redessinée, étoiles recréées
      };
      const c = s.color ? colorInput(s.label, get, (v) => set(v)) : slider(s.label, { min: s.min, max: s.max, step: s.step, get, set, hint: s.hint });
      this.syncs.push(c.sync);
      this.paramBox.append(c.row);
    }
    this.play(0, 0);
  }

  private buildPanel(): void {
    const p = panel(310);
    const effects = select('Effet', EFFECTS.map((e) => [e.id, e.label] as [string, string]));
    effects.select.addEventListener('change', () => this.selectEffect(EFFECTS.find((e) => e.id === effects.select.value)!));

    const zoom = select('Zoom', ZOOMS.map((z) => [String(z), `${z * 100} %`] as [string, string]));
    zoom.select.value = String(this.zoom);
    zoom.select.addEventListener('change', () => {
      this.zoom = Number(zoom.select.value);
      this.fit();
    });

    this.paramBox = document.createElement('div');
    this.paramBox.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    this.info = document.createElement('div');
    this.info.style.cssText = 'font-size:12px;color:#9fe;white-space:pre-wrap';

    p.append(
      header('Visionneuse de particules', () => this.scene.start(SCENES.game)),
      note('Clic sur la scène ou Espace : rejoue l\'effet (au clic : à cet endroit).'),
      effects.row,
      line(
        button('▶ Jouer', () => this.play(0, 0)),
        checkbox('En boucle', false, (v) => this.setLoop(v)),
        checkbox('Sol du jeu', true, (v) => this.setBackground(v)),
      ),
      checkbox('Afficher un Gunner (échelle)', true, (v) => this.gunner?.setVisible(v)),
      zoom.row,
      this.paramBox,
      heading('Divers'),
      line(
        button('Copier le code', () => {
          const code = fxSnippet(this.effect.id);
          void navigator.clipboard?.writeText(code).catch(() => {});
          this.info.textContent = `Copié — à coller dans FX_DEFAULTS (fxParams.ts) :\n${code}`;
        }),
        button('Save', () => void saveFxToCode().then((msg) => (this.info.textContent = `${msg}\n(tous les effets sont enregistrés)`))),
        button('Reset', () => {
          resetFx(this.effect.id);
          this.fx.build();
          if (this.effect.id === 'recruit') this.showRecruit(this.recruitAt.x, this.recruitAt.y);
          for (const s of this.syncs) s();
          this.info.textContent = "Retour à la dernière sauvegarde (cet effet).";
        }),
      ),
      this.info,
    );
    document.body.append(p);
    this.panel = p;
  }

  private setBackground(on: boolean): void {
    this.ground?.destroy();
    this.ground = undefined;
    if (on && this.textures.exists('ground_tile')) {
      this.ground = this.add.tileSprite(0, 0, 4000, 4000, 'ground_tile').setOrigin(0.5).setTileScale(VISUAL.groundScale).setDepth(-2);
    }
  }

  private readonly fit = (): void => {
    const cam = this.cameras.main;
    cam.setZoom(this.zoom);
    cam.centerOn(-(330 / 2) / this.zoom + 60, 0); // décalé pour laisser la place au panneau
  };
}
