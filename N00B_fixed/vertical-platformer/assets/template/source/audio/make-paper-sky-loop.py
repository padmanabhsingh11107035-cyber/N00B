"""Recreate the runtime edit from the unchanged source MP3 beside this script.
Requires ffmpeg, numpy and soundfile (libsndfile/Vorbis). OGG serial metadata may vary.
"""
from pathlib import Path
import subprocess
import numpy as np
import soundfile as sf

root = Path(__file__).parent
sample_rate = 44100
source = subprocess.check_output([
    "ffmpeg", "-v", "error", "-i", str(root / "vertical-platformer-paper-sky-source.mp3"),
    "-f", "f32le", "-acodec", "pcm_f32le", "-",
])
samples = np.frombuffer(source, dtype="<f4").reshape(-1, 2)
start, period, blend = [round(seconds * sample_rate) for seconds in (0.68, 91.2, 0.6)]
loop = samples[start:start + period].copy()
phase = np.linspace(0, np.pi / 2, blend, endpoint=True)[:, None]
loop[:blend] = samples[start + period:start + period + blend] * np.cos(phase) + loop[:blend] * np.sin(phase)
guard = round(0.005 * sample_rate)
loop[:guard] *= np.linspace(0, 1, guard)[:, None]
loop[-guard:] *= np.linspace(1, 0, guard)[:, None]
sf.write(root / "vertical-platformer-paper-sky.ogg", loop * (10 ** (-5.92 / 20)), sample_rate,
         format="OGG", subtype="VORBIS", compression_level=0.4)
