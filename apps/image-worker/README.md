# PrintlyKiddo image Worker

Independent image delivery Worker for `img.printlykiddo.com`. It reads only keys under `imgs/`
from the `kid-print` R2 binding and keeps image delivery separate from the HTML page router.

## Local-only migration mode

```bash
npm install
npm run cf-typegen
npm run typecheck
npm run dev
```

`wrangler dev --local` uses a local R2 simulation. This configuration has no production route or
custom domain, and the `deploy` script is deliberately disabled. Do not add `remote: true` while
validating the migration.

The original standalone repository remains untouched. This app was migrated from its current
working tree, which contains newer image caching and crawler compatibility changes than the old
copy previously stored under `apps/admin/cf-image-worker`.
