"""Découpe art-src/critic_font.png (« ! » puis les chiffres 0-9, dans cet ordre) en glyphes séparés dans public/assets/fx/crit/ et recopie la
bulle art-src/critic_bubble.png. Les glyphes sont repérés tout seuls (colonnes non transparentes). Usage : python tools/crit-font.py"""
from PIL import Image
import os
src = 'games/xiao-swarm/art-src/critic_font.png'
out = 'games/xiao-swarm/public/assets/fx/crit'
os.makedirs(out, exist_ok=True)
im = Image.open(src).convert('RGBA')
alpha = im.split()[3]
w, h = im.size
cols = [any(alpha.getpixel((x, y)) > 20 for y in range(h)) for x in range(w)]
runs, start = [], None
for x, c in enumerate(cols + [False]):
    if c and start is None:
        start = x
    if not c and start is not None:
        runs.append((start, x - 1))
        start = None
names = ['bang'] + [str(i) for i in range(10)]
assert len(runs) == len(names), f'{len(runs)} glyphes trouvés, {len(names)} attendus : {runs}'
for n, (a, b) in zip(names, runs):
    im.crop((max(0, a - 1), 0, min(w, b + 2), h)).save(f'{out}/{n}.png')
Image.open('games/xiao-swarm/art-src/critic_bubble.png').convert('RGBA').save(f'{out}/bubble.png')
print('ok', sorted(os.listdir(out)))
