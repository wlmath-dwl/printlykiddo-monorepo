type RuntimeEnv = CloudflareEnv;

type RedirectRecord = {
  source: string;
  destination: string;
  status_code: number;
};

const HTML_CACHE_CONTROL = "public, max-age=0, s-maxage=31536000";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

function normalizePathname(input: string) {
  let pathname = input.replace(/\/{2,}/g, "/");
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, "");
  const parts = pathname.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) return null;
  return pathname || "/";
}

function pageKey(pathname: string) {
  return pathname === "/" ? "pages/index.html" : `pages${pathname}/index.html`;
}

function objectKey(pathname: string) {
  const key = pathname.replace(/^\/+/, "");
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

function remoteSafeObjectKey(key: string) {
  return key.split("/").map((segment) => {
    const match = segment.match(/^\[(\.\.\.)?([^\]]+)\]$/);
    if (!match) return segment;
    return `__next-${match[1] ? "catchall" : "param"}-${match[2]}__`;
  }).join("/");
}

function isAssetPath(pathname: string) {
  return pathname.startsWith("/_next/")
    || pathname.startsWith("/assets/")
    || ["/apple-icon", "/opengraph-image", "/twitter-image"].includes(pathname)
    || pathname.includes(".");
}

function cacheControlForAsset(pathname: string) {
  if (pathname.startsWith("/_next/static/")) return IMMUTABLE_CACHE_CONTROL;
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return "public, max-age=300, s-maxage=3600";
  }
  return "public, max-age=300, s-maxage=86400";
}

function applyCommonHeaders(headers: Headers, env: RuntimeEnv) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "interest-cohort=(), camera=(), microphone=(), geolocation=()");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("X-Printly-Environment", env.ENVIRONMENT);
  if (env.ROBOTS_MODE === "noindex") headers.set("X-Robots-Tag", "noindex, nofollow");
}

async function readObject(request: Request, env: RuntimeEnv, key: string) {
  const object = await env.PAGES_BUCKET.get(key, {
    onlyIf: request.headers,
  });
  if (!object) return null;
  if (!("body" in object)) {
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    return new Response(null, { status: 304, headers });
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Content-Length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

function matchRedirect(pathname: string, redirect: RedirectRecord) {
  const wildcard = "/:path*";
  if (!redirect.source.endsWith(wildcard)) {
    return pathname === redirect.source ? redirect.destination : null;
  }
  const sourcePrefix = redirect.source.slice(0, -wildcard.length) || "/";
  if (pathname !== sourcePrefix && !pathname.startsWith(`${sourcePrefix}/`)) return null;
  const suffix = pathname === sourcePrefix ? "" : pathname.slice(sourcePrefix.length + 1);
  return redirect.destination.endsWith(wildcard)
    ? `${redirect.destination.slice(0, -wildcard.length)}${suffix ? `/${suffix}` : ""}`
    : redirect.destination;
}

async function resolveRedirect(request: Request, env: RuntimeEnv, pathname: string) {
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  headers.delete("If-Modified-Since");
  headers.delete("Range");
  const lookupRequest = new Request(request.url, { method: "GET", headers });
  const response = await readObject(lookupRequest, env, "data/redirects.json");
  if (!response?.ok) return null;
  const payload = await response.json<{ redirects?: RedirectRecord[] }>();
  for (const redirect of payload.redirects ?? []) {
    const destination = matchRedirect(pathname, redirect);
    if (destination) return { destination, status: redirect.status_code || 308 };
  }
  return null;
}

function responseFromCached(request: Request, cached: Response, env: RuntimeEnv) {
  const headers = new Headers(cached.headers);
  headers.set("X-Page-Cache", "HIT");
  applyCommonHeaders(headers, env);
  return new Response(request.method === "HEAD" ? null : cached.body, {
    status: cached.status,
    headers,
  });
}

export default {
  async fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const url = new URL(request.url);
    const pathname = normalizePathname(url.pathname);
    if (!pathname) return new Response("Bad Request", { status: 400 });

    if (url.pathname !== pathname) {
      url.pathname = pathname;
      return Response.redirect(url.toString(), 308);
    }

    if (pathname === "/.well-known/printly-release") {
      const release = await readObject(request, env, "data/release-manifest.json");
      if (!release) return new Response("Release manifest not found", { status: 404 });
      const headers = new Headers(release.headers);
      headers.set("Cache-Control", "no-store");
      applyCommonHeaders(headers, env);
      return new Response(request.method === "HEAD" ? null : release.body, { status: release.status, headers });
    }

    if (isAssetPath(pathname)) {
      const key = objectKey(pathname);
      const asset = await readObject(request, env, key)
        ?? (remoteSafeObjectKey(key) === key ? null : await readObject(request, env, remoteSafeObjectKey(key)));
      if (!asset) return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
      const headers = new Headers(asset.headers);
      if (!headers.has("Cache-Control")) headers.set("Cache-Control", cacheControlForAsset(pathname));
      applyCommonHeaders(headers, env);
      return new Response(request.method === "HEAD" ? null : asset.body, { status: asset.status, headers });
    }

    // Cache API key is the exact public URL. This allows Cloudflare's single-URL
    // purge to invalidate the same key without knowing a private query suffix.
    const cacheKeyUrl = new URL(url.origin + pathname);
    const cacheKey = new Request(cacheKeyUrl, { method: "GET" });
    const cached = await caches.default.match(cacheKey);
    if (cached) return responseFromCached(request, cached, env);

    const source = await readObject(request, env, pageKey(pathname));
    if (!source) {
      const redirect = await resolveRedirect(request, env, pathname);
      if (redirect) {
        const destination = new URL(redirect.destination, url.origin);
        return Response.redirect(destination.toString(), redirect.status);
      }
      return new Response("Not Found", {
        status: 404,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (source.status === 304) return source;

    const headers = new Headers(source.headers);
    headers.delete("Location");
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", pathname === "/download-history" ? "no-store" : HTML_CACHE_CONTROL);
    headers.set("Cloudflare-CDN-Cache-Control", pathname === "/download-history" ? "no-store" : HTML_CACHE_CONTROL);
    headers.set("X-Page-Cache", "MISS");
    applyCommonHeaders(headers, env);
    const response = new Response(source.body, { status: 200, headers });
    if (pathname !== "/download-history") ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    return request.method === "HEAD" ? new Response(null, response) : response;
  },
} satisfies ExportedHandler<RuntimeEnv>;
