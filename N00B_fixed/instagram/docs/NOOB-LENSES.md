# NOOB Lenses

A camera with face filters, like Snapchat's lenses: pick a lens, take a picture, save it or share it to any app. Every saved picture has the NOOB tag (the logo in a dark pill) burned into its bottom right corner.

## Where it is

- **`/lenses`** (the file `lenses.html`) is a page of its own. It works without an account and without the app being loaded, so it also works while the app itself is switched off (for example while Supabase is restricted).
- In the app it opens from the **Create** sheet ("Lenses") and the **Home menu** ("NOOB Lenses"), shown in a frame over everything (`src/components/Lenses/LensHost.tsx`, address `/lenses?embed=1`). In that frame the finished picture also has **Story** and **Post** buttons: they hand the file to the normal creator (nothing is published from the camera).
- The administrator can switch it off: Admin > Pages > "NOOB Lenses" (key `lenses`).

## Privacy

Everything happens on the device: the camera picture, the face finder, the drawing and the saved file. There is no upload, no storage, no network call (`scripts/supabase/test-lenses.mjs` forbids them in `src/lenses/`). The camera is switched off when the picture is taken or the page closes.

## How it works

- `src/lenses/faceTracker.ts` loads Google's **MediaPipe Face Landmarker** (`@mediapipe/tasks-vision` 0.10.35, Apache 2.0). Its WebAssembly program (`public/lenses/mediapipe/vision_wasm_internal.*`) and model (`public/lenses/face_landmarker.task`, 3.7 MB) are files of this site and are fetched only when the camera opens. It starts on the graphics chip and falls back to the processor.
- `src/lenses/faceMath.ts` turns the 478 points of a face into a few numbers (middle between the eyes, size, tilt, turn, forehead / chin / cheeks, nose, mouth, expressions) and smooths them (One Euro filter). Pure functions, tested in Node.
- `src/lenses/catalog.ts` holds the 20 lenses. Each is drawn from scratch on a canvas, in "eye distances" around the face, so one drawing fits every face. Colour looks (Golden Hour, Noir, Neon, Dreamy) use canvas blend modes, not `ctx.filter` (Safari does not have it).
- `src/lenses/scene.ts` draws a picture (`renderScene`) and the little round pictures of the lens list (the same code on a made-up face).
- `src/lenses/exportPhoto.ts` draws the tag, makes the JPEG, and shares (Web Share with the file) or saves it.
- `src/lenses/LensApp.tsx` is the page: phone = a strip of lenses (the ring in the middle is the shutter, X = no lens); computer = a grid with search and a shutter button. "Use a photo" runs a lens on a picture from the phone (also the way in when there is no camera).

## Security rules

`public/_headers` gives `/lenses` its own policy: `'wasm-unsafe-eval'` (compiles the face finder's WebAssembly; it does not allow `eval()` of text), no network except its own files, no frames inside it, and only this site may frame it. The rest of the website does not get WebAssembly.

## Adding a lens

Add an entry to `LENSES` in `catalog.ts` (`face`: draws on each face in eye distances; `base`: changes the whole picture; `top`: drawn over everything in pixels). Use only the time `t` for movement, never saved state. `test-lenses.mjs` draws every lens on extreme faces, so a typo shows up there. The list picture is made automatically.

## Honest limits

- Lenses are flat drawings placed by the face (no 3D, no hair or hand in front of them); a very small or far face is not found (the finder needs a face of roughly a fifth of the picture's width).
- Pictures only (no video yet).
- Tried here with a photo of a face and the strict security rules; the live camera (iPhone Safari, Android) is only tried on a real phone.
- The first open downloads about 4 MB (finder program + model, compressed) once; the browser keeps it for a week.
