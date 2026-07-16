# Production cutover: migration-local-004

- Cut over: 2026-07-16
- Production Worker: `printlykiddo-static-production`
- Production Worker version: `f655bb14-3ac5-4f6f-b149-acdb2171777a`
- Production bucket: `printlykiddo-pages-production`
- Cache version: `migration-local-004`
- Legacy Worker retained: `printlykiddo`
- Legacy rollback version: `c1a760f4-449c-4a7b-8db2-4084b3a10c45`
- Main route ID: `462bee4a791740f98d4d5454f9dd6f18`
- WWW route ID: `dcda2751f8fe469890a5191bf33bcc76`

The legacy Worker, D1 database, ISR cache, shared image bucket, and prior Worker versions were not
deleted. Both production routes were reassigned in place, without deleting either route.

The Wrangler OAuth token did not have Cache Purge permission. No cache objects were purged. The new
Worker instead namespaces Cache API HTML entries with the release ID, preventing reuse of legacy
Worker entries. The final production-origin validation checked 453 pages, 28 static assets, 6,555
image references, and 500 live image requests with zero errors or warnings.

Cloudflare Web Analytics appends its beacon to production HTML after the Worker response. Origin
validation removes only that known platform-owned script for the immutable R2 body hash comparison;
SEO, resource, and image checks continue to inspect the actual served HTML.
