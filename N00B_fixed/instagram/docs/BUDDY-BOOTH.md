# NOOB Buddy Booth

Take a photo with a **buddy** standing next to you, like the "take a photo with a character" camera in the Pokémon GO video, but with characters that belong to NOOB. Pick a buddy, the camera opens with a "stand here" box for the person, press the shutter, and the picture comes out in a premium frame with a name tag and the NOOB wordmark at the bottom right. The stickers made earlier (K-Drama, K-Movie, Anime, K-Pop Purple / Pink, Flair) are still there, as optional **Filters**.

**Address:** `https://noobsocials.com/booth` is the booth as **a page of its own** (`booth.html`, built like NOOB Lenses): the app, the login and the database are not loaded, so it opens without an account and **still works when NOOB itself is down** (the database restriction of 28 Oct 2026 shows "NOOB is down" on every address of the app, but not here). Everything the booth does happens on the device. On that page the finished picture is saved or shared; the Story / Post / Reel buttons only exist in the app (profile button), where the picture goes into the normal creators.

**Look:** the whole page is ONE flat colour, **#111184** (dark blue), with white for words, icons and outlines: no gradients, no patterns, no shadows, no see-through layers (`src/components/Booth/booth.css`; `test-booth.mjs` fails if any other colour, gradient, shadow or blur appears there). The pictures themselves (frames, buddies, stickers, name tag) keep their own colours: they are what the page makes, not the page.

**Opening:** every time it opens, a 4-second flat 2D opening plays (`src/booth/opening.ts`, `BoothOpening.tsx`): the words BUDDY BOOTH drop in, four photo cards fall into place one after another, each is "taken" with a flash and a buddy pops in (Bunby, Kitsu, Coco, Ember), all four hop, one last flash, and everything slides up into the first screen. A tap, a click or a key skips it; a phone set to "reduce motion" goes straight in; a timer ends it after 4 seconds even if the screen is not being drawn. Only #111184 and white are used. See it as a contact sheet: `node scripts/booth/sheet.mjs <folder> opening`.

Opens from the **profile page** (your own profile, the gradient button with the little photo-card icon beside the menu). Switch it off for users in **Admin > Pages > Buddy Booth** (key `booth`).

## What a person does

1. **Pick a buddy** (search, suggestions, "Surprise", or the fields: K-Pop, K-Drama, Movies, Anime, Cute, Fun). Or "Use a photo from my gallery" and add a buddy to it afterwards.
2. **Camera**: the live picture is already inside the frame. A white "stand here" box with a person shape shows where the friend should stand (on the side the buddy is not on). The buddy can be moved, resized (corner handle, two fingers, or the mouse wheel) and mirrored. The switch button turns the camera around for a selfie. When the camera is blocked or missing: "Try again", "Use the camera app" (the phone's own camera through a file input) and "Choose a photo".
3. **Shutter**: a flash, and the picture is taken. The same screen becomes the editor: the camera is switched off, the buddy and the filters can still be moved.
4. **Filters** (optional): all 46 moving stickers, in their packs (Featured, Recent, K-Drama, K-Movie, Anime, K-Pop Purple, K-Pop Pink, Flair). Up to 24 on one picture, up to 3 buddies.
5. **Frame**: shape (4:5 posts, 1:1 square, 9:16 stories), five frames (Pearl, Noir Gold, Photocard, Sakura, Neon), the name tag on or off, the "stand here" box on or off. Changing the shape or the frame keeps every buddy standing on the floor of the photo (`reflow` in `src/booth/scene.ts`).
6. **Done** opens the result: a **Picture** (JPEG, 1080 wide) and a **Moving** version (about 3 seconds in a loop, 720 wide, MP4 where the browser can, else WebM). Save, Share (the phone's share sheet), **Story**, **Post** (picture) or **Reel** (moving): the file goes into the normal creators; nothing is sent anywhere from the booth.

## The picture

`renderScene` (`src/booth/scene.ts`) is the only place a picture is put together, for the live preview, the saved picture and every picture of the saved video: frame back, the photo in its window (mirrored for a selfie), the buddies, the stickers, the buddy's **name tag** ("NOOB Buddy" and the name, on a white card above the head), the line `#NOOBbuddies` on the bottom strip (left), and last of all the **NOOB wordmark** (bottom strip, right; tinted to the frame; nothing can cover it).

Only the live preview also draws the "stand here" box and the handles of the picked one.

## The buddies (`src/booth/buddies/`)

Fourteen original characters, all drawn in code on a canvas (no picture files, sharp at any size, they move): they breathe, hop, sway, wave and blink, and every one repeats exactly after the 3-second loop so the saved video starts again without a jump.

| Field | Buddies |
| --- | --- |
| K-Pop | Bunby (idol bunny with a light stick), Cleo (black cat, heart shades, pink microphone) |
| K-Drama | Coco (bear in a trench coat, clear umbrella, rain), Nana (banana milk) |
| Movies | Clappy (a clapperboard that claps), Poppy (popcorn that pops) |
| Anime | Kitsu (fox spirit, three tails, foxfire), Kuro (ninja cat with a shuriken), Onigi (rice ball with a sprout) |
| Cute | Mochi (squishy rice cake), Boba (bubble tea), Waddle (penguin DJ) |
| Fun | Ember (baby dragon), Bolt (little robot) |

None of them is copied from a show, a band or a game. A buddy has no white sticker edge; it makes its own soft shadow on the ground and its feet stand at 93 units below the middle of its 200-unit box (`GROUND` in `parts.ts`), which is how `startSpot` puts it on the floor of the photo. A buddy is only resized and moved, never turned. To add one: a `def({ ... buddy: { field, tagline, size, accent } })` in the file of its field, built from the parts in `parts.ts`, then look at it with `node scripts/booth/sheet.mjs <folder> buddies` (one sheet) or `... <folder> bd-ember` (one buddy, four moments).

## Stickers as filters

Unchanged (`src/booth/packs/`, `catalog.ts`): the same drawing kit (`kit.ts`), a white die-cut edge and soft shadow, loops of 3 seconds. Two rotating ones (DON!, Daebak, Blockbuster) were changed so that their loop closes exactly.

## Files

- `src/booth/`: `kit.ts` (the drawing kit), `buddies/` and `packs/` (the art), `catalog.ts`, `frames.ts` (frames, wordmark, caption), `scene.ts` (the picture, the tag, the "stand here" box, handles), `gestures.ts` (fingers and mouse, as plain maths), `camera.ts`, `media.ts` (photo in, picture / video out).
- `src/components/Booth/`: `BuddyBooth.tsx` (the page), `ResultSheet.tsx`, `Thumb.tsx` (one clock for all the small moving pictures), `BoothIcon.tsx`, `BoothHost.tsx` + `boothStore.ts` (opened from the profile, code fetched only then), `booth.css` (every class starts with `bb-`).
- `scripts/booth/sheet.mjs`: draws contact sheets of the art (needs the `@napi-rs/canvas` package that is in `node_modules`).
- `scripts/supabase/test-booth.mjs`: 96 checks (every buddy and sticker drawn at six moments, the loop seam, the name tag always inside the photo, the wordmark last, gestures, camera messages, the wiring and what the booth may not touch).

## Safe by design

Everything happens on the device: the camera, the drawing, the saved file. No network call, no storage call, no HTML made from text (`test-booth.mjs` forbids them in the booth's files). The camera is let go when the picture is taken, when the screen is left and when the page goes to the background. The site's own pages may use the camera (`Permissions-Policy: camera=(self)` in `public/_headers`).

## Only tried on a real phone

The live camera, the share sheet, and the moving picture on iPhone (MP4) versus Android (MP4 or WebM) were tried here with a pretend camera and the browser's recorder; they still need one look on a real phone.
