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

`data/uk.json` holds the four UK nation outlines, extracted from Natural Earth
1:10m `admin_0_map_subunits` (public domain), simplified and stripped of tiny
islands. The app projects it with an Albers equal-area conic tuned to the UK
(`projectAlbers`); the same projection places property markers, so it is the
single source of truth for map geometry.

## Verifying changes

There are no unit tests. The app is checked by driving it in Chromium with
Playwright against a stubbed Supabase client, because the CDN and `supabase.co`
are both blocked from the sandbox. Worth exercising after UI changes: the list
filters, the map (marker count should match the filtered rows), mark-visited,
add/edit property, the duplicate-name and half-coordinate validations, and both
light and dark themes.
