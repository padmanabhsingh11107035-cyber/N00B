# NOOB Family Map

A room for a family (or friends) where everybody sees everybody's live place on a detailed world map. Free, optional, and shown only to the people in the room.

**Address:** `https://noobsocials.com/family` (a page of its own, `family.html`) and the same screens inside the app (Home menu > Family Map). Open `https://noobsocials.com/family?demo=1` for a made-up demo that needs no account and no database. An invitation link looks like `https://noobsocials.com/family#join=K7QM2XPD` (the code sits after the `#`, so no server ever sees it).

## What a person sees
1. **First page**: the turning earth on top (35% of the screen), the two buttons **Create room** and **Join room**, and "Your rooms" (tap a room: no code to type again).
2. **Allow location** (before creating or joining): why it is needed, then the browser's own question. If it is blocked, how to fix it, or "join without sharing for now".
3. **Create room**: a name and a picture; then the room's **code** (8 letters and digits, shown as `K7QM-2XPD`) with Share invite / Copy code.
4. **Join room**: type the code once. The room stays on the account.
5. **A room**: the detailed map full-screen, every person's profile picture on their exact place with their first name, a dot on the spot, a green ring when they are live. A sheet lists the people (live / "Last seen 5 min ago" / "Paused sharing", distance from you, "Moving 24 km/h"). Buttons: show everyone, show me, night / streets, 3D. Menu: code, share my location (switch), keep screen on, new code and delete room (owner), leave room.

## How it works
- **Map**: MapLibre GL 6 (WebGL; 6.5 or newer, because every older version has a known script-injection flaw in its popup cleaner, which `npm audit` in the CI reports), loaded only when a map is shown (its own chunk, about 1 MB, plus the worker file `maplibre-gl-worker-*.mjs`: the library looks for its worker next to its own file, which a build renames, so `MapCanvas.tsx` tells it where the file is with `setWorkerUrl`). The pictures come from OpenFreeMap (free, no key, OpenStreetMap data); its "liberty" style is recoloured into the night look in `src/family/mapStyle.ts`. If OpenFreeMap cannot be reached a plain OpenStreetMap picture is used. The first page uses the globe projection with an atmosphere.
- **Database** (migration `20261031000001_family_map.sql`): four tables nobody can read or write directly (row-level security, no policy, nothing granted) and ten `family_*` functions that check who is asking: `family_create_room`, `family_join_room`, `family_my_rooms`, `family_room_state`, `family_push_location`, `family_set_sharing`, `family_leave_room`, `family_remove_member`, `family_rotate_code`, `family_delete_room`.
- **Live places**: the phone follows its own place (`watchPosition`) and sends it when it moved 8 m (at most every 4 s), or every 20 s as a heartbeat; the room is read every 5 s while the page is on the screen. Pins glide between readings. A website can only learn the place **while its page is open** (iPhone and Android stop it when the screen locks); "Keep screen on" in the menu helps.
- **Privacy**: only the last place of a person is stored (one row, replaced each time; no history, no trail). It is shown only to people in a room with that person while that person shares with that room, it disappears after 24 hours without news, when sharing is paused everywhere, and when the person leaves the last room. Administrators cannot read places. The phone saves only the last room and the map style, never a place.
- **Codes**: 8 symbols from a 32-symbol alphabet without look-alikes (I, O, 0, 1), from the database's secure random numbers. 8 wrong codes in 10 minutes pause a person for 10 minutes. The owner can make a new code (the old one stops at once) or remove a person. Limits: 20 people per room, 10 rooms per person. If the person who made a room deletes their account, the room goes with it.
- **Admin switch**: Admin > Pages > Family Map hides the menu entry and the database refuses new rooms, members and places (nothing is deleted).
- **Security headers**: `/family` has its own policy in `public/_headers` (the two map servers and the database only; the whole site's policy names the two map servers too, because the app shows the same map inside itself).

## Run / test
`npm run dev:web` then `/family?demo=1`. Tests: `node --liftoff-only scripts/supabase/test-family.mjs` (logic, the database on a real Postgres, wiring). Look: classes all start with `fm-` (`src/components/Family/family.css`).
