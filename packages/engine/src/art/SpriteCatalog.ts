import type Phaser from 'phaser';

/**
 * Catalogue de sprites : le jeu demande un visuel par son id logique
 * ('soldier_medic', 'alien_crab'…) sans savoir d'où il vient — dessin
 * procédural, PNG isolé, planche en grille, atlas TexturePacker ou export Aseprite.
 *
 * Remplacer un visuel = déclarer une entrée dans le manifeste d'assets ; le code
 * du jeu ne change pas. Sans entrée, le dessin procédural (défaut) est utilisé.
 */
export interface SpriteDef {
  /** Clé de texture Phaser. */
  texture: string;
  /** Frame dans la texture (index de planche ou nom d'atlas). */
  frame?: string | number;
  /** Point d'ancrage en fraction de la frame (0.5, 0.95 = pieds). */
  originX?: number;
  originY?: number;
  /** Échelle d'affichage. */
  scale?: number;
  /** Le dessin regarde vers la gauche (par défaut : vers la droite). */
  facesLeft?: boolean;
  /** Recadrage (px de la frame) : x, y, largeur, hauteur. Ex. portrait = haut du corps. */
  crop?: [number, number, number, number];
  /** Ne pas afficher (ex. arme déjà dessinée dans la planche du soldat). */
  hidden?: boolean;
  /** Animations : nom logique ('idle', 'walk', 'shoot'…) → clé d'animation Phaser. */
  anims?: Record<string, string>;
}

export class SpriteCatalog {
  private readonly defs = new Map<string, SpriteDef>();

  /** Déclare (ou remplace) un visuel. */
  define(id: string, def: SpriteDef): void {
    this.defs.set(id, def);
  }

  /**
   * Valeurs par défaut (dessin procédural) : ne remplace pas une définition
   * existante, mais complète les champs qu'elle n'a pas précisés.
   */
  defaults(id: string, def: SpriteDef): void {
    const existing = this.defs.get(id);
    if (!existing) {
      this.defs.set(id, def);
      return;
    }
    const overridden = existing.texture !== def.texture;
    // Une planche fournie garde ses propres réglages ; on ne complète que l'ancrage si absent.
    this.defs.set(id, {
      ...existing,
      originX: existing.originX ?? def.originX,
      originY: existing.originY ?? def.originY,
      scale: existing.scale ?? (overridden ? 1 : def.scale),
    });
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  get(id: string): SpriteDef {
    return this.defs.get(id) ?? { texture: id };
  }

  /** Échelle de base du visuel (à multiplier par les effets de squash, pop…). */
  scaleOf(id: string): number {
    return this.get(id).scale ?? 1;
  }

  /** Crée un Sprite configuré (texture, frame, ancrage, échelle, recadrage). */
  add(scene: Phaser.Scene, id: string, x = 0, y = 0): Phaser.GameObjects.Sprite {
    const d = this.get(id);
    const s = scene.add.sprite(x, y, d.texture, d.frame);
    s.setOrigin(d.originX ?? 0.5, d.originY ?? 0.5).setScale(d.scale ?? 1);
    if (d.crop) s.setCrop(...d.crop);
    if (d.hidden) s.setVisible(false);
    return s;
  }

  /** Joue l'animation logique si elle existe. Retourne false sinon (le jeu garde son anim procédurale). */
  play(sprite: Phaser.GameObjects.Sprite, id: string, anim: string): boolean {
    const key = this.get(id).anims?.[anim];
    if (!key || !sprite.scene.anims.exists(key)) return false;
    sprite.play(key, true);
    return true;
  }

  hasAnim(id: string, anim: string): boolean {
    return !!this.get(id).anims?.[anim];
  }

  /**
   * Animation orientée selon une direction (dx, dy) : utilise `${base}_up|down|left|right`
   * si la planche les fournit, sinon `${base}_right` ou `base` retourné horizontalement.
   * Applique le flipX adéquat. Retourne false si aucune variante n'existe.
   */
  playDirectional(sprite: Phaser.GameObjects.Sprite, id: string, base: string, dx: number, dy: number): boolean {
    const vertical = Math.abs(dy) > Math.abs(dx) * 1.1;
    if (vertical) {
      const v = dy > 0 ? `${base}_down` : `${base}_up`;
      if (this.play(sprite, id, v)) {
        sprite.setFlipX(false);
        return true;
      }
    }
    const left = dx < 0;
    if (left && this.play(sprite, id, `${base}_left`)) {
      sprite.setFlipX(false);
      return true;
    }
    if (this.play(sprite, id, `${base}_right`) || this.play(sprite, id, base)) {
      sprite.setFlipX(this.flipFor(id, left ? -1 : 1));
      return true;
    }
    return false;
  }

  /** flipX à appliquer pour regarder dans la direction `facing` (1 = droite). */
  flipFor(id: string, facing: number): boolean {
    const left = facing < 0;
    return this.get(id).facesLeft ? !left : left;
  }
}

/** Catalogue global du jeu. */
export const sprites = new SpriteCatalog();
