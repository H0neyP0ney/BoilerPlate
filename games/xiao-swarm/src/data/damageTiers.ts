/**
 * Paliers de dégâts : le tir du Gunner (blaster bleu) change de couleur quand le multiplicateur de dégâts de la squad (stat `damage`,
 * upgrades comprises) franchit un seuil. Un palier = un seuil (`min`, multiplicateur de dégâts), une texture de projectile (créée
 * dans `art/fx.ts` à partir de `glow` / `head`) et une couleur d'impact. Le premier palier est le tir d'origine (bleu) ; l'ordre
 * des seuils doit être croissant. Les textures voyagent dans le snapshot comme n'importe quel projectile (liste `TEXTURES`).
 */
export interface DamageTier {
  /** Multiplicateur de dégâts à partir duquel ce palier s'applique. */
  min: number;
  texture: string;
  /** Traînée (RGB 0-255) et tête (RGB 0-255) du projectile. */
  glow: [number, number, number];
  head: [number, number, number];
  /** Couleur de l'étincelle d'impact. */
  impact: number;
}

/** Texture de base de l'arme concernée (`weapon.texture` du Gunner) : seule elle change de couleur. */
export const TIERED_TEXTURE = 'fx_blaster_blue';

/**
 * bleu > vert > jaune > orangé > violet > rouge : un palier toutes les 2 prises de l'upgrade de dégâts (+15 % chacune, 10 prises max → ×2,5 :
 * 1, 1,3, 1,6, 1,9, 2,2, 2,5). Seuils légèrement sous la valeur exacte : le cumul de flottants (0,15 × 4…) ne doit pas faire rater un palier.
 */
export const DAMAGE_TIERS: DamageTier[] = [
  { min: 1, texture: 'fx_blaster_blue', glow: [60, 150, 255], head: [130, 205, 255], impact: 0x5ab4ff },
  { min: 1.29, texture: 'fx_blaster_green', glow: [60, 220, 110], head: [170, 255, 190], impact: 0x5aff8a },
  { min: 1.59, texture: 'fx_blaster_yellow', glow: [255, 235, 60], head: [255, 250, 170], impact: 0xffec3a },
  { min: 1.89, texture: 'fx_blaster_orange', glow: [255, 150, 40], head: [255, 210, 130], impact: 0xff9a3a },
  { min: 2.19, texture: 'fx_blaster_purple', glow: [170, 90, 255], head: [215, 170, 255], impact: 0xb06aff },
  { min: 2.49, texture: 'fx_blaster_red', glow: [255, 60, 60], head: [255, 160, 150], impact: 0xff4a4a },
];

/** Palier atteint pour ce multiplicateur de dégâts. */
export function damageTier(mult: number): DamageTier {
  let tier = DAMAGE_TIERS[0];
  for (const t of DAMAGE_TIERS) if (mult >= t.min) tier = t;
  return tier;
}

/** Texture du projectile d'un soldat : la couleur du palier pour le blaster bleu, la texture de l'arme sinon. */
export function projectileTexture(weaponTexture: string, damageMul: number): string {
  return weaponTexture === TIERED_TEXTURE ? damageTier(damageMul).texture : weaponTexture;
}

/** Palier d'une texture de projectile (impact, affichage), ou undefined si elle n'est pas à paliers. */
export function tierOfTexture(texture: string): DamageTier | undefined {
  return DAMAGE_TIERS.find((t) => t.texture === texture);
}
