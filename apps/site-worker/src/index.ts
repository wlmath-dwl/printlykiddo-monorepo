interface Env {
  LOCAL_PAGES: Fetcher;
  PAGES_BUCKET?: R2Bucket;
}

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

async function readLocalAsset(request: Request, env: Env, key: string) {
  const url = new URL(request.url);
  url.pathname = `/${key}`;
  url.search = "";
  return env.LOCAL_PAGES.fetch(new Request(url, {
    method: "GET",
    headers: request.headers,
  }));
}

async function readPage(request: Request, env: Env, key: string) {
  if (env.PAGES_BUCKET) {
    const object = await env.PAGES_BUCKET.get(key);
    if (!object) return null;
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    return new Response(object.body, { headers });
  }
  const response = await readLocalAsset(request, env, key);
  return response.status === 404 ? null : response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
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

    if (pathname.startsWith("/_next/") || pathname.startsWith("/assets/") || pathname.includes(".")) {
      return env.LOCAL_PAGES.fetch(request);
    }

    const cache = caches.default;
    const cacheKeyUrl = new URL(url.origin + pathname);
    cacheKeyUrl.searchParams.set("__printly_page_cache", "v1");
    const cacheKey = new Request(cacheKeyUrl, { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) {
      const response = new Response(request.method === "HEAD" ? null : cached.body, cached);
      response.headers.set("X-Page-Cache", "HIT");
      return response;
    }

    const source = await readPage(request, env, pageKey(pathname));
    if (!source) {
      return new Response("Not Found", {
        status: 404,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const headers = new Headers(source.headers);
    headers.delete("Location");
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=0, s-maxage=31536000");
    headers.set("Cloudflare-CDN-Cache-Control", "public, max-age=31536000");
    headers.set("X-Page-Cache", "MISS");
    const response = new Response(source.body, { status: 200, headers });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return request.method === "HEAD" ? new Response(null, response) : response;
  },
} satisfies ExportedHandler<Env>;
