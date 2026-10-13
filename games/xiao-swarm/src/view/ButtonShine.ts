import Phaser from 'phaser';

/** Réglages du reflet : le premier passe `first` ms après l'apparition, puis un toutes les `period` ms ; chaque passage dure `sweep` ms. */
export interface ShineOptions {
  period?: number;
  sweep?: number;
  first?: number;
  /** Opacité maximale du reflet (0 → 1). */
  alpha?: number;
}

/**
 * Reflet blanc qui traverse un bouton de gauche à droite, à intervalle régulier. Le reflet est découpé à la silhouette de l'image du bouton
 * (`sourceKey`, ses coins arrondis et sa transparence) : on dessine l'image dans un canvas, puis la bande blanche en « source-in ». Renvoie
 * l'image du reflet (même échelle que le bouton, à ajouter au même conteneur, au-dessus du fond) ; elle est invisible entre deux passages.
 */
export function createButtonShine(scene: Phaser.Scene, sourceKey: string, scale: number, opts: ShineOptions = {}): Phaser.GameObjects.Image {
  const { period = 3000, sweep = 550, first = 700, alpha = 0.85 } = opts;
  const src = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = src.width;
  const h = src.height;
  const key = `shine_${sourceKey}`;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  const image = scene.add.image(0, 0, key).setScale(scale).setVisible(false);
  if (!tex) return image; // canvas indisponible : pas de reflet
  const ctx = tex.getContext();

  const bandW = w * 0.2; // largeur de la bande
  const slant = h * 0.4; // inclinaison : la bande est un parallélogramme
  const draw = (p: number): void => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h); // la silhouette du bouton...
    ctx.globalCompositeOperation = 'source-in'; // ...ne garde que la bande, là où le bouton est opaque
    const x0 = -bandW - slant + p * (w + bandW + 2 * slant);
    const grad = ctx.createLinearGradient(x0, 0, x0 + bandW + slant, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x0 + slant, 0);
    ctx.lineTo(x0 + slant + bandW, 0);
    ctx.lineTo(x0 + bandW, h);
    ctx.lineTo(x0, h);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    tex.refresh();
  };

  const run = (): void => {
    if (!image.active) return;
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: sweep,
      ease: 'Sine.InOut',
      onStart: () => image.setVisible(true),
      onUpdate: (tw) => draw(tw.getValue() ?? 0),
      onComplete: () => image.setVisible(false),
    });
  };
  scene.time.addEvent({ delay: period, loop: true, startAt: Math.max(0, period - first), callback: run });
  image.once(Phaser.GameObjects.Events.DESTROY, () => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  });
  return image;
}
