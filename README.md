# NASTI

NASTI is a field data collection and seed inventory platform for native seed
collection programs. Field teams record what they collected, where, and from
which plants; the office side tracks that seed through cleaning, treatment,
storage, and quality testing, and can hand batches to external labs for testing.

The repo is a pnpm + Turborepo monorepo holding two front ends, a set of shared
packages, the Supabase backend, and the PowerSync service config that makes the
mobile app work offline.

## Repo layout

| Path                         | What it is                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web`                   | `@nasti/web` — office web app (React 18, Vite, TanStack Router). Deployed to Cloudflare Pages      |
| `apps/mobile`                | `nasti-mobile` — "Seed Scout" field app (React 19, Vite, Capacitor for iOS/Android), offline-first |
| `packages/common`            | `@nasti/common` — Supabase client, generated DB types, domain types, shared hooks/utils            |
| `packages/ui`                | `@nasti/ui` — component library on Radix primitives + Tailwind v4                                  |
| `packages/tailwind-config`   | Shared Tailwind v4 config and PostCSS deps                                                         |
| `packages/eslint-config`     | Shared ESLint config                                                                               |
| `packages/typescript-config` | Shared tsconfig bases                                                                              |
| `supabase/`                  | Migrations, seed data, pgTAP tests, edge functions, local dev config                               |
| `powersync/`                 | PowerSync service config, sync rules, Docker Compose for local dev, Fly.io deploy config           |
| `apps/web/functions/`        | Cloudflare Pages Functions — ALA image proxy and IBRA region endpoint                              |

`apps/pwa/` is a leftover build directory from the app that `apps/mobile`
replaced. It has no `package.json`, so it is not a workspace package and nothing
builds it.

## Architecture

Both front ends talk to the same Supabase project, but they reach it differently.

**Web** queries Supabase directly through `@supabase/supabase-js`, with TanStack
Query for server state and Zustand for the small amount of global state (current
user and organisation). Row Level Security is the authorization boundary — there
is no API layer of our own in between. Work that needs elevated privileges lives
in Supabase edge functions (`supabase/functions/`): invitations, user
deactivation, organisation link requests, batch testing assignment and return,
and trip data deletion.

**Mobile** is offline-first and never queries Supabase for domain data during
normal use. PowerSync replicates the rows the user is entitled to into a local
SQLite database (via `@capacitor-community/sqlite`), the UI reads and writes
that local database, and the connector uploads the queued local mutations to
Supabase when a connection is available. Photos and audio are captured locally
and uploaded resumably with `tus-js-client`.

Authorization rides on the JWT. A custom access token hook stamps `org_id` and
`role` into `app_metadata`, and RLS policies read them through
`get_user_organisation_id()` and `auth_org_role()` rather than joining `org_user`
on every row. The trade-off is that a membership or role change does not take
effect until the token refreshes.

## Domain model

- **Organisations** are the tenant boundary; every record is organisation-scoped.
  Users belong to one via `org_user` with role `Admin` or `Member`. An
  organisation is of type `General` (collects seed) or `Testing` (runs quality
  tests for others), and the two link to each other through
  `organisation_link` / `organisation_link_request`.
- **Trips** group field work. Within a trip, teams record **collections** (seed
  gathered from a population, with location, species or field name, phenology,
  duration, photos, audio, people present, and the **containers** it went into)
  and **scouting notes** (a population observed but not collected).
- **Species** are per-organisation records, optionally tied to an ALA
  (Atlas of Living Australia) GUID, with photos sourced from uploads, collection
  photos, or ALA.
- **Batches** are the inventory side. A collection becomes an origin batch,
  which can be split, merged, mixed, cleaned, and treated; each operation is a
  database function (`fn_split_batch`, `fn_merge_batches`, `fn_clean_batch`,
  `fn_treat_batch`, and so on) rather than client-side writes. **Sub-batches**
  are the storage-level portions within a batch, and weight is derived through
  the `batch_current_weight` / `sub_batch_current_weight` views rather than
  stored. `batch_custody` records who holds a batch, which is what lets a
  testing organisation see and act on batches assigned to it.
- **Tests** hold quality test results (x-ray, cut test, TZ, germination) with
  statistics computed in the database.
- **Containers** and **storage locations** are organisation-level catalogues
  managed by admins under Settings.

`packages/common/types/database.ts` is generated from the database and is the
source of truth for table shapes; `packages/common/types/index.ts` maps those
rows onto the domain names used across the apps.

## Getting started

Prerequisites: Node 22 (what CI uses), `pnpm`, Docker (for Supabase and
PowerSync), and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
pnpm install
```

Start the local Supabase stack:

```bash
supabase start
```

Local services: API on `http://127.0.0.1:57321`, database on
`postgresql://postgres:postgres@127.0.0.1:57322/postgres`, Studio on
`http://127.0.0.1:57323`, and Inbucket (captured emails) on
`http://127.0.0.1:57324`.

Environment variables go in a single `.env.local` at the **repo root** — both
Vite configs set `envDir` to the root for local development, so the two apps
share one file. At minimum you need `VITE_SUPABASE_URL`,
`VITE_SB_PUBLISHABLE_KEY`, and `VITE_MAPBOX_ACCESS_TOKEN`, plus
`VITE_POWERSYNC_URL` for the mobile app. Optional: `VITE_SENTRY_DSN`,
`VITE_PUBLIC_POSTHOG_KEY`, `VITE_PUBLIC_POSTHOG_HOST`, `VITE_WEB_APP_URL`.
Production builds fall back to Vite's default per-app resolution.

Then run the apps:

```bash
pnpm dev
```

`pnpm dev` starts everything through Turborepo. To run one app:

```bash
pnpm dev --filter=@nasti/web
pnpm dev --filter=nasti-mobile
```

The web app's `dev` script wraps Vite in `wrangler pages dev` so the Pages
Functions under `apps/web/functions` are available; use `pnpm --filter=@nasti/web
dev:vite` for plain Vite on port 5173 if you don't need them. The mobile app
serves on port 5172.

For offline work on mobile you also need the PowerSync service running locally:

```bash
pnpm powersync:up     # docker compose up
pnpm powersync:logs   # follow logs
pnpm powersync:down   # tear down
```

## Commands

Run from the repo root:

| Command             | What it does                                                     |
| ------------------- | ---------------------------------------------------------------- |
| `pnpm dev`          | All apps in watch mode                                           |
| `pnpm build`        | Type-check (`tsc -b`) and build every package and app            |
| `pnpm lint`         | ESLint across the workspace                                      |
| `pnpm test`         | Vitest across the workspace — see the caveat below               |
| `pnpm test:db`      | pgTAP tests in `supabase/tests` against the local database       |
| `pnpm gen-types`    | Regenerate `packages/common/types/database.ts` from the local DB |
| `pnpm powersync:up` | Start the local PowerSync service                                |

To type-check a single app without a full build:
`pnpm --filter=@nasti/web exec tsc -b`.

Two rough edges to know about:

- The unit tests all live in `apps/mobile`. `pnpm test` fails at `@nasti/web`,
  which has a `vitest` script but no test files — vitest exits non-zero when it
  finds none. Use `pnpm test --filter=nasti-mobile` until the web app either
  gains tests or drops the script.
- `pnpm lint` reports hundreds of errors once you have run the web dev server:
  `apps/web/.wrangler/` holds generated bundles, and while it is gitignored it is
  not in the ESLint ignores. Lint the paths you changed, or delete
  `apps/web/.wrangler`.

## Database changes

Migrations live in `supabase/migrations/` and are named
`<YYYYMMDDHHMMSS>_<description>.sql`. `supabase/seed.sql` runs after them on a
reset, so a migration that drops or renames a column needs the seed updated in
the same change.

A typical loop:

1. Write the migration.
2. `supabase db reset` to apply migrations and seed from scratch.
3. `pnpm gen-types` to refresh the generated types, then update
   `packages/common/types/index.ts` if you added a table or enum.
4. `pnpm test:db` to check the RLS contracts in
   `supabase/tests/rls_contracts.sql`.

New tables need explicit RLS. The current convention is one policy per command,
named `<table>_<action>`, with the organisation check written as
`organisation_id = (SELECT public.get_user_organisation_id())` — the `SELECT`
wrapper matters, it makes Postgres evaluate the helper once per query instead of
once per row. Child tables scope through their parent instead; see
`collection_containers` in `supabase/migrations/20260727000002_collection_containers.sql`
for that shape.

## Adding a table the mobile app syncs

PowerSync needs the same table described in three places, and missing one fails
quietly — the table simply stays empty on the device, or local writes never
reach Supabase:

1. `powersync/sync-config.yaml` — a query under the right stream, deciding which
   rows a user receives. Cast Postgres types SQLite has no equivalent for
   (`purpose::text`, `person_ids::text`, `duration::text`).
2. `apps/mobile/src/lib/powersync/schema.ts` — the client-side table and its
   columns. SQLite has no boolean, so booleans are `column.integer`.
3. `apps/mobile/src/lib/powersync/connector.ts` — `TABLE_UPLOAD_PRIORITY` so
   rows upload after their parent (a child row uploaded first fails on the
   foreign key), plus `JSON_FIELDS` / `ARRAY_FIELDS` / `BOOLEAN_FIELDS` if the
   values need converting back on the way up.

Changing sync rules also means redeploying the PowerSync service; migrations
alone are not enough.

## Deployment

- **Web** — Cloudflare Pages, built with `tsc -b && vite build`.
- **Mobile** — `pnpm --filter=nasti-mobile cap:sync` then open the native
  project (`cap:open:ios`, `cap:open:android`). The
  `Build Android APK` GitHub Actions workflow produces a debug APK for internal
  testing; see `apps/mobile/README.md`.
- **PowerSync** — Fly.io (`powersync/fly.toml`), via the `deploy-powersync`
  workflow.
- **Supabase** — migrations and edge functions applied with the Supabase CLI.

## Conventions

- No semicolons; Prettier with `prettier-plugin-tailwindcss`. Husky and
  lint-staged format and lint staged files (configured for `apps/web` and
  `packages/ui` — elsewhere, run Prettier yourself), and commitlint enforces
  Conventional Commits.
- `Boolean(value)` rather than `!!value`.
- Avoid `any`. Use `unknown` where a type is genuinely unknown.
- File-based routing with TanStack Router. `routeTree.gen.ts` is generated —
  the Vite plugin rewrites it on dev and build, so don't hand-edit it. It also
  watches route files, and will overwrite one with a scaffold stub if it ever
  observes the file empty; be careful running formatters over route files while
  a dev server is up.
- Forms use react-hook-form with Zod resolvers.
- Read [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
  before reaching for `useEffect`. Where async data has to seed a form's default
  values, the pattern in this codebase is to wait for the data and mount the
  form once, rather than resetting it in an effect.

`CLAUDE.md` carries the same conventions in the form Claude Code reads.
