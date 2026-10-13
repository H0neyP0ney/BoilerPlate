#!/usr/bin/env python3
"""
Synthétise les bruitages du jeu (Xiao Swarm) : sons de remplacement, à écraser par de vrais sons (voir docs/SONS.md).

  python tools/gen-sfx.py            # tous les sons
  python tools/gen-sfx.py ui_click levelup   # seulement ceux-là

Sources .wav : games/xiao-swarm/art-src/audio/sfx/<nom>.wav (44,1 kHz mono)
Livrés       : games/xiao-swarm/public/assets/audio/sfx/<nom>.mp3 (mono, 64 kbit/s, via ffmpeg)
Le script est déterministe (graines fixes) : le relancer redonne les mêmes fichiers. Chaque son est normalisé à -2 dB ;
son volume réel dans le jeu se règle dans `SFX` de games/xiao-swarm/src/settings.ts.
"""
import os
import subprocess
import sys
import wave

import numpy as np

SR = 44100
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'games', 'xiao-swarm')
WAV_DIR = os.path.join(ROOT, 'art-src', 'audio', 'sfx')
MP3_DIR = os.path.join(ROOT, 'public', 'assets', 'audio', 'sfx')


# ---------- briques ----------
def tt(d):
    return np.arange(int(SR * d)) / SR


def silence(d):
    return np.zeros(int(SR * d))


def noise(d, seed=1):
    return np.random.RandomState(seed).uniform(-1, 1, int(SR * d))


def fit(x, n):
    return x[:n] if len(x) >= n else np.concatenate([x, np.zeros(n - len(x))])


def phase(freq, d):
    """freq : nombre (Hz) ou tableau de fréquences instantanées."""
    n = int(SR * d)
    f = np.full(n, float(freq)) if np.isscalar(freq) else fit(np.asarray(freq, float), n)
    return 2 * np.pi * np.cumsum(f) / SR


def sine(freq, d):
    return np.sin(phase(freq, d))


def tri(freq, d):
    return 2 / np.pi * np.arcsin(np.sin(phase(freq, d)))


def square(freq, d):
    return np.sign(np.sin(phase(freq, d)))


def saw(freq, d):
    p = phase(freq, d) / (2 * np.pi)
    return 2 * (p - np.floor(p + 0.5))


def sweep(f0, f1, d, power=1.0):
    """Fréquence qui glisse de f0 à f1 (power > 1 : rapide au début)."""
    u = np.linspace(0, 1, int(SR * d)) ** (1 / power)
    return f0 + (f1 - f0) * u


def decay(x, tau, attack=0.003):
    n = len(x)
    t = np.arange(n) / SR
    e = np.exp(-t / tau)
    a = int(SR * attack)
    if a > 0:
        e[:a] *= np.linspace(0, 1, a)
    return x * e


def swell(x, attack, release):
    n = len(x)
    e = np.ones(n)
    a, r = int(SR * attack), int(SR * release)
    if a > 0:
        e[:a] = np.linspace(0, 1, a) ** 1.5
    if r > 0:
        e[-r:] *= np.linspace(1, 0, r)
    return x * e


def _filt(x, fn):
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(spec * fn(freqs), len(x))


def lp(x, fc, order=4):
    return _filt(x, lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order)))


def hp(x, fc, order=4):
    return _filt(x, lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order)))


def bp(x, lo, hi):
    return hp(lp(x, hi), lo)


def echo(x, delays=(0.11, 0.23), gains=(0.35, 0.2), tail=0.25):
    n = len(x) + int(SR * tail)
    out = fit(x, n).copy()
    for d, g in zip(delays, gains):
        k = int(SR * d)
        out[k:] += g * fit(x, n)[: n - k]
    return out


def place(parts, total=None):
    """parts : liste de (signal, début en s). Retourne le mélange."""
    end = max(int(SR * s) + len(x) for x, s in parts)
    out = np.zeros(max(end, int(SR * (total or 0))))
    for x, s in parts:
        k = int(SR * s)
        out[k : k + len(x)] += x
    return out


def note(freq, d, tau=0.12, harm=(1.0, 0.3, 0.1), wave_fn=sine, attack=0.004):
    x = sum(h * wave_fn(freq * (i + 1), d) for i, h in enumerate(harm))
    return decay(x, tau, attack)


def finish(x, peak=0.8):
    x = np.nan_to_num(x)
    m = np.max(np.abs(x)) or 1.0
    x = x / m * peak
    f = int(SR * 0.006)
    x[-f:] *= np.linspace(1, 0, f)  # pas de clic en fin de son
    x[: int(SR * 0.0008)] *= 0.0  # ni au début
    return x


def mix(*xs):
    n = max(len(x) for x in xs)
    return sum(fit(x, n) for x in xs)


# notes (Hz)
C4, E4, G4, C5, D5, E5, G5, A5, B5, C6, E6, G6 = 261.63, 329.63, 392.0, 523.25, 587.33, 659.25, 783.99, 880.0, 987.77, 1046.5, 1318.5, 1568.0
B6 = 1975.5


# ---------- les sons ----------
def ui_click():
    return mix(decay(sine(sweep(1500, 900, 0.07), 0.07), 0.018), decay(hp(noise(0.03, 2), 3500), 0.004) * 0.35)


def ui_hover():
    return decay(sine(1900, 0.05), 0.009) * 0.6


def ui_open():
    n = noise(0.34, 3)
    sw = swell(bp(n, 600, 5000), 0.18, 0.12) * 0.45
    tone = swell(sine(sweep(380, 1250, 0.34, 0.8), 0.34), 0.12, 0.14) * 0.6
    return mix(sw, tone)


def ui_claim():
    return echo(place([(note(E5, 0.3, 0.1), 0), (note(B5, 0.4, 0.14), 0.07)]), (0.09,), (0.25,), 0.15)


def ui_claim_prism():
    notes = [C5, E5, G5, C6, E6, G6, B6]
    arp = place([(note(f, 0.5, 0.15, (1, 0.4, 0.2)), 0.055 * i) for i, f in enumerate(notes)])
    spark = decay(hp(noise(0.9, 5), 6500), 0.28) * 0.18
    return echo(mix(arp, spark), (0.1, 0.21, 0.33), (0.4, 0.28, 0.18), 0.3)


def _clack(seed, f):
    n = decay(bp(noise(0.06, seed), 1200, 5200), 0.012)
    return n * 0.8 + decay(sine(f, 0.06), 0.014) * 0.5


def ui_reroll():
    rng = np.random.RandomState(7)
    parts = [(_clack(10 + i, rng.uniform(180, 420)), 0.045 * i + rng.uniform(0, 0.02)) for i in range(6)]
    return place(parts, 0.4)


def levelup():
    arp = place([(note(f, 0.4, 0.2, (1, 0.35, 0.15), tri), 0.07 * i) for i, f in enumerate([C5, E5, G5, C6])])
    chord = place([(swell(mix(note(C6, 0.75, 0.4), note(E6, 0.75, 0.4), note(G6, 0.75, 0.4)), 0.01, 0.2) * 0.6, 0.3)])
    spark = place([(decay(hp(noise(0.5, 21), 7000), 0.12) * 0.22, 0.28)])
    return echo(mix(arp, chord, spark), (0.12, 0.26), (0.32, 0.2), 0.3)


def xp():
    """Ramassage d'XP (très fréquent) : un bruitage de collecte SANS note — un petit souffle de bruit filtré, bref, plus un micro-tick."""
    puff = decay(bp(noise(0.07, 301), 1600, 5200), 0.014) * 0.8  # le « pfit » aigu
    body = decay(bp(noise(0.06, 302), 600, 1500), 0.011) * 0.45  # un peu de corps, qui s'éteint plus vite
    tick = decay(hp(noise(0.012, 303), 4500), 0.002) * 0.35
    return mix(puff, body, tick)


def xp_note():
    """Ancien ramassage d'XP, avec une note (variante `xp--note`, pour comparer)."""
    return decay(sine(sweep(900, 1500, 0.07, 1.4), 0.07), 0.03) * 0.8


def recruit():
    return echo(place([(note(G5, 0.2, 0.09, (1, 0.3), tri), 0), (note(C6, 0.2, 0.09, (1, 0.3), tri), 0.09), (note(E6, 0.3, 0.14, (1, 0.3), tri), 0.18)]), (0.08,), (0.25,), 0.15)


def pu_stim():
    zip_ = decay(saw(sweep(260, 2000, 0.28, 0.6), 0.28), 0.2) * 0.4
    buzz = swell(lp(square(sweep(120, 200, 0.4), 0.4), 800), 0.02, 0.2) * 0.35 * (0.7 + 0.3 * np.sin(2 * np.pi * 30 * tt(0.4)))
    return mix(zip_, buzz)


def pu_magnet():
    sw = swell(bp(noise(0.55, 31), 300, 4500), 0.05, 0.3)
    sw = sw * np.linspace(1, 0.3, len(sw))
    tone = decay(sine(sweep(900, 110, 0.5, 2.2), 0.5), 0.3) * 0.7
    thump = place([(decay(sine(sweep(140, 55, 0.2), 0.2), 0.08) * 0.9, 0.34)])
    return mix(sw * 0.5, tone, thump)


def pu_heal():
    ch = [note(f, 0.7, 0.35, (1, 0.2)) for f in (C6, E6, G6)]
    return echo(place([(ch[0], 0), (ch[1], 0.07), (ch[2], 0.14)]), (0.13, 0.27), (0.35, 0.2), 0.3)


def pu_stasis():
    low = swell(mix(sine(sweep(260, 95, 0.9, 0.7), 0.9), sine(sweep(390, 140, 0.9, 0.7), 0.9) * 0.5), 0.02, 0.5)
    ice = swell(hp(noise(0.9, 41), 3500), 0.05, 0.6) * 0.15
    ping = place([(note(2200, 0.5, 0.2, (1, 0.5)), 0.05)]) * 0.25
    return echo(mix(low * 0.8, ice, ping), (0.15, 0.3), (0.35, 0.2), 0.25)


def pu_rockets():
    whoosh = swell(lp(noise(0.55, 51), 3500), 0.2, 0.25) * np.linspace(0.4, 1, int(SR * 0.55))
    thud = decay(sine(sweep(160, 45, 0.25), 0.25), 0.1) * 0.9
    return mix(whoosh * 0.7, thud)


def pu_reroll():
    return mix(ui_reroll() * 0.7, place([(note(C6, 0.4, 0.16), 0.2), (note(E6, 0.4, 0.2), 0.27)]) * 0.6)


def pu_prism():
    chord = mix(*[note(f, 1.1, 0.5, (1, 0.35, 0.15)) for f in (C5, E5, G5, C6, E6)])
    vib = chord * (0.8 + 0.2 * np.sin(2 * np.pi * 6 * tt(1.1)))
    spark = decay(hp(noise(1.1, 61), 7500), 0.4) * 0.25
    risers = np.zeros(int(SR * 1.2))
    for i, f in enumerate((G6, B6, 2349.0, 2637.0)):
        n = note(f, 0.3, 0.1)
        risers[int(SR * (0.1 + 0.08 * i)) : int(SR * (0.1 + 0.08 * i)) + len(n)] += n * 0.35
    return echo(mix(vib * 0.7, spark, risers), (0.12, 0.25, 0.4), (0.4, 0.3, 0.2), 0.4)


def egg_break():
    crack = decay(hp(noise(0.5, 71), 700), 0.05)
    boom = decay(sine(sweep(220, 55, 0.5), 0.5), 0.18)
    crunch = place([(decay(bp(noise(0.12, 72 + i), 800, 4000), 0.03) * 0.6, 0.06 + 0.07 * i) for i in range(4)])
    return mix(crack * 0.9, boom, crunch)


def alien_die_s():
    return mix(decay(sine(sweep(560, 160, 0.15), 0.15), 0.05) * 0.8, decay(bp(noise(0.15, 81), 900, 3200), 0.03) * 0.6)


def alien_die_m():
    return mix(decay(sine(sweep(330, 80, 0.25), 0.25), 0.09), decay(lp(noise(0.25, 82), 2200), 0.06) * 0.7)


def alien_die_l():
    return mix(decay(sine(sweep(170, 38, 0.6), 0.6), 0.22), decay(lp(noise(0.6, 83), 1300), 0.16) * 0.8, decay(sine(70, 0.5), 0.18) * 0.6)


def soldier_die():
    parts = [(note(f, 0.18, 0.07, (1, 0.2), tri), 0.1 * i) for i, f in enumerate((E5, C5, G4 * 0.9, C4))]
    return lp(place(parts), 2500)


def crit():
    ping = decay(sine(2400, 0.3), 0.07) + 0.5 * decay(sine(2400 * 3.1, 0.3), 0.05)
    return mix(ping * 0.8, decay(hp(noise(0.03, 91), 5000), 0.004) * 0.7)


def boss_arrive():
    horn = swell(lp(mix(saw(55, 1.5), saw(82.4, 1.5) * 0.7, saw(110, 1.5) * 0.4), 700), 0.45, 0.5)
    sub = swell(sine(sweep(40, 55, 1.5), 1.5), 0.5, 0.5)
    riser = swell(bp(noise(1.5, 101), 200, 3000), 0.9, 0.3) * 0.25
    return mix(horn * 0.8, sub, riser)


def boss_down():
    boom = decay(lp(noise(1.0, 111), 900), 0.25) + decay(sine(sweep(130, 32, 1.0), 1.0), 0.3) * 1.2
    chord = place([(swell(mix(*[note(f, 1.2, 0.55, (1, 0.4, 0.2), tri) for f in (C4, E4, G4, C5)]), 0.01, 0.4), 0.28)])
    return echo(mix(boom, chord * 0.8), (0.14, 0.3), (0.3, 0.2), 0.4)


def boss_enrage():
    growl = swell(lp(saw(sweep(90, 210, 0.75, 0.8), 0.75), 1100), 0.05, 0.25) * (0.6 + 0.4 * np.sin(2 * np.pi * 24 * tt(0.75)))
    return mix(growl, swell(bp(noise(0.75, 121), 150, 1800), 0.1, 0.3) * 0.3)


def alien_shot():
    return decay(lp(square(sweep(760, 190, 0.2, 1.6), 0.2), 2400), 0.08) * 0.8


def tongue():
    return mix(decay(bp(noise(0.16, 131), 700, 2600), 0.05), decay(sine(sweep(950, 280, 0.16), 0.16), 0.06) * 0.6)


def fuse():
    n = int(SR * 0.55)
    rng = np.random.RandomState(141)
    crackle = np.where(rng.uniform(size=n) > 0.965, rng.uniform(-1, 1, n), 0.0)
    hiss = hp(noise(0.55, 142), 3000) * 0.5
    return (crackle * 2 + hiss) * np.linspace(0.25, 1, n) * np.linspace(1, 0.4, n)


def cleave():
    wh = swell(bp(noise(0.25, 151), 500, 2500), 0.08, 0.1) * 0.7
    thud = place([(decay(sine(sweep(110, 48, 0.3), 0.3), 0.1) * 1.0, 0.12), (decay(lp(noise(0.2, 152), 600), 0.06) * 0.8, 0.12)])
    return mix(wh, thud)


def stalactite():
    crack = decay(hp(noise(0.4, 161), 3500), 0.06)
    pings = place([(note(f, 0.4, 0.13, (1, 0.4)), 0.02 * i) for i, f in enumerate((3200, 4100, 5200))])
    return mix(crack * 0.7, pings * 0.3)


def freeze():
    zap = decay(sine(sweep(3200, 900, 0.4, 1.6), 0.4), 0.18)
    shimmer = swell(hp(noise(0.4, 171), 5000), 0.02, 0.2) * 0.25
    return echo(mix(zap * 0.7, shimmer), (0.08,), (0.3,), 0.15)


def thaw():
    ticks = place([(decay(hp(noise(0.08, 181 + i), 2500), 0.015), 0.07 * i) for i in range(4)])
    return mix(ticks * 0.7, place([(decay(sine(1300, 0.3), 0.06) * 0.4, 0.0), (decay(sine(1700, 0.3), 0.08) * 0.35, 0.12)]))


def capture():
    return place([(decay(sine(sweep(280, 900, 0.14, 1.5), 0.14), 0.07), 0), (decay(sine(sweep(350, 1100, 0.14, 1.5), 0.14), 0.07) * 0.8, 0.1)])


def release():
    return mix(decay(sine(sweep(850, 190, 0.12), 0.12), 0.04), decay(hp(noise(0.06, 191), 1500), 0.01) * 0.5)


def rock_break():
    bursts = place([(decay(lp(noise(0.25, 201 + i), 1800), 0.08) * (1 - 0.15 * i), 0.05 * i) for i in range(4)])
    return mix(bursts, decay(sine(sweep(130, 50, 0.3), 0.3), 0.1) * 0.7)


def heal():
    return decay(sine(sweep(880, 1320, 0.16, 1.5), 0.16), 0.08) * 0.8


def defeat():
    parts = [(note(f, 0.45, 0.2, (1, 0.3, 0.1), tri), 0.26 * i) for i, f in enumerate((G4, E4, C4, G4 / 2))]
    return echo(lp(place(parts), 2200), (0.15, 0.3), (0.3, 0.2), 0.4)


def victory():
    fan = place([(note(f, 0.3, 0.12, (1, 0.4, 0.2), tri), 0.11 * i) for i, f in enumerate((C5, E5, G5, C6))])
    hold = place([(swell(mix(*[note(f, 1.4, 0.7, (1, 0.35, 0.15), tri) for f in (C5, E5, G5, C6, E6)]), 0.01, 0.5), 0.46)])
    return echo(mix(fan, hold * 0.8), (0.14, 0.3, 0.46), (0.3, 0.22, 0.14), 0.5)


SOUNDS = {
    'ui_click': ui_click, 'ui_hover': ui_hover, 'ui_open': ui_open, 'ui_claim': ui_claim, 'ui_claim_prism': ui_claim_prism, 'ui_reroll': ui_reroll,
    'levelup': levelup, 'xp': xp, 'xp--note': xp_note, 'recruit': recruit,
    'pu_stim': pu_stim, 'pu_magnet': pu_magnet, 'pu_heal': pu_heal, 'pu_stasis': pu_stasis, 'pu_rockets': pu_rockets, 'pu_reroll': pu_reroll, 'pu_prism': pu_prism,
    'egg_break': egg_break, 'alien_die_s': alien_die_s, 'alien_die_m': alien_die_m, 'alien_die_l': alien_die_l, 'soldier_die': soldier_die, 'crit': crit,
    'boss_arrive': boss_arrive, 'boss_down': boss_down, 'boss_enrage': boss_enrage,
    'alien_shot': alien_shot, 'tongue': tongue, 'fuse': fuse, 'cleave': cleave, 'stalactite': stalactite, 'freeze': freeze, 'thaw': thaw,
    'capture': capture, 'release': release, 'rock_break': rock_break, 'heal': heal, 'defeat': defeat, 'victory': victory,
}


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    names = sys.argv[1:] or list(SOUNDS)
    os.makedirs(WAV_DIR, exist_ok=True)
    os.makedirs(MP3_DIR, exist_ok=True)
    total = 0
    for name in names:
        if name not in SOUNDS:
            print(f'inconnu : {name}')
            continue
        x = finish(SOUNDS[name]())
        wav = os.path.join(WAV_DIR, f'{name}.wav')
        mp3 = os.path.join(MP3_DIR, f'{name}.mp3')
        write_wav(wav, x)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-b:a', '64k', mp3], check=True)
        size = os.path.getsize(mp3)
        total += size
        print(f'{name:16s} {len(x) / SR:5.2f} s  {size / 1024:5.1f} Ko')
    print(f'total : {total / 1024:.0f} Ko')


if __name__ == '__main__':
    main()
