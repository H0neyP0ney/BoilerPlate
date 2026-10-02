import type Phaser from 'phaser';
import { canvasTexture, sprites } from '@xiao/engine';
import { FX } from '../fxParams';

/**
 * Recrue « bonus +1 » assemblée à partir de pièces fournies (art-src/bonus_recrue → public/assets/recruit, déclarées dans
 * assets/manifest.ts) : globe doré, anneau lumineux, tête de la classe et « +1 » décalé en bas à droite. Une seule texture
 * `recruit_<classe>` est produite au chargement (et redessinée par la visionneuse de particules) ; les étoiles qui
 * scintillent autour sont des particules (view/UnitViews.ts). Réglages : `FX.recruit` (fxParams.ts).
 * Si une pièce manque, la recrue procédurale (art/soldiers.ts) reste utilisée.
 */

/** Texture d'étoile des particules de scintillement autour des recrues composées. */
export const RECRUIT_STAR = 'recruit_part_star';

/** Classes dont la recrue a son visuel composé (tête fournie dans public/assets/recruit). */
const HEADS: Record<string, string> = { trooper: 'recruit_part_gunner' };

/** Taille de référence du globe (px dans la texture) ; la texture a de la marge pour grossir les pièces. */
const GLOBE = 160;
const SIZE = 220;
/** Point d'ancrage (pieds) : sous le centre du globe, comme avant la marge (51 px sous le centre pour un globe de 160). */
const ORIGIN_Y = 0.5 + 51 / SIZE;

const composed = new Set<string>();

/** Vrai si la recrue de cette classe utilise le visuel composé (et donc les étoiles). */
export function hasComposedRecruit(_scene: Phaser.Scene, cls: string): boolean {
  return composed.has(`recruit_${cls}`);
}

/** Crée (ou redessine, `FX.recruit` modifié) les textures des recrues composées. */
export function makeRecruitTextures(scene: Phaser.Scene): void {
  const img = (key: string): HTMLImageElement | null =>
    scene.textures.exists(key) ? (scene.textures.get(key).getSourceImage() as HTMLImageElement) : null;
  const globe = img('recruit_part_globe');
  const ring = img('recruit_part_ring');
  const plus = img('recruit_part_plus_one');
  if (!globe || !ring || !plus) return;
  const r = FX.recruit;
  for (const [cls, headKey] of Object.entries(HEADS)) {
    const head = img(headKey);
    if (!head) continue;
    const key = `recruit_${cls}`;
    const paint = (ctx: CanvasRenderingContext2D): void => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      const c = SIZE / 2;
      const draw = (source: HTMLImageElement, dx: number, dy: number, scale: number, alpha = 1): void => {
        const w = GLOBE * scale;
        const h = (w * source.height) / source.width;
        ctx.globalAlpha = alpha;
        ctx.drawImage(source, c + dx * GLOBE - w / 2, c + dy * GLOBE - h / 2, w, h);
        ctx.globalAlpha = 1;
      };
      draw(globe, 0, 0, r.globeScale, r.globeAlpha);
      draw(ring, 0, 0, r.ringScale, r.ringAlpha); // même cadrage que le globe : l'anneau épouse son bord
      draw(head, r.headX, r.headY, r.headScale);
      draw(plus, r.plusX, r.plusY, r.plusScale); // « +1 » excentré en bas à droite
    };
    if (composed.has(key) && scene.textures.exists(key)) {
      const tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
      paint(tex.getContext());
      tex.refresh();
    } else {
      canvasTexture(scene, key, SIZE, SIZE, (ctx) => paint(ctx));
      composed.add(key);
    }
    // Défini avant registerDefaultSprites : ces réglages (ancrage, échelle) sont gardés.
    sprites.define(key, { texture: key, originX: 0.5, originY: ORIGIN_Y, scale: r.displayScale * (GLOBE / 160) });
  }
}
