# NOOB teaser (promo video)

A 32-second vertical (1080 x 1920) teaser for the whole app, cut to the beat of its own music. Everything is made in code: no screenshots, no stock footage, no samples.

- `teaser_audio.py` — the soundtrack (128 BPM): a heartbeat intro, a build with a speeding snare roll, half a beat of silence, the drop (kick, pumping bass, claps, hats, arpeggio, pad), a hook for the finale, and one big final hit. Made with numpy.
- `teaser_video.py` — the picture: the NOOB logo, big animated type, feature icons drawn in code (Reels, Stories, Chat, Games, Music, Daily NOOB, NOOB AI, Studio, Go Live, Shop and more), doodles, colour flashes, screen shake, glow. Every cut is on a beat.

## Make it again

Needs Python with `numpy`, `Pillow` and `imageio-ffmpeg` (it brings ffmpeg). The paths at the top of `teaser_video.py` point at this PC.

```
python teaser_audio.py teaser.wav
python teaser_video.py sheet sheet.png          # a contact sheet of key moments, to look at the design
python teaser_video.py render teaser.wav noob-teaser.mp4
```

The finished video goes in `out/` (not in git: it is big). To change the words, the colours or the order of the features, edit `FEATURES` and the scene functions in `teaser_video.py`.

## NOOB opening animation

`opening.py` makes the 4-second opening animation (1080 x 1920, 60 fps, with its own synthesised sound): a pen draws NOOB, its two O's are the logo's eyes, the camera dives into the pupil and the app opens out of it like an iris. It needs `numpy`, `opencv-python`, `Pillow` and `imageio-ffmpeg`.

```
python opening.py sheet sheet.png                  # contact sheet of key moments
python opening.py audio opening.wav
python opening.py render opening.wav opening.mp4   # write to a drive with space (D:)
python opening.py export ../instagram/public/opening/opening-data.js   # the shapes for the in-app version
```

The in-app version is `instagram/public/opening/` (`opening.js` draws the same animation live on a canvas, `opening-data.js` is what `export` writes, `opening.mp3` is the sound: `ffmpeg -i opening.wav -codec:a libmp3lame -b:a 72k opening.mp3`). `index.html` loads it after the splash; change the `?v=` number there and in `opening.js` when a file changes, because the files are kept for a year. It plays on the splash (the logo splash stays for reduced motion and the coaching / editor addresses), opens the app like an iris and removes the splash itself.
