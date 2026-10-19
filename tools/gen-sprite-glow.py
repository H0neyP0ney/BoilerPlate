"""Halo blanc au survol des boutons Armory / Skins : pour chaque ui/btn_*.png, écrit ui/btn_*_glow.png = la silhouette en blanc (contour net de ~2 px)
entourée d'un flou vers l'extérieur, sur une image agrandie de PAD px de chaque côté (le bouton l'affiche derrière le sprite, à l'échelle).
À relancer après `node tools/slice-armory-buttons.mjs`.

    python tools/gen-sprite-glow.py
"""
from PIL import Image, ImageChops, ImageFilter

DIR = 'games/xiao-swarm/public/assets/ui/'
NAMES = ['btn_armory', 'btn_skins']
PAD = 24  # marge ajoutée autour de l'image (px de l'image) : doit contenir tout le flou
OUTLINE = 7  # taille du filtre de dilatation (impair) : contour net de (OUTLINE - 1) / 2 px
BLUR = 5  # rayon du flou extérieur
GAIN = 1.8  # renforce le flou

for name in NAMES:
    im = Image.open(f'{DIR}{name}.png').convert('RGBA')
    w, h = im.size
    alpha = Image.new('L', (w + 2 * PAD, h + 2 * PAD), 0)
    alpha.paste(im.getchannel('A'), (PAD, PAD))
    solid = alpha.filter(ImageFilter.MaxFilter(OUTLINE))  # silhouette élargie : le contour net
    blur = solid.filter(ImageFilter.GaussianBlur(BLUR)).point(lambda v: min(255, int(v * GAIN)))
    out = Image.new('RGBA', alpha.size, (255, 255, 255, 0))
    out.putalpha(ImageChops.lighter(solid, blur))
    out.save(f'{DIR}{name}_glow.png')
    print(f'{name}_glow.png', out.size)
