
/**
 * Paliers de dégâts : le tir du Gunner (blaster bleu) change de couleur quand le multiplicateur de dégâts de la squad (stat `damage`,
 * upgrades comprises) franchit un seuil. Un palier = un seuil (`min`, multiplicateur de dégâts), une texture de projectile (créée
 * dans `art/fx.ts` à partir de `glow` / `head`) et une couleur d'impact. Le premier palier est le tir d'origine (bleu) ; l'ordre
 * des seuils doit être croissant. Les textures voyagent dans le snapshot comme n'importe quel projectile (liste `TEXTURES`).
 */
export interface DamageTier {
  /** Seuil, en multiple des dégâts de base de la squad (1 = dégâts de la classe), à partir duquel ce palier s'applique. */
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
 * 7 paliers : bleu > vert > jaune > orangé > violet > rose > rouge, répartis linéairement de ×1 à ×3,5 (14/10 : le dernier palier était à ×4, le plafond théorique de la stat Damage :
 * 10 prises toutes prismatiques ; ×2,5 sans prismatique, voir Squad / progression.ts) : un palier tous les ×0,4167. Seuils légèrement sous la valeur exacte (−0,01) : le cumul de flottants ne doit pas faire rater un palier.
 */
export const DAMAGE_TIERS: DamageTier[] = [
  { min: 1, texture: 'fx_blaster_blue', glow: [60, 150, 255], head: [130, 205, 255], impact: 0x5ab4ff },
  { min: 1.41, texture: 'fx_blaster_green', glow: [60, 220, 110], head: [170, 255, 190], impact: 0x5aff8a },
  { min: 1.82, texture: 'fx_blaster_yellow', glow: [255, 235, 60], head: [255, 250, 170], impact: 0xffec3a },
  { min: 2.24, texture: 'fx_blaster_orange', glow: [255, 150, 40], head: [255, 210, 130], impact: 0xff9a3a },
  { min: 2.66, texture: 'fx_blaster_purple', glow: [170, 90, 255], head: [215, 170, 255], impact: 0xb06aff },
  { min: 3.07, texture: 'fx_blaster_pink', glow: [255, 90, 200], head: [255, 190, 235], impact: 0xff5ac8 },
  { min: 3.49, texture: 'fx_blaster_red', glow: [255, 60, 60], head: [255, 160, 150], impact: 0xff4a4a },
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

/** Taille du tir au dernier palier (rouge), en multiple de la taille d'origine (bleu = ×1) ; grossit régulièrement entre les deux. */
export const TIER_MAX_SCALE = 1.5;

/** Échelle d'affichage du tir d'un palier (×1 au premier, `TIER_MAX_SCALE` au dernier). Affichage seulement. */
export function tierScale(tier: DamageTier): number {
  const i = DAMAGE_TIERS.indexOf(tier);
  return 1 + ((TIER_MAX_SCALE - 1) * i) / (DAMAGE_TIERS.length - 1);
}

/** Palier d'une texture de projectile (impact, affichage), ou undefined si elle n'est pas à paliers. */
export function tierOfTexture(texture: string): DamageTier | undefined {
  return DAMAGE_TIERS.find((t) => t.texture === texture);
}
