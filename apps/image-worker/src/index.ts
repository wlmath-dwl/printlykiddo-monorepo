const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const PUBLIC_IMAGE_PREFIX = "imgs/";

const OWNED_HOSTS = new Set([
  "printlykiddo.com",
  "www.printlykiddo.com",
  "localhost",
  "127.0.0.1",
  "::1",
]);

const ALLOWED_REFERER_HOSTS = new Set([
  "www.googleusercontent.com",
  "www.bing.com",
  "duckduckgo.com",
  "www.facebook.com",
  "l.facebook.com",
  "m.facebook.com",
  "twitter.com",
  "t.co",
  "x.com",
  "www.reddit.com",
  "old.reddit.com",
  "www.linkedin.com",
]);

const ALLOWED_REFERER_SUFFIXES = [
  ".google.com",
  ".google.co.uk",
  ".pinterest.com",
  ".yandex.com",
];

const ALLOWED_BOT_USER_AGENTS = [
  "Googlebot",
  "Storebot-Google",
  "AdsBot-Google",
  "Bingbot",
  "BingPreview",
  "DuckDuckBot",
  "YandexBot",
  "YandexImages",
  "Baiduspider",
  "Pinterestbot",
  "Pinterest",
  "Twitterbot",
  "facebookexternalhit",
  "Facebot",
  "Slackbot-LinkExpanding",
  "WhatsApp",
  "Discordbot",
  "TelegramBot",
  "LinkedInBot",
  "redditbot",
  "Applebot",
];

function jsonError(status: number, message: string, headers?: HeadersInit) {
  return new Response(JSON.stringify({ code: status, message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status >= 500 ? "no-store" : "public, max-age=60",
      ...headers,
    },
  });
}

function parseHostname(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedRefererHost(hostname: string) {
  if (OWNED_HOSTS.has(hostname) || ALLOWED_REFERER_HOSTS.has(hostname)) return true;
  return ALLOWED_REFERER_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function isRequestAllowed(request: Request) {
  const originHost = parseHostname(request.headers.get("Origin"));
  const refererHost = parseHostname(request.headers.get("Referer"));
  const userAgent = request.headers.get("User-Agent") || "";

  if (!originHost && !refererHost) return true;
  if (ALLOWED_BOT_USER_AGENTS.some((bot) => userAgent.includes(bot))) return true;
  if (originHost && OWNED_HOSTS.has(originHost)) return true;
  return Boolean(refererHost && isAllowedRefererHost(refererHost));
}

function resolveR2Key(pathname: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    return null;
  }

  if (!decoded.startsWith(PUBLIC_IMAGE_PREFIX) || decoded.includes("\0")) return null;
  const parts = decoded.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return decoded;
}

function cacheKeyFor(url: URL) {
  const keyUrl = new URL(url.origin + url.pathname);
  keyUrl.searchParams.set("__printly_image_cache", "v1");
  return new Request(keyUrl, { method: "GET" });
}

function responseForRequest(request: Request, response: Response) {
  const headers = new Headers(response.headers);
  const requestEtag = request.headers.get("If-None-Match");
  const responseEtag = headers.get("ETag");
  if (requestEtag && responseEtag && requestEtag === responseEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    headers,
  });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonError(405, "Method not allowed", { Allow: "GET, HEAD, OPTIONS" });
    }

    if (!isRequestAllowed(request)) {
      return jsonError(403, "Hotlinking is not allowed from this referer");
    }

    const url = new URL(request.url);
    const r2Key = resolveR2Key(url.pathname);
    if (!r2Key) {
      return jsonError(404, "Image path must use /imgs/<filename>");
    }

    try {
      const cache = caches.default;
      const cacheKey = cacheKeyFor(url);
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("X-Image-Cache", "HIT");
        return responseForRequest(request, new Response(cached.body, { status: cached.status, headers }));
      }

      const object = await env.IMG_R2.get(r2Key);
      if (!object) return jsonError(404, "Image not found");

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      headers.set("Content-Length", String(object.size));
      headers.set(
        "Cache-Control",
        `public, max-age=${ONE_YEAR_SECONDS}, s-maxage=${ONE_YEAR_SECONDS}, immutable`,
      );
      headers.set("Cloudflare-CDN-Cache-Control", `public, max-age=${ONE_YEAR_SECONDS}`);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      headers.set("Cross-Origin-Resource-Policy", "cross-origin");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Image-Cache", "MISS");

      const response = new Response(object.body, { status: 200, headers });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return responseForRequest(request, response);
    } catch (error) {
      console.error(JSON.stringify({
        event: "image_proxy_error",
        path: url.pathname,
        message: error instanceof Error ? error.message : "unknown error",
      }));
      return jsonError(500, "Internal server error");
    }
  },
} satisfies ExportedHandler<CloudflareEnv>;
