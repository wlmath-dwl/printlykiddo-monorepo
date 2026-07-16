import path from "node:path";

export function normalizePublicPath(input) {
  let pathname = String(input || "/").trim();
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  pathname = pathname.replace(/\/{2,}/g, "/");
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, "");
  const segments = pathname.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Unsafe public path: ${input}`);
  }
  return pathname || "/";
}

export function publicPathToPageKey(input) {
  const pathname = normalizePublicPath(input);
  return pathname === "/" ? "pages/index.html" : `pages${pathname}/index.html`;
}

export function pageKeyToLocalPath(root, key) {
  const normalized = key.replace(/^\/+/, "");
  const target = path.resolve(root, normalized);
  const safeRoot = `${path.resolve(root)}${path.sep}`;
  if (target !== path.resolve(root) && !target.startsWith(safeRoot)) {
    throw new Error(`Page key escapes local root: ${key}`);
  }
  return target;
}
