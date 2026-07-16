export type RouteCategoryKind =
  | "top-level"
  | "second-level"
  | "third-level"
  | "second-level-browse"
  | "third-level-browse";

export type ActiveRouteItem = {
  slug: string;
  name: string;
};

export type ParsedBrowseSegment = {
  activeSlug: string;
};

export type ResolvedCategoryRoute = {
  kind: RouteCategoryKind;
  categorySegments: string[];
  browseSegment: string | null;
  categoryDepth: 1 | 2 | 3;
};

function sortBySlugLength<T extends { slug: string }>(items: T[]) {
  return [...items].sort((left, right) => right.slug.length - left.slug.length);
}

function findByPrefix<T extends { slug: string }>(items: T[], value: string) {
  return sortBySlugLength(items).find(
    (item) => value === item.slug || value.startsWith(`${item.slug}-`),
  );
}

export function resolveActiveFromBrowseSegment<T extends ActiveRouteItem>(
  segment: string,
  actives: T[],
) {
  return findByPrefix(actives, segment) ?? null;
}

export function resolveCategoryRoute(
  slugParts: string[],
  hasThirdLevelCategory: boolean,
): ResolvedCategoryRoute | null {
  if (slugParts.length === 1) {
    return {
      kind: "top-level",
      categorySegments: slugParts,
      browseSegment: null,
      categoryDepth: 1,
    };
  }

  if (slugParts.length === 2) {
    return {
      kind: "second-level",
      categorySegments: slugParts,
      browseSegment: null,
      categoryDepth: 2,
    };
  }

  if (slugParts.length === 3) {
    if (hasThirdLevelCategory) {
      return {
        kind: "third-level",
        categorySegments: slugParts,
        browseSegment: null,
        categoryDepth: 3,
      };
    }

    return {
      kind: "second-level-browse",
      categorySegments: slugParts.slice(0, 2),
      browseSegment: slugParts[2],
      categoryDepth: 2,
    };
  }

  if (slugParts.length === 4) {
    return {
      kind: "third-level-browse",
      categorySegments: slugParts.slice(0, 3),
      browseSegment: slugParts[3],
      categoryDepth: 3,
    };
  }

  return null;
}

export function buildBrowseSegment(
  activeSlug: string,
) {
  return activeSlug;
}

export function buildCategoryHref(
  categorySegments: string[],
  activeSlug?: string | null,
) {
  const basePath = `/${categorySegments.join("/")}`;
  if (!activeSlug) {
    return basePath;
  }

  return `${basePath}/${buildBrowseSegment(activeSlug)}`;
}

export function parseBrowseSegment(
  segment: string,
  actives: ActiveRouteItem[],
): ParsedBrowseSegment | null {
  const active = resolveActiveFromBrowseSegment(segment, actives);
  if (!active) {
    return null;
  }

  if (segment !== active.slug) {
    return null;
  }

  return {
    activeSlug: active.slug,
  };
}
