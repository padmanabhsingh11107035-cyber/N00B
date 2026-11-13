# Admin page: User's data (the green map)

A full-screen page opened from the admin panel (tab **User's data**, next to Visitors; only the main administrator sees the tab). A green hacker-style world map with a tiny yellow dot for
where each user **created their account** (hollow ring) and where they were **last seen** (filled dot). A switch shows Signed up / Last seen / Both. Dots are about 2 px, never merged and carry
**no numbers, no usernames and no user list**. Tap (or hover with a mouse) a dot for a small terminal card: username, place, coordinates, IP, platform / device, created date, last seen, and
where the location came from. Zoom / pan; zoomed in far, a faint graticule and a crosshair with a coordinate readout of the map appear. Back is at the top left (also the phone's Back gesture).

Around the map run several **decorative** code windows (cyan network scan, magenta hex dump, amber thread table, red signal ticker, violet source listing, white-green decrypt), a green
code rain, a radar sweep, a UTC ticker, a typed boot sequence, a glitchy title and blinking LEDs. They are made up on the spot, read nothing from the database, claim no real activity and are
labelled "decorative feeds". The **FX** button turns all of it off. Windows collapse by tapping their title bar. On a phone the windows sit in a strip under the map that is one line until opened.

## What is shown, and where it comes from (accuracy)

**This is NOT GPS.** No location permission is asked and no location API is used anywhere in the app. The most exact position available is the one Cloudflare works out from the internet
address of each connection (`request.cf.latitude / longitude`). It is usually the city (sometimes a mobile operator's hub in another city, a VPN or a data centre), not the street.

* The Worker's `/__geo` (asked by the app once per page load) now also tells the caller its approximate `latitude` / `longitude` (3 decimals, `null` when unknown), exactly as it already told city / region / country: only to the person who asks about their own connection, never stored by the Worker, `no-store`.
* The app adds `lat` / `lng` (only valid numbers, -90..90 / -180..180) to the info it already sends to `record_visit`; the database stores them on that visit row (`site_visits.lat / lng`, `numeric(8,5)`), keeps the old ones when a later visit has none, and ignores invalid values.
* The map uses those coordinates as they are (no scatter); the card says `LOC SRC ip-geo +-city`.
* When a user's visit has no coordinates (every visit before this change until that person opens the app again, or a typed profile city), the dot comes from the offline place list (`src/data/geoPlaces.ts`) and is scattered a little (a few km for a city, tens of km for a region, about 200 km for a country only); the card says `LOC SRC place-name` and `geo n/a`.
* A place found in neither is **not guessed**: the user is counted as "NONE" in the footer and has no dot.

| Shown | Source |
|---|---|
| Last seen place, coordinates, IP, platform, device, time | the newest non-bot `site_visits` row of the user |
| Signup place | 1. the city typed on the profile (+ country of the sign-up phone code; no coordinates), 2. the oldest `site_visits` row (with its coordinates), 3. only the phone-code country |
| Signup IP / platform / device | the oldest non-bot `site_visits` row |
| Username, created date | `profiles` |

## Privacy

* **The IP address is returned only by `admin_user_locations()`**, which only the main administrator can call (`security definer`, `require_master_admin()`, execute revoked from `public` and `anon`); a normal user or a visitor is refused (tested). The admin Visitors page already shows IPs. No non-admin function returns an IP or anyone's coordinates. Phone numbers and emails are never part of the answer (tested).
* `site_visits` itself is not readable by browsers (no grants); coordinates and IP live only there.
* No outside service is used: the offline list is bundled in the app, no geocoding request is ever made. Nothing is cached in the browser (no localStorage).
* The Privacy Policy / Terms already say the approximate place of the connection is read from NOOB's own address; this adds the approximate coordinates of the same lookup, nothing new is asked of the person.

## Files

* `worker/index.js` (`/__geo` adds latitude / longitude), `src/utils/visitorInfo.ts` (`validCoords`), `src/services/visitTracker.ts` (adds `lat` / `lng` to `record_visit`).
* `supabase/migrations/20261114000007_visit_coordinates.sql` - `site_visits.lat / lng` + `record_visit` (same as before, plus coordinates). `20261114000008_admin_user_locations_v2.sql` - `admin_user_locations(p_limit)` now also gives `lat`, `lng`, `ip`, `platform`, `device` per place. Both idempotent, additive, no data changed. (`20261114000004` is the first version of the function; 08 replaces it.)
* `src/components/Modals/AdminUserDataPage.tsx` (page), `UserDataMap.tsx` (SVG land + canvas dots, spatial-hash hit test, crosshair), `UserDataFeeds.tsx` (code windows, ticker, boot lines), `UserDataRain.tsx` (code rain), `adminUserData.css`.
* `src/utils/userLocations.ts` (resolver, scatter, projection, `placeCoords`, `DotHash`, short times), `src/data/geoPlaces.ts` (gazetteer), `src/data/worldMapPath.ts` (generated outline, about 80 KB), `scripts/gen-world-map.mjs` (makes it from Natural Earth 110m via a scratch install of `world-atlas`, `topojson-client`, `d3-geo`).
* `harness/` - page `?page=userdata&admin=1` with 64 made-up people (most with lat / lng, IP, platform; some without so the fallback shows; `state=empty|error|loading`, `denied=1`).
* Tests (all in `npm run guard`): `scripts/supabase/test-admin-user-locations.mjs`, `test-geo-places.mjs`, `test-device-location-buddy.mjs` (the `/__geo` body).

## Effects: cost and behaviour

One shared timer drives all windows (at most 24 frames a second); only windows that are on screen are touched; it stops while the browser tab is hidden; with "reduce motion" the windows show one still picture and the CSS animations are off. The rain is capped at 25 fps. The windows let touches through except on their title bars, so they never block map gestures. Measured in the harness (the Browser pane throttles animation frames to about 2.5 a second, so every frame had all six windows due): 3.9 to 4.5 ms of script per frame in that worst case; at the real 24 fps the average is well under 1 ms per frame. Layout / paint cost could not be measured there.

## Extending the gazetteer

Open `src/data/geoPlaces.ts`. Cities and regions are grouped under a country line `@XX` (ISO alpha-2), one `Name lat lng` per line; alternative spellings are joined with `/` (`Bengaluru/Bangalore 12.97 77.59`).
Plain ASCII, accents do not matter, matching ignores case, spaces and dots. A city is looked up as `city|country`, then `region|country`, then the country centre. Add a line, run
`node --liftoff-only scripts/supabase/test-geo-places.mjs` (it also checks that no entry is far from its own country, which catches a wrong sign).

## Owner steps

1. Run `supabase/migrations/20261114000007_visit_coordinates.sql` in the Supabase SQL editor, **then** `supabase/migrations/20261114000008_admin_user_locations_v2.sql` (both safe to run twice; additive; no data changed).
2. Push the code (Worker + app deploy as usual). Open Admin panel -> **User's data**.
3. Old visits have no coordinates: each person's dot becomes exact-to-the-city only after that person opens the app again (until then it falls back to the place name). Nothing to do.
4. If a people-heavy city is "NONE" or sits at a country centre, add it to the place list as above.

## Rollback

Remove the tab (`setShowUserData` / `AdminUserDataPage` in `AdminControlModal.tsx`) or revert the commit. To drop the database part: `drop function if exists public.admin_user_locations(integer);` (nothing else depends on it). The `lat` / `lng` columns are harmless to leave; if they are dropped, `record_visit` from `20261020000002` must be restored first.

## Limits

* Places are approximate (IP geolocation: the connection's city or a nearby hub, a VPN, a data centre); the typed profile city is the user's word. Dots of one city share the same coordinates and sit on top of each other (the card's Next button walks through them).
* Users who never opened the app while logged in, and never typed a city, show only the phone-code country or nothing.
* The 110 m map outline is coarse when zoomed to city level; dots are still placed correctly (equirectangular, 1000 units = 360 degrees).
