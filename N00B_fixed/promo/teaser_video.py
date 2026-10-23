"""The picture of the NOOB teaser: 1080 x 1920 (phone, 9:16), 30 frames a second, 32.5 seconds, cut to the beat of teaser_audio.py (128 BPM).
Only designed graphics are used (no screenshots): the NOOB logo, big animated type, feature icons drawn in code, doodles, colour bursts and flashes.

usage:
  python teaser_video.py sheet <out.png>            a contact sheet of key moments (to look at the design quickly)
  python teaser_video.py render <audio.wav> <out.mp4>
"""
import math
import subprocess
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
BPM = 128
BEAT = 60.0 / BPM
DUR = 32.5
ROOT = r'C:\n00b-work\N00B\N00B_fixed\instagram\public'
IMPACT = r'C:\Windows\Fonts\impact.ttf'
BLACKF = r'C:\Windows\Fonts\ariblk.ttf'
BOLDF = r'C:\Windows\Fonts\arialbd.ttf'
FFMPEG = r'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe'

clamp = lambda v, a=0.0, b=1.0: max(a, min(b, v))
lerp = lambda a, b, t: a + (b - a) * t


def hexrgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def out_back(t, s=1.9):
    t = clamp(t) - 1; return 1 + (s + 1) * t ** 3 + s * t ** 2


def out_cubic(t):
    t = clamp(t); return 1 - (1 - t) ** 3


def beat_phase(t):
    """seconds since the last beat"""
    return (t % BEAT)


def pulse(t, k=7.0):
    return math.exp(-beat_phase(t) * k)


# ------------------------------------------------------------------ fonts and text sprites
_font_cache = {}


def font(path, size):
    k = (path, size)
    if k not in _font_cache:
        _font_cache[k] = ImageFont.truetype(path, size)
    return _font_cache[k]


_text_cache = {}


def text_sprite(text, size, fill=(255, 255, 255), face=IMPACT, stroke=0, stroke_fill=(0, 0, 0), shadow=None, tracking=0):
    key = (text, size, fill, face, stroke, stroke_fill, shadow, tracking)
    if key in _text_cache:
        return _text_cache[key]
    f = font(face, size)
    # measure
    if tracking:
        widths = [f.getlength(ch) + tracking for ch in text]; tw = int(sum(widths))
    else:
        tw = int(f.getlength(text))
    asc, desc = f.getmetrics(); th = asc + desc
    pad = stroke + (max(abs(shadow[0]), abs(shadow[1])) if shadow else 0) + 12
    img = Image.new('RGBA', (tw + pad * 2, th + pad * 2), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    def draw_at(dx, dy, color, sw):
        if tracking:
            x = pad + dx
            for ch, wd in zip(text, widths):
                d.text((x, pad + dy), ch, font=f, fill=color, stroke_width=sw, stroke_fill=stroke_fill); x += wd
        else:
            d.text((pad + dx, pad + dy), text, font=f, fill=color, stroke_width=sw, stroke_fill=stroke_fill)
    if shadow:
        draw_at(shadow[0], shadow[1], shadow[2], stroke)
    draw_at(0, 0, fill, stroke)
    _text_cache[key] = img
    return img


def blit(frame, sprite, cx, cy, scale=1.0, rot=0.0, alpha=1.0, maxw=None):
    """put a sprite on the frame (an RGBA PIL image), centred on (cx, cy); it is never wider than maxw (default: most of the screen)"""
    if alpha <= 0.003 or scale <= 0.003:
        return
    limit = (W * 0.94) if maxw is None else maxw
    scale = min(scale, limit / sprite.width)
    s = sprite
    if abs(scale - 1.0) > 0.003:
        s = s.resize((max(1, int(s.width * scale)), max(1, int(s.height * scale))), Image.BICUBIC)
    if abs(rot) > 0.05:
        s = s.rotate(rot, resample=Image.BICUBIC, expand=True)
    if alpha < 0.995:
        a = s.getchannel('A').point(lambda v: int(v * alpha)); s = s.copy(); s.putalpha(a)
    x, y = int(cx - s.width / 2), int(cy - s.height / 2)
    sx0, sy0 = max(0, -x), max(0, -y); sx1, sy1 = min(s.width, W - x), min(s.height, H - y)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    s = s.crop((sx0, sy0, sx1, sy1)); frame.alpha_composite(s, dest=(x + sx0, y + sy0))


# ------------------------------------------------------------------ the logo
LOGO = Image.open(ROOT + r'\brand\noob-wordmark.png').convert('RGBA')   # white, 640 x 207
AI_LOGO = Image.open(ROOT + r'\noob-ai-logo.png').convert('RGBA')


def tinted(img, color):
    out = Image.new('RGBA', img.size, color + (255,)); out.putalpha(img.getchannel('A')); return out


# ------------------------------------------------------------------ icons: drawn big (2x) and shrunk, white with an accent
def icon(name, accent):
    S = 1200; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im); K = 2
    wh, ac = (255, 255, 255, 255), accent + (255,)
    P = lambda pts: [(x * K, y * K) for x, y in pts]
    if name == 'reels':
        d.rounded_rectangle([x * K for x in (90, 50, 510, 550)], radius=90 * K, fill=wh)
        d.polygon(P([(240, 190), (240, 410), (420, 300)]), fill=ac)
        for x in (150, 250, 350, 450):
            d.rounded_rectangle([x * K - 20, 85 * K, x * K + 20, 115 * K], radius=8, fill=ac)
    elif name == 'stories':
        d.ellipse([60 * K, 60 * K, 540 * K, 540 * K], outline=wh, width=46 * K)
        d.rounded_rectangle([185 * K, 275 * K, 415 * K, 325 * K], radius=25 * K, fill=ac); d.rounded_rectangle([275 * K, 185 * K, 325 * K, 415 * K], radius=25 * K, fill=ac)
    elif name == 'chat':
        d.rounded_rectangle([50 * K, 90 * K, 550 * K, 400 * K], radius=100 * K, fill=wh)
        d.polygon(P([(140, 380), (130, 540), (290, 395)]), fill=wh)
        for x in (190, 300, 410):
            d.ellipse([(x - 34) * K, (245 - 34) * K, (x + 34) * K, (245 + 34) * K], fill=ac)
    elif name == 'games':
        d.rounded_rectangle([40 * K, 170 * K, 560 * K, 430 * K], radius=130 * K, fill=wh)
        d.rounded_rectangle([120 * K, 275 * K, 250 * K, 325 * K], radius=22 * K, fill=ac); d.rounded_rectangle([160 * K, 235 * K, 210 * K, 365 * K], radius=22 * K, fill=ac)
        d.ellipse([(400 - 32) * K, (255 - 32) * K, (400 + 32) * K, (255 + 32) * K], fill=ac); d.ellipse([(468 - 32) * K, (320 - 32) * K, (468 + 32) * K, (320 + 32) * K], fill=ac)
    elif name == 'music':
        for cx, cy in ((190, 440), (400, 390)):
            d.ellipse([(cx - 85) * K, (cy - 62) * K, (cx + 85) * K, (cy + 62) * K], fill=wh)
        d.rectangle([250 * K, 130 * K, 296 * K, 430 * K], fill=wh); d.rectangle([460 * K, 80 * K, 506 * K, 380 * K], fill=wh)
        d.polygon(P([(250, 130), (506, 80), (506, 170), (250, 220)]), fill=ac)
    elif name == 'daily':
        flame = [(300, 40), (400, 170), (470, 290), (480, 400), (430, 500), (300, 560), (170, 500), (120, 400), (140, 300), (210, 220), (250, 330), (300, 250), (270, 140)]
        d.polygon(P(flame), fill=wh)
        d.polygon(P([(300, 330), (370, 420), (370, 490), (300, 530), (230, 490), (230, 420)]), fill=ac)
    elif name == 'ai':
        def star(cx, cy, r, fill):
            pts = []
            for i in range(8):
                a = i * math.pi / 4 - math.pi / 2; rr = r if i % 2 == 0 else r * 0.26; pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
            d.polygon(P(pts), fill=fill)
        star(280, 320, 250, wh); star(470, 130, 90, ac); star(450, 470, 70, wh)
    elif name == 'studio':
        d.polygon(P([(110, 520), (160, 560), (390, 330), (340, 280)]), fill=wh)
        d.polygon(P([(340, 280), (390, 330), (440, 280), (390, 230)]), fill=ac)
        for cx, cy, r in ((460, 130, 70), (220, 160, 46), (520, 330, 40)):
            pts = []
            for i in range(8):
                a = i * math.pi / 4 - math.pi / 2; rr = r if i % 2 == 0 else r * 0.26; pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
            d.polygon(P(pts), fill=wh)
    elif name == 'live':
        d.ellipse([(300 - 78) * K, (300 - 78) * K, (300 + 78) * K, (300 + 78) * K], fill=ac)
        for r in (170, 260):
            d.arc([(300 - r) * K, (300 - r) * K, (300 + r) * K, (300 + r) * K], -50, 50, fill=wh, width=40 * K)
            d.arc([(300 - r) * K, (300 - r) * K, (300 + r) * K, (300 + r) * K], 130, 230, fill=wh, width=40 * K)
    elif name == 'shop':
        d.polygon(P([(120, 190), (480, 190), (540, 540), (60, 540)]), fill=wh)
        d.arc([190 * K, 40 * K, 410 * K, 340 * K], 180, 360, fill=wh, width=40 * K)
        d.ellipse([(230) * K, (300) * K, 370 * K, 440 * K], fill=ac)
    elif name == 'rooms':
        d.rounded_rectangle([225 * K, 50 * K, 375 * K, 330 * K], radius=75 * K, fill=wh)
        d.arc([140 * K, 150 * K, 460 * K, 440 * K], 0, 180, fill=wh, width=38 * K)
        d.rectangle([282 * K, 440 * K, 318 * K, 540 * K], fill=wh); d.rounded_rectangle([200 * K, 520 * K, 400 * K, 560 * K], radius=20 * K, fill=ac)
    elif name == 'draw':
        d.polygon(P([(430, 60), (540, 170), (230, 480), (110, 500), (130, 380)]), fill=wh)
        d.polygon(P([(110, 500), (130, 380), (230, 480)]), fill=ac)
        d.line(P([(380, 110), (490, 220)]), fill=ac, width=22 * K)
    elif name == 'explore':
        d.ellipse([50 * K, 50 * K, 550 * K, 550 * K], outline=wh, width=40 * K)
        d.polygon(P([(390, 210), (330, 330), (210, 390), (270, 270)]), fill=ac)
        d.polygon(P([(390, 210), (270, 270), (330, 330)]), fill=wh)
    elif name == 'points':
        d.ellipse([60 * K, 60 * K, 540 * K, 540 * K], fill=wh)
        d.ellipse([110 * K, 110 * K, 490 * K, 490 * K], outline=ac, width=26 * K)
        d.text((300 * K, 300 * K), 'N', font=font(BLACKF, 260 * K), fill=ac, anchor='mm')
    return im.resize((600, 600), Image.LANCZOS)


_icon_cache = {}


def get_icon(name, accent):
    k = (name, accent)
    if k not in _icon_cache:
        _icon_cache[k] = icon(name, accent)
    return _icon_cache[k]


# ------------------------------------------------------------------ the features (each gets two beats)
FEATURES = [
    ('REELS', 'Scroll. Watch. Repeat.', 'reels', (255, 45, 85)),
    ('STORIES', 'Share your day', 'stories', (255, 179, 0)),
    ('CHAT', 'Voice, photos, reactions', 'chat', (0, 224, 255)),
    ('GAMES', 'Play big 3D games', 'games', (124, 255, 0)),
    ('MUSIC', 'Your vibe, always on', 'music', (180, 76, 255)),
    ('DAILY NOOB', 'Win real points', 'daily', (255, 122, 0)),
    ('NOOB AI', 'Talk to your AI friend', 'ai', (125, 249, 255)),
    ('STUDIO', 'Edit like a pro', 'studio', (255, 79, 216)),
    ('GO LIVE', 'Stream to everyone', 'live', (255, 42, 42)),
    ('SHOP', 'Shop NOOB', 'shop', (255, 212, 0)),
]
MORE = [('rooms', (80, 160, 255)), ('draw', (255, 120, 180)), ('explore', (60, 230, 200)), ('points', (255, 210, 0)), ('reels', (255, 45, 85)), ('games', (124, 255, 0)), ('music', (180, 76, 255)), ('chat', (0, 224, 255)), ('live', (255, 60, 60)), ('studio', (255, 79, 216)), ('stories', (255, 179, 0)), ('shop', (255, 212, 0))]


# ------------------------------------------------------------------ the background: dark, tinted by the accent, with turning rays and drifting doodles
_bg_mask = None


def radial_bg(accent, strength=0.35):
    global _bg_mask
    if _bg_mask is None:
        yy, xx = np.mgrid[0:H // 8, 0:W // 8].astype(np.float32)
        d = np.sqrt(((xx - W / 16) / (W / 16)) ** 2 + ((yy - H / 2 / 8 * 0.9) / (H / 16)) ** 2)
        _bg_mask = np.clip(1.0 - d * 0.85, 0, 1) ** 1.6
    arr = np.empty((H // 8, W // 8, 3), np.float32)
    for c in range(3):
        arr[:, :, c] = 6 + _bg_mask * strength * accent[c] * 0.9
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).convert('RGBA')


_rays_cache = {}


def rays_mask(n, alpha):
    k = (n, alpha)
    if k not in _rays_cache:
        S = 2300; im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im); c = S / 2
        for i in range(0, n * 2, 2):
            a0 = i * math.pi / n; a1 = (i + 1) * math.pi / n
            d.polygon([(c, c), (c + math.cos(a0) * S, c + math.sin(a0) * S), (c + math.cos(a1) * S, c + math.sin(a1) * S)], fill=alpha)
        _rays_cache[k] = im
    return _rays_cache[k]


def draw_rays(frame, color, t, cx=W / 2, cy=H * 0.42, speed=14, alpha=36, n=18):
    m = rays_mask(n, alpha).rotate(t * speed, resample=Image.BILINEAR).crop((int(1150 - cx), int(1150 - cy), int(1150 - cx + W), int(1150 - cy + H)))
    frame.paste(color + (255,), (0, 0), m)


def doodle_sprite(kind, size, color, lw):
    S = size * 2; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = S / 2; w = lw * 2; col = color + (255,)
    if kind == 'star':
        pts = [(c + math.cos(-math.pi / 2 + i * math.pi / 5) * (c * 0.9 if i % 2 == 0 else c * 0.4), c + math.sin(-math.pi / 2 + i * math.pi / 5) * (c * 0.9 if i % 2 == 0 else c * 0.4)) for i in range(10)]
        d.line(pts + [pts[0]], fill=col, width=w, joint='curve')
    elif kind == 'heart':
        pts = []
        for i in range(60):
            a = i / 60 * 2 * math.pi; x = 16 * math.sin(a) ** 3; y = -(13 * math.cos(a) - 5 * math.cos(2 * a) - 2 * math.cos(3 * a) - math.cos(4 * a)); pts.append((c + x * c / 19, c + y * c / 19 - c * 0.05))
        d.line(pts + [pts[0]], fill=col, width=w, joint='curve')
    elif kind == 'bolt':
        pts = [(c * 1.15, c * 0.1), (c * 0.35, c * 1.1), (c * 0.95, c * 1.1), (c * 0.8, c * 1.9), (c * 1.65, c * 0.8), (c * 1.05, c * 0.8), (c * 1.15, c * 0.1)]
        d.line(pts, fill=col, width=w, joint='curve')
    elif kind == 'ring':
        d.ellipse([c * 0.15, c * 0.15, c * 1.85, c * 1.85], outline=col, width=w)
    elif kind == 'plus':
        d.line([(c * 0.2, c), (c * 1.8, c)], fill=col, width=w); d.line([(c, c * 0.2), (c, c * 1.8)], fill=col, width=w)
    elif kind == 'smiley':
        d.ellipse([c * 0.1, c * 0.1, c * 1.9, c * 1.9], outline=col, width=w); d.ellipse([c * 0.62, c * 0.65, c * 0.78, c * 0.85], fill=col); d.ellipse([c * 1.22, c * 0.65, c * 1.38, c * 0.85], fill=col)
        d.arc([c * 0.5, c * 0.8, c * 1.5, c * 1.5], 20, 160, fill=col, width=w)
    elif kind == 'note':
        d.ellipse([c * 0.3, c * 1.25, c * 0.9, c * 1.7], outline=col, width=w); d.line([(c * 0.88, c * 1.45), (c * 0.88, c * 0.3), (c * 1.6, c * 0.55)], fill=col, width=w, joint='curve')
    return im.resize((size, size), Image.LANCZOS)


DOODLES = []
_rs = np.random.default_rng(3)
for i in range(30):
    DOODLES.append(dict(kind=['star', 'heart', 'bolt', 'ring', 'plus', 'smiley', 'note'][i % 7], x=float(_rs.random()), y=float(_rs.random()), size=int(_rs.integers(46, 110)), speed=float(_rs.uniform(18, 60)), rot=float(_rs.uniform(-25, 25)), spin=float(_rs.uniform(-20, 20))))
_doodle_cache = {}


def draw_doodles(frame, t, color=(255, 255, 255), alpha=0.22):
    for dd in DOODLES:
        key = (dd['kind'], dd['size'], color)
        if key not in _doodle_cache:
            _doodle_cache[key] = doodle_sprite(dd['kind'], dd['size'], color, 5)
        y = (dd['y'] * (H + 300) - t * dd['speed']) % (H + 300) - 150
        blit(frame, _doodle_cache[key], dd['x'] * W, y, 1.0, dd['rot'] + t * dd['spin'], alpha)


# ------------------------------------------------------------------ the scenes. Each draws on `frame` (RGBA) and returns an effects dict for the post pass
def new_frame(accent=(120, 120, 140), strength=0.3):
    return radial_bg(accent, strength).copy()


def shake(t0, amp=18, decay=18):
    return amp * math.exp(-t0 * decay)


def scene_intro(t):
    # beats 0-8: a heartbeat in the dark and four lines of text
    words = [('WHAT IF', 0), ('ONE APP', 2), ('HAD EVERYTHING', 4), ('YOU LOVE?', 6)]
    idx = min(3, int(t // (2 * BEAT)))
    word, b0 = words[idx]
    ts = t - b0 * BEAT
    accent = [(255, 45, 85), (0, 224, 255), (180, 76, 255), (255, 212, 0)][idx]
    f = new_frame(accent, 0.12 + 0.12 * pulse(t, 5))
    draw_doodles(f, t, (255, 255, 255), 0.10 + 0.05 * idx)
    size = 250 if len(word) < 9 else 168
    sp = text_sprite(word, size, (255, 255, 255), stroke=0, shadow=(8, 8, accent))
    sc = out_back(ts / 0.28) * (1 + 0.05 * pulse(t))
    if idx == 2:
        a = text_sprite('HAD', 250, (255, 255, 255), shadow=(8, 8, accent)); b = text_sprite('EVERYTHING', 168, (255, 255, 255), shadow=(8, 8, accent))
        blit(f, a, W / 2, H / 2 - 140, sc); blit(f, b, W / 2, H / 2 + 80, sc)
    else:
        blit(f, sp, W / 2, H / 2, sc)
    # a ring that beats
    r = 330 + 120 * (1 - math.exp(-beat_phase(t) * 6)); ring = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(ring).ellipse([W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r], outline=accent + (int(120 * math.exp(-beat_phase(t) * 5)),), width=6); f.alpha_composite(ring)
    fade = clamp(t / 0.4)
    return f, dict(flash=0.0, aberr=2 + 6 * pulse(t, 9), shake=shake(beat_phase(t), 5), dark=1 - fade)


def scene_build(t):
    # beats 8-16: quick words, then icons strobing faster and faster, then black
    b = t / BEAT
    if b < 12:
        words = [('SCROLL.', (255, 45, 85)), ('CHAT.', (0, 224, 255)), ('PLAY.', (124, 255, 0)), ('CREATE.', (255, 79, 216))]
        i = int(b - 8); word, accent = words[i]; ts = t - (8 + i) * BEAT
        f = new_frame(accent, 0.45); draw_rays(f, accent, t, speed=30, alpha=40); draw_doodles(f, t, (255, 255, 255), 0.15)
        blit(f, text_sprite(word, 270, (255, 255, 255), shadow=(10, 10, accent)), W / 2, H / 2, out_back(ts / 0.22) * 1.0)
        return f, dict(flash=0.55 * math.exp(-ts * 14), aberr=3 + 10 * pulse(t, 8), shake=shake(ts, 14))
    names = ['reels', 'chat', 'games', 'music', 'live', 'shop', 'ai', 'studio']
    colors = [f[3] for f in FEATURES]
    rate = 2 if b < 14 else (4 if b < 15 else 8)          # icons per beat
    k = int((b - 12) * rate) if b < 14 else (4 + int((b - 14) * 4) if b < 15 else 8 + int((b - 15) * 8))
    nm = names[k % len(names)]; accent = {'reels': (255, 45, 85), 'chat': (0, 224, 255), 'games': (124, 255, 0), 'music': (180, 76, 255), 'live': (255, 42, 42), 'shop': (255, 212, 0), 'ai': (125, 249, 255), 'studio': (255, 79, 216)}[nm]
    f = new_frame(accent, 0.55); draw_rays(f, accent, t, speed=60, alpha=50)
    ts = (b * 60 / BPM) % (BEAT / rate)
    blit(f, get_icon(nm, accent), W / 2, H / 2, out_back(ts / 0.1) * 1.35, 0)
    grow = clamp((b - 13.5) / 2.0)
    if grow > 0:
        r = grow * 700; ring = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(ring).ellipse([W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r], outline=(255, 255, 255, int(90 * grow)), width=10); f.alpha_composite(ring)
    fl = 0.35 * (ts < 0.04) + 0.2 * grow
    black = 1.0 if b >= 15.55 else 0.0
    return f, dict(flash=fl, aberr=4 + 14 * grow, shake=4 + 16 * grow, dark=black)


def scene_logo(t):
    # beats 16-20: the drop. The logo slams in with a shockwave
    ts = t - 16 * BEAT; b = ts / BEAT
    f = new_frame((255, 60, 110), 0.4)
    draw_rays(f, (255, 90, 140), t, speed=20, alpha=45, cy=H * 0.45)
    draw_doodles(f, t, (255, 255, 255), 0.18)
    sc = out_back(ts / 0.3, 2.4) * (1 + 0.04 * pulse(t, 6))
    w0 = 940; lg = LOGO.resize((w0, int(w0 * LOGO.height / LOGO.width)), Image.LANCZOS)
    sh = tinted(lg, (255, 60, 110)); blit(f, sh, W / 2 + 12, H * 0.43 + 14, sc, 0, 1.0, 2000)
    blit(f, lg, W / 2, H * 0.43, sc, 0, 1.0, 2000)
    for i in range(3):                                        # shockwaves
        r = 120 + (ts - i * 0.08) * 2300
        if ts - i * 0.08 > 0:
            ring = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(ring).ellipse([W / 2 - r, H * 0.43 - r, W / 2 + r, H * 0.43 + r], outline=(255, 255, 255, int(200 * math.exp(-(ts - i * 0.08) * 3.2))), width=12 - i * 3); f.alpha_composite(ring)
    if b > 1.6:
        tg = text_sprite('CONNECT  •  SHARE  •  GROW', 58, (255, 255, 255), face=BLACKF, tracking=4)
        k = out_cubic((b - 1.6) / 0.5); blit(f, tg, W / 2, H * 0.43 + 330 + (1 - k) * 60, 1.0, 0, k)
    return f, dict(flash=0.95 * math.exp(-ts * 9), aberr=6 + 22 * math.exp(-ts * 7), shake=shake(ts, 30, 10))


def scene_feature(t):
    # beats 20-40: ten features, two beats each
    b = t / BEAT - 20; i = int(b // 2); ts = t - (20 + 2 * i) * BEAT
    name, sub, ic, accent = FEATURES[i]
    f = new_frame(accent, 0.5)
    draw_rays(f, accent, t, speed=16 + 4 * (i % 3), alpha=34, cy=H * 0.36)
    dark = tuple(int(c * 0.3) for c in accent)
    draw_doodles(f, t, (255, 255, 255), 0.2)
    p = pulse(t, 7)
    # icon with a halo
    k = out_back(ts / 0.26)
    halo = Image.new('RGBA', (900, 900), (0, 0, 0, 0)); ImageDraw.Draw(halo).ellipse([60, 60, 840, 840], fill=accent + (70,)); halo = halo.filter(ImageFilter.GaussianBlur(40))
    blit(f, halo, W / 2, H * 0.36, k * (1 + 0.1 * p))
    icn = get_icon(ic, accent)
    if ic == 'ai':
        a = AI_LOGO.resize((560, 560), Image.LANCZOS); blit(f, a, W / 2, H * 0.36, k * (1 + 0.05 * p), math.sin(ts * 5) * 4)
    else:
        blit(f, icn, W / 2, H * 0.36, k * 1.15 * (1 + 0.05 * p), math.sin(ts * 5) * 6)
    # the word
    size = 270 if len(name) <= 7 else (200 if len(name) <= 9 else 168)
    wd = text_sprite(name, size, (255, 255, 255), shadow=(10, 10, accent))
    wk = out_back((ts - 0.05) / 0.26)
    blit(f, wd, W / 2, H * 0.62, wk * (1 + 0.035 * p))
    sb = text_sprite(sub, 78, (255, 255, 255), face=BLACKF)
    sk = out_cubic((ts - 0.12) / 0.3); blit(f, sb, W / 2, H * 0.62 + 190 + (1 - sk) * 40, 1.0, 0, sk)
    # a progress row
    for j in range(len(FEATURES)):
        x = W / 2 + (j - (len(FEATURES) - 1) / 2) * 56
        d = ImageDraw.Draw(f); r = 11 if j == i else 7
        d.ellipse([x - r, H * 0.9 - r, x + r, H * 0.9 + r], fill=(255, 255, 255, 255) if j == i else (255, 255, 255, 90))
    return f, dict(flash=0.55 * math.exp(-ts * 16), aberr=2 + 9 * p, shake=shake(ts, 12, 16))


def scene_more(t):
    # beats 40-44: "AND MUCH MORE", then a grid of icons popping in
    b = t / BEAT - 40; ts = t - 40 * BEAT
    accent = (255, 45, 85)
    f = new_frame(accent, 0.4); draw_rays(f, (255, 255, 255), t, speed=25, alpha=28); draw_doodles(f, t, (255, 255, 255), 0.18)
    if b < 2:
        words = ['AND', 'MUCH']; i = int(b); sc = out_back((ts - i * BEAT) / 0.22)
        blit(f, text_sprite(words[i], 360, (255, 255, 255), shadow=(12, 12, accent)), W / 2, H / 2, sc)
        return f, dict(flash=0.5 * math.exp(-(ts - i * BEAT) * 14), aberr=3 + 8 * pulse(t, 8), shake=shake(beat_phase(t), 14))
    blit(f, text_sprite('MORE', 330, (255, 255, 255), shadow=(12, 12, accent)), W / 2, H * 0.19, out_back((ts - 2 * BEAT) / 0.22))
    n = len(MORE)
    for j, (nm, col) in enumerate(MORE):
        tj = ts - 2 * BEAT - j * (2 * BEAT / n) * 0.8
        if tj < 0:
            continue
        r_, c_ = divmod(j, 3); x = W / 2 + (c_ - 1) * 330; y = H * 0.38 + r_ * 300
        blit(f, get_icon(nm, col), x, y, out_back(tj / 0.2) * 0.42, 0)
    return f, dict(flash=0.2 * pulse(t, 14), aberr=3 + 10 * pulse(t, 8), shake=shake(beat_phase(t), 10))


def scene_one(t):
    # beats 44-48: ONE APP. EVERYTHING.
    b = t / BEAT - 44; ts = t - 44 * BEAT; first = b < 2
    accent = (255, 212, 0) if first else (255, 45, 85)
    f = new_frame(accent, 0.55); draw_rays(f, accent, t, speed=40, alpha=44); draw_doodles(f, t, (255, 255, 255), 0.2)
    word = 'ONE APP.' if first else 'EVERYTHING.'; size = 330 if first else 190
    t0 = ts if first else ts - 2 * BEAT
    sp = text_sprite(word, size, (255, 255, 255), shadow=(14, 14, accent))
    blit(f, sp, W / 2, H / 2, out_back(t0 / 0.24) * (1 + 0.04 * pulse(t, 6)))
    if not first:
        blit(f, text_sprite('ONE APP.', 120, (255, 255, 255), face=BLACKF), W / 2, H / 2 - 200, 1.0, 0, 0.6)
    fl = 0.6 * math.exp(-t0 * 12) + (0.35 if b > 3.25 and int((b - 3.25) * 8) % 2 == 0 else 0)
    return f, dict(flash=fl, aberr=4 + 12 * pulse(t, 8), shake=shake(t0, 22, 14) + (6 if b > 3 else 0))


def scene_finale(t):
    # beats 48-56: the logo among the icons, turning
    ts = t - 48 * BEAT; b = ts / BEAT
    f = new_frame((255, 60, 110), 0.5)
    draw_rays(f, (255, 255, 255), t, speed=22, alpha=26, cy=H * 0.4); draw_doodles(f, t, (255, 255, 255), 0.2)
    names = ['reels', 'stories', 'chat', 'games', 'music', 'daily', 'ai', 'studio', 'live', 'shop']
    cols = [x[3] for x in FEATURES]
    gap = 230; loop = gap * len(names)
    for row, (yy, direction) in enumerate(((H * 0.13, -1), (H * 0.70, 1))):
        k = out_cubic((ts - 0.15 - row * 0.1) / 0.4)
        for j, nm in enumerate(names):
            x = ((j * gap + direction * t * 190) % loop) - gap * 0.5
            if nm == 'ai':
                blit(f, AI_LOGO.resize((190, 190), Image.LANCZOS), x, yy, 0.95 * k, 0, 1.0, 400)
            else:
                blit(f, get_icon(nm, cols[j]), x, yy, 0.33 * k * (1 + 0.08 * pulse(t, 7)), 0, 1.0, 400)
    sc = out_back(ts / 0.3, 2.2) * (1 + 0.035 * pulse(t, 6)); w0 = 820
    lg = LOGO.resize((w0, int(w0 * LOGO.height / LOGO.width)), Image.LANCZOS)
    blit(f, tinted(lg, (255, 60, 110)), W / 2 + 10, H * 0.4 + 12, sc, 0, 1.0, 2000); blit(f, lg, W / 2, H * 0.4, sc, 0, 1.0, 2000)
    if b > 1.0:
        k = out_cubic((b - 1.0) / 0.5)
        blit(f, text_sprite('CONNECT  •  SHARE  •  GROW', 58, (255, 255, 255), face=BLACKF, tracking=4), W / 2, H * 0.4 + 330, 1.0, 0, k)
    if b > 4.0:
        k = out_back((b - 4.0) / 0.5); blit(f, text_sprite('ALL IN ONE APP', 170, (255, 255, 255), shadow=(8, 8, (255, 60, 110))), W / 2, H * 0.85, k)
    return f, dict(flash=0.8 * math.exp(-ts * 8), aberr=3 + 8 * pulse(t, 8), shake=shake(ts, 22, 10))


def scene_cta(t):
    # beats 56-60: free, install
    ts = t - 56 * BEAT; b = ts / BEAT
    f = new_frame((0, 224, 255), 0.5); draw_rays(f, (255, 255, 255), t, speed=30, alpha=30, cy=H * 0.35); draw_doodles(f, t, (255, 255, 255), 0.2)
    lg = LOGO.resize((620, int(620 * LOGO.height / LOGO.width)), Image.LANCZOS)
    blit(f, lg, W / 2, H * 0.22, out_back(ts / 0.3) * (1 + 0.04 * pulse(t, 6)))
    badge = text_sprite('FREE', 300, (255, 255, 255), shadow=(12, 12, (255, 45, 85)))
    blit(f, badge, W / 2, H * 0.45, out_back((ts - 0.1) / 0.3) * (1 + 0.05 * pulse(t, 7)), -4)
    sub = text_sprite('on your phone. Install in one tap.', 56, (255, 255, 255), face=BLACKF)
    blit(f, sub, W / 2, H * 0.45 + 250, 1.0, 0, out_cubic((ts - 0.5) / 0.4))
    # the button
    k = out_back((ts - 0.9) / 0.35)
    btn = Image.new('RGBA', (860, 190), (0, 0, 0, 0)); d = ImageDraw.Draw(btn); d.rounded_rectangle([0, 0, 859, 189], radius=95, fill=(255, 255, 255, 255))
    t_btn = text_sprite('INSTALL NOOB', 96, (10, 10, 14), face=BLACKF); btn.alpha_composite(t_btn, ((860 - t_btn.width) // 2, (190 - t_btn.height) // 2))
    blit(f, btn, W / 2, H * 0.72, k * (1 + 0.04 * pulse(t, 6)))
    blit(f, text_sprite('noobsocials.com', 80, (255, 255, 255), face=BOLDF), W / 2, H * 0.72 + 210, 1.0, 0, out_cubic((ts - 1.2) / 0.4))
    return f, dict(flash=0.55 * math.exp(-ts * 12), aberr=2 + 8 * pulse(t, 8), shake=shake(ts, 14, 14))


def scene_stutter(t):
    # beats 60-64: strobing "GET IT NOW", then black just before the last hit
    b = t / BEAT - 60; ts = t - 60 * BEAT
    steps = int(b * 2); invert = steps % 2 == 1
    f = Image.new('RGBA', (W, H), (255, 255, 255, 255) if invert else (8, 8, 12, 255))
    if not invert:
        f = new_frame((255, 45, 85), 0.6)
    draw_doodles(f, t, (0, 0, 0) if invert else (255, 255, 255), 0.25)
    words = ['GET', 'IT', 'NOW'] if b < 3.0 else ['NOOB']
    w = words[min(len(words) - 1, int(b))] if b < 3 else 'NOOB'
    col = (10, 10, 14) if invert else (255, 255, 255)
    sp = text_sprite(w, 420 if w != 'NOOB' else 380, col, shadow=(14, 14, (255, 45, 85) if invert else (255, 212, 0)))
    blit(f, sp, W / 2, H / 2, 1.0 + 0.1 * pulse(t, 5) + 0.02 * (b % 1))
    blk = 1.0 if b >= 3.55 else 0.0
    return f, dict(flash=0.0, aberr=6 + 18 * (b / 4), shake=6 + 22 * (b / 4), dark=blk)


def scene_end(t):
    # from beat 64: the last hit, then a calm final card
    ts = t - 64 * BEAT
    f = new_frame((255, 60, 110), 0.45); draw_rays(f, (255, 255, 255), t, speed=12, alpha=22, cy=H * 0.4); draw_doodles(f, t, (255, 255, 255), 0.16)
    k = out_back(ts / 0.35, 2.0); w0 = 900
    lg = LOGO.resize((w0, int(w0 * LOGO.height / LOGO.width)), Image.LANCZOS)
    blit(f, tinted(lg, (255, 60, 110)), W / 2 + 12, H * 0.4 + 14, k, 0, 1.0, 2000); blit(f, lg, W / 2, H * 0.4, k * (1 + 0.025 * math.sin(ts * 3)), 0, 1.0, 2000)
    blit(f, text_sprite('CONNECT  •  SHARE  •  GROW', 58, (255, 255, 255), face=BLACKF, tracking=4), W / 2, H * 0.4 + 300, 1.0, 0, out_cubic((ts - 0.3) / 0.5))
    blit(f, text_sprite('noobsocials.com', 92, (255, 255, 255), face=BOLDF), W / 2, H * 0.74, 1.0, 0, out_cubic((ts - 0.6) / 0.5))
    blit(f, text_sprite('FREE  •  INSTALL IN ONE TAP', 54, (255, 255, 255), face=BLACKF, tracking=3), W / 2, H * 0.74 + 120, 1.0, 0, 0.85 * out_cubic((ts - 0.9) / 0.5))
    fade_out = clamp((t - (DUR - 0.7)) / 0.7)
    return f, dict(flash=1.0 * math.exp(-ts * 7), aberr=2 + 20 * math.exp(-ts * 6), shake=shake(ts, 30, 9), dark=fade_out)


def frame_at(t):
    b = t / BEAT
    if b < 8: return scene_intro(t)
    if b < 16: return scene_build(t)
    if b < 20: return scene_logo(t)
    if b < 40: return scene_feature(t)
    if b < 44: return scene_more(t)
    if b < 48: return scene_one(t)
    if b < 56: return scene_finale(t)
    if b < 60: return scene_cta(t)
    if b < 64: return scene_stutter(t)
    return scene_end(t)


# ------------------------------------------------------------------ the finishing pass: shake, colour fringes, glow, edges, grain, flash (one colour channel at a time, to use little memory)
_vig = None
_grain = None
_rng = np.random.default_rng(11)


def post(img, fx, idx):
    global _vig, _grain
    if _vig is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.75)) ** 2)
        _vig = (np.clip(1.15 - d ** 2 * 0.9, 0.35, 1) * 256).astype(np.int32); del yy, xx, d
        _grain = [np.repeat(np.repeat(_rng.normal(0, 4.0, (H // 2, W // 2)).astype(np.int8), 2, 0), 2, 1) for _ in range(5)]
    rgb = img.convert('RGB')
    sh = fx.get('shake', 0.0)
    if sh > 0.5:
        dx, dy = int(_rng.normal(0, sh)), int(_rng.normal(0, sh))
        rgb = ImageChops.offset(rgb, dx, dy)
    ab = int(fx.get('aberr', 0))
    if ab > 0:
        r, g, b = rgb.split(); r = ImageChops.offset(r, ab, 0); b = ImageChops.offset(b, -ab, 0); rgb = Image.merge('RGB', (r, g, b))
    glow = rgb.resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(7)).resize((W, H), Image.BILINEAR)
    fl = fx.get('flash', 0.0); dark = fx.get('dark', 0.0); gr = _grain[idx % len(_grain)]
    out = np.empty((H, W, 3), np.uint8)
    for c in range(3):
        ch = np.asarray(rgb.getchannel(c), dtype=np.int32)
        gl = np.asarray(glow.getchannel(c), dtype=np.int32) - 70
        np.clip(gl, 0, None, out=gl)
        ch += (gl * 141) >> 8
        ch = (ch * _vig) >> 8
        ch += gr
        if fl > 0.01:
            ch = (ch * (1 - fl) + 255 * fl).astype(np.int32)
        if dark > 0.01:
            ch = (ch * (1 - dark)).astype(np.int32)
        out[:, :, c] = np.clip(ch, 0, 255)
    return out


def render(wav, out):
    import gc, time
    cmd = [FFMPEG, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', wav,
           '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '2', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', str(DUR), '-movflags', '+faststart', out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(DUR * FPS)
    for i in range(n):
        t = i / FPS
        for attempt in range(8):
            try:
                img, fx = frame_at(t)
                data = post(img, fx, i).tobytes()
                break
            except MemoryError:
                print(f'frame {i}: out of memory, trying again ({attempt + 1})', flush=True)
                img = fx = data = None; gc.collect(); time.sleep(2)
        else:
            raise SystemExit('out of memory, giving up at frame %d' % i)
        p.stdin.write(data)
        if i % 30 == 0:
            print(f'{i}/{n} frames, {t:.1f}s', flush=True)
    p.stdin.close(); p.wait(); print('done', out)


def sheet(out, beats=None):
    from_beats = beats or [0.5, 2.5, 4.5, 6.5, 8.6, 12.8, 14.6, 16.4, 18.6, 21.0, 23.0, 26.5, 31.0, 40.6, 42.8, 44.8, 46.8, 49.0, 53.5, 56.8, 58.5, 60.8, 62.6, 64.6, 65.8, 66.0]
    ts = [min(DUR - 0.05, b * BEAT) for b in from_beats]
    cols = 7; rows = math.ceil(len(ts) / cols); tw, th = 270, 480
    sh = Image.new('RGB', (cols * tw, rows * th), (0, 0, 0))
    for k, t in enumerate(ts):
        img, fx = frame_at(t); a = post(img, fx, 0)
        sh.paste(Image.fromarray(a).resize((tw, th), Image.LANCZOS), ((k % cols) * tw, (k // cols) * th))
    sh.save(out); print('sheet', out, [round(t, 1) for t in ts])


if __name__ == '__main__':
    if sys.argv[1] == 'sheet':
        sheet(sys.argv[2], [float(x) for x in sys.argv[3:]] or None)
    else:
        render(sys.argv[2], sys.argv[3])
