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

Visits are still stored as rows in `daysout.visits` (schema unchanged
deliberately), but the UI only ever exposes a single visited/not-visited
toggle now — no per-visit dates, notes, or history list. `toggleVisited()`
inserts one dateless, noteless row to mark a property visited, and deletes
every row for that property to un-mark it, rather than tracking which one to
remove. The redundancy (a table that can hold multiple dated visits, used
only as an existence flag) is intentional — not worth a schema migration
just to drop columns the app no longer surfaces. Anything deriving visited
state should go through `isVisited()`.

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

`data/uk-roads.json` holds motorways and A-roads (274 line segments), also
from Natural Earth (`ne_10m_roads`, filtered to a UK bounding box and
cross-checked against `data/uk.json`'s land polygons so segments in nearby
countries — Ireland, France — aren't included). Fetched via
`fetch(UK_ROADS_URL)` in `loadUkRoads()`, in parallel with `loadUkMap()` —
unlike the nation outlines, a roads-fetch failure fails soft (empty array,
console error only) rather than blocking the map, since roads are background
context and not needed for the map to actually work. Drawn once in the shell
build (`renderMap()`), not redrawn per zoom step or filter change, since
positions never change and `vector-effect: non-scaling-stroke` already keeps
line width constant on screen — the same reasoning `.map-nation` outlines
already use. Rendered in their own `.map-roads` group between the nation
fill and the city labels/property markers so roads read as ground context
underneath everything else, and are `pointer-events: none` throughout, same
as city labels.

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

`.uk-map-svg-wrap` is simply full width, fixed height (`min(80vh, 900px)`,
`min(65vh, 620px)` on mobile) — an earlier attempt made the wrapper's
width/height ratio track the current viewBox (`--map-aspect`, recomputed on
every pan/zoom) so the box shape matched whatever was zoomed in, but that
didn't visibly widen the map and was dropped in favour of this simpler fix.
The `<svg>`'s own `preserveAspectRatio="xMidYMid meet"` centres the UK inside
the fixed box and pads the rest with `--map-sea`, so a zoomed-out or
near-square crop just gets letterboxed by the sea colour rather than shrinking
the box to match — that letterboxing is intentional, not a bug.

Marker/label sizing (`MAP_MARKER_RADIUS`, `screenPx()`) targets a constant
*screen*-pixel size — on any device, not just at any zoom level. `currentMapZoom`
alone (an earlier version) only compensated for zoom, so the same "10 SVG
units" radius rendered at wildly different physical sizes depending on the
wrapper's actual CSS width — e.g. ~8px across on a phone, well under Apple's
~44px touch-target guidance, which is why markers were hard to tap on iPhone.
`currentPxPerSvgUnit` (updated in `applyView()`, which already measures the
wrapper) now tracks the *effective* px-per-unit scale so `screenPx(n)` returns
the right SVG-unit size for an "n on-screen pixels" target regardless of
device. Getting this right requires accounting for the letterboxing above:
`preserveAspectRatio="meet"` scales by whichever of width/height is more
constraining (`Math.min(rect.width / view.w, rect.height / view.h)`) — using
`rect.width` alone (tried first) silently returns the *wrong* scale whenever
the current view is letterboxed by height instead, e.g. the full, tall UK
extent inside a wide, short wrapper (exactly the default reset-zoom state).
`MAP_MARKER_RADIUS` is now a target of 16 screen px (~32px on-screen
diameter) — still short of ideal touch-target size, but a large jump from an
effectively-invisible ~8px on a phone, without making desktop markers absurd
(both now render at the *same* size, by design). A side effect worth knowing:
bigger on-screen markers legitimately overlap more at full-UK zoom, so dense
regions (South-East England) can now consolidate into one very large cluster
there — especially on a narrow/mobile viewport, where the whole UK's real-world
extent is squeezed into a smaller physical canvas than desktop, so the same
constant marker size covers proportionally more of it. That's the intended
trade-off of the no-overlap guarantee at a bigger marker size, not a bug —
zooming in (manually, or by tapping the cluster) still separates it.

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
`selectMarkerByIds()`), which reads `e.target` at pointerdown time before
capture can interfere. This one is easy to reintroduce — if marker clicks ever
stop selecting, check here first before assuming the DOM markup broke.

`dragState` is set on every pointerdown, including one that lands on a marker
or cluster — not just when `e.target.closest(".map-marker, .map-marker-cluster")`
comes back empty. An earlier version returned early in that case (reasoning
that a marker press should only ever be a tap), which meant a drag that
happened to *start* on top of a marker never panned at all, since
pointermove's panning is gated on `dragState`. That was hard to notice on
desktop with small, precise mouse targeting, but became a real bug once
markers grew to a ~32px tap target (see the marker-sizing section above) —
on a phone, a pan gesture starting on or near a marker is common, not an edge
case. `tapCandidate` still resolves a genuine tap correctly regardless
(pointermove nulls it out once movement exceeds `TAP_MAX_MOVEMENT_PX`, before
`dragState`'s pan math ever runs on that same event), so this doesn't
reintroduce spurious selection during a real drag.

Markers that overlap on screen are merged into one bigger numbered icon rather
than left to stack invisibly, overlap, or get picked arbitrarily on tap.
`drawMapMarkers()` recomputes this from scratch on every render **and** every
zoom step (via `applyView()`) using `clusterPointsNoOverlap()`, which runs in
two phases rather than a single fixed-radius pass:

1. `clusterPoints()` (generic greedy single-linkage) groups raw points using
   `individualMarkerRadius() * 2` — the distance at which two *lone* markers
   would touch.
2. Repeated passes then merge any two resulting groups whose actually-drawn
   circles would still collide, using each group's real current size via
   `drawnRadiusForGroupSize()` (a cluster icon is `MAP_CLUSTER_RADIUS_SCALE`
   — 1.6× — bigger than a lone marker), until a pass makes no further merges
   (capped at 10 passes).

Phase 2 exists because a single blanket threshold sized for the *worst case*
(two full cluster icons touching) was tried first and cascaded into one
80+-member cluster in densely-packed regions (South-East England) once the
radius crossed a percolation threshold — single-linkage chaining through a
dense point cloud with too generous a radius doesn't stay local. Escalating
the merge distance only for the *specific pairs* that would actually overlap,
rather than assuming from the start that everything might end up
cluster-sized, avoids that. All radii live in the same map/SVG-unit space as
point coordinates (`individualMarkerRadius() = screenPx(MAP_MARKER_RADIUS)`),
so distance-vs-radius comparisons need no separate screen-pixel conversion
and stay correct regardless of zoom or the map's on-screen size.

Even with that fix, growing the marker size later (see `MAP_MARKER_RADIUS`'s
history above) reopened essentially the same problem at a bigger radius: one
region could still consolidate into a 240+-member cluster, just at a higher
percolation threshold than before. `MAP_CLUSTER_MAX_SIZE` (50) caps this
directly — both `clusterPoints()`'s phase-1 growth and phase-2's merge step
refuse to produce a group bigger than that, even if it means two capped
clusters are left slightly overlapping near each other in an unusually dense
area. This is a deliberate step back from the strict "markers never overlap"
guarantee: several capped, mostly-separate clusters read as far more useful
than one region turning into a single giant blob with a number in it.

Each marker/cluster carries `data-property-ids` — always a comma-separated
list, even for a single property — instead of a singular id, so pointer
handlers use `.closest(".map-marker, .map-marker-cluster")` and split that
attribute rather than reading a per-element id. Zooming in enough that two
markers no longer overlap makes them un-cluster on the very next
`drawMapMarkers()` call, since membership is recomputed from actual on-screen
distance, not cached. `selectMarkerByIds()` just applies the tapped element's
id list to `state.selectedPropertyIds` — no separate proximity search is
needed at tap time, since the cluster grouping already did that work when the
marker was drawn. Tapping a merged cluster (more than one id) also calls
`zoomToSeparate()`, which zooms in step-by-step on the group's centre until
`clusterPointsNoOverlap()` would no longer merge every original member into
one cluster — so tapping the icon actually reveals the individual markers it
replaced, rather than leaving the same icon on screen — it keeps zooming
until *every* original member is its own singleton, not just until the group
splits into smaller sub-clusters (a 3+ member cluster resolving to "1 + 2"
instead of three individual markers was a bug this closed). `clampView()`'s
zoom-in floor is `baseView.w / 5000` (street-level) rather than a much
shallower earlier value specifically so this can actually reach real-world
properties a few hundred metres apart (e.g. Alnwick Castle and The Alnwick
Garden, ~270m apart, couldn't separate at all under the old floor). It still
stops early if a zoom step doesn't change `view.w` (that floor reached), so
pointer-coincident data doesn't spin the loop forever — and since it only
checks the tapped group against itself, a member can still end up newly
clustered with some other, previously distant property that zooming toward
the group's centre brought close by on screen; that's an accepted side
effect of clustering being recomputed from *all* currently-plotted
properties, not a bug. The selection card becomes a small carousel
(`data-cluster-nav="prev"/"next"`, `state.selectedCardIndex`) whenever that
list has more than one entry. The card also has a
`data-action="close-map-selection"` × in the corner, handled by the same
delegated click listener as the list's mark-visited/edit buttons — that
handler clears both `.map-marker.active` and `.map-marker-cluster.active`.
Tapping empty map space (not a marker) does the same thing, resolved in
`endPointer()` alongside the double-tap-zoom check — the two are
independent, so a quick double-tap on empty space both dismisses any open
card *and* zooms, rather than the first tap's dismissal blocking the second
tap's zoom from being recognised.

Marker fill colour is set inline per-element (`markerFillColor()`), not
through a CSS class, since it depends on the specific property's institution:
visited renders in that institution's full colour, unvisited renders as
`color-mix(in srgb, <colour> 38%, var(--map-sea))` — a lighter tint of the
*same* hue rather than a generic grey, so colour alone still identifies the
institution either way (verified working as both a `fill` attribute and
inline style on SVG elements, including with a `var()` operand, in Chromium).
The map specifically uses `institutionGroupColour()`, not the `institutionColour()`
the list view's tags use — it resolves an exact institution (e.g. "National
Trust for Scotland") to its *group's* colour (National Trust's green) via
`GROUP_VARNAME_BY_MEMBER`, the same 4 buckets `INSTITUTION_GROUPS` gives the
progress cards, rather than each of the 7+ exact institutions getting its own
near-similar hue — a map is read at a glance, and that many close shades
would be harder to tell apart than the 4 group colours already used
elsewhere. `institutionTags()` in the list view deliberately keeps using the
exact per-institution colour instead, since it's showing the precise
association, not a filter bucket. A mixed-group cluster falls back to
`--muted` rather than picking one member's colour arbitrarily; a cluster only
renders as "visited" shade once *every* member has been visited, not just
one. Because colour is set inline, the old `.map-marker.visited`/`.unvisited`
CSS rules were removed entirely — reintroducing class-based fill rules would
silently override the inline colour via CSS cascade.

The map also carries a fixed set of ~133 UK cities and market towns
(`UK_CITIES`, `drawCityLabels()`) as muted, non-interactive background
landmarks. The original ~20 were just the major cities, spread across all
four nations rather than clustered in England (which has more big cities);
the market towns were added afterwards so that (almost) every property has
*some* labelled landmark nearby, not just properties near a big city. A
literal "every property within 5 miles" turned out to need ~260 more towns —
essentially one per property — so the actual target is every property within
20 miles of a landmark (most within 10), a deliberate trade-off computed with
a greedy set-cover script (farthest/densest-point-first, see git history)
against the seed data rather than picked by eye. A further batch after that
just filled out some notable cities/towns the first two passes happened to
miss (Exeter, Norwich, Perth, Newry, …), not chasing exhaustive coverage.
They live in their own `.map-cities` group between the nation outlines and
the property markers, are never counted in `clusterPointsNoOverlap()`, and
use the same constant-on-screen-size approach (`screenPx()`) as everything
else on the map. At this density, showing all ~133 unconditionally used to
make labels overlap each other illegibly in the densest regions (South-East
England)
when zoomed out. `drawCityLabels()` now skips drawing a city (dot and label
together, not just the text) whenever its approximate on-screen label box
would overlap one already placed, checked in `UK_CITIES`' array order — the
~20 major cities are listed first, so they win any conflict over the market
towns appended after them. There's no real text-metrics call available
without a canvas, so label width is approximated as `name.length *
CITY_LABEL_CHAR_WIDTH_PX` — good enough to decide "would these collide?", not
meant to be pixel-perfect typesetting. Recomputed on every zoom step for the
same reason clusters are: whether two labels are "too close" is a
screen-pixel question that eases as you zoom in, so a city hidden at full
zoom-out can reappear once its neighbours are far enough apart on screen.

Markers have no `<title>` child and rely only on `aria-label` plus the custom
`.uk-map-tooltip` — that tooltip is built from a `pointermove` handler
matching `.closest(".map-marker, .map-marker-cluster")`, showing a name/
location line for a single property (no visited status or date — colour
already carries that) or "N properties here" for a cluster. There's no
"opened zoomed to the N miles around..." caption under the map either
(`.map-center-note` was removed) — the map itself already shows where it's
centred, so a text caption saying so again was redundant. Marker strokes
(`.map-marker`/`.map-marker-cluster circle`) are deliberately thin
(0.5–0.75px, thicker only on hover/active) so the border reads as a subtle
outline rather than competing with the institution-colour fill for attention.
Those all carry `vector-effect: non-scaling-stroke` — without it, stroke-width
is in SVG user units and scales with the viewBox, so the same numeric value
renders visibly *thicker* the further you zoom in (the opposite of what a
border should do); this pins it to screen pixels regardless of zoom, the same
constant-on-screen-size goal `MAP_MARKER_RADIUS / currentMapZoom` already
gives the marker's radius.

The map always shows exactly one non-property landmark marker
(`drawLocationMarker()`, in its own `.map-location-marker` group so
`drawMapMarkers()` rebuilding `.map-markers` never touches it): a pulsing
"you are here" dot at `state.userLocation` once known, or a house icon at
`LONDON` before that (covers both "permission not yet granted" and "denied" —
there's no third state to render differently). It's redrawn alongside the
property markers on every render and zoom step for the same constant-size
reason, and also right after the silent background geolocation fetch in
`ensureUkMapLoaded()` resolves, swapping the London house for the real dot in
place without recentring the map (consistent with that fetch never
retroactively moving the view either).

A floating "scroll to top" button (`#scroll-top-btn`) only shows in list view,
only once the filtered list has more than `SCROLL_TOP_MIN_ROWS` (10) rows, and
only once the page is actually scrolled down past
`SCROLL_TOP_SCROLL_THRESHOLD_PX` — showing it at the very top would be a
button that does nothing when clicked. `updateScrollTopButton()` is called
from `renderPropertyList()`, `toggleView()`, and a `window` `scroll` listener,
so it stays in sync with filtering, switching views, and scrolling without
needing its own render pass. Switching to map view (much shorter than a long
list) makes the browser itself clamp `window.scrollY` back down if it no
longer fits the shorter page — that's normal browser reflow behaviour, not
something this feature needs to account for specially.

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
Dispatch on the marker element itself — for a cluster, dispatch on the
`.map-marker-cluster` `<g>`, not a nested `<circle>`/`<text>`, since
`data-property-ids` lives on the group. Worth exercising after UI changes: the
list filters, the progress cards' dual role as the institution filter (picking
one, picking "All places" to clear, the `aria-checked`/`role="radio"` state),
the map (marker count should match the filtered rows, the default zoom framing
shouldn't be confused with a full-UK view when selecting a marker by id,
clusters should show the right count and fully un-merge into individual
markers on zoom-in or on tapping the cluster — not partially, e.g. a 3+
member cluster resolving to "1 + 2" —, no cluster should ever exceed
`MAP_CLUSTER_MAX_SIZE` members (check `data-property-ids` split length on
every `.map-marker-cluster`) even in the densest mock data, no two rendered
markers/clusters should ever overlap regardless of zoom level *except* where
the size cap forced it (checking every pairwise `cx`/`cy`/`r` on the
rendered `<circle>`s is a good way to confirm this directly rather than
eyeballing a screenshot), no two city/town labels should overlap at any zoom
level either (same pairwise check, but on each `.map-city text`'s real
`getBoundingClientRect()`, not the approximate width `drawCityLabels()` uses
internally to decide what to draw) and more of them should appear as you
zoom in, hovering a marker/cluster
should show only the custom tooltip and never a native one, marker colour
should track the property's institution *group* (not each exact
institution's own colour — a National Trust for Scotland property should
render in National Trust's green) with unvisited noticeably lighter than
visited, the location marker should be a house icon at London with no
geolocation permission and a "you are here" dot once granted, and
marker/cluster borders should stay visually thin even zoomed in deep, and a
marker's rendered on-screen size — read its `<circle>`'s `getBoundingClientRect()`,
not just the SVG-unit `r` attribute — should come out the *same* on a phone-sized
viewport as on desktop, not smaller), mark-visited, add/edit property, the
duplicate-name and half-coordinate validations, and both light and dark
themes. To test the location marker, geolocation must be set on the
Playwright **browser context** (`browser.newContext({ geolocation: {...},
permissions: ["geolocation"] })`), not the page — and Chromium only honours
it when both options are set together.
