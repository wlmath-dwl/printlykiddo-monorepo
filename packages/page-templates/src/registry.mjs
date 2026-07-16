const normalize = (value) => value.replaceAll("\\", "/");

export const PAGE_FAMILIES = Object.freeze({
  homepage: { dependency: "template:homepage" },
  category: { dependency: "template:category" },
  resource: { dependency: "template:resource" },
  "static-info": { dependency: "template:static-info" },
  collections: { dependency: "template:collections" },
  "word-search-root": { dependency: "template:word-search-root" },
  "word-search-theme": { dependency: "template:word-search-theme" },
  "maze-root": { dependency: "template:maze-root" },
  "sudoku-root": { dependency: "template:sudoku-root" },
  puzzle: { dependency: "template:puzzle" },
});

export function classifySiteSource(relativePath) {
  const file = normalize(relativePath);
  if (file.includes("components/site-header") || file.endsWith("lib/site-nav.ts")) {
    return { kind: "dependency", key: "fragment:site-header" };
  }
  if (file.endsWith("components/site-footer.tsx")) {
    return { kind: "dependency", key: "fragment:site-footer" };
  }
  if (file.endsWith("app/globals.css") || file.endsWith("tailwind.config.js") || file.endsWith("postcss.config.js")) {
    return {
      kind: "artifact",
      key: "asset:site-styles",
      dependencies: Object.values(PAGE_FAMILIES).map((family) => family.dependency),
    };
  }
  if (file.includes("components/word-search-maker") || file.endsWith("lib/word-search.ts")) {
    return {
      kind: "artifact",
      key: "asset:word-search-client",
      dependencies: ["template:word-search-root", "template:word-search-theme"],
    };
  }
  if (file.includes("components/sudoku-maker")) {
    return { kind: "artifact", key: "asset:sudoku-client", dependencies: ["template:sudoku-root"] };
  }
  if (file.includes("components/maze-maker")) {
    return { kind: "artifact", key: "asset:maze-client", dependencies: ["template:maze-root"] };
  }
  if (file.includes("app/tools/word-search-generator/[theme]")) {
    return { kind: "dependency", key: "template:word-search-theme" };
  }
  if (file.includes("app/tools/word-search-generator")) {
    return { kind: "dependency", key: "template:word-search-root" };
  }
  if (file.includes("app/tools/sudoku-generator")) return { kind: "dependency", key: "template:sudoku-root" };
  if (file.includes("app/tools/maze-generator")) return { kind: "dependency", key: "template:maze-root" };
  if (file.includes("app/[...slug]") || file.includes("components/worksheet-resource-page")) {
    return { kind: "dependency", key: "template:resource" };
  }
  if (file.includes("components/category-card") || file.endsWith("lib/category-route.ts")) {
    return { kind: "dependency", key: "template:category" };
  }
  if (file.endsWith("app/page.tsx") || file.includes("components/home-")) {
    return { kind: "dependency", key: "template:homepage" };
  }
  if (file.endsWith("lib/seo-schema.ts") || file.endsWith("lib/site-seo.ts") || file.endsWith("app/layout.tsx")) {
    return { kind: "global", key: "code:global" };
  }
  if (/\.(tsx?|jsx?|css)$/.test(file) && (file.startsWith("app/") || file.startsWith("components/") || file.startsWith("lib/"))) {
    return { kind: "global", key: "code:unclassified" };
  }
  return null;
}
