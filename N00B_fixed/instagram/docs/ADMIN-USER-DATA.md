# Admin page: User's data (the green map)

A full-screen page opened from the admin panel (tab **User's data**, next to Visitors; only the main administrator sees the tab). It shows a green world map with a yellow dot for the
approximate place each user **created their account** (hollow ring) and where they were **last seen** (filled dot). A switch shows Signed up / Last seen / Both. Dots that overlap at the
current zoom are joined into one counted dot. Tap or hover a dot (or a counted dot) for a terminal-style card: username, display name, `created YYYY-MM-DD`, place, `last seen 3m ago @ place`.
A list of users (search box, newest "last seen" first) sits beside the map on a computer and in a drawer on a phone; tapping a row flies the map to that person.
Counters show how many users are placed, unplaced and in total. Back is at the top left (also the phone's Back gesture).

## What is shown, and where it comes from

Nothing new is collected. The page only reads what the database already holds:

| Shown | Source (first match wins) |
|---|---|
| Signup place | 1. the city typed on the profile (`profiles.city`) with the country of the phone code picked at sign-up (the "(IN)" part of `profile_private.country_code`; the number itself is never read out), 2. the oldest `site_visits` row of that user, 3. only the phone-code country |
| Last seen place and time | the newest non-bot `site_visits` row of that user (filled by `record_visit()` from the network's approximate place of the connection) |
| Name, username, created date | `profiles` |

`login_history` stores no place, so it is not used. Phone-code countries are a weak signal (the sign-up default is India); the database therefore also returns `source` (`profile` / `visit` / `dialcode`) for each signup place.

## Privacy

* Approximate place only (city / region / country). **No IP address, phone number, email or any other personal detail** leaves the database for this page (tested).
* **Admin only**: `admin_user_locations()` is `security definer`, calls `require_master_admin()` (the same check as the other admin functions), execute is revoked from `public` and `anon`. A normal user or a visitor is refused; the page then shows ACCESS DENIED. The tab is also hidden for everyone else.
* **No outside service** is used: coordinates come from an offline list bundled in the app (`src/data/geoPlaces.ts`). No geocoding request is ever made.
* Dots are deliberately scattered: a few km for a known city, tens of km for a region, a couple of hundred km when only the country is known (deterministic per user), so a dot is never a street address and dots of one city do not sit on top of each other.
* A place that is not in the list is **not guessed**: the user is counted as "unplaced" and has no dot.
* Nothing is cached in the browser (no localStorage); data is loaded once per open and by the refresh button.

## Files

* `supabase/migrations/20261114000004_admin_user_locations.sql` - the one SQL file (function `admin_user_locations(p_limit integer default 2000)`, limit clamped 1..5000, newest-active first; idempotent).
* `src/components/Modals/AdminUserDataPage.tsx` (page, counters, list, log, states), `UserDataMap.tsx` (SVG map, pan / pinch / wheel zoom, clustering, tooltip), `UserDataRain.tsx` (decorative code rain), `adminUserData.css`.
* `src/utils/userLocations.ts` (resolver, scatter, projection, clustering, short times), `src/data/geoPlaces.ts` (gazetteer), `src/data/worldMapPath.ts` (generated map outline, about 80 KB).
* `scripts/gen-world-map.mjs` - makes `worldMapPath.ts` from Natural Earth 110m (public domain, npm package `world-atlas`). The three helper packages (`world-atlas`, `topojson-client`, `d3-geo`) are installed in a scratch folder only, never in the app.
* `harness/` - page `?page=userdata&admin=1` with 64 made-up people (`state=empty|error|loading`, `denied=1`).
* Tests: `scripts/supabase/test-admin-user-locations.mjs`, `scripts/supabase/test-geo-places.mjs` (both in `npm run guard`).

## Extending the gazetteer

Open `src/data/geoPlaces.ts`. Cities and regions are grouped under a country line `@XX` (ISO alpha-2), one `Name lat lng` per line; alternative spellings are joined with `/` (`Bengaluru/Bangalore 12.97 77.59`).
Plain ASCII, accents do not matter, matching ignores case, spaces and dots. A city is looked up as `city|country`, then `region|country`, then the country centre. Add a line, run
`node --liftoff-only scripts/supabase/test-geo-places.mjs` (it also checks that no entry is far from its own country, which catches a wrong sign). To regenerate the map outline:
`mkdir <scratch> && cd <scratch> && npm init -y && npm i world-atlas@2 topojson-client d3-geo`, then `node scripts/gen-world-map.mjs <scratch>` from `N00B_fixed/instagram`.

## Owner steps

1. Run `supabase/migrations/20261114000004_admin_user_locations.sql` in the Supabase SQL editor (safe to run twice; changes no table and no data).
2. Push the code (the app part builds and deploys as usual). Open Admin panel -> **User's data**.
3. If a new people-heavy city is "unplaced" or sits at a country centre, add it to the gazetteer as above.

## Rollback

Remove the tab (`setShowUserData` / `AdminUserDataPage` in `AdminControlModal.tsx`) or revert the commit. To drop the database part: `drop function if exists public.admin_user_locations(integer);` (nothing else depends on it; no data is stored by it).

## Limits

* Places are approximate (the connection's city, which can be a mobile operator's hub in another city, a VPN, or a data centre); the typed profile city is the user's word.
* Users who never opened the app while logged in, and never typed a city, show only the phone-code country or nothing.
* The 110 m map outline is coarse when zoomed to city level; dots are still placed correctly (equirectangular, 1000 units = 360 degrees).
