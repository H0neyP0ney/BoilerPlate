import Phaser from 'phaser';

/** Nombre d'étincelles en croix semées sur la carte, et distance (fraction de la largeur) à laquelle la lumière les allume. */
const SPARKS = 16;
const SPARK_REACH = 0.55;
/** Inclinaison (rad) des bandes de lumière. */
const BAND_TILT = 0.62;

let counter = 0;

/**
 * Lumière de la carte prismatique « hologramme » : bandes de lumière blanche, halo et étincelles qui suivent un point de lumière (le curseur au survol, une
 * promenade lente au repos). Elles ne sont plus dans la texture de la carte (`holoCard` de `art/cardPixels.ts`) mais dessinées ici, image par image, dans une
 * texture dynamique de la taille de la carte (× `SUPERSAMPLE` de `CardTilt`), dont on efface ce qui dépasse de la silhouette de la carte (coins arrondis, cadre).
 * La texture est ensuite affichée par `CardTilt` en voile additif, à plat ou en perspective sur le maillage de la carte inclinée.
 */
export class HoloLight {
  readonly key: string;
  private readonly tex: Phaser.Textures.DynamicTexture;
  private readonly maskKey: string;
  private readonly mask: Phaser.GameObjects.Image;
  private readonly bands: Phaser.GameObjects.Image[] = [];
  private readonly glow: Phaser.GameObjects.Image;
  private readonly sparks: { img: Phaser.GameObjects.Image; x: number; y: number; phase: number; size: number }[] = [];

  /** `silhouette` : image de la carte (son canal alpha donne la forme) ; `w`, `h` : taille de la texture en pixels. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly w: number,
    private readonly h: number,
    silhouette: CanvasImageSource,
    /** Seulement le halo (reflet des cartes normales au survol) : ni bandes ni étincelles. */
    private readonly glowOnly = false,
  ) {
    const id = counter++;
    this.key = `holo_light_${id}`;
    this.maskKey = `holo_mask_${id}`;
    this.tex = scene.textures.addDynamicTexture(this.key, w, h, false)!;
    // masque : blanc partout SAUF où la carte est opaque ; effacé sur la lumière, il la coupe aux bords de la carte
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(silhouette, 0, 0, w, h);
    scene.textures.addCanvas(this.maskKey, cv);
    const mk = (key: string): Phaser.GameObjects.Image => new Phaser.GameObjects.Image(scene, 0, 0, key); // hors de la liste d'affichage : seulement dessiné dans la texture
    this.mask = mk(this.maskKey).setDisplaySize(w, h).setPosition(w / 2, h / 2);
    for (let i = 0; i < 2; i++) this.bands.push(mk('fx_holo_band'));
    this.glow = mk('fx_glow');
    // étincelles : positions fixes (graine fixe), sur le corps de la carte
    let seed = 12345;
    const rnd = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let n = 0; n < SPARKS; n++) {
      this.sparks.push({ img: mk('fx_star'), x: 0.12 + rnd() * 0.76, y: 0.1 + rnd() * 0.8, phase: rnd() * Math.PI * 2, size: 0.05 + rnd() * 0.05 });
    }
  }

  /**
   * Redessine la lumière. (`lx`, `ly`) : point de lumière sur la carte (−1 → 1) ; `strength` (0 → 1) : intensité (pleine au survol, douce au repos) ;
   * `time` : secondes (scintillement des étincelles).
   */
  render(lx: number, ly: number, strength: number, time: number): void {
    const { w, h, tex } = this;
    tex.clear();
    const cx = (lx * 0.5 + 0.5) * w;
    const cy = (ly * 0.5 + 0.5) * h;
    // deux bandes parallèles de part et d'autre du point de lumière : la principale (large) puis une fine
    const perp = { x: Math.cos(BAND_TILT), y: Math.sin(BAND_TILT) }; // direction perpendiculaire à la bande (la bande est verticale puis inclinée)
    const spec = [
      { off: 0, wide: 0.3, a: 0.5 },
      { off: 0.24, wide: 0.08, a: 0.36 },
    ];
    if (this.glowOnly) {
      this.glow.setPosition(cx, cy).setDisplaySize(w * 0.9, w * 0.9).setAlpha(0.3 * strength);
      tex.draw(this.glow);
      tex.erase(this.mask); // le reflet reste sur la carte
      tex.render();
      return;
    }
    this.bands.forEach((b, i) => {
      const s = spec[i];
      b.setPosition(cx + perp.x * s.off * w, cy + perp.y * s.off * w)
        .setRotation(BAND_TILT)
        .setDisplaySize(s.wide * w, h * 2.2)
        .setAlpha(s.a * strength);
      tex.draw(b);
    });
    // halo doux autour du point de lumière
    this.glow.setPosition(cx, cy).setDisplaySize(w * 0.9, w * 0.9).setAlpha(0.35 * strength);
    tex.draw(this.glow);
    // étincelles : s'allument près du point de lumière et scintillent
    for (const sp of this.sparks) {
      const dx = sp.x * w - cx;
      const dy = sp.y * h - cy;
      const near = Math.max(0, 1 - Math.hypot(dx, dy) / (SPARK_REACH * w));
      const twinkle = 0.55 + 0.45 * Math.sin(time * 5 + sp.phase);
      sp.img
        .setPosition(sp.x * w, sp.y * h)
        .setDisplaySize(sp.size * w * (0.7 + 0.5 * twinkle), sp.size * w * (0.7 + 0.5 * twinkle))
        .setAlpha(Math.min(1, near * near * 1.6 * twinkle * strength));
      tex.draw(sp.img);
    }
    tex.erase(this.mask); // coupe la lumière hors de la carte
    tex.render();
  }

  destroy(): void {
    for (const o of [this.mask, this.glow, ...this.bands, ...this.sparks.map((s) => s.img)]) o.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    if (this.scene.textures.exists(this.maskKey)) this.scene.textures.remove(this.maskKey);
  }
}
