# Génère les textures des globes au sol (power-ups et globe d'upgrade) et de leurs étoiles, à partir des pièces dorées de la recrue
# (public/assets/recruit/globe.webp, ring.webp, star.webp) : même recette que l'ancienne recoloration au lancement (teinte décalée en HSL,
# éclaircissement vers le blanc). Sorties : games/xiao-swarm/public/assets/globes/globe_<nom>.png (220×220, globe + anneau centrés) et
# star_<nom>.png. Ce sont désormais des images à retoucher à la main : RELANCER CE SCRIPT ÉCRASE LES RETOUCHES.
#
#   python tools/bake-globes.py            (n'écrit que les fichiers absents)
#   python tools/bake-globes.py --force    (réécrit tout)
import colorsys
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'games', 'xiao-swarm', 'public', 'assets')
SRC = os.path.join(ROOT, 'recruit')
OUT = os.path.join(ROOT, 'globes')
SIZE = 220  # côté de la texture du globe (le globe de 160 px est centré dedans)

# nom → (décalage de teinte en degrés depuis le doré, éclaircissement 0-1) : valeurs de l'ancienne recoloration
VARIANTS = {
    'stim': (330, 0),  # rouge orangé
    'magnet': (165, 0.7),  # blanc légèrement bleuté
    'heal': (75, 0),  # vert
    'stasis': (165, 0),  # bleu
    'rockets': (350, 0),  # jaune orangé
    'reroll': (0, 0),  # doré, comme les recrues
    'upgrade': (285, 0.3),  # rose clair (globe d'upgrade des œufs de boss)
}


def recolor(im: Image.Image, hue: float, light: float) -> Image.Image:
    if hue % 360 == 0 and light <= 0:
        return im
    px = im.load()
    shift = (hue % 360) / 360
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if hue % 360:
                r2, g2, b2 = colorsys.hls_to_rgb((h + shift) % 1, l, s)
            else:
                r2, g2, b2 = r / 255, g / 255, b / 255
            out = [round(r2 * 255), round(g2 * 255), round(b2 * 255)]
            if light > 0:
                out = [round(c + (255 - c) * light) for c in out]
            px[x, y] = (*out, a)
    return im


def main() -> None:
    force = '--force' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    globe = Image.open(os.path.join(SRC, 'globe.webp')).convert('RGBA')
    ring = Image.open(os.path.join(SRC, 'ring.webp')).convert('RGBA')
    star = Image.open(os.path.join(SRC, 'star.webp')).convert('RGBA')
    for name, (hue, light) in VARIANTS.items():
        g_path = os.path.join(OUT, f'globe_{name}.png')
        s_path = os.path.join(OUT, f'star_{name}.png')
        if force or not os.path.exists(g_path):
            canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
            for part in (globe, ring):
                layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
                layer.paste(part, ((SIZE - part.width) // 2, (SIZE - part.height) // 2))
                canvas = Image.alpha_composite(canvas, layer)
            recolor(canvas, hue, light).save(g_path)
            print(g_path)
        if force or not os.path.exists(s_path):
            recolor(star.copy(), hue, light).save(s_path)
            print(s_path)


main()
