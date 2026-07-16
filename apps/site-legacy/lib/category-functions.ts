import {
  buildLocalDevImageUrl,
  isPrintlyKiddoLocalDev,
} from "@/lib/printly-local-dev";

export const CATEGORY_FUNCTIONS = [
  {
    slug: "coloring-pages",
    name: "Coloring",
    leadPhrase: "coloring pages",
  },
  {
    slug: "tracing-worksheets",
    name: "Tracing",
    leadPhrase: "tracing worksheets",
  },
  {
    slug: "cut",
    name: "Scissor Skills",
    leadPhrase: "scissor skills worksheets",
  },
  {
    slug: "number-sequencing",
    name: "Number Sequence Puzzles",
    leadPhrase: "number sequence puzzles",
  },
  {
    slug: "grid-puzzles",
    name: "Grid Puzzles",
    leadPhrase: "grid puzzles",
  },
] as const;

export type CategoryFunctionSlug = (typeof CATEGORY_FUNCTIONS)[number]["slug"];
export type CategoryFunctionVariantSlug =
  | CategoryFunctionSlug
  | `${CategoryFunctionSlug}_color`;
export type CategoryColorVariant = "standard" | "color";

export type CategoryFunction = {
  slug: CategoryFunctionSlug;
  name: string;
  leadPhrase: string;
};

export type CategoryFunctionVariant = {
  slug: CategoryFunctionVariantSlug;
  name: string;
  colorVariant: CategoryColorVariant;
  function: CategoryFunction;
};

export type CategoryFunctionImageSet = {
  cover: string;
  card: string[];
  pdf: string[];
};

export type CategoryImageManifest = Partial<
  Record<CategoryFunctionVariantSlug, CategoryFunctionImageSet>
> & {
  origin?: string[];
  origin_color?: string[];
};

const LEGACY_FUNCTION_SLUG_ALIASES: Record<CategoryFunctionSlug, string[]> = {
  "coloring-pages": ["coloring"],
  "tracing-worksheets": ["tracing"],
  cut: ["scissor-skills"],
  "number-sequencing": ["puzzle"],
  "grid-puzzles": ["strip_puzzle"],
};

type CategoryWithImageManifest = {
  slug: string;
  imagePath: string;
  imageManifest: CategoryImageManifest | null;
};

export type CategoryImageSize = 256 | 512 | 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeImageSet(value: unknown): CategoryFunctionImageSet | null {
  if (!isRecord(value)) {
    return null;
  }

  const cover = typeof value.cover === "string" ? value.cover.trim() : "";
  if (!cover) {
    return null;
  }

  return {
    cover,
    card: normalizeStringArray(value.card),
    pdf: normalizeStringArray(value.pdf),
  };
}

function getImageCdnBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL?.trim() ||
    "https://img.printlykiddo.com"
  ).replace(/\/+$/, "");
}

function getManifestImageSet(
  parsed: Record<string, unknown>,
  keys: string[],
): CategoryFunctionImageSet | null {
  for (const key of keys) {
    const normalized = normalizeImageSet(parsed[key]);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function getManifestKeys(
  slug: CategoryFunctionSlug,
  colorVariant: CategoryColorVariant,
) {
  const currentKey = colorVariant === "color" ? `${slug}_color` : slug;
  const legacyKeys = (LEGACY_FUNCTION_SLUG_ALIASES[slug] ?? []).map((legacySlug) =>
    colorVariant === "color" ? `${legacySlug}_color` : legacySlug,
  );

  return [currentKey, ...legacyKeys];
}

export function buildCategoryImageUrl(
  categoryPath: string,
  imageId?: string | null,
  size: CategoryImageSize = 256,
) {
  if (!categoryPath.trim() || !imageId?.trim()) {
    return null;
  }

  const normalizedPath = categoryPath.trim().replace(/^\/+|\/+$/g, "");
  const suffix = size === 256 ? "" : `-${size}`;
  const relativeKey = `imgs/${normalizedPath}/${imageId.trim()}${suffix}.webp`;
  if (isPrintlyKiddoLocalDev()) {
    return buildLocalDevImageUrl({ path: relativeKey });
  }
  return `${getImageCdnBaseUrl()}/${relativeKey}`;
}

export function parseCategoryImageManifest(
  raw?: string | null,
): CategoryImageManifest | null {
  if (!raw?.trim().startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const manifest: CategoryImageManifest = {};

    for (const item of CATEGORY_FUNCTIONS) {
      const standard = getManifestImageSet(
        parsed,
        getManifestKeys(item.slug, "standard"),
      );
      if (standard) {
        manifest[item.slug] = standard;
      }

      const colorKey = `${item.slug}_color` as CategoryFunctionVariantSlug;
      const colored = getManifestImageSet(
        parsed,
        getManifestKeys(item.slug, "color"),
      );
      if (colored) {
        manifest[colorKey] = colored;
      }
    }

    const origin = normalizeStringArray(parsed.origin);
    if (origin.length > 0) {
      manifest.origin = origin;
    }

    const originColor = normalizeStringArray(parsed.origin_color);
    if (originColor.length > 0) {
      manifest.origin_color = originColor;
    }

    return Object.keys(manifest).length > 0 ? manifest : null;
  } catch {
    return null;
  }
}

export function getCategoryFunctionBySlug(
  slug: CategoryFunctionSlug,
): CategoryFunction {
  const matched = CATEGORY_FUNCTIONS.find((item) => item.slug === slug);
  if (!matched) {
    throw new Error(`Unknown category function: ${slug}`);
  }

  return matched;
}

export function getBaseFunctionSlug(
  slug: CategoryFunctionVariantSlug,
): CategoryFunctionSlug {
  return slug.endsWith("_color")
    ? (slug.slice(0, -6) as CategoryFunctionSlug)
    : (slug as CategoryFunctionSlug);
}

export function getAvailableCategoryFunctions(
  manifests: Array<CategoryImageManifest | null | undefined>,
): CategoryFunction[] {
  return CATEGORY_FUNCTIONS.filter((item) =>
    manifests.some(
      (manifest) =>
        Boolean(manifest?.[item.slug]) ||
        Boolean(manifest?.[`${item.slug}_color`]),
    ),
  );
}

export function getAvailableFunctionVariants(
  functionSlug: CategoryFunctionSlug,
  manifests: Array<CategoryImageManifest | null | undefined>,
): CategoryFunctionVariant[] {
  const functionItem = getCategoryFunctionBySlug(functionSlug);
  const variants: CategoryFunctionVariant[] = [];
  const hasStandard = manifests.some((manifest) =>
    Boolean(manifest?.[functionSlug]),
  );
  const colorSlug = `${functionSlug}_color` as CategoryFunctionVariantSlug;
  const hasColor = manifests.some((manifest) => Boolean(manifest?.[colorSlug]));

  if (hasStandard) {
    variants.push({
      slug: functionSlug,
      name: "Black & White",
      colorVariant: "standard",
      function: functionItem,
    });
  }

  if (hasColor) {
    variants.push({
      slug: colorSlug,
      name: "Color",
      colorVariant: "color",
      function: functionItem,
    });
  }

  return variants;
}

export function getDefaultFunctionVariantSlug(
  functionSlug: CategoryFunctionSlug,
  manifests: Array<CategoryImageManifest | null | undefined>,
): CategoryFunctionVariantSlug | null {
  const variants = getAvailableFunctionVariants(functionSlug, manifests);
  return variants[0]?.slug ?? null;
}

export function getCategoryFunctionVariant(
  slug: string,
  manifests: Array<CategoryImageManifest | null | undefined>,
): CategoryFunctionVariant | null {
  const standardFunction = CATEGORY_FUNCTIONS.find(
    (item) => item.slug === slug,
  );
  if (standardFunction) {
    return {
      slug: standardFunction.slug,
      name: "Black & White",
      colorVariant: "standard",
      function: standardFunction,
    };
  }

  const allVariants = CATEGORY_FUNCTIONS.flatMap((item) =>
    getAvailableFunctionVariants(item.slug, manifests),
  );

  return allVariants.find((item) => item.slug === slug) ?? null;
}

export function getCategoryAssetUrls(
  category: CategoryWithImageManifest,
  variantSlug: CategoryFunctionVariantSlug,
) {
  const assets = category.imageManifest?.[variantSlug];
  if (!assets) {
    return null;
  }

  return {
    coverImageUrl: buildCategoryImageUrl(category.imagePath, assets.cover),
    cardImageUrl: buildCategoryImageUrl(
      category.imagePath,
      assets.card[0] ?? null,
    ),
    cardImageUrls: assets.card
      .map((imageId) => buildCategoryImageUrl(category.imagePath, imageId))
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl)),
    pdfImageUrls: assets.pdf
      .map((imageId) => buildCategoryImageUrl(category.imagePath, imageId))
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl)),
  };
}

export function getCategoryOriginImageUrl(category: CategoryWithImageManifest) {
  const imageId =
    category.imageManifest?.origin_color?.[0] ??
    category.imageManifest?.origin?.[0] ??
    null;

  return buildCategoryImageUrl(category.imagePath, imageId);
}
