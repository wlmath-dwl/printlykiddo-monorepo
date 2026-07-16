# PrintlyKiddo static-site migration runbook

This runbook keeps the current production Worker, D1 database, image Worker, and `kid-print`
image bucket untouched until the replacement site has been validated and its route is switched.

## Safety invariants

- `printlykiddo.com` stays on the legacy Worker during build, upload, and validation.
- `img.printlykiddo.com` and the `kid-print/imgs/` objects are reused without migration.
- Page objects use dedicated `printlykiddo-pages-staging` and
  `printlykiddo-pages-production` buckets.
- No script in this repository creates, changes, or deletes a Worker route or custom domain.
- Remote R2 writes require both `--execute` and a one-command acknowledgement environment
  variable. Production additionally requires the exact release id.
- Remote object deletion is disabled during migration.
- The root `deploy` command and every legacy deployment command remain disabled.

## 1. Prepare and validate a release locally

Use Node 24 as specified by `.nvmrc`.

```bash
npm run pages:build-production -- --release 20260716-001
npm run pages:validate-release -- --release 20260716-001
```

The production builder compiles Next.js in production mode, renders only registry URLs marked
dirty, carries forward previously referenced immutable chunks, creates `robots.txt` and
`sitemap.xml`, hashes every object, and refuses a release containing development assets,
localhost URLs, broken local asset references, or incomplete SEO basics.

## 2. Preview the upload plan

These commands are read-only and do not connect to R2 unless a later command includes the guarded
write options.

```bash
npm run pages:remote-plan -- --environment staging --release 20260716-001
npm run pages:remote-plan -- --environment production --release 20260716-001
```

Review `.local/releases/20260716-001/upload-plan-*.json`. A plan lists every changed object,
unchanged object, stale object, and public URL whose HTML cache must be purged after promotion.

## 3. Seed and test the local R2 simulator

```bash
npm run pages:seed-local-r2 -- --release 20260716-001
npm run dev:worker
```

The local and remote Workers use the same `PAGES_BUCKET` code path. Workers Static Assets are not
used anywhere in the new architecture.

## 4. Upload staging objects

Only run this after the staging bucket exists. The acknowledgement applies to one shell command;
do not store it in an env file.

```bash
PRINTLY_REMOTE_WRITE_ACK=ALLOW_PRINTLY_STAGING_WRITE \
  npm run pages:remote-upload -- \
  --environment staging \
  --release 20260716-001 \
  --confirm-empty-bucket \
  --execute
```

The release manifest uploads last. Every uploaded object is downloaded to a temporary directory
and checked against its SHA-256 before local staging state is advanced.

Upload the staging Worker version separately only after its dry run succeeds. The repository does
not provide an unguarded deploy shortcut and its Wrangler configuration contains no production
route or custom domain.

```bash
npm run dry-run:staging --workspace @printlykiddo/site-worker
```

## 5. Validate staging

Bind the staging Worker to a new preview hostname outside this repository, then run:

```bash
npm run pages:validate-origin -- \
  --release 20260716-001 \
  --origin https://preview.printlykiddo.com \
  --expect-noindex
```

The validator checks all manifest URLs, served body hashes, SEO basics, local JS/CSS/assets,
online image references, the noindex header, and the release endpoint.

## 6. Promote the identical release

Promotion refuses a release that is not the currently verified staging release.

```bash
PRINTLY_REMOTE_WRITE_ACK=ALLOW_PRINTLY_PRODUCTION_WRITE \
  npm run pages:promote -- \
  --release 20260716-001 \
  --confirm-release 20260716-001 \
  --confirm-empty-bucket \
  --execute
```

Deploy the new production Worker under a temporary hostname and repeat origin validation before
changing the public route. Route changes are manual and intentionally outside repository scripts.

## 7. Cut over and purge

Immediately before cutover, record the legacy Worker version and route, and pause content edits.
Change only the `printlykiddo.com` Worker association. Do not delete the legacy Worker or any old
binding. After the new route is active, purge the exact HTML URLs from the release manifest:

```bash
PRINTLY_REMOTE_WRITE_ACK=ALLOW_PRINTLY_PRODUCTION_WRITE \
CLOUDFLARE_ZONE_ID=... \
CLOUDFLARE_API_TOKEN=... \
  npm run pages:purge-cache -- \
  --environment production \
  --release 20260716-001 \
  --confirm-release 20260716-001 \
  --execute
```

The token must be provided by the shell or secret manager and must never be committed.

## 8. Roll back without deleting anything

Generate a plan for a known-good release:

```bash
npm run pages:rollback-plan -- \
  --environment production \
  --release 20260716-001
```

For an immediate routing problem, reassign `printlykiddo.com` to the recorded legacy Worker and
purge the affected public HTML URLs. Keep the new Worker and both page buckets for diagnosis.
Keep the legacy Worker, D1 database, ISR cache, and old deployment versions for at least the agreed
observation period. The shared `kid-print` image bucket remains a permanent production dependency
and is never part of page cleanup.
