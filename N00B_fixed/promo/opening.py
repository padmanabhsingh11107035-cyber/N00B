"""NOOB opening animation (4 seconds, 1080 x 1920, 60 fps), made entirely in code: no screenshots, no stock footage, no samples.

The story: in the dark a pen draws NOOB (its two O's are eyes, like the logo), the letters fill in and the eyes open, look left, right, blink and look at you;
then the camera dives into the pupil (like X's logo zoom), the screen goes white and then black, and the app opens out of the pupil like an iris.

    python opening.py sheet sheet.png                 # a contact sheet of key moments, to look at the design
    python opening.py audio opening.wav               # the sound
    python opening.py render opening.wav out.mp4      # picture + sound -> mp4
"""
import math
import subprocess
import sys
import wave

import cv2
import numpy as np
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, T = 1080, 1920, 60, 4.0
BLACKF = r'C:\Windows\Fonts\ariblk.ttf'
BOLDF = r'C:\Windows\Fonts\arialbd.ttf'

# ---------------------------------------------------------------- easing
def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x

def prog(t, a, b):
    return clamp((t - a) / (b - a))

def smooth(u):
    u = clamp(u)
    return u * u * (3 - 2 * u)

def out_cubic(u):
    u = clamp(u)
    return 1 - (1 - u) ** 3

def in_out(u):
    u = clamp(u)
    return 0.5 * (1 - math.cos(math.pi * u))

def out_back(u, k=1.9):
    u = clamp(u)
    return 1 + (k + 1) * (u - 1) ** 3 + k * (u - 1) ** 2

# ---------------------------------------------------------------- the wordmark (world coordinates, y down)
CAP = 200.0          # letter height
R = 102.0            # radius of an O (the eyes)
GAP = 12.0
WN, WB = 170.0, 176.0
CX, CY = W / 2, H / 2
X0 = CX - (WN + 2 * 2 * R + WB + 3 * GAP) / 2
LET = {  # centre x of each letter
    'N': X0 + WN / 2,
    'O1': X0 + WN + GAP + R,
    'O2': X0 + WN + GAP + 2 * R + GAP + R,
    'B': X0 + WN + GAP + 4 * R + 2 * GAP + WB / 2,
}
LCY = CY               # world y of the letters' middle
Z0 = (CX, CY + 40.0)   # what the camera looks at first (puts the word a little above the middle)
LEVELS = (1, 2, 4, 8)


def glyph_mask(ch, w, h, ss):
    """A heavy, rounded letter as a mask `ss` times bigger than its size on screen (so it can be drawn sharply while the camera moves in)."""
    size = int(CAP / 0.716 * ss)
    f = ImageFont.truetype(BLACKF, size)
    im = Image.new('L', (int(size * 1.4), int(size * 1.4)), 0)
    ImageDraw.Draw(im).text((int(size * 0.2), int(size * 0.1)), ch, font=f, fill=255)
    bb = im.getbbox()
    im = im.crop(bb).resize((int(w * ss), int(h * ss)), Image.LANCZOS)
    a = np.asarray(im, np.float32)
    a = cv2.GaussianBlur(a, (0, 0), 3.2 * ss)          # rounds the corners, like the logo's soft letters
    a = np.clip((a - 118) * 6.0, 0, 255)
    return a.astype(np.uint8)


MASKS = {}
for key, ch, w in (('N', 'N', WN), ('B', 'B', WB)):
    MASKS[key] = {lv: glyph_mask(ch, w, CAP, lv) for lv in LEVELS}


def contours_of(key):
    m = MASKS[key][4]
    cs, _ = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    ox = LET[key] - (WN if key == 'N' else WB) / 2
    oy = LCY - CAP / 2
    for c in cs:
        p = c[:, 0, :].astype(np.float32)[::6] / 4.0
        p = np.vstack([p, p[:1]])
        out.append(np.stack([p[:, 0] + ox, p[:, 1] + oy], 1))
    return out


OUTLINES = {k: contours_of(k) for k in ('N', 'B')}

# ---------------------------------------------------------------- camera
S_END = 90.0
ZOOM_A, ZOOM_B = 2.28, 3.12
REVEAL_A, REVEAL_B = 3.10, 3.72


def camera(t):
    u = prog(t, ZOOM_A, ZOOM_B)
    s = math.exp(math.log(S_END) * (u ** 2.3))
    p2 = (LET['O2'], LCY)
    k = smooth(u * 1.15)
    z = (Z0[0] + (p2[0] - Z0[0]) * k, Z0[1] + (p2[1] - Z0[1]) * k)
    sh = 0.0
    if t > 3.08:
        sh = 16.0 * math.exp(-(t - 3.08) * 14.0)
    return s, z, (math.sin(t * 91) * sh, math.cos(t * 77) * sh)


def to_screen(q, s, z, sk):
    return ((q[0] - z[0]) * s + W / 2 + sk[0], (q[1] - z[1]) * s + H / 2 + sk[1])


# ---------------------------------------------------------------- small drawing helpers (8-bit, anti-aliased)
SH = 4

def circle(img, c, r, v, th=-1):
    if r <= 0.2:
        return
    cx, cy = c
    if abs(cx) > 3e5 or abs(cy) > 3e5 or r > 3e5:
        return
    cv2.circle(img, (int(round(cx * 16)), int(round(cy * 16))), int(round(r * 16)), v, th if th < 0 else int(round(th)), cv2.LINE_AA, SH)


def poly(img, pts, v, th):
    if len(pts) < 2:
        return
    a = np.round(np.asarray(pts, np.float64) * 16).astype(np.int32).reshape(-1, 1, 2)
    if np.abs(a).max() > 2e8:
        return
    cv2.polylines(img, [a], False, v, max(1, int(round(th))), cv2.LINE_AA, SH)


def rrect(img, x0, y0, x1, y1, r, v):
    cv2.rectangle(img, (int(x0 + r), int(y0)), (int(x1 - r), int(y1)), v, -1, cv2.LINE_AA)
    cv2.rectangle(img, (int(x0), int(y0 + r)), (int(x1), int(y1 - r)), v, -1, cv2.LINE_AA)
    for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
        circle(img, (cx, cy), r, v)


def glow_add(g, layer, sigma, gain):
    sm = cv2.resize(layer, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    sm = cv2.GaussianBlur(sm, (0, 0), sigma / 4.0)
    big = cv2.resize(sm, (W, H), interpolation=cv2.INTER_LINEAR)
    return cv2.add(g, (big.astype(np.float32) * gain).clip(0, 255).astype(np.uint8))


def sparkle(img, c, size, v=255):
    x, y = c
    if size < 1:
        return
    for ang in (0, math.pi / 2):
        dx, dy = math.cos(ang) * size, math.sin(ang) * size
        tri = np.array([[x - dx, y - dy], [x + dy * 0.12, y - dx * 0.12], [x + dx, y + dy], [x - dy * 0.12, y + dx * 0.12]])
        cv2.fillPoly(img, [np.round(tri * 16).astype(np.int32)], v, cv2.LINE_AA, SH)
    circle(img, c, size * 0.14, v)


# ---------------------------------------------------------------- doodles (hand-drawn, in world coordinates)
def _rng(seed):
    return np.random.RandomState(seed)

def _wobble(p, seed, amt=0.035):
    r = _rng(seed)
    return p + r.normal(0, amt, p.shape)

def d_star(seed):
    a = np.linspace(0, 2 * math.pi, 11) - math.pi / 2
    rr = np.array([1, .42] * 5 + [1])
    return [_wobble(np.stack([np.cos(a) * rr, np.sin(a) * rr], 1), seed)]

def d_heart(seed):
    t = np.linspace(0, 2 * math.pi, 48)
    x = 16 * np.sin(t) ** 3 / 17
    y = -(13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t)) / 17
    return [_wobble(np.stack([x, y], 1), seed)]

def d_plane(seed):
    return [_wobble(np.array([[-1, .2], [1, -.6], [-.2, .7], [-1, .2]]), seed, .02), _wobble(np.array([[-.2, .7], [-.1, .05], [1, -.6]]), seed + 1, .02)]

def d_loop(seed):
    t = np.linspace(0, 2.6 * 2 * math.pi, 90)
    r = 0.12 + t / (2.6 * 2 * math.pi) * 0.88
    return [_wobble(np.stack([np.cos(t) * r, np.sin(t) * r], 1), seed, .015)]

def d_bolt(seed):
    return [_wobble(np.array([[.2, -1], [-.5, .1], [0, .1], [-.3, 1], [.6, -.2], [.05, -.2], [.2, -1]]), seed, .02)]

def d_smile(seed):
    a = np.linspace(0, 2 * math.pi, 40)
    face = np.stack([np.cos(a), np.sin(a)], 1)
    m = np.linspace(0.15 * math.pi, 0.85 * math.pi, 14)
    mouth = np.stack([np.cos(m) * 0.55, np.sin(m) * 0.5 + 0.05], 1)
    e1 = np.stack([np.cos(a[:12] * 2) * .08 - .35, np.sin(a[:12] * 2) * .08 - .3], 1)
    e2 = np.stack([np.cos(a[:12] * 2) * .08 + .35, np.sin(a[:12] * 2) * .08 - .3], 1)
    return [_wobble(face, seed, .02), mouth, e1, e2]

def d_x(seed):
    return [_wobble(np.array([[-1, -1], [1, 1]]), seed, .03), _wobble(np.array([[1, -1], [-1, 1]]), seed + 1, .03)]

def d_o(seed):
    a = np.linspace(0, 2 * math.pi * 1.06, 40)
    return [_wobble(np.stack([np.cos(a), np.sin(a)], 1), seed, .03)]

def d_plus(seed):
    return [np.array([[0, -1], [0, 1]], float), np.array([[-1, 0], [1, 0]], float)]

def d_squig(seed):
    x = np.linspace(-1, 1, 50)
    return [np.stack([x, np.sin(x * 9) * 0.22], 1)]

def d_arrow(seed):
    t = np.linspace(0, 1, 40)
    x = -1 + 2 * t
    y = -np.sin(t * math.pi * 1.2) * 0.8
    body = np.stack([x, y], 1)
    tip = body[-1]
    return [_wobble(body, seed, .015), np.array([tip + [-.25, -.22], tip, tip + [-.3, .15]])]

DOODLES = [  # kind, world offset from the word's centre, size, rotation (deg), draw from, draw to
    (d_star, (-430, -290), 70, -12, 0.50, 0.95),
    (d_heart, (400, -330), 66, 14, 0.62, 1.05),
    (d_plane, (-360, 330), 82, -8, 0.72, 1.15),
    (d_loop, (390, 300), 64, 0, 0.80, 1.25),
    (d_bolt, (-60, -420), 60, 10, 0.90, 1.30),
    (d_smile, (80, 410), 58, 8, 0.98, 1.38),
    (d_x, (-440, -175), 34, 0, 1.05, 1.28),
    (d_o, (450, 175), 32, 0, 1.10, 1.34),
    (d_plus, (-230, -380), 26, 0, 1.12, 1.30),
    (d_squig, (230, -400), 90, -6, 1.00, 1.34),
    (d_arrow, (-120, 390), 86, 6, 1.18, 1.46),
    (d_star, (470, 410), 34, 20, 1.20, 1.46),
    (d_heart, (-470, -430), 30, -18, 1.22, 1.48),
]
DOODLE_PATHS = []
for i, (fn, off, size, rot, a, b) in enumerate(DOODLES):
    rr = math.radians(rot)
    m = np.array([[math.cos(rr), -math.sin(rr)], [math.sin(rr), math.cos(rr)]])
    paths = [(p @ m.T) * size + np.array([CX + off[0], CY + off[1]]) for p in fn(100 + i * 7)]
    DOODLE_PATHS.append((paths, a, b))


def draw_doodles(layer, t, s, z, sk, fade):
    for paths, a, b in DOODLE_PATHS:
        u = out_cubic(prog(t, a, b))
        if u <= 0 or fade <= 0:
            continue
        total = sum(len(p) for p in paths)
        budget = u * total
        for p in paths:
            if budget <= 1:
                break
            n = int(min(len(p), budget))
            budget -= len(p)
            pts = [to_screen(q, s, z, sk) for q in p[:n]]
            poly(layer, pts, int(255 * fade), 5 * min(s, 2.5))


# ---------------------------------------------------------------- the letters
def letter_state(t):
    """Per letter: outline progress, fill, pop scale."""
    out = {}
    starts = {'N': 0.18, 'O1': 0.30, 'O2': 0.42, 'B': 0.54}
    fills = {'N': 1.10, 'O1': 1.17, 'O2': 1.24, 'B': 1.31}
    for k in LET:
        draw = in_out(prog(t, starts[k], starts[k] + 0.62))
        fill = smooth(prog(t, fills[k], fills[k] + 0.2))
        pop = 1.0 + 0.07 * math.sin(math.pi * prog(t, fills[k], fills[k] + 0.28)) if t > fills[k] else 1.0
        out[k] = (draw, fill, pop)
    return out


def gaze(t):
    """Where the eyes look (in eye radii), and how open they are."""
    gx = 0.0
    if t > 1.55:
        gx = -0.14 * smooth(prog(t, 1.55, 1.68))
    if t > 1.82:
        gx = -0.14 + 0.28 * smooth(prog(t, 1.82, 1.96))
    if t > 2.06:
        gx = 0.14 * (1 - smooth(prog(t, 2.06, 2.20)))
    gy = 0.0
    blink = 1.0
    if 1.98 < t < 2.14:
        blink = abs(math.cos(math.pi * prog(t, 1.98, 2.14))) * 0.88 + 0.12
    open_ = out_back(prog(t, 1.30, 1.52))
    return gx, gy, blink, open_


def render_letters(g, t, s, z, sk):
    st = letter_state(t)
    gx, gy, blink, open_ = gaze(t)
    for key in ('N', 'B'):
        draw, fill, pop = st[key]
        if fill <= 0:
            continue
        wd = WN if key == 'N' else WB
        cx = LET[key]
        k = pop * s
        # which mask level keeps the picture sharp
        lv = 1
        for L in LEVELS:
            lv = L
            if k <= L:
                break
        ox = cx - wd / 2
        oy = LCY - CAP / 2
        # the letter pops about its own centre
        wx, wy = cx + (ox - cx) * pop, LCY + (oy - LCY) * pop
        sx, sy = to_screen((wx, wy), s, z, sk)
        sc = k / lv
        x1, y1 = sx + wd * k, sy + CAP * k
        if x1 < -50 or sx > W + 50 or y1 < -50 or sy > H + 50:
            continue
        M = np.array([[sc, 0, sx], [0, sc, sy]], np.float32)
        m = cv2.warpAffine(MASKS[key][lv], M, (W, H), flags=cv2.INTER_LINEAR, borderValue=0)
        # the fill wipes in from the left
        if fill < 1:
            xs = np.arange(W, dtype=np.float32)
            edge = sx + wd * k * fill * 1.15
            ramp = np.clip((edge - xs) / (40.0 * max(k, 1)) + 0.0, 0, 1)
            m = (m.astype(np.float32) * ramp[None, :]).astype(np.uint8)
        np.maximum(g, m, out=g)
    for key in ('O1', 'O2'):
        draw, fill, pop = st[key]
        cx = LET[key]
        c = to_screen((cx, LCY), s, z, sk)
        r = R * pop * s
        if c[0] + r < -50 or c[0] - r > W + 50 or c[1] + r < -50 or c[1] - r > H + 50:
            continue
        if fill > 0:
            tmp = np.zeros((H, W), np.uint8)
            circle(tmp, c, r * (0.2 + 0.8 * fill) if fill < 1 else r, int(255 * min(1.0, fill * 1.4)))
            np.maximum(g, tmp, out=g)
        if fill >= 0.6 and open_ > 0:
            # the eye: a big black pupil with a white glint at its upper right
            rp = R * 0.64 * s * pop * open_
            pc = (c[0] + gx * R * s * pop, c[1] + gy * R * s * pop)
            if blink < 0.999:
                cv2.ellipse(g, (int(round(pc[0] * 16)), int(round(pc[1] * 16))), (int(round(rp * 16)), int(round(rp * blink * 16))), 0, 0, 360, 0, -1, cv2.LINE_AA, SH)
            else:
                circle(g, pc, rp, 0)
            if blink > 0.6:
                circle(g, (pc[0] + rp * 0.34, pc[1] - rp * 0.36), rp * 0.20, 255)
    return st


def render_strokes(layer, t, s, z, sk):
    """The pen: outlines drawn on, with a glowing tip."""
    st = letter_state(t)
    tips = []
    for key in ('N', 'B'):
        draw, fill, pop = st[key]
        if draw <= 0:
            continue
        fade = 1.0 - smooth(prog(t, 1.18, 1.5)) if True else 1.0
        if fade <= 0:
            continue
        for cnt in OUTLINES[key]:
            n = max(2, int(len(cnt) * draw))
            pts = [to_screen(q, s, z, sk) for q in cnt[:n]]
            poly(layer, pts, int(255 * fade), 5)
            if draw < 1:
                tips.append(pts[-1])
    for key in ('O1', 'O2'):
        draw, fill, pop = st[key]
        if draw <= 0:
            continue
        fade = 1.0 - smooth(prog(t, 1.18, 1.5))
        if fade <= 0:
            continue
        c = to_screen((LET[key], LCY), s, z, sk)
        ang = 360.0 * draw
        cv2.ellipse(layer, (int(round(c[0] * 16)), int(round(c[1] * 16))), (int(R * s * 16), int(R * s * 16)), 0, -90, -90 + ang, int(255 * fade), 5, cv2.LINE_AA, SH)
        if draw < 1:
            a = math.radians(-90 + ang)
            tips.append((c[0] + math.cos(a) * R * s, c[1] + math.sin(a) * R * s))
    for tp in tips:
        circle(layer, tp, 9, 255)
    return tips


# ---------------------------------------------------------------- the app that opens out of the pupil
def _wallpaper():
    img = np.full((H, W), 12, np.uint8)
    r = _rng(7)
    kinds = [d_star, d_heart, d_plus, d_o, d_x, d_bolt, d_squig, d_loop]
    lay = np.zeros((H, W), np.uint8)
    for i in range(46):
        fn = kinds[i % len(kinds)]
        c = np.array([r.uniform(40, W - 40), r.uniform(40, H - 40)])
        size = r.uniform(26, 52)
        rot = r.uniform(-0.6, 0.6)
        m = np.array([[math.cos(rot), -math.sin(rot)], [math.sin(rot), math.cos(rot)]])
        for p in fn(300 + i):
            poly(lay, (p @ m.T) * size + c, 255, 3)
    return np.clip(img.astype(np.float32) + lay.astype(np.float32) * 0.075, 0, 255).astype(np.uint8)


WALL = _wallpaper()
_f = ImageFont.truetype(BLACKF, 78)
_im = Image.new('L', (400, 120), 0)
ImageDraw.Draw(_im).text((6, 10), 'NOOB', font=_f, fill=255)
LOGO_SMALL = np.asarray(_im.crop(_im.getbbox()), np.uint8)


def home_scene(t):
    """A stand-in for the app's first screen (drawn in code, not a screenshot): header, stories, two posts, bottom bar. Things settle in one after another."""
    g = WALL.copy()
    u0 = prog(t, REVEAL_A + 0.05, REVEAL_A + 0.55)
    # header
    a = out_cubic(prog(t, REVEAL_A + 0.10, REVEAL_A + 0.45))
    lh, lw = LOGO_SMALL.shape
    y = int(112 - (1 - a) * 30)
    roi = g[y:y + lh, 56:56 + lw]
    roi[:] = np.maximum(roi, (LOGO_SMALL * a).astype(np.uint8))
    for i, cx in enumerate((830, 920, 1010)):
        circle(g, (cx, y + lh / 2), 26, int(150 * a), 3)
    # stories
    for i in range(6):
        a = out_back(prog(t, REVEAL_A + 0.16 + i * 0.05, REVEAL_A + 0.5 + i * 0.05))
        cx, cy = 100 + i * 175, 300
        circle(g, (cx, cy), 74 * a, 190 if i else 255, 4)
        circle(g, (cx, cy), 60 * a, 52)
        if i == 0:
            poly(g, [(cx - 18 * a, cy), (cx + 18 * a, cy)], 235, 5)
            poly(g, [(cx, cy - 18 * a), (cx, cy + 18 * a)], 235, 5)
        rrect(g, cx - 38 * a, cy + 92, cx + 38 * a, cy + 104, 6, int(70 * a))
    # posts
    for j, y0 in enumerate((470, 1190)):
        a = out_cubic(prog(t, REVEAL_A + 0.28 + j * 0.10, REVEAL_A + 0.68 + j * 0.10))
        dy = int((1 - a) * 90)
        y1 = y0 + dy
        if a <= 0.01:
            continue
        card = np.zeros((H, W), np.uint8)
        rrect(card, 40, y1, 1040, y1 + 680, 38, 255)
        base = (card.astype(np.float32) / 255.0)
        g = (g.astype(np.float32) * (1 - base * 0.9 * a) + 26 * base * a).astype(np.uint8)
        circle(g, (110, y1 + 62), 34 * a, int(120 * a))
        rrect(g, 166, y1 + 40, 166 + 230, y1 + 56, 8, int(150 * a))
        rrect(g, 166, y1 + 68, 166 + 140, y1 + 80, 6, int(80 * a))
        img = np.zeros((H, W), np.uint8)
        rrect(img, 60, y1 + 120, 1020, y1 + 590, 26, 255)
        b2 = img.astype(np.float32) / 255.0
        g = (g.astype(np.float32) * (1 - b2 * 0.9 * a) + 40 * b2 * a).astype(np.uint8)
        if j == 0:
            for q in (d_heart(5)[0],):
                poly(g, q * 120 + np.array([540, y1 + 355]), int(190 * a), 6)
        else:
            for q in d_star(9):
                poly(g, q * 120 + np.array([540, y1 + 355]), int(190 * a), 6)
        for k2, x in enumerate((90, 180, 270)):
            circle(g, (x, y1 + 635), 20 * a, int(150 * a), 3)
    # bottom bar
    a = out_cubic(prog(t, REVEAL_A + 0.34, REVEAL_A + 0.70))
    by = int(H - 130 + (1 - a) * 140)
    g[by:, :] = (g[by:, :].astype(np.float32) * 0.25 + 9).astype(np.uint8)
    cv2.line(g, (0, by), (W, by), 55, 2)
    for i, cx in enumerate((110, 290, 540, 790, 970)):
        if i == 2:
            circle(g, (cx, by + 62), 36, 230, 4)
            poly(g, [(cx - 14, by + 62), (cx + 14, by + 62)], 230, 4)
            poly(g, [(cx, by + 48), (cx, by + 76)], 230, 4)
        else:
            rrect(g, cx - 24, by + 38, cx + 24, by + 86, 12, 150 if i != 0 else 240)
    return g


# ---------------------------------------------------------------- one frame
_YY, _XX = np.mgrid[0:H, 0:W].astype(np.float32)
VIGN = np.clip(1.0 - 0.38 * (((_XX - W / 2) / (W * 0.75)) ** 2 + ((_YY - H / 2) / (H * 0.75)) ** 2), 0.55, 1.0)


def world_frame(t, s, z, sk):
    g = np.zeros((H, W), np.uint8)
    # pen outlines + doodles
    layer = np.zeros((H, W), np.uint8)
    render_strokes(layer, t, s, z, sk)
    d_fade = 1.0 - smooth(prog(t, 2.0, 2.3))
    if t < 2.4:
        draw_doodles(layer, t, s, z, sk, d_fade)
    letters = np.zeros((H, W), np.uint8)
    render_letters(letters, t, s, z, sk)
    g = np.maximum(layer, letters)
    # soft glow around the pen and around the white letters
    if t < 1.6:
        g = glow_add(g, layer, 22, 0.9)
    bloom = 0.30 + 0.5 * smooth(prog(t, ZOOM_A, ZOOM_B))
    if t > 1.1:
        g = glow_add(g, letters, 38, bloom)
    # sparkles when a letter fills
    for key, tt in (('N', 1.12), ('O1', 1.19), ('O2', 1.26), ('B', 1.33)):
        u = prog(t, tt, tt + 0.30)
        if 0 < u < 1:
            c = to_screen((LET[key] + 40, LCY - CAP / 2 - 52), s, z, sk)
            sparkle(g, c, 62 * math.sin(math.pi * u) ** 0.8)
    return g


def frame_at(t):
    s, z, sk = camera(t)
    u = prog(t, ZOOM_A, ZOOM_B)
    if 0.12 < u < 1.0:   # a little motion blur while the camera dives
        acc = np.zeros((H, W), np.float32)
        n = 3
        for i in range(n):
            tt = t + (i - (n - 1) / 2) * (0.55 / FPS)
            s2, z2, sk2 = camera(tt)
            acc += world_frame(tt, s2, z2, sk2).astype(np.float32)
        g = (acc / n).astype(np.uint8)
    else:
        g = world_frame(t, s, z, sk)
    # the app opens out of the pupil like an iris
    if t >= REVEAL_A:
        ur = out_cubic(prog(t, REVEAL_A, REVEAL_B))
        rad = ur * math.hypot(W, H) * 0.62
        home = home_scene(t)
        mask = np.zeros((H, W), np.uint8)
        circle(mask, (W / 2, H / 2), rad, 255)
        m = (mask.astype(np.float32) / 255.0)
        ring = np.zeros((H, W), np.uint8)
        if 0 < ur < 1:
            circle(ring, (W / 2, H / 2), rad, int(255 * (1 - ur) ** 0.7), 8)
        g = (g.astype(np.float32) * (1 - m) + home.astype(np.float32) * m).astype(np.uint8)
        g = np.maximum(g, ring)
        if 0 < ur < 1:
            g = glow_add(g, ring, 30, 1.2)
    out = (g.astype(np.float32) * VIGN).astype(np.uint8)
    # a touch of film grain while it is still dark
    rgb = cv2.cvtColor(out, cv2.COLOR_GRAY2RGB)
    return rgb


# ---------------------------------------------------------------- sound
SR = 44100

def _env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)

def make_audio(path):
    n = int(SR * T)
    L = np.zeros(n)
    Rr = np.zeros(n)
    r = np.random.RandomState(3)

    def add(sig, at, pan=0.0, gain=1.0):
        i = int(at * SR)
        j = min(n, i + len(sig))
        if i >= n:
            return
        seg = sig[:j - i] * gain
        L[i:j] += seg * (1 - max(0, pan))
        Rr[i:j] += seg * (1 + min(0, pan))

    def tone(f0, f1, dur, att=0.002, dec=0.1, harm=()):
        m = int(dur * SR)
        tt = np.arange(m) / SR
        f = f0 * (f1 / f0) ** (tt / dur)
        ph = 2 * math.pi * np.cumsum(f) / SR
        s = np.sin(ph)
        for k, a in harm:
            s += a * np.sin(ph * k)
        return s * _env(m, att, dec)

    def noise(dur, lp=None):
        m = int(dur * SR)
        x = r.normal(0, 1, m)
        if lp:
            a = math.exp(-2 * math.pi * lp / SR)
            y = np.zeros(m)
            acc = 0.0
            for i in range(m):
                acc = (1 - a) * x[i] + a * acc
                y[i] = acc
            x = y / (np.max(np.abs(y)) + 1e-9)
        return x

    # a very quiet room
    room = noise(T, 300) * 0.02
    L += room
    Rr += room
    # the pen scratching, in four strokes
    for a, b, pan in ((0.18, 0.80, -0.5), (0.30, 0.92, -0.15), (0.42, 1.04, 0.15), (0.54, 1.16, 0.5)):
        m = int((b - a) * SR)
        x = noise(b - a)
        x = np.diff(x, prepend=0) * 0.5
        tt = np.linspace(0, 1, m)
        env = np.sin(math.pi * tt) ** 1.5 * (0.6 + 0.4 * np.abs(np.sin(tt * 40)))
        add(x * env, a, pan, 0.10)
    # the letters fill with a soft pop each
    for i, at in enumerate((1.10, 1.17, 1.24, 1.31)):
        add(tone(260 + i * 60, 620 + i * 90, 0.20, 0.002, 0.05, ((2, 0.25),)), at, (-0.5 + i / 3), 0.30)
        add(tone(90, 60, 0.25, 0.002, 0.09), at, 0, 0.28)
    # the eyes open: two small bells
    for at, f, pan in ((1.46, 1318.5, -0.3), (1.56, 1975.5, 0.3)):
        add(tone(f, f, 0.7, 0.002, 0.16, ((2, 0.35), (3, 0.12))), at, pan, 0.16)
    # looking left, right and the blink: tiny clicks
    for at in (1.56, 1.84, 1.99, 2.12):
        add(noise(0.012) * np.exp(-np.arange(int(0.012 * SR)) / (0.003 * SR)), at, 0, 0.12)
    # the dive: a riser
    a, b = 2.15, 3.10
    m = int((b - a) * SR)
    tt = np.linspace(0, 1, m)
    add(tone(180, 2600, b - a, 0.2, 5.0, ((2, 0.3),)) * (tt ** 2.2), a, 0, 0.16)
    x = np.diff(noise(b - a), prepend=0)
    add(x * (tt ** 3.0), a, 0, 0.22)
    # the white flash: a deep hit
    add(tone(70, 36, 1.0, 0.003, 0.34, ((2, 0.2),)), 3.10, 0, 0.75)
    add(noise(0.4, 900) * _env(int(0.4 * SR), 0.002, 0.10), 3.10, 0, 0.55)
    add(np.diff(noise(0.5), prepend=0) * _env(int(0.5 * SR), 0.004, 0.14), 3.10, 0, 0.18)
    # the app opens: a sparkle of notes
    notes = (1046.5, 1318.5, 1568.0, 1760.0, 2093.0)
    for i, f in enumerate(notes):
        at = 3.20 + i * 0.075
        add(tone(f, f, 0.8, 0.002, 0.20, ((2, 0.3), (3, 0.1))), at, -0.6 + 0.3 * i, 0.15)
    add(tone(261.6, 261.6, 0.9, 0.05, 0.4, ((2, 0.3), (3, 0.2))), 3.2, 0, 0.10)
    add(tone(392.0, 392.0, 0.9, 0.05, 0.4, ((2, 0.3), (3, 0.2))), 3.2, 0, 0.08)
    out = np.stack([L, Rr], 1)
    out = np.tanh(out * 1.6) / np.tanh(1.6)
    out *= 10 ** (-3 / 20) / max(1e-6, np.max(np.abs(out)))
    fade = np.ones(n)
    fade[-int(0.12 * SR):] = np.linspace(1, 0, int(0.12 * SR))
    out *= fade[:, None]
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((out * 32767).astype('<i2').tobytes())
    print('audio ok', path)


# ---------------------------------------------------------------- output
def render(wav, out):
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ff, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', wav,
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(T * FPS)
    for i in range(n):
        p.stdin.write(frame_at(i / FPS).tobytes())
        if i % 30 == 0:
            print(f'frame {i}/{n}', flush=True)
    p.stdin.close()
    p.wait()
    print('video ok', out)


def sheet(out, times=None):
    times = times or [0.2, 0.5, 0.8, 1.1, 1.3, 1.5, 1.7, 2.0, 2.4, 2.8, 3.0, 3.1, 3.2, 3.35, 3.55, 3.95]
    tiles = []
    for t in times:
        f = cv2.resize(frame_at(t), (270, 480), interpolation=cv2.INTER_AREA)
        cv2.putText(f, f'{t:.2f}', (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 90, 90), 2)
        tiles.append(f)
    cols = 8
    rows = [np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]
    Image.fromarray(np.vstack(rows)).save(out)
    print('sheet ok', out)


def export_js(out):
    """The drawn shapes (the outlines of N and B, the doodles) as a script for the in-app version (instagram/public/opening/opening.js draws the same animation live on a canvas)."""
    import json
    import re

    def flat(a):
        return np.round(np.asarray(a, np.float64), 1).ravel().tolist()

    data = {
        'N': [flat(c[:-1][::2]) for c in OUTLINES['N']],
        'B': [flat(c[:-1][::2]) for c in OUTLINES['B']],
        'doodles': [{'a': a, 'b': b, 'paths': [flat(p) for p in paths]} for paths, a, b in DOODLE_PATHS],
    }
    text = json.dumps(data, separators=(',', ':'))
    text = re.sub(r'(\d)\.0(?![\d])', lambda m: m.group(1), text)
    with open(out, 'w', encoding='utf8', newline='\n') as f:
        f.write('// Generated by promo/opening.py (python opening.py export <this file>): the outlines of N and B and the doodles of the opening animation.\n')
        f.write('window.__NOOB_OPENING_DATA=' + text + ';\n')
    print('export ok', out, len(text), 'bytes')


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'export':
        export_js(sys.argv[2])
    elif mode == 'sheet':
        sheet(sys.argv[2])
    elif mode == 'audio':
        make_audio(sys.argv[2])
    elif mode == 'render':
        render(sys.argv[2], sys.argv[3])
    elif mode == 'frame':
        Image.fromarray(frame_at(float(sys.argv[2]))).save(sys.argv[3])
