"""Makes the sounds and ground textures TerraFoundry's code asks for but its zip did not contain (simple generated ones, made for NOOB).
Sounds are 16-bit mono WAV data stored under the .mp3 names the game asks for (the browser's audio decoder reads the content, not the name)."""
import os, wave, struct
import numpy as np
from PIL import Image

OUT = 'D:/noob-terra/game/public/assets'
os.makedirs(OUT + '/audio', exist_ok=True)
os.makedirs(OUT + '/tex', exist_ok=True)
SR = 22050
rng = np.random.default_rng(7)

def t(d): return np.linspace(0, d, int(SR * d), endpoint=False)
def env(n, a=0.01, r=0.2):
    e = np.ones(n); na = max(1, int(a * SR)); nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na); e[-nr:] = np.minimum(e[-nr:], np.linspace(1, 0, nr)); return e
def noise(d): return rng.uniform(-1, 1, int(SR * d))
def lp(x, k):  # moving-average low pass
    k = max(1, int(k)); return np.convolve(x, np.ones(k) / k, mode='same')
def tone(f, d, shape='sin'):
    x = t(d)
    return np.sin(2 * np.pi * f * x) if shape == 'sin' else np.sign(np.sin(2 * np.pi * f * x)) * 0.6
def sweep(f0, f1, d):
    x = t(d); f = np.linspace(f0, f1, len(x)); return np.sin(2 * np.pi * np.cumsum(f) / SR)
def save(name, x, gain=0.8):
    x = np.asarray(x, dtype=np.float64); m = np.max(np.abs(x)) or 1; x = x / m * gain
    with wave.open(f'{OUT}/audio/{name}.mp3', 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype('<i2').tobytes())

def hit(d, k, f=0):  # thud / chop / stone
    n = noise(d); x = lp(n, k) * env(len(n), 0.002, d * 0.8)
    if f: x = x + 0.6 * tone(f, d) * env(len(n), 0.002, d * 0.9)
    return x
def blip(f, d): return tone(f, d) * env(int(SR * d), 0.005, d * 0.6)

def mix(*xs):
    n = max(len(x) for x in xs); out = np.zeros(n)
    for x in xs: out[:len(x)] += x
    return out

S = {}
S['sfx-ui-click'] = blip(900, 0.06); S['sfx-ui-hover'] = blip(600, 0.04) * 0.5
S['sfx-chop'] = hit(0.18, 6, 140); S['sfx-stone'] = mix(hit(0.16, 3, 300), hit(0.16, 2))
S['sfx-crystal'] = sum(blip(f, 0.5) * 0.5 for f in (1200, 1800, 2400))
S['sfx-dig'] = hit(0.22, 12) ; S['sfx-treefall'] = np.concatenate([hit(0.5, 20, 70), hit(0.6, 30, 50)])
S['sfx-pickup'] = np.concatenate([blip(700, 0.07), blip(1000, 0.09)]); S['sfx-craft'] = np.concatenate([hit(0.08, 4, 220), hit(0.08, 4, 260), blip(900, 0.12)])
S['sfx-place-wood'] = hit(0.14, 8, 180); S['sfx-place-stone'] = hit(0.18, 4, 110)
S['sfx-eat'] = np.concatenate([hit(0.07, 5), hit(0.07, 5), hit(0.07, 5)]); S['sfx-hurt'] = sweep(420, 180, 0.22) * env(int(SR * 0.22), 0.002, 0.15)
S['sfx-swing'] = lp(noise(0.2), 20) * np.sin(np.linspace(0, np.pi, int(SR * 0.2)))
S['sfx-creature-hit'] = hit(0.14, 5, 200); S['sfx-creature-die'] = sweep(300, 70, 0.5) * env(int(SR * 0.5), 0.01, 0.4)
S['sfx-bow-draw'] = lp(noise(0.45), 10) * np.linspace(0.2, 1, int(SR * 0.45)) * 0.5; S['sfx-bow-release'] = np.concatenate([hit(0.06, 3, 250), lp(noise(0.12), 8) * env(int(SR * 0.12), 0.001, 0.1) * 0.4])
S['sfx-arrow-hit'] = hit(0.1, 3, 400); S['sfx-levelup'] = np.concatenate([blip(f, 0.12) for f in (523, 659, 784, 1046)])
S['sfx-chest'] = np.concatenate([hit(0.1, 8, 120), sweep(180, 300, 0.2) * env(int(SR * 0.2), 0.01, 0.1) * 0.5]); S['sfx-chest-close'] = hit(0.16, 10, 100)
S['sfx-dawn'] = np.concatenate([blip(f, 0.4) * 0.7 for f in (392, 523, 659)])
S['sfx-door-open'] = mix(sweep(140, 220, 0.3) * env(int(SR * 0.3), 0.02, 0.2) * 0.6, hit(0.3, 14) * 0.2); S['sfx-door-close'] = hit(0.2, 9, 90)
S['sfx-map-open'] = lp(noise(0.25), 6) * np.sin(np.linspace(0, np.pi, int(SR * 0.25))) * 0.7
S['sfx-wolf-howl'] = sweep(300, 620, 1.2) * np.sin(np.linspace(0, np.pi, int(SR * 1.2))) ** 0.7
S['sfx-wolf-attack'] = mix(sweep(220, 120, 0.3) * env(int(SR * 0.3), 0.005, 0.2), hit(0.25, 3) * 0.4)
S['sfx-wave-horn'] = mix(tone(110, 1.2, 'sq'), tone(165, 1.2, 'sq') * 0.7) * env(int(SR * 1.2), 0.1, 0.5)
S['sfx-ghoul'] = mix(sweep(160, 90, 0.7), 0.5 * sweep(320, 180, 0.7)) * env(int(SR * 0.7), 0.05, 0.4)
S['sfx-boss-roar'] = mix(sweep(110, 55, 1.5), lp(noise(1.5), 4) * 0.6) * env(int(SR * 1.5), 0.05, 0.8)
for k, v in S.items(): save(k, v)

def loop(d, fn): return fn(t(d))
def wind(d, level, hz): x = lp(noise(d), 40) * (0.5 + 0.5 * np.sin(2 * np.pi * hz * t(d))); return x * level
save('amb-day', wind(8, 1, 0.15) + 0.15 * lp(noise(8), 4) * (np.sin(2 * np.pi * 0.7 * t(8)) > 0.9), 0.5)
save('amb-night', wind(8, 1, 0.1) + 0.25 * np.sin(2 * np.pi * 3600 * t(8)) * (np.sin(2 * np.pi * 1.3 * t(8)) > 0.97), 0.45)
cf = lp(noise(6), 3) * (0.4 + 0.6 * (rng.uniform(size=int(SR * 6)) > 0.995)); save('amb-campfire', lp(cf, 8) + lp(noise(6), 30) * 0.4, 0.5)

def music(name, d, notes, bpm, wave_='sin', bass=True, gain=0.55):
    n = int(SR * d); x = np.zeros(n); beat = 60 / bpm
    for i in range(int(d / beat)):
        f = notes[i % len(notes)]; s = int(i * beat * SR); seg = t(beat * 0.95)
        v = np.sin(2 * np.pi * f * seg) + (0.3 * np.sin(2 * np.pi * 2 * f * seg) if wave_ == 'sin' else 0)
        v = v * env(len(seg), 0.02, beat * 0.6); x[s:s + len(seg)] += v[: max(0, min(len(seg), n - s))] if s < n else 0
        if bass and i % 2 == 0:
            b = np.sin(2 * np.pi * (f / 2) * seg) * env(len(seg), 0.02, beat * 0.9) * 0.6; x[s:s + len(seg)] += b[: max(0, min(len(seg), n - s))]
    save(name, x, gain)
A = 220.0; sc = lambda *s: [A * 2 ** (k / 12) for k in s]
music('music-title', 20, sc(0, 4, 7, 12, 7, 4, 3, 7), 70)
music('music-day', 24, sc(0, 2, 4, 7, 9, 7, 4, 2), 84)
music('music-night', 24, sc(-5, -2, 0, -2, -7, -5, -2, 0), 56)
music('music-boss', 20, sc(0, 0, 3, 0, 6, 5, 3, 1), 120, 'sq')

# textures (256 px, soft tileable noise); diffuse jpg, normal jpg, rough jpg
def fbm(seed, octaves=5, size=256):
    r = np.random.default_rng(seed); out = np.zeros((size, size)); amp = 1.0; tot = 0
    for o in range(octaves):
        n = 4 * 2 ** o; g = r.uniform(size=(n, n)); big = np.kron(g, np.ones((size // n, size // n)))
        # cheap smoothing by wrapping blur
        for _ in range(2): big = (big + np.roll(big, 1, 0) + np.roll(big, -1, 0) + np.roll(big, 1, 1) + np.roll(big, -1, 1)) / 5
        out += big * amp; tot += amp; amp *= 0.55
    return out / tot
def tex(name, base, var, seed, streaks=False, rough=False):
    h = fbm(seed)
    if streaks: h = 0.6 * h + 0.4 * np.tile(fbm(seed + 1, 3)[:, :1], (1, 256))
    h = (h - h.min()) / (h.max() - h.min())
    col = np.zeros((256, 256, 3))
    for i in range(3): col[..., i] = base[i] + (h - 0.5) * 2 * var[i]
    Image.fromarray(np.clip(col, 0, 255).astype('uint8')).save(f'{OUT}/tex/{name}_diff.jpg', quality=88)
    gy, gx = np.gradient(h * 6); nz = np.ones_like(h); n = np.stack([-gx, -gy, nz], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype('uint8')).save(f'{OUT}/tex/{name}_nor.jpg', quality=88)
    if rough: Image.fromarray((np.clip(0.6 + (h - 0.5) * 0.5, 0, 1) * 255).astype('uint8')).save(f'{OUT}/tex/{name}_rough.jpg', quality=88)
tex('leafy_grass', (92, 128, 52), (30, 40, 22), 1); tex('forest_floor', (84, 66, 44), (30, 26, 20), 2); tex('mud_forest', (88, 66, 46), (24, 20, 16), 3)
tex('lichen_rock', (112, 114, 100), (34, 36, 30), 4); tex('coast_sand_03', (206, 190, 150), (22, 22, 20), 5); tex('snow_02', (232, 238, 246), (14, 14, 12), 6)
tex('worn_rock_natural_01', (128, 120, 110), (36, 34, 30), 7); tex('bark_brown_02', (92, 70, 52), (34, 28, 22), 8, True, True); tex('oak_wood_planks', (168, 126, 78), (28, 24, 18), 9, True)
print(len(os.listdir(OUT + '/audio')), 'sounds,', len(os.listdir(OUT + '/tex')), 'textures;', sum(os.path.getsize(OUT + '/audio/' + f) for f in os.listdir(OUT + '/audio')) // 1000, 'KB of audio')
