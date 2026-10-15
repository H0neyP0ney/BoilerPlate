import type Phaser from 'phaser';
import { UPGRADES, type UpgradeId } from '../data/progression';

/**
 * Replis dessinés des images isolées du manifeste (interface, décor, effets) : tant que le fichier d'un paquet 2 n'est pas arrivé, une texture
 * SIMPLE (formes, une ou deux couleurs, pas de détail) de la MÊME taille que l'image porte déjà sa clé, donc la mise en page est déjà la bonne. À l'arrivée du
 * fichier, `swapInRealImages` redessine l'image dans cette même texture (même objet canvas : tout ce qui l'affiche ou la lit la voit changer, rien à rafraîchir).
 *
 * Pas concernés (autre mécanisme de repli, ou texture dont on dérive d'autres textures au lancement) : les critiques, les icônes de power-up (emoji), le globe d'XP,
 * la fusée, l'œuf, le sol, les pièces de la recrue, et `ui_card_base` / `ui_slot_empty` / `ui_slot_full` (sources des fonds de cartes : à garder au paquet 1).
 */
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const rounded = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
};

/** Cadre sombre à bord clair (cadres des barres, bouton). */
const frame = (fill: string, stroke: string): Draw => (ctx, w, h) => {
  rounded(ctx, 2, 2, w - 4, h - 4, h * 0.3);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = stroke;
  ctx.stroke();
};

/** Jauge pleine (images de 53 × 32 étirées en 3-slice). */
const bar = (color: string): Draw => (ctx, w, h) => {
  rounded(ctx, 0, 0, w, h, h / 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  rounded(ctx, 3, 3, w - 6, h * 0.35, h * 0.2);
  ctx.fill();
};

const blob = (fill: string, light: string, flat = 0.7): Draw => (ctx, w, h) => {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(w / 2, h * (1 - flat / 2) - 2, w / 2 - 2, (h * flat) / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(w * 0.45, h * 0.35, w * 0.28, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
};

const letter = (text: string, color = '#ffffff'): Draw => (ctx, w, h) => {
  ctx.font = `bold ${Math.round(h * 0.9)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + 1);
};

const glyph = (draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Draw => (ctx, w, h) => {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  draw(ctx, w, h);
};

/** Dimensions réelles des images (pixels) : les replis ont la même taille pour que l'affichage ne bouge pas à l'arrivée du fichier. */
const SIZES: Record<string, [number, number]> = {
  tache_1: [259, 232], tache_2: [259, 211], tache_3: [260, 237], tache_4: [235, 203],
  obstacle_1: [200, 179], obstacle_2: [161, 124], obstacle_3: [229, 196], obstacle_4: [191, 152],
  obstacle_5: [242, 305], obstacle_6: [260, 189], obstacle_7: [132, 109], obstacle_8: [111, 107],
  ui_hud_button: [102, 96], ui_hud_pause: [45, 51], ui_hud_sound: [56, 50], ui_hud_music: [49, 53],
  ui_key: [64, 59], ui_key_W: [25, 19], ui_key_A: [22, 19], ui_key_S: [18, 19], ui_key_D: [20, 19], ui_key_Z: [20, 19], ui_key_Q: [21, 21],
  ui_reroll: [259, 119], fx_star: [48, 48], ui_rewarded: [160, 139],
  ui_boss_frame: [500, 76], ui_boss_fill: [53, 32], ui_xp_frame: [600, 83], ui_xp_fill: [53, 32], ui_levelup_title: [326, 153],
  fx_wall_rock: [96, 86], fx_freezebot: [101, 87],
  ui_tl_frame: [793, 142], ui_tl_fill: [53, 32], ui_tl_arrow: [50, 43], ui_tl_tick_off: [8, 31], ui_tl_tick_on: [9, 31], ui_tl_ring: [122, 121],
  upgrade_icon_damage: [84, 83], upgrade_icon_fireRate: [86, 87], upgrade_icon_hp: [89, 74], upgrade_icon_range: [89, 90], upgrade_icon_crit: [97, 89],
  upgrade_icon_speed: [76, 76], upgrade_icon_maxSquad: [91, 89], upgrade_icon_magnet: [82, 72], upgrade_icon_recruit: [86, 85],
  upgrade_icon_xpGain: [88, 93], upgrade_icon_teamSpirit: [96, 83], upgrade_icon_lastStand: [91, 84],
};

const DRAWERS: Record<string, Draw> = {
  ui_hud_button: frame('#13233a', '#4a78c8'),
  ui_hud_pause: glyph((c, w, h) => {
    c.fillRect(w * 0.12, h * 0.08, w * 0.3, h * 0.84);
    c.fillRect(w * 0.58, h * 0.08, w * 0.3, h * 0.84);
  }),
  ui_hud_sound: glyph((c, w, h) => {
    c.fillRect(0, h * 0.35, w * 0.22, h * 0.3);
    c.beginPath();
    c.moveTo(w * 0.22, h * 0.35);
    c.lineTo(w * 0.55, h * 0.08);
    c.lineTo(w * 0.55, h * 0.92);
    c.lineTo(w * 0.22, h * 0.65);
    c.fill();
    c.lineWidth = 3;
    c.beginPath();
    c.arc(w * 0.55, h / 2, h * 0.28, -0.9, 0.9);
    c.stroke();
  }),
  ui_hud_music: glyph((c, w, h) => {
    c.beginPath();
    c.ellipse(w * 0.3, h * 0.78, w * 0.26, h * 0.16, 0, 0, Math.PI * 2);
    c.fill();
    c.fillRect(w * 0.5, h * 0.08, w * 0.12, h * 0.72);
    c.fillRect(w * 0.5, h * 0.08, w * 0.4, h * 0.14);
  }),
  ui_key: frame('#e8eef8', '#8aa0c0'),
  ui_reroll: frame('#3f6fe0', '#9fc0ff'),
  fx_star: (ctx, w, h) => {
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const r = i % 2 === 0 ? w / 2 : w * 0.14;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
    }
    ctx.fill();
  },
  ui_rewarded: (ctx, w, h) => {
    frame('#2a7a3a', '#a8ffb8')(ctx, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(w * 0.38, h * 0.28);
    ctx.lineTo(w * 0.7, h / 2);
    ctx.lineTo(w * 0.38, h * 0.72);
    ctx.fill();
  },
  ui_boss_frame: frame('#2a0f12', '#ff5a4a'),
  ui_boss_fill: bar('#e0352a'),
  ui_xp_frame: frame('#0f1c33', '#5a8fe0'),
  ui_xp_fill: bar('#3b9bff'),
  ui_tl_frame: frame('#0f1c33', '#e0b83a'),
  ui_tl_fill: bar('#ffd23a'),
  ui_tl_arrow: (ctx, w, h) => {
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath();
    ctx.moveTo(w / 2, h);
    ctx.lineTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.fill();
  },
  ui_tl_tick_off: (ctx, w, h) => {
    ctx.fillStyle = '#5a6a88';
    rounded(ctx, 0, 0, w, h, w / 2);
    ctx.fill();
  },
  ui_tl_tick_on: (ctx, w, h) => {
    ctx.fillStyle = '#ffd23a';
    rounded(ctx, 0, 0, w, h, w / 2);
    ctx.fill();
  },
  ui_tl_ring: (ctx, w, h) => {
    ctx.lineWidth = w * 0.12;
    ctx.strokeStyle = '#ffd23a';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - ctx.lineWidth / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  },
  ui_levelup_title: (ctx, w, h) => {
    ctx.font = `bold ${Math.round(h * 0.42)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#7a3a00';
    ctx.strokeText('LEVEL UP!', w / 2, h / 2);
    ctx.fillStyle = '#ffd23a';
    ctx.fillText('LEVEL UP!', w / 2, h / 2);
  },
  fx_wall_rock: blob('#8a8a94', '#b4b4be', 0.8),
  fx_freezebot: (ctx, w, h) => {
    ctx.fillStyle = '#8ad8ff';
    rounded(ctx, w * 0.2, h * 0.3, w * 0.6, h * 0.45, h * 0.2);
    ctx.fill();
    ctx.fillStyle = '#1e7fc0';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.52, h * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8f4ff';
    ctx.fillRect(w * 0.05, h * 0.18, w * 0.4, h * 0.07);
    ctx.fillRect(w * 0.55, h * 0.18, w * 0.4, h * 0.07);
  },
};
for (const k of ['W', 'A', 'S', 'D', 'Z', 'Q']) DRAWERS[`ui_key_${k}`] = letter(k, '#2a3a58');
for (let n = 1; n <= 4; n++) DRAWERS[`tache_${n}`] = (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(10,6,4,0.55)');
  g.addColorStop(1, 'rgba(10,6,4,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
};
for (let n = 1; n <= 8; n++) DRAWERS[`obstacle_${n}`] = blob('#5a4a44', '#85726a', 0.85);

/** Une icône d'upgrade : disque à la couleur de la carte. */
const upgradeIcon = (id: UpgradeId): Draw => (ctx, w, h) => {
  const c = `#${UPGRADES[id].color.toString(16).padStart(6, '0')}`;
  const r = Math.min(w, h) / 2 - 3;
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
};
for (const k of Object.keys(SIZES)) if (k.startsWith('upgrade_icon_')) DRAWERS[k] = upgradeIcon(k.slice('upgrade_icon_'.length) as UpgradeId);

/** Une image du manifeste a-t-elle un repli de ce module ? */
export const hasImageFallback = (id: string): boolean => id in DRAWERS && id in SIZES;

/** Ids dont le repli est posé (pas encore remplacé par le vrai fichier). */
const placeholders = new Set<string>();

/** Pose le repli de chaque image de `ids` dont la texture n'existe pas encore. */
export function installImageFallbacks(scene: Phaser.Scene, ids: readonly string[]): void {
  for (const id of ids) {
    if (!hasImageFallback(id) || scene.textures.exists(id)) continue;
    const [w, h] = SIZES[id];
    const tex = scene.textures.createCanvas(id, w, h);
    if (!tex) continue;
    DRAWERS[id](tex.getContext(), w, h);
    tex.refresh();
    placeholders.add(id);
  }
}

/** Clé sous laquelle le vrai fichier d'un repli est chargé (la clé d'origine est prise par le repli). */
export const realKey = (id: string): string => `${id}#real`;

/** Cette image a-t-elle un repli posé qui attend son fichier ? */
export const isPlaceholder = (id: string): boolean => placeholders.has(id);

/** Les vrais fichiers sont arrivés : on les redessine dans les textures de repli (même canvas), puis on libère la copie. Un fichier absent laisse le repli. */
export function swapInRealImages(scene: Phaser.Scene, ids: readonly string[]): void {
  for (const id of ids) {
    const real = realKey(id);
    if (!placeholders.has(id)) continue;
    if (!scene.textures.exists(real)) continue;
    const src = scene.textures.get(real).getSourceImage() as CanvasImageSource & { width: number; height: number };
    const tex = scene.textures.get(id) as Phaser.Textures.CanvasTexture;
    if (tex.width !== src.width || tex.height !== src.height) tex.setSize(src.width, src.height);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, src.width, src.height);
    ctx.drawImage(src, 0, 0);
    tex.refresh();
    scene.textures.remove(real);
    placeholders.delete(id);
  }
}
