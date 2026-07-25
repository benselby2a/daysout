# Days Out (GitHub Pages + Supabase)

Track visits to historic houses and gardens around the UK — National Trust,
English Heritage, National Trust for Scotland, Historic Environment Scotland,
Cadw, RHS gardens and independent houses.

- **List view** with a free-text search, a Visited toggle (All / Visited / Not
  visited) and a Sort toggle (A–Z / Nearest to me), each a single button that
  cycles through its values. The "Visited Properties" progress cards double as
  the institution filter — click one to narrow the list to it, click again
  (or click "All places") to clear
- **Map view** — a polygon map of the UK with every property plotted by
  coordinates, coloured by institution (visited in that institution's colour,
  not visited in a lighter tint of the same colour). Opens immediately (it
  never waits on a location fix) zoomed to the 50 miles around your location if
  already known, or London otherwise, with pinch, double-tap/double-click,
  scroll, and on-screen +/− controls to zoom, and drag to pan. Markers close
  enough together to visually overlap merge into one bigger numbered icon;
  zooming in until they're no longer touching splits them back into individual
  markers. Tapping either opens a selection card — a small carousel when more
  than one property is involved — with a × to close it. Tapping a merged icon
  also zooms in until it splits back into its individual markers
- **Mark a place as visited or not**, a single toggle — no dates, notes, or
  visit history to manage
- **Add your own properties**, capturing name, location, institution(s),
  coordinates and a website link

Static site, no build step — same shape as the holiday calendar app.

## 1) Create the Supabase tables

In the Supabase SQL editor, run the SQL in:

- `supabase.sql`

That creates the `daysout` schema (a `properties` table and a `visits` table),
sets up row level security, and seeds 313 starter properties.

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
- **Seed data caveats.** The 313 starter properties are a hand-built list, not an
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
