-- Defence in depth: take the table/sequence grants back off the `anon` role.
--
-- The init migration granted `all` to both `anon` and `authenticated`, and
-- relied on row level security to keep the published anon key out — there is
-- no RLS policy for `anon`, so it reads and writes nothing today. That works,
-- but it leaves RLS as the single thing standing between a key published in
-- the GitHub Pages build and the whole dataset: one `disable row level
-- security` (or one table created later without RLS turned on) and the anon
-- key has full access immediately.
--
-- Revoking the grants means the anon role has no path to these tables even if
-- RLS is off, so the two controls have to fail together rather than one.
-- `usage` on the schema is deliberately left in place: PostgREST needs it to
-- resolve the schema at all, and on its own it grants no access to any table.
--
-- No behaviour change for the app, which only ever talks to Supabase as an
-- authenticated user. Re-running this is safe.

revoke all on all tables in schema daysout from anon;
revoke all on all sequences in schema daysout from anon;

-- Future tables/sequences in this schema should not quietly pick up grants
-- either. This only affects objects created from here on by the role that
-- runs it, so it complements rather than replaces the revokes above.
alter default privileges in schema daysout revoke all on tables from anon;
alter default privileges in schema daysout revoke all on sequences from anon;
