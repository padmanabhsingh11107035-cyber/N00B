#!/usr/bin/env bash
# Converts raw generated audio (Lyria music, ElevenLabs SFX) in $SRC into game-ready files in
# public/audio. Music: EBU R128 loudness normalised, short fade-in and a longer fade-out so the
# loop seam reads as a phrase ending. SFX: silence-trimmed, levelled to a common loudness, mono.
set -euo pipefail
SRC=${SRC:-/home/ubuntu/audio-src}
OUT=${OUT:-$(dirname "$0")/../public/audio}
mkdir -p "$OUT/music" "$OUT/sfx"

music() { # name, seconds to keep (0 = all), fade-out seconds
  local name=$1 keep=$2 fade=$3 dur
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC/music/$name.mp3")
  [ "$keep" != 0 ] && dur=$keep
  local st
  st=$(echo "$dur - $fade" | bc -l)
  ffmpeg -y -v error -i "$SRC/music/$name.mp3" -t "$dur" \
    -af "loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.35,afade=t=out:st=$st:d=$fade" \
    -ar 44100 -ac 2 -b:a 112k "$OUT/music/$name.mp3"
}
music hub 0 2.5
music floor1 0 2.5
music floor2 0 2.5
music boss1 0 2
music boss2 0 2
music victory 31 1.5

for f in "$SRC"/sfx/*.mp3; do
  n=$(basename "$f" .mp3)
  tmp=$(mktemp --suffix=.wav)
  # Trim leading/trailing silence (keeps natural tails above -55 dB).
  ffmpeg -y -v error -i "$f" -af "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse" -ac 1 "$tmp"
  mean=$(ffmpeg -hide_banner -i "$tmp" -af volumedetect -f null - 2>&1 | sed -n 's/.*mean_volume: \([-0-9.]*\).*/\1/p')
  gain=$(echo "-17 - ($mean)" | bc -l)
  ffmpeg -y -v error -i "$tmp" -af "volume=${gain}dB,alimiter=limit=0.94:attack=1:release=40" \
    -ar 44100 -ac 1 -b:a 96k "$OUT/sfx/$n.mp3"
  rm -f "$tmp"
done
du -sh "$OUT/music" "$OUT/sfx"
