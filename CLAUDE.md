# Days Out — working notes

## Git workflow

**Commit and push completed work straight to `main`. Do not open a pull request
or create a feature branch unless explicitly asked.** `main` is the default
branch and the one GitHub Pages deploys from, so anything merged there is live.

## What this is

A static site — no build step, no dependencies to install. Open `index.html`
through any static server (`npx serve -p 4322 .`, or the `.claude/launch.json`
config) and it runs. Deployed by GitHub Pages from `main` at the repo root, so
every path must stay relative for the `/daysout/` subpath to work.

Structure follows the sibling `holidaycalendar` app: `index.html` + `main.js` +
`styles.css`, Supabase over the CDN client, an email/password auth gate, hub
theme integration via `postMessage`, and a PWA manifest.

## Supabase

- One shared Supabase project across the apps, each with **its own schema**.
  This app uses `daysout`, set via `db: { schema: "daysout" }` in `main.js`.
- Adding a schema is not enough on its own: it must also be listed in
  **Settings → API → Exposed schemas**, which writes to
  `pgrst.db_schemas` on the `authenticator` role. When editing that value
  directly, **append** — the same string carries every other app's schema, and
  replacing it breaks them all.
- Symptoms worth recognising: HTTP **406** / `PGRST106` means the schema is not
  exposed; `PGRST205` ("not found in the schema cache") means it is exposed but
  the table is missing or the cache is stale — `notify pgrst, 'reload schema';`.
- RLS policies grant access to the `authenticated` role only, so the published
  anon key alone reads nothing. Requires a real Supabase user.
- `supabase.sql` is the full setup (schema + tables + policies + seed) and is
  the concatenation of the files in `supabase/migrations/`. Regenerate both
  together if the seed changes; the seed is idempotent via
  `on conflict (name) do nothing`.

## Data model

Visits are rows in `daysout.visits`, not a boolean on the property, so a place
can be visited repeatedly and `visited_on` is nullable ("visited, no idea
when"). Anything deriving visited state should go through `isVisited()`.

Properties store their **exact** association (`National Trust for Scotland`,
`Cadw`, …). `INSTITUTION_GROUPS` in `main.js` groups those by membership for the
filter chips and progress cards only — never write a group name into the
database. Filter state stores group keys, and `selectedInstitutionNames()`
expands them, falling back to treating an unknown key as a literal institution
name so hand-typed values and pre-grouping saved filters keep working.

`data/uk.json` holds the four UK nation outlines, extracted from Natural Earth
1:10m `admin_0_map_subunits` (public domain), simplified and stripped of tiny
islands. The app projects it with an Albers equal-area conic tuned to the UK
(`projectAlbers`); the same projection places property markers, so it is the
single source of truth for map geometry.

The map opens zoomed to `DEFAULT_MAP_RADIUS_MILES` around the user's location,
falling back to London (`ensureMapDefaultCenter()`). That request is capped at
`MAP_LOCATION_GRACE_MS` (2.5s) — deliberately much shorter than the 15s used by
the explicit "Nearest to me" sort — because this one fires passively on opening
the tab and must never leave the map stuck behind a spinner over an unanswered
permission prompt. Losing that race doesn't cancel the underlying request, so
a slow "Allow" click still populates `state.userLocation` for later use. The
default view is resolved once per page load and only sets the *starting*
viewBox; the existing reset-zoom control still returns to the full UK extent.
Pinch-zoom and double-tap-to-zoom are hand-rolled on top of Pointer Events in
`wireMapInteractions()` (there's no touch-gesture library) — `setPointerCapture`
is wrapped in try/catch there because a throw from it would otherwise abort the
rest of that pointerdown handler, silently breaking the tracking setup below it.

Marker selection does **not** use the native `click` event, on purpose:
`svg.setPointerCapture()` is called on every pointerdown (needed so a pinch
that starts with a finger on a marker still gets tracked), and a captured
pointer retargets the resulting `click`'s `e.target` to the `<svg>` itself
rather than the marker — silently breaking `e.target.classList.contains(...)`
checks in a click handler. Selection is instead resolved inside the same
pointerup-based tap detection used for double-tap-zoom (see `tapCandidate` and
`selectMarker()`), which reads `e.target` at pointerdown time before capture
can interfere. This one is easy to reintroduce — if marker clicks ever stop
selecting, check here first before assuming the DOM markup broke.

## Verifying changes

There are no unit tests. The app is checked by driving it in Chromium with
Playwright against a stubbed Supabase client, because the CDN and `supabase.co`
are both blocked from the sandbox. Playwright's touchscreen API only supports
single-point taps/swipes, so pinch-zoom and double-tap need synthetic
`PointerEvent`s with distinct `pointerId`s dispatched directly via
`element.dispatchEvent()` in a `page.evaluate()` call — two overlapping
pointerdown/pointermove/pointerup sequences with different `pointerId`s for a
pinch, two pointerdown+pointerup pairs close together in time for a double-tap.
Worth exercising after UI changes: the
list filters, the map (marker count should match the filtered rows, and the
default zoom framing shouldn't be confused with a full-UK view when clicking a
marker by id), mark-visited, add/edit property, the duplicate-name and
half-coordinate validations, and both
light and dark themes.
