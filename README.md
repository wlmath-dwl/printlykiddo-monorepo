# PrintlyKiddo Monorepo (local migration workspace)

This directory is an isolated migration copy of the current public site and local admin.
The original repositories under `/Users/dongwanlong/mywork` are not modified.
Use Node 24 for local Cloudflare tooling (`.nvmrc`); the installed Node 25 runtime currently fails
when Wrangler starts Workerd on this machine.

## Safety boundary

- `pages:scan`, `pages:build` and `pages:publish-local` only read local files and write `.local/`.
- The new Worker configuration contains no production R2 bucket id, D1 database id, route or custom domain.
- The image Worker keeps the existing `kid-print` binding name, but local development uses Wrangler's
  local R2 simulation and its deploy script is disabled.
- There is intentionally no root `deploy` or remote sync command.
- Legacy Cloudflare files remain inside `apps/site-legacy` and `apps/admin` only as migration references. Do not run their deploy/sync commands from this workspace.

## Layout

```text
apps/admin          Existing local content admin and all local data/resources
apps/site-legacy    Existing Next.js public site, used as the first local HTML renderer
apps/site-worker    New lightweight static page router (local preview only)
apps/image-worker   Independent R2 image proxy (local preview only)
packages/shared     URL, hashing and filesystem conventions
packages/page-data  Dependency collection primitives
packages/page-templates  Page-family and code-impact registry
packages/publisher  URL registry, dirty detection, incremental local build/publish
.local/r2           Local filesystem stand-in for the future R2 page bucket
```

## First local run

```bash
npm install
npm run pages:scan
npm run pages:status
npm run dev:site
```

With the legacy site running locally, build only dirty URLs in another terminal:

```bash
npm run pages:build -- --origin http://localhost:3000 --limit 10
npm run pages:publish-local
npm run dev:worker
```

`dev:site` enables `PRINTLY_STATIC_RENDER=1`: content still comes from the copied local SQLite
database, while generated HTML uses production CDN image URLs instead of the development-only
`/api/local-dev/image` route.

The first renderer deliberately uses the existing local Next site over HTTP so the migration can
validate URL tracking, dependency invalidation and local R2 layout before page templates are
extracted. It never fetches the production site unless an explicit non-local `--origin` is passed;
the CLI rejects non-loopback origins by default.

## URL management

Start the copied admin and open `/admin/site-pages`. The **URL 与静态页** screen shows every URL,
page family, dirty reason, target R2 key and local publish status. Its buttons only invoke the local
publisher. Browser builds are intentionally limited to 100 pages per batch so a single admin HTTP
request does not need to stay open for the complete initial inventory.

The migrated admin uses `http://localhost:4540` so it can run beside the original admin on port 4538.

Every local publish also writes `.local/r2/data/cache-invalidation.json`. It records the exact URLs
whose cached HTML must be purged later. A future remote uploader must upload all selected objects
successfully first, then purge only those URLs; this workspace does not perform either online step.
