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

**Bump the `?v=` cache-busting suffix on `main.js` and `styles.css` in
`index.html` every time either file changes**, even for a same-day follow-up
edit — GitHub Pages' CDN caches those URLs verbatim, so an unchanged query
string means returning visitors keep getting the old file indefinitely,
however many commits have landed since. This has already caused a live "new
feature isn't clickable / doesn't do anything" report once (the browser was
still running JS from before the feature existed).

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
`Cadw`, …). `INSTITUTION_GROUPS` in `main.js` groups those by membership for
the "Visited Properties" progress cards only — never write a group name into
the database. Those cards double as the institution filter (each is a
`role="radio"` button with `data-institution`; "All places" clears it) rather
than a separate control, so there is one place, not two, that needs updating
if the grouping ever changes. Filter state stores group keys, and
`selectedInstitutionNames()` expands them, falling back to treating an unknown
key as a literal institution name so hand-typed values and pre-grouping saved
filters keep working.

`data/uk.json` holds the four UK nation outlines, extracted from Natural Earth
1:10m `admin_0_map_subunits` (public domain), simplified and stripped of tiny
islands. The app projects it with an Albers equal-area conic tuned to the UK
(`projectAlbers`); the same projection places property markers, so it is the
single source of truth for map geometry.

The map opens zoomed to `DEFAULT_MAP_RADIUS_MILES` around the user's location
if already known (`state.userLocation`, e.g. from an earlier "Nearest to me"),
or London otherwise (`resolveMapDefaultCenter()`) — it **never** waits on a
fresh geolocation request before rendering; an earlier version did (with a
capped grace window) and it was still a noticeably slow way to open a map.
`ensureUkMapLoaded()` fires `requestLocation({silent:true})` in the background
after first render purely so a later "Nearest to me" (or reopening the map tab
in the same session) can benefit from a resolved location without prompting
again — it does not retroactively re-centre the already-open map. The default
view is resolved once per page load and only sets the *starting* viewBox; the
existing reset-zoom control still returns to the full UK extent.

`--map-aspect` (the wrapper's width/height ratio) is **not** fixed to the full
UK's tall/narrow shape — `applyView()` recomputes it from the *current*
viewBox on every pan/zoom. The default local view is roughly square, and
sizing the wrapper for the country's proportions instead would letterbox that
square crop down to a fraction of the available width. This is the mechanism
behind "the map fills the available width" — without it, only the *shape* of
whatever's currently zoomed-in changes the visible framing, not the box.

Pinch-zoom and double-tap-to-zoom are hand-rolled on top of Pointer Events in
`wireMapInteractions()` (there's no touch-gesture library) — `setPointerCapture`
is wrapped in try/catch there because a throw from it would otherwise abort the
rest of that pointerdown handler, silently breaking the tracking setup below it.
The same pointerdown handler also calls `e.preventDefault()` unconditionally:
without it, a mouse-drag pan (or a double-click) reads to the browser as a
text-selection drag, which highlights whatever the cursor passes over once it
strays outside the map — particularly visible on a trackpad. `user-select:
none` on `.uk-map-svg-wrap` is a second layer of the same fix.

Marker selection does **not** use the native `click` event, on purpose:
`svg.setPointerCapture()` is called on every pointerdown (needed so a pinch
that starts with a finger on a marker still gets tracked), and a captured
pointer retargets the resulting `click`'s `e.target` to the `<svg>` itself
rather than the marker — silently breaking `e.target.classList.contains(...)`
checks in a click handler. Selection is instead resolved inside the same
pointerup-based tap detection used for double-tap-zoom (see `tapCandidate` and
`selectMarkerCluster()`), which reads `e.target` at pointerdown time before
capture can interfere. This one is easy to reintroduce — if marker clicks ever
stop selecting, check here first before assuming the DOM markup broke.

A tap doesn't just select whatever marker `e.target` was — `selectMarkerCluster()`
also gathers every *other* marker within `MAP_CLUSTER_RADIUS_PX` screen pixels
of the tap point (converted to the current viewBox's units, so "close" always
means close on screen regardless of zoom) into `state.selectedPropertyIds`,
ordered nearest-first. The selection card becomes a small carousel
(`data-cluster-nav="prev"/"next"`, `state.selectedCardIndex`) whenever that
list has more than one entry — real UK property data clusters densely enough
(e.g. Alnwick Castle and The Alnwick Garden) that this isn't a rare edge case
at full-UK zoom. The card also has a `data-action="close-map-selection"` × in
the corner, handled by the same delegated click listener as the list's
mark-visited/edit buttons.

## Verifying changes

There are no unit tests. The app is checked by driving it in Chromium with
Playwright against a stubbed Supabase client, because the CDN and `supabase.co`
are both blocked from the sandbox. Playwright's touchscreen API only supports
single-point taps/swipes, so pinch-zoom and double-tap need synthetic
`PointerEvent`s with distinct `pointerId`s dispatched directly via
`element.dispatchEvent()` in a `page.evaluate()` call — two overlapping
pointerdown/pointermove/pointerup sequences with different `pointerId`s for a
pinch, two pointerdown+pointerup pairs close together in time for a double-tap.
A synthetic event's `e.target` is fixed to whatever element `dispatchEvent()`
was called on, unlike a real pointer event (which the browser hit-tests at
the given coordinates) — dispatching on the `<svg>` root to simulate a marker
tap silently tests nothing, since `e.target` never becomes a `.map-marker`.
Dispatch on the marker element itself. To exercise clustering deliberately,
sample every marker's `cx`/`cy` and pick the closest real pair rather than
guessing a screen coordinate — this dataset already has genuine near-duplicates
(e.g. Alnwick Castle / The Alnwick Garden) worth targeting directly. Worth
exercising after UI changes: the list filters, the progress cards' dual role
as the institution filter (picking one, picking "All places" to clear, the
`aria-checked`/`role="radio"` state), the map (marker count should match the
filtered rows, the default zoom framing shouldn't be confused with a full-UK
view when clicking a marker by id, and `--map-aspect` should differ visibly
between the default and full-UK views), mark-visited, add/edit property, the
duplicate-name and half-coordinate validations, and both light and dark
themes.
