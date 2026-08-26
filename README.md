# Days Out (GitHub Pages + Supabase)

Track visits to historic houses and gardens around the UK — National Trust,
English Heritage, National Trust for Scotland, Historic Environment Scotland,
Cadw, RHS gardens, independent houses, and historic churches and cathedrals.

- **List view** with a free-text search, a Visited toggle (All / Visited / Not
  visited) and a Sort toggle (A–Z / Nearest to me), each a single button that
  cycles through its values. The "Visited Properties" progress cards double as
  the institution filter — click one to narrow the list to it, click again
  (or click "All places") to clear. A floating button appears once you've
  scrolled down a long list (more than 10 places) to jump back to the top
- **Map view** — a polygon map of the UK with every property plotted by
  coordinates, coloured by institution group (visited in that group's colour,
  not visited in a lighter tint of the same colour — the same 4 groups as the
  progress cards, e.g. a National Trust for Scotland place shows National
  Trust's green). Opens immediately (it never waits on a location fix) zoomed
  to the 50 miles around your location if already known, or London otherwise,
  with pinch, double-tap/double-click, scroll, and on-screen +/− controls to
  zoom, and drag to pan. Markers render at the same on-screen size on a phone
  as on desktop, sized for tapping rather than a fixed map-unit size that
  would render tiny on a small screen. Markers close enough to touch merge
  into one bigger numbered icon (capped at 50 properties, so one very dense
  region can't swallow the whole map into a single cluster), and zooming in
  (or tapping the icon) splits them back into individual markers once
  there's room to show them separately. Tapping either opens a selection
  card — a small carousel when more than one property is involved — closed
  with its × or by tapping anywhere else on the map. A pulsing dot marks
  your current location once known, or a house icon at London stands in for
  it until then. Major cities and market
  towns (187 of them) are shown as muted background labels for orientation,
  spread across all four nations and picked so that every property in the
  seed data has one within about 20 miles, not just the properties near a
  big city — at
  full-UK zoom only as many are shown as fit without overlapping, and more
  appear as you zoom in. Motorways and A-roads are drawn as muted background
  lines for the same reason — ground context, not
  another data layer to read. **Zooming in adds detail rather than showing
  it all at once**: minor roads join the motorways and A-roads once you're
  past about half the UK, and around 3,300 villages and small
  settlements (each within 20 miles of a property, so they're useful
  landmarks rather than filler) appear at closer zooms again, drawn smaller
  and lighter than the towns. Zoomed out, none of that is drawn, so the
  full-UK view stays as clean as it was
- **Mark a place as visited or not**, a single toggle — no dates, notes, or
  visit history to manage
- **Add your own properties**, capturing name, location, institution(s),
  coordinates and a website link

Static site, no build step — same shape as the holiday calendar app.

## 1) Create the Supabase tables

In the Supabase SQL editor, run the SQL in:

- `supabase.sql`

That creates the `daysout` schema (a `properties` table and a `visits` table),
sets up row level security, and seeds 502 starter properties.

Then, in **Project Settings > API > Exposed schemas**, add `daysout` so
PostgREST can see it. Without this the app loads but every query fails.

The individual migrations are in `supabase/migrations/` if you would rather
apply them one at a time.

## 2) Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. In GitHub, open **Settings > Pages**.
3. Under **Build and deployment**, choose:
   - Source: `Deploy from a branch`
   - Branch: `main` (or your default branch)
   - Folder: `/ (root)`
4. Save and wait for the Pages URL.

Every path in the app is relative, so it works from a project subpath such as
`https://<user>.github.io/daysout/`.

## 3) Sign in

The app is behind a Supabase email/password sign-in, and the row level security
policies grant access to the `authenticated` role only. Add yourself as a user
under **Authentication > Users** in the Supabase dashboard.

This is deliberately stricter than an anon-key-only setup: the anon key is
published with the site, so on its own it gives no read or write access to
your data.

## Notes

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` at the top of `main.js` currently point
  at the same Supabase project as the other apps, using a separate `daysout`
  schema to keep the tables apart. Change them if you want a different project.
- **Seed data caveats.** The 502 starter properties are a hand-built list, not an
  official export — the primary sources (historichouses.org, rhs.org.uk,
  Wikipedia) block direct fetches from this environment, so the Historic Houses
  and RHS Partner Garden entries in particular were compiled from web search
  result snippets and cross-checked, not scraped from an official directory.
  Coordinates are approximate positions — good to a few hundred metres, which is
  well inside a pixel at UK map scale — and every field is editable in the app.
  Website links are left blank rather than guessed, and the institution tags
  are a starting point: RHS Partner Garden membership in particular changes
  year to year (the RHS added a batch of new partner gardens for 2026, some
  reflected here), so treat that tag as approximate and correct it in the app
  as needed.
- **Association grouping is display only.** The progress cards group bodies by
  the membership that gets you in — National Trust covers the National Trust
  for Scotland, English Heritage covers Cadw and Historic Environment
  Scotland, and RHS covers both RHS Gardens and RHS Partner Gardens. Each
  property still stores and shows its exact association, so an NTS castle
  stays distinguishable from a National Trust one. Change the grouping in
  `INSTITUTION_GROUPS` in `main.js`; no migration is needed.
- **Historic churches.** 97 parish churches and cathedrals across Kent, East
  Sussex and West Sussex, added from a user-supplied reference app rather than
  scraped or web-searched. They get their own "Historic Church"
  institution/group (its own progress card, filter, and map colour) rather
  than folding into an existing body, since they aren't National Trust /
  English Heritage / RHS / Historic Houses members. The source data's
  construction date, opening hours, highlight note and longer description are
  concatenated into the `notes` field rather than given their own columns —
  consistent with this app's general approach of not migrating the schema for
  one category's extra metadata.
- A property needs both a latitude and a longitude to appear on the map. The map
  view says how many filtered places are missing coordinates.
- Visits are still stored as rows in `daysout.visits` under the hood (the
  schema is unchanged), but the UI only ever exposes a visited/not-visited
  toggle — marking visited inserts one dateless, noteless row, marking
  not-visited deletes all of them. Deleting a property deletes its visits.
- Filters and the chosen view are remembered in browser local storage.
- **Nearest to me** asks the browser for your location the first time you choose
  it, and falls back to sorting by name if you decline. Distances are
  straight-line (so they under-read against a road route) and shown in miles.
  Your position is held in memory for the session only — it is never written to
  local storage or sent to Supabase. Reloading the page with that sort saved
  will not re-prompt unless you already granted permission. Geolocation needs
  HTTPS, which GitHub Pages provides. There is no separate "getting your
  location…" status bar — the list or map just updates once it resolves.
- `data/uk.json` holds the England / Scotland / Wales / Northern Ireland
  outlines, extracted from the Natural Earth 1:10m `admin_0_map_subunits`
  dataset (public domain), simplified and trimmed of very small islands. It is
  bundled locally so the map needs no external requests. The app draws it with
  an Albers equal-area conic projection tuned to the UK.
- `data/uk-roads.json` holds motorways, A-roads and minor roads (468
  segments), also from Natural Earth (`ne_10m_roads`, public domain),
  filtered to the UK and bundled locally the same way. The minor roads are
  only drawn once the map is zoomed in past about half the UK. If it
  fails to load, the map still works — roads are decorative background
  context, not required. This is as detailed as Natural Earth gets: every UK
  road it holds is already in the file, and everything it leaves out is in
  Ireland, France or the Isle of Man. A denser network would have to come
  from OpenStreetMap.
- `data/uk-villages.json` holds 3,324 villages and small settlements, drawn
  only at closer zoom levels. Each is within 20 miles of a seed property (so
  they read as landmarks near somewhere you might visit) and at least 1.5
  miles from its neighbours and 2.5 miles from any of the 187 named towns, so
  they don't pile up. That is most of what the source can give — its ceiling
  is 4,232, and anything smaller than that is below the gazetteer's
  population-500 cut-off. Same fail-soft loading as the roads. The coordinates come
  from a GeoNames-derived gazetteer of places with a population of 500 or
  more — GeoNames data is licensed
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), unlike the
  public-domain Natural Earth data used elsewhere on the map.
