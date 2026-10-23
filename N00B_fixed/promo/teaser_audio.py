"""The sound of the NOOB teaser: a 30-second energetic track at 128 BPM, made from scratch with numpy (no samples, no downloads).

Structure (one bar = 4 beats = 1.875 s):
  beats  0-8   intro: a low pad, a heartbeat, a few glassy plucks, a riser starts
  beats  8-16  build: four on the floor, hats, a snare roll that speeds up, a rising noise sweep, then a half-beat of silence
  beats 16-48  DROP: kick, bass on the off-beats (pumping), claps, hats, arpeggio, pad, crashes
  beats 48-60  final: the same plus a bright hook on top
  beats 60-64  stutter, a riser, a gap, and one big final hit at beat 64, then the tail rings out

usage: python teaser_audio.py <output.wav>
"""
import sys
import wave
import numpy as np

SR = 44100
BPM = 128
BEAT = 60.0 / BPM
BEATS = 64
TAIL = 2.5
N = int((BEATS * BEAT + TAIL) * SR)
rng = np.random.default_rng(7)

drums_l = np.zeros(N); drums_r = np.zeros(N)
music_l = np.zeros(N); music_r = np.zeros(N)      # ducked by the kick (the pumping)
fx_l = np.zeros(N); fx_r = np.zeros(N)            # risers, impacts (not ducked)
send = np.zeros(N)                                 # what goes to the reverb


def pan_gains(p):
    a = (p + 1) * np.pi / 4
    return np.cos(a), np.sin(a)


def put(bufl, bufr, t0, sig, gain=1.0, pan=0.0, to_send=0.0):
    i = int(round(t0 * SR))
    if i >= N or i + len(sig) <= 0:
        return
    s0 = max(0, -i); i = max(0, i); j = min(N, i + len(sig) - s0)
    seg = sig[s0:s0 + (j - i)] * gain
    gl, gr = pan_gains(pan)
    bufl[i:j] += seg * gl; bufr[i:j] += seg * gr
    if to_send:
        send[i:j] += seg * to_send


def fft_filter(x, lo=None, hi=None, slope=6.0):
    """band limit with a smooth edge: lo = high-pass corner (Hz), hi = low-pass corner (Hz)"""
    n = len(x); X = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1 / SR)
    m = np.ones_like(f)
    if hi: m *= 1 / (1 + (f / hi) ** (slope))
    if lo: m *= 1 - 1 / (1 + (f / lo) ** (slope))
    return np.fft.irfft(X * m, n)


def env(n, a=0.003, r=0.05):
    e = np.ones(n); na = max(1, int(a * SR)); nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr)
    return e


def saw(freq, n, detune=0.0, phase=0.0):
    t = np.arange(n) / SR
    return 2 * ((freq * (1 + detune) * t + phase) % 1.0) - 1


def note_hz(name):
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    n = names[name[0]] + (1 if '#' in name else 0); octv = int(name[-1])
    return 440.0 * 2 ** ((n + 12 * (octv - 4) - 9) / 12)


# ---------------- drums
def kick(gain=1.0, length=0.42):
    n = int(length * SR); t = np.arange(n) / SR
    f = 46 + 150 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.0)
    click = np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 700) * 0.35
    return (body + click) * gain


NOISE = rng.standard_normal(SR)
HAT_NOISE = fft_filter(NOISE, lo=7500)
CLAP_NOISE = fft_filter(NOISE, lo=900, hi=5200)


def clap(gain=1.0):
    n = int(0.28 * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for k, off in enumerate((0.0, 0.011, 0.023)):
        i = int(off * SR); m = n - i
        s[i:] += CLAP_NOISE[:m] * np.exp(-np.arange(m) / SR * (55 if k < 2 else 16))
    return s * 0.55 * gain


def snare(gain=1.0):
    n = int(0.25 * SR); t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * (190 + 60 * np.exp(-t * 40)) * t) * np.exp(-t * 22)
    nz = CLAP_NOISE[:n] * np.exp(-t * 20)
    return (tone * 0.5 + nz * 0.7) * gain


def hat(open_=False, gain=1.0):
    n = int((0.28 if open_ else 0.06) * SR); t = np.arange(n) / SR
    return HAT_NOISE[:n] * np.exp(-t * (16 if open_ else 95)) * gain * 0.35


def crash(length=2.2, gain=1.0):
    n = int(length * SR); t = np.arange(n) / SR
    x = fft_filter(rng.standard_normal(n), lo=4500)
    return x * np.exp(-t * 2.2) * gain * 0.5


def boom(length=2.0, gain=1.0):
    n = int(length * SR); t = np.arange(n) / SR
    f = 28 + 60 * np.exp(-t * 6)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.8)
    nz = fft_filter(rng.standard_normal(n), hi=900) * np.exp(-t * 4.5) * 0.5
    return (s + nz) * gain


def riser(length, gain=1.0):
    n = int(length * SR); t = np.arange(n) / SR; u = t / length
    base = rng.standard_normal(n)
    cuts = [300, 700, 1500, 3200, 6500, 12000]
    versions = [fft_filter(base, hi=c) for c in cuts]
    out = np.zeros(n)
    pos = u * (len(cuts) - 1)
    for k, v in enumerate(versions):
        w = np.clip(1 - np.abs(pos - k), 0, 1)
        out += v * w
    f = 220 * np.exp(np.log(14) * u)
    chirp = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.5 + np.sin(4 * np.pi * np.cumsum(f) / SR) * 0.2
    out = (out * 0.6 + chirp) * (u ** 2.2)
    return out * gain


def reverse_crash(length, gain=1.0):
    n = int(length * SR); u = np.arange(n) / n
    x = fft_filter(rng.standard_normal(n), lo=3500)
    return x * (u ** 3) * gain * 0.6


def pluck(freq, length=0.5, gain=1.0):
    n = int(length * SR); t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * freq * 3.01 * t) * 2.2 * np.exp(-t * 9)
    return np.sin(2 * np.pi * freq * t + mod) * np.exp(-t * 6) * gain


# ---------------- tonal
CHORDS = [('A', ['A3', 'C4', 'E4'], 'A1'), ('F', ['F3', 'A3', 'C4'], 'F1'), ('C', ['C4', 'E4', 'G4'], 'C2'), ('G', ['G3', 'B3', 'D4'], 'G1')]


def bass_note(freq, length):
    n = int(length * SR)
    s = saw(freq, n) * 0.6 + saw(freq, n, 0.004) * 0.4
    s = fft_filter(s, hi=420, slope=4) + np.sin(2 * np.pi * freq * np.arange(n) / SR) * 0.9
    return s * env(n, 0.004, 0.04)


def pad(chord_notes, length, cutoff=3000, gain=1.0):
    n = int(length * SR); s = np.zeros(n)
    for nm in chord_notes:
        f = note_hz(nm)
        for d in (-0.006, -0.0025, 0.0, 0.0025, 0.006):
            s += saw(f, n, d, rng.random())
    s = fft_filter(s, hi=cutoff, lo=120, slope=3)
    return s * env(n, 0.05, 0.25) * gain / 14


def arp_note(freq, length=0.22):
    n = int(length * SR); t = np.arange(n) / SR
    s = saw(freq, n, 0.0) + saw(freq, n, 0.007) * 0.8 + saw(freq * 2, n, -0.004) * 0.25
    s = fft_filter(s, hi=5200, slope=3)
    return s * np.exp(-t * 13) * env(n, 0.002, 0.03) * 0.5


def hook_note(freq, length):
    n = int(length * SR); t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t * 4, 0, 1)
    ph = 2 * np.pi * np.cumsum(freq * vib) / SR
    s = np.sign(np.sin(ph)) * 0.4 + np.sin(ph) * 0.6 + saw(freq, n, 0.005) * 0.35
    s = fft_filter(s, hi=6500, slope=3)
    return s * env(n, 0.004, 0.09) * 0.55


def beat_t(b):
    return b * BEAT


# ================= the arrangement
kick_times = []


def do_kick(b, g=1.0):
    kick_times.append(beat_t(b)); put(drums_l, drums_r, beat_t(b), kick(g), 1.0)


# ---- intro (0-8)
for b in range(0, 8):
    do_kick(b, 0.25 + 0.4 * (b / 8))                      # a soft heartbeat getting stronger
chord_len = 4 * BEAT
for bar in range(2):
    ch = CHORDS[bar % 4]
    put(music_l, music_r, beat_t(bar * 4), pad(ch[1], chord_len + 0.4, cutoff=500 + 600 * bar, gain=0.55 + 0.15 * bar), 1.0, 0, 0.5)
for k, nm in enumerate(['E5', 'A5', 'C6', 'E6']):        # glassy plucks that tease the tune
    put(fx_l, fx_r, beat_t(1 + k * 2), pluck(note_hz(nm), 0.9, 0.35), 1.0, -0.5 + k / 3, 0.9)
put(fx_l, fx_r, beat_t(4), riser(4 * BEAT, 0.5))

# ---- build (8-16)
for b in range(8, 16):
    do_kick(b, 0.85)
ch = CHORDS[2]
put(music_l, music_r, beat_t(8), pad(ch[1], 4 * BEAT + 0.3, cutoff=1500, gain=0.7), 1.0, 0, 0.5)
put(music_l, music_r, beat_t(12), pad(CHORDS[3][1], 4 * BEAT + 0.3, cutoff=3500, gain=0.8), 1.0, 0, 0.5)
for b8 in range(16, 32):
    put(drums_l, drums_r, beat_t(8 + b8 * 0.5 - 8), hat(False, 0.5 + 0.4 * (b8 - 16) / 16), 1.0, 0.25)
put(fx_l, fx_r, beat_t(8), riser(7.55 * BEAT, 0.9))
put(fx_l, fx_r, beat_t(12), reverse_crash(3.5 * BEAT, 0.5))
# the snare roll: eighths, then sixteenths, then thirty-seconds
t_roll = 12.0
steps = []
while t_roll < 15.5:
    steps.append(t_roll)
    gap = 0.5 if t_roll < 14 else (0.25 if t_roll < 15 else 0.125)
    t_roll += gap
for k, tb in enumerate(steps):
    put(drums_l, drums_r, beat_t(tb), snare(0.35 + 0.65 * k / len(steps)), 1.0, 0, 0.25)

# ---- the drop (16-60)
def drop_bar(bar_start_beat, hook=False, fill=False):
    bar_i = int(bar_start_beat // 4)
    ch = CHORDS[bar_i % 4]
    for b in range(4):
        do_kick(bar_start_beat + b, 1.0)
    for b in (1, 3):
        put(drums_l, drums_r, beat_t(bar_start_beat + b), clap(1.0), 1.0, 0, 0.35)
    for s16 in range(16):                                  # hats: sixteenths, open hats on the off-beats
        tb = bar_start_beat + s16 * 0.25
        if s16 % 4 == 2:
            put(drums_l, drums_r, beat_t(tb), hat(True, 0.9), 1.0, 0.2)
        elif s16 % 2 == 1:
            put(drums_l, drums_r, beat_t(tb), hat(False, 0.35), 1.0, -0.2)
        elif s16 % 4 == 0:
            put(drums_l, drums_r, beat_t(tb), hat(False, 0.2), 1.0, 0.1)
    froot = note_hz(ch[2])
    for e in range(4):                                     # bass on the off-beats
        put(music_l, music_r, beat_t(bar_start_beat + e + 0.5), bass_note(froot, 0.42 * BEAT * 2 / 2.0), 1.0, 0)
    put(music_l, music_r, beat_t(bar_start_beat), pad(ch[1], 4 * BEAT + 0.35, cutoff=4200, gain=0.9), 1.0, 0, 0.55)
    notes = [note_hz(n.replace('3', '5').replace('4', '5')) for n in ch[1]]
    pattern = [0, 1, 2, 1, 0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1]
    for s16, idx in enumerate(pattern):
        tb = bar_start_beat + s16 * 0.25
        put(music_l, music_r, beat_t(tb), arp_note(notes[idx] * (2 if s16 % 8 == 7 else 1)), 0.7, -0.6 if s16 % 2 else 0.6, 0.45)
    if hook:
        hn = {'A': ['A5', 'C6', 'E6', 'A6'], 'F': ['F5', 'A5', 'C6', 'F6'], 'C': ['C6', 'E6', 'G6', 'G6'], 'G': ['G5', 'B5', 'D6', 'G6']}[ch[0]]
        for k, nm in enumerate(hn):
            ln = 0.45 * BEAT if k < 3 else 2.4 * BEAT
            put(music_l, music_r, beat_t(bar_start_beat + k * 0.5), hook_note(note_hz(nm), ln), 0.75, 0.0, 0.5)
    if fill:                                               # a short snare fill on the last beat
        for k in range(4):
            put(drums_l, drums_r, beat_t(bar_start_beat + 3 + k * 0.25), snare(0.5 + 0.15 * k), 1.0, 0, 0.2)


put(fx_l, fx_r, beat_t(16), boom(2.2, 1.0)); put(drums_l, drums_r, beat_t(16), crash(2.4, 1.0), 1.0, 0.1, 0.4)
for bar_beat in range(16, 48, 4):
    if bar_beat > 16 and bar_beat % 16 == 0:
        put(drums_l, drums_r, beat_t(bar_beat), crash(1.8, 0.7), 1.0, -0.1, 0.35)
    drop_bar(bar_beat, hook=False, fill=(bar_beat in (28, 44)))
# beats 40-44: a mini build inside the drop (the "and more" moment)
put(fx_l, fx_r, beat_t(40), riser(3.6 * BEAT, 0.55))
put(fx_l, fx_r, beat_t(48), boom(2.0, 0.9)); put(drums_l, drums_r, beat_t(48), crash(2.4, 0.9), 1.0, 0.1, 0.4)
for bar_beat in range(48, 60, 4):
    drop_bar(bar_beat, hook=True, fill=(bar_beat == 56))

# ---- stutter and the final hit (60-64)
put(fx_l, fx_r, beat_t(60), riser(3.5 * BEAT, 1.0))
for tb in (60, 61, 62, 62.5, 63, 63.25, 63.5):
    do_kick(tb, 1.0)
for k in range(8):
    put(drums_l, drums_r, beat_t(61.5 + k * 0.25), snare(0.4 + 0.08 * k), 1.0, 0, 0.2)
put(fx_l, fx_r, beat_t(64), boom(3.0, 1.2)); put(drums_l, drums_r, beat_t(64), crash(2.6, 1.0), 1.0, 0, 0.5)
do_kick(64, 1.0)
final = ['A2', 'E3', 'A3', 'C4', 'E4', 'A4']
for nm in final:
    put(music_l, music_r, beat_t(64), pad([nm], 2.4, cutoff=6000, gain=1.4), 1.0, 0, 0.8)
put(fx_l, fx_r, beat_t(64) + 0.02, pluck(note_hz('A6'), 1.6, 0.5), 1.0, 0.3, 0.9)

# ================= mix
sc = np.ones(N)                                           # the pumping: music gets quieter at every kick
for tk in kick_times:
    i = int(tk * SR); j = min(N, i + int(0.5 * SR))
    tt = np.arange(j - i) / SR
    sc[i:j] = np.minimum(sc[i:j], 1 - 0.78 * np.exp(-tt / 0.13))
gate = np.ones(N)                                          # half a beat of silence before the drop, and before the end
for g0, g1 in ((15.55, 16.0), (63.55, 64.0)):
    i, j = int(beat_t(g0) * SR), int(beat_t(g1) * SR); gate[i:j] = 0.0
    k = int(0.004 * SR); gate[i - k:i] = np.linspace(1, 0, k)

# the reverb: a room made of decaying noise
ir_n = int(1.9 * SR); t_ir = np.arange(ir_n) / SR
ir = fft_filter(rng.standard_normal(ir_n), hi=7000) * np.exp(-t_ir * 2.6); ir[0] = 0
ir /= np.sqrt(np.sum(ir ** 2))
wet = np.fft.irfft(np.fft.rfft(send, N + ir_n) * np.fft.rfft(ir, N + ir_n), N + ir_n)[:N]

lvl = np.ones(N)                                           # the build is a little quieter than the drop, so the drop hits harder
b0, b1 = int(beat_t(8) * SR), int(beat_t(16) * SR); lvl[:b0] = 0.8; lvl[b0:b1] = np.linspace(0.68, 0.9, b1 - b0)
L = (drums_l * gate * lvl + music_l * sc * gate * lvl + fx_l) * 1.0 + wet * 0.22
R = (drums_r * gate * lvl + music_r * sc * gate * lvl + fx_r) * 1.0 + wet * 0.22
# a gentle lift of the low end and a soft clip, then the level
drive = 1.35
L = np.tanh(L * drive) / np.tanh(drive); R = np.tanh(R * drive) / np.tanh(drive)
peak = max(np.abs(L).max(), np.abs(R).max()); L *= 0.93 / peak; R *= 0.93 / peak
fade = int(0.02 * SR); L[:fade] *= np.linspace(0, 1, fade); R[:fade] *= np.linspace(0, 1, fade)
tail_fade = int(0.6 * SR); L[-tail_fade:] *= np.linspace(1, 0, tail_fade); R[-tail_fade:] *= np.linspace(1, 0, tail_fade)

out = sys.argv[1] if len(sys.argv) > 1 else 'teaser.wav'
pcm = (np.stack([L, R], 1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', out, round(N / SR, 2), 's, peak', round(float(peak), 2))
