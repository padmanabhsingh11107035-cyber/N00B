#!/usr/bin/env python3
"""Paint PBR costume textures for every humanoid variant from the Blender UV-space bake.

  python3 scripts/assets/paint-characters.py [variant ...]

Inputs : assets/build/chars/<gender>-bake.npz (per-texel rest position P, normal N, bone-region
         weights G, coverage C) + the original Quaternius skin textures (anatomy detail).
Outputs: public/models/chars/<variant>_albedo.webp (1024), <variant>_orm.webp (512, glTF ORM:
         R=AO, G=roughness, B=metalness), <variant>_emit.webp (512, only when emissive),
         <gender>_normal.webp (1024, shared).
Coordinates: Blender rest pose, metres. +x = character's left, -y = front, +z = up.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = '/home/ubuntu/aegisrun'
UBC = ROOT + '/assets/source/quaternius-ubc/Universal Base Characters[Standard]/Base Characters/'
OUT = ROOT + '/public/models/chars'
os.makedirs(OUT, exist_ok=True)

LM = {  # skeleton landmarks from the rest pose (see build-characters.py output)
    'male': dict(head=1.60, eye=1.705, shoulder=1.456, wrist=0.70, pelvis=0.949, knee=0.542, ankle=0.087, top=1.81),
    'female': dict(head=1.55, eye=1.657, shoulder=1.418, wrist=0.64, pelvis=0.932, knee=0.535, ankle=0.071, top=1.767),
}

# ── small numpy toolkit ──────────────────────────────────────────────────

def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def srgb2lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin2srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def box(a, r):
    """Separable box blur (edge-clamped) on HxW or HxWxC float arrays."""
    if r < 1:
        return a
    for ax in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[ax] = (r + 1, r)
        c = np.cumsum(np.pad(a, pad, mode='edge'), axis=ax, dtype=np.float64)
        hi = np.take(c, np.arange(2 * r + 1, c.shape[ax]), axis=ax)
        lo = np.take(c, np.arange(0, c.shape[ax] - 2 * r - 1), axis=ax)
        a = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return a


def blur(a, r):
    return box(box(box(a, r), r), r)


def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def band(x, c, w, soft=0.004):
    """1 inside |x-c|<w with soft edges."""
    return 1 - ss(w, w + soft, np.abs(x - c))


def dilate(img, cov, iters=14):
    img = img.copy()
    m = cov.astype(np.float32)
    for _ in range(iters):
        acc = np.zeros_like(img)
        wacc = np.zeros_like(m)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                acc += np.roll(np.roll(img * m[..., None] if img.ndim == 3 else img * m, dy, 0), dx, 1)
                wacc += np.roll(np.roll(m, dy, 0), dx, 1)
        fill = (m == 0) & (wacc > 0)
        if img.ndim == 3:
            img[fill] = acc[fill] / wacc[fill][:, None]
        else:
            img[fill] = acc[fill] / wacc[fill]
        m = np.maximum(m, fill.astype(np.float32))
    rest = m == 0
    if rest.any():
        img[rest] = img[~rest].mean(0)
    return img


def noise(shape, scale, seed):
    rng = np.random.default_rng(seed)
    n = rng.random((shape[0] // scale + 2, shape[1] // scale + 2)).astype(np.float32)
    im = Image.fromarray((n * 255).astype(np.uint8)).resize((shape[1] + scale * 2, shape[0] + scale * 2), Image.BICUBIC)
    return np.asarray(im, np.float32)[:shape[0], :shape[1]] / 255


def save_rgb(a, path, size, q=84):
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    im.resize((size, size), Image.LANCZOS).save(path, 'WEBP', quality=q, method=6)


# ── painter ─────────────────────────────────────────────────────────────

class Canvas:
    def __init__(self, gender):
        d = np.load(f'{ROOT}/assets/build/chars/{gender}-bake.npz')
        self.g = gender
        self.P = d['P'].astype(np.float32)
        self.N = d['N'].astype(np.float32)
        self.C = d['C']
        keys = [str(k) for k in d['keys']]
        G = d['G'].astype(np.float32) / 255
        self.w = {k: G[..., i] for i, k in enumerate(keys)}
        self.R = self.P.shape[0]
        self.lm = LM[gender]
        src = 'T_Superhero_Male_Ligh.png' if gender == 'male' else 'T_Superhero_Female_Light_BaseColor.png'
        orig = np.asarray(Image.open(UBC + 'Textures/' + src).convert('RGB').resize((self.R, self.R)), np.float32) / 255
        self.orig = orig
        lum = orig @ np.array([0.299, 0.587, 0.114], np.float32)
        self.lum = lum
        # High-pass anatomy detail (muscle definition, knuckles, facial features) for fabric + skin.
        self.detail = np.clip(lum / (blur(lum, max(2, self.R // 170)) + 1e-4), 0.55, 1.6)
        self.skin_ratio = np.clip(orig / (blur(orig, max(3, self.R // 70)) + 1e-4), 0.4, 1.8)
        rough = np.asarray(Image.open(UBC + 'Godot - UE/' + ('T_Superhero_Male_Roughness.png' if gender == 'male' else 'T_Superhero_Female_Roughness.png')).convert('RGB').resize((self.R, self.R)), np.float32) / 255
        self.orig_rough = rough[..., 1]
        x, y, z = self.P[..., 0], self.P[..., 1], self.P[..., 2]
        self.x, self.y, self.z = x, y, z
        self.ax = np.abs(x)
        self.nx, self.ny, self.nz = self.N[..., 0], self.N[..., 1], self.N[..., 2]
        self.front = ss(-0.1, -0.45, self.ny)
        self.back = ss(0.1, 0.45, self.ny)
        L = self.lm
        self.head = np.clip(self.w['head'] + ss(L['head'] - 0.02, L['head'] + 0.03, z) * (self.ax < 0.2), 0, 1)
        self.neck = np.clip(self.w['neck'], 0, 1) * (1 - self.head)
        self.hand = ss(0.35, 0.65, self.w['hand'] + ss(L['wrist'] - 0.035, L['wrist'] + 0.005, self.ax) * (z > L['shoulder'] - 0.2))
        self.torso = np.clip(self.w['torso'] + self.w['pelvis'], 0, 1)
        self.arm = np.clip(self.w['upperarm'] + self.w['lowerarm'], 0, 1)
        self.leg = np.clip(self.w['thigh'] + self.w['calf'] + self.w['foot'], 0, 1)
        self.fabric_tex = self._fabric()
        # Layers (linear colour, roughness, metalness, emissive rgb)
        R = self.R
        self.col = np.zeros((R, R, 3), np.float32)
        self.rough = np.full((R, R), 0.55, np.float32)
        self.metal = np.zeros((R, R), np.float32)
        self.emit = np.zeros((R, R, 3), np.float32)
        self.has_emit = False

    def _fabric(self):
        p = ROOT + '/assets/source/polyhaven/cotton_jersey/cotton_jersey_diff_1k.jpg'
        t = np.asarray(Image.open(p).convert('L').resize((256, 256), Image.LANCZOS), np.float32) / 255
        reps = self.R // 256 + 1
        t = np.tile(t, (reps, reps))[:self.R, :self.R]
        return 1 + (t - t.mean()) * 0.5

    # paint(mask, colour) blends a flat material into the layers.
    def paint(self, mask, color, rough=None, metal=None, detail=0.55, fabric=True, emit=None, emit_k=1.0):
        m = np.clip(mask, 0, 1)[..., None]
        c = srgb2lin(hexc(color) if isinstance(color, str) else np.asarray(color, np.float32))
        shade = self.detail ** detail
        if fabric:
            shade = shade * self.fabric_tex
        base = c[None, None, :] * shade[..., None] if c.ndim == 1 else c * shade[..., None]
        self.col = self.col * (1 - m) + base * m
        if rough is not None:
            self.rough = self.rough * (1 - m[..., 0]) + rough * m[..., 0]
        if metal is not None:
            self.metal = self.metal * (1 - m[..., 0]) + metal * m[..., 0]
        if emit is not None:
            self.has_emit = True
            e = srgb2lin(hexc(emit)) * emit_k
            self.emit = self.emit * (1 - m) + e[None, None, :] * m

    def skin(self, tone, mask=None):
        tone_l = srgb2lin(hexc(tone))
        mask = np.ones(self.P.shape[:2], np.float32) if mask is None else mask
        base = tone_l[None, None, :] * srgb2lin(np.clip(self.skin_ratio, 0, 2) * 0.5) / srgb2lin(np.float32(0.5))
        m = mask[..., None]
        self.col = self.col * (1 - m) + base * m
        self.rough = self.rough * (1 - mask) + (0.42 + 0.25 * self.orig_rough) * mask
        self.metal = self.metal * (1 - mask)

    def save(self, name):
        col = dilate(lin2srgb(self.col), self.C)
        save_rgb(col, f'{OUT}/{name}_albedo.webp', 1024)
        orm = np.stack([np.ones_like(self.rough), np.clip(self.rough, 0.04, 1), np.clip(self.metal, 0, 1)], -1)
        save_rgb(dilate(orm, self.C, 8), f'{OUT}/{name}_orm.webp', 512, q=90)
        if self.has_emit:
            save_rgb(dilate(lin2srgb(self.emit), self.C, 8), f'{OUT}/{name}_emit.webp', 512, q=88)
        return self.has_emit


# ── costume building blocks ─────────────────────────────────────────────

def suit_base(c, color, panel=None, piping=None, piping_w=0.035, collar_z=None, piping_metal=0.85):
    """Full-body suit with side panels (by surface normal) and metallic piping between them."""
    L = c.lm
    body = 1 - c.head
    c.paint(body, color, rough=0.62, metal=0.0, detail=0.6)
    if panel:
        s = c.nx ** 2
        torso_panel = ss(0.42, 0.47, s) * c.torso * (c.z < L['shoulder'] - 0.02)
        leg_panel = ss(0.5, 0.55, s) * c.leg
        arm_panel = ss(0.45, 0.5, c.nz) * c.arm
        c.paint((torso_panel + leg_panel + arm_panel).clip(0, 1) * body, panel, rough=0.5, detail=0.6)
        if piping:
            pipe = (band(s, 0.445, piping_w * 0.6, 0.01) * c.torso * (c.z < L['shoulder'] - 0.02)
                    + band(s, 0.525, piping_w * 0.6, 0.01) * c.leg + band(c.nz, 0.475, piping_w * 0.6, 0.01) * c.arm)
            c.paint(pipe.clip(0, 1) * body, piping, rough=0.3, metal=piping_metal, detail=0.3, fabric=False)
    if collar_z is not None:
        c.paint(band(c.z, collar_z, 0.012) * (c.neck + c.torso * (c.z > L['shoulder'])).clip(0, 1), piping or color, rough=0.3, metal=min(0.8, piping_metal) if piping else 0, fabric=False)


def boots(c, color, top=None, cuff=None, rough=0.3, metal=0.05, cuff_metal=0.9):
    L = c.lm
    top = top if top is not None else L['knee'] - 0.1
    m = ss(top + 0.006, top - 0.006, c.z) * c.leg
    c.paint(m, color, rough=rough, metal=metal, detail=0.35, fabric=False)
    # rubber sole
    c.paint(ss(0.024, 0.016, c.z) * c.leg, '#15141a', rough=0.8, metal=0, detail=0.2, fabric=False)
    if cuff:
        c.paint(band(c.z, top + 0.012, 0.012) * c.leg, cuff, rough=0.28, metal=cuff_metal, detail=0.25, fabric=False)


def gloves(c, color, cuff=None, length=0.11, rough=0.32, metal=0.02, cuff_metal=0.9):
    L = c.lm
    m = np.clip(c.hand + ss(L['wrist'] - length - 0.006, L['wrist'] - length + 0.006, c.ax) * c.arm, 0, 1)
    c.paint(m, color, rough=rough, metal=metal, detail=0.45, fabric=False)
    if cuff:
        c.paint(band(c.ax, L['wrist'] - length + 0.012, 0.011) * c.arm, cuff, rough=0.28, metal=cuff_metal, fabric=False)


def belt(c, color, buckle=None, z=None, w=0.028):
    L = c.lm
    z = L['pelvis'] + 0.03 if z is None else z
    m = band(c.z, z, w) * c.torso * (c.ax < 0.25)
    c.paint(m, color, rough=0.3, metal=0.85, detail=0.3, fabric=False)
    if buckle:
        b = m * band(c.x, 0, 0.035) * c.front
        c.paint(b, buckle, rough=0.25, metal=0.2, fabric=False, emit=buckle, emit_k=0.9)


def emblem_shield(c, fill, border, letter, glow=None, zc=None, size=1.0):
    """Heraldic shield with a chevron 'A' on the chest (front torso)."""
    L = c.lm
    zc = L['shoulder'] - 0.13 if zc is None else zc
    u = c.x / size
    v = (c.z - zc) / size
    front = c.front * c.torso * (c.ny < -0.25)
    t = np.clip((v + 0.095) / 0.095, 0, 1)
    hw = 0.085 * np.where(v > 0, 1.0, t ** 0.75)
    inside = ss(0.004, -0.004, np.abs(u) - hw) * ss(0.004, -0.004, v - 0.07) * ss(-0.004, 0.004, v + 0.095)
    inner_hw = np.maximum(hw - 0.014, 0)
    inner = ss(0.003, -0.003, np.abs(u) - inner_hw) * ss(0.003, -0.003, v - 0.056) * ss(-0.003, 0.003, v + 0.075)
    c.paint(inside * front, border, rough=0.25, metal=0.95, detail=0.2, fabric=False)
    c.paint(inner * front, fill, rough=0.3, metal=0.1, detail=0.2, fabric=False)
    # chevron A: two legs from apex (0, .042) to (+-.042, -.058) + crossbar
    def seg(ax_, ay_, bx_, by_, w):
        px, py = u - ax_, v - ay_
        dx, dy = bx_ - ax_, by_ - ay_
        h = np.clip((px * dx + py * dy) / (dx * dx + dy * dy), 0, 1)
        d = np.hypot(px - dx * h, py - dy * h)
        return ss(w + 0.003, w - 0.003, d)
    a = np.maximum.reduce([seg(0, 0.042, -0.042, -0.058, 0.009), seg(0, 0.042, 0.042, -0.058, 0.009), seg(-0.024, -0.016, 0.024, -0.016, 0.007)])
    c.paint(a * inner * front, letter, rough=0.22, metal=0.95, detail=0.2, fabric=False, emit=glow, emit_k=0.6 if glow else 1.0)


def mask_band(c, color, emit=None):
    L = c.lm
    m = band(c.z, L['eye'] + 0.004, 0.03, 0.006) * c.head * ss(0.06, -0.02, c.y)
    c.paint(m, color, rough=0.28, metal=0.05, detail=0.25, fabric=False, emit=emit, emit_k=0.15 if emit else 1)


# ── variants ─────────────────────────────────────────────────────────────

def hero(c):
    L = c.lm
    c.skin('#e9b48f')
    # Aegis palette: deep navy suit, burnished gold armour pieces, crisp white piping and emblem.
    suit_base(c, '#121a3f', panel='#1d2a63', piping='#eef1f7', collar_z=L['head'] - 0.045, piping_metal=0.0)
    # tapering chest V a shade lighter than the navy base
    v = ss(0.012, -0.012, np.abs(c.x) - np.clip((c.z - (L['shoulder'] - 0.33)) * 0.55, 0, 0.2)) * c.front * c.torso * (c.z > L['pelvis'] + 0.08) * (c.z < L['shoulder'] + 0.02)
    c.paint(v, '#1a2556', rough=0.45, detail=0.6)
    boots(c, '#c89b3c', cuff='#f2f4f8', rough=0.34, metal=0.7, cuff_metal=0.0)
    gloves(c, '#c89b3c', cuff='#f2f4f8', rough=0.34, metal=0.7, cuff_metal=0.0)
    belt(c, '#d4a94a', buckle='#f6f8ff')
    emblem_shield(c, '#121a3f', '#d9b04f', '#ffffff', glow='#fff6de')
    mask_band(c, '#101734')
    return {'gender': 'male', 'hair': 'Hair_SimpleParted', 'hairColor': '#2c1a47', 'eyes': '#ffe3a1', 'eyeGlow': 1.1}


def classmate(c, suit, panel, trim, skin, *, gloves_c=None, boots_c=None, emblem=None, emit=None, sleeveless=False, legs=None):
    L = c.lm
    c.skin(skin)
    suit_base(c, suit, panel=panel, piping=trim, collar_z=L['head'] - 0.05)
    if sleeveless:
        c.skin(skin, mask=c.arm * ss(L['shoulder'] - 0.02, L['shoulder'] - 0.08, c.z * 0 + (L['shoulder'] - c.ax * 0.2)) + c.arm * ss(0.2, 0.24, c.ax))
    if legs:
        c.paint(c.leg * (c.z < L['pelvis'] - 0.02), legs, rough=0.55, detail=0.6)
    boots(c, boots_c or '#23232e', cuff=trim)
    gloves(c, gloves_c or suit, cuff=trim, length=0.06)
    belt(c, trim, buckle=emit or trim)
    if emblem == 'circuit' and emit:
        s = c.nx ** 2
        lines = (band(s, 0.3, 0.012, 0.01) * c.torso + band(c.nz, 0.3, 0.012, 0.01) * c.arm + band(s, 0.35, 0.012, 0.01) * c.leg) * (1 - c.head)
        c.paint(lines.clip(0, 1), emit, rough=0.3, metal=0.2, fabric=False, emit=emit, emit_k=1.4)
    elif emblem == 'sun':
        d = np.hypot(c.x, c.z - (L['shoulder'] - 0.13))
        ang = np.arctan2(c.z - (L['shoulder'] - 0.13), c.x)
        rays = (np.cos(ang * 12) > 0.3) * band(d, 0.075, 0.02)
        core = ss(0.05, 0.045, d)
        c.paint(np.clip(core + rays, 0, 1) * c.front * c.torso, trim, rough=0.25, metal=0.9, fabric=False, emit=emit, emit_k=0.6)
    elif emblem == 'clock':
        zc = L['shoulder'] - 0.13
        d = np.hypot(c.x, c.z - zc)
        ang = np.arctan2(c.z - zc, c.x)
        face = ss(0.07, 0.066, d)
        ring = band(d, 0.066, 0.006)
        ticks = (np.cos(ang * 12) > 0.93) * band(d, 0.055, 0.008)
        hands = band(c.x, 0, 0.004) * (c.z > zc) * (c.z < zc + 0.045) + band(c.z, zc, 0.004) * (c.x > 0) * (c.x < 0.035)
        m = c.front * c.torso
        c.paint(face * m, '#2a1747', rough=0.3, fabric=False)
        c.paint(np.clip(ring + ticks + hands, 0, 1) * m, trim, rough=0.25, metal=0.9, fabric=False, emit=emit, emit_k=0.8)
    elif emblem == 'flame':
        t = ss(L['knee'] + 0.1, 0.1, c.z) * c.leg
        n = noise(c.P.shape[:2], 24, 3)
        flame = ss(0.45, 0.55, t + (n - 0.5) * 0.5)
        c.paint(flame, '#ff9a3c', rough=0.4, detail=0.5, emit='#ff6a1a', emit_k=0.35)
    elif emblem == 'wind':
        diag = np.sin((c.x * 0.8 + c.z) * 42) > 0.55
        c.paint(diag * c.torso * c.front * (c.z > L['pelvis'] + 0.1), trim, rough=0.35, detail=0.5)
    elif emblem == 'rock':
        n = noise(c.P.shape[:2], 10, 11)
        c.paint(ss(0.5, 0.62, n) * c.arm * ss(0.3, 0.4, c.ax), '#8a7a66', rough=0.85, detail=0.9, fabric=False)


VARIANTS = {
    'hero': hero,
    'pixel': lambda c: (classmate(c, '#1d2430', '#2a3444', '#7ef9ff', '#f3cfb1', emblem='circuit', emit='#56f2ff'),
                        {'gender': 'female', 'hair': 'Hair_Long', 'hairColor': '#16202e', 'eyes': '#3a2a1e'})[1],
    'rocky': lambda c: (classmate(c, '#c47a2a', '#7a4a1e', '#e8c37a', '#b07a55', emblem='rock', sleeveless=True, legs='#3a3430'),
                        {'gender': 'male', 'hair': 'Hair_Buzzed', 'hairColor': '#2a1a12', 'eyes': '#2a1a10'})[1],
    'zephyr': lambda c: (classmate(c, '#e9f3f7', '#9fe6f5', '#5ac8e0', '#f5d9c4', emblem='wind', boots_c='#dfe8ec'),
                         {'gender': 'female', 'hair': 'Hair_BuzzedFemale', 'hairColor': '#e9e4d6', 'eyes': '#3d6d8a'})[1],
    'mira': lambda c: (classmate(c, '#f4efe2', '#f2c24a', '#d9a13a', '#c68d66', emblem='sun', emit='#ffd66b', boots_c='#8a5a2a'),
                       {'gender': 'female', 'hair': 'Hair_Long', 'hairColor': '#6e2a18', 'eyes': '#4a2a14'})[1],
    'tock': lambda c: (classmate(c, '#3b2466', '#6a44b0', '#c9a6ff', '#e8c1a0', emblem='clock', emit='#c58cff'),
                       {'gender': 'male', 'hair': 'Hair_SimpleParted', 'hairColor': '#c9c3dd', 'eyes': '#6a4aa0'})[1],
    'blaze': lambda c: (classmate(c, '#2a1612', '#c2361e', '#ff9a3c', '#7a4a32', emblem='flame', boots_c='#1b1210'),
                        {'gender': 'male', 'hair': 'Hair_Buzzed', 'hairColor': '#120c0a', 'eyes': '#1a0e08'})[1],
}


def shade(c):
    L = c.lm
    c.paint(np.ones_like(c.z), '#14101f', rough=0.7, detail=0.9, fabric=False)
    n = noise(c.P.shape[:2], 18, 5)
    n2 = noise(c.P.shape[:2], 6, 9)
    cracks = band(n + (n2 - 0.5) * 0.2, 0.5, 0.012, 0.01)
    c.paint(cracks, '#b57cff', rough=0.3, fabric=False, emit='#9b5cff', emit_k=2.2)
    c.paint(band(c.z, L['eye'], 0.012) * c.head * c.front * band(np.abs(c.x), 0.032, 0.014), '#ff4d6d', fabric=False, emit='#ff4d6d', emit_k=4)
    return {'gender': 'male', 'hair': None, 'hairColor': '#000000', 'eyes': '#ff4d6d', 'eyeGlow': 3}


def bruiser(c):
    L = c.lm
    n = noise(c.P.shape[:2], 3, 21)
    fur = srgb2lin(hexc('#6b4a2e'))[None, None, :] * (0.75 + 0.5 * n)[..., None]
    c.col[:] = fur * c.detail[..., None] ** 0.4
    c.rough[:] = 0.95
    jersey = c.torso * (c.z > L['pelvis'] - 0.05) + c.w['upperarm'] * ss(0.3, 0.27, c.ax)
    c.paint(jersey.clip(0, 1), '#5a1f8a', rough=0.6, detail=0.5)
    c.paint(band(c.ax, 0.265, 0.012) * c.w['upperarm'] + band(c.z, L['pelvis'] - 0.04, 0.02) * c.torso, '#ffc53d', rough=0.5, fabric=False)
    # "00" numerals front and back
    for sgn, mask in ((0, c.front), (1, c.back)):
        zc = L['shoulder'] - 0.2
        digits = np.zeros_like(c.z)
        for cx in (-0.055, 0.055):
            e = ((c.x - cx) / 0.042) ** 2 + ((c.z - zc) / 0.08) ** 2
            digits = np.maximum(digits, band(np.sqrt(e), 1.0, 0.2, 0.05))
        c.paint(digits * mask * c.torso, '#ffc53d', rough=0.45, fabric=False)
    c.paint(c.leg * (c.z < L['pelvis'] - 0.02) * (c.z > L['knee'] - 0.12), '#f1ede4', rough=0.6, detail=0.6)
    c.paint(band(c.z, L['knee'] - 0.06, 0.02) * c.leg, '#5a1f8a', rough=0.6)
    boots(c, '#f4f1ea', cuff='#ffc53d', top=L['ankle'] + 0.12, rough=0.5)
    gloves(c, '#f4f1ea', length=0.05, rough=0.7)
    return {'gender': 'male', 'hair': None, 'hairColor': '#000000', 'eyes': '#c58cff'}


def proctor(c):
    L = c.lm
    c.paint(np.ones_like(c.z), '#1d1640', rough=0.62, detail=0.5)
    # velvet bars on sleeves + gold stole panels down the front
    # red-and-gold regalia trim: crimson sleeve bars edged in gold
    c.paint(sum(band(c.ax, L['wrist'] - d, 0.02) for d in (0.18, 0.28)) * c.arm, '#9b1a2b', rough=0.55, detail=0.4)
    c.paint(sum(band(c.ax, L['wrist'] - d, 0.004) for d in (0.158, 0.202, 0.258, 0.302)) * c.arm, '#e2bf62', rough=0.3, metal=0.9, fabric=False)
    c.paint(band(c.ax, L['wrist'] - 0.23, 0.006) * c.arm, '#caa04a', rough=0.35, metal=0.85, fabric=False)
    stole = ss(0.012, -0.012, np.abs(np.abs(c.x) - 0.075) - 0.035) * c.front * c.torso * (c.z > L['pelvis'] - 0.1)
    c.paint(stole, '#caa04a', rough=0.35, metal=0.7, detail=0.4, fabric=False)
    c.paint(band(np.abs(np.abs(c.x) - 0.075), 0.035, 0.004) * c.front * c.torso * (c.z > L['pelvis'] - 0.1), '#f4dc8c', rough=0.3, metal=0.9, fabric=False)
    # crimson centre stripe down each gold stole panel
    c.paint(band(np.abs(c.x) - 0.075, 0, 0.012) * c.front * c.torso * (c.z > L['pelvis'] - 0.1), '#9b1a2b', rough=0.5, detail=0.3, fabric=False)
    # porcelain mask with a single glowing eye socket
    c.paint(c.head + c.neck, '#ece6da', rough=0.22, metal=0.0, detail=0.15, fabric=False)
    eye = ss(0.03, 0.024, np.hypot(c.x, (c.z - L['eye'] - 0.005) * 1.2)) * c.head * c.front
    c.paint(eye, '#140a06', rough=0.9, fabric=False)
    c.paint(ss(0.014, 0.008, np.hypot(c.x, (c.z - L['eye'] - 0.005) * 1.2)) * c.head * c.front, '#ffd35c', fabric=False, emit='#ffcf4d', emit_k=4)
    c.paint(band(c.z, L['eye'] - 0.06, 0.004) * c.head * c.front * (c.ax < 0.03), '#6a5f58', rough=0.4, fabric=False)
    gloves(c, '#f2eee6', length=0.09, rough=0.5)
    return {'gender': 'male', 'hair': None, 'hairColor': '#000000', 'eyes': '#ffcf4d', 'eyeGlow': 0, 'hideEyes': True}


def librarian(c):
    L = c.lm
    c.skin('#b9cbbf')
    c.paint((1 - c.head) * (1 - c.hand), '#1f5c5a', rough=0.85, detail=0.6)
    n = noise(c.P.shape[:2], 2, 31)
    knit = (np.sin(c.z * 900) * 0.5 + 0.5) * 0.25 + n * 0.1
    c.col *= (1 - knit[..., None] * ((1 - c.head) * (1 - c.hand))[..., None] * 0.6)
    c.paint(c.leg * (c.z < L['pelvis'] - 0.02), '#2b1e33', rough=0.7)
    # crimson placket edged in gold (buttons sit on it)
    c.paint(band(c.x, 0, 0.014) * c.front * c.torso * (c.z > L['pelvis'] + 0.02), '#8e1b2c', rough=0.6)
    c.paint((band(c.x, 0.016, 0.003) + band(c.x, -0.016, 0.003)) * c.front * c.torso * (c.z > L['pelvis'] + 0.02), '#e2bf62', rough=0.3, metal=0.9, fabric=False)
    for k in range(5):
        zb = L['pelvis'] + 0.08 + k * 0.085
        c.paint(ss(0.011, 0.008, np.hypot(c.x - 0.02, c.z - zb)) * c.front * c.torso, '#caa04a', rough=0.3, metal=0.95, fabric=False)
    # crimson cuffs with gold edges
    c.paint(band(c.ax, L['wrist'] - 0.1, 0.022) * c.arm, '#8e1b2c', rough=0.6)
    c.paint((band(c.ax, L['wrist'] - 0.077, 0.004) + band(c.ax, L['wrist'] - 0.123, 0.004)) * c.arm, '#e2bf62', rough=0.3, metal=0.9, fabric=False)
    c.paint(band(c.z, L['eye'] + 0.002, 0.012) * c.head * c.front * band(np.abs(c.x), 0.032, 0.013), '#b9ffe0', rough=0.2, fabric=False, emit='#8dffcf', emit_k=2.5)
    return {'gender': 'female', 'hair': 'Hair_Buns', 'hairColor': '#b8b3b0', 'eyes': '#8dffcf', 'eyeGlow': 2.5}


VARIANTS.update({'shade': shade, 'bruiser': bruiser, 'proctor': proctor, 'librarian': librarian})
GENDER = {'hero': 'male', 'pixel': 'female', 'rocky': 'male', 'zephyr': 'female', 'mira': 'female', 'tock': 'male', 'blaze': 'male',
          'shade': 'male', 'bruiser': 'male', 'proctor': 'male', 'librarian': 'female'}


def main():
    names = sys.argv[1:] or list(VARIANTS)
    manifest_path = f'{OUT}/variants.json'
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    canv = {}
    for g in ('male', 'female'):
        if not os.path.exists(f'{OUT}/{g}_normal.webp'):
            src = 'T_Superhero_Male_Normal.png' if g == 'male' else 'T_Superhero_Female_Normal.png'
            Image.open(UBC + 'Godot - UE/' + src).convert('RGB').resize((1024, 1024), Image.LANCZOS).save(f'{OUT}/{g}_normal.webp', 'WEBP', quality=90, method=6)
    for name in names:
        g = GENDER[name]
        c = Canvas(g)
        info = VARIANTS[name](c)
        info['emit'] = c.save(name)
        manifest[name] = info
        print('painted', name, g, 'emit' if info['emit'] else '')
    json.dump(manifest, open(manifest_path, 'w'), indent=1)


if __name__ == '__main__':
    main()
