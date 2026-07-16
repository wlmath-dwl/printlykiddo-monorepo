import snapshot from "@/data/puzzle-pages.json";
import { buildLocalDevImageUrl, isPrintlyKiddoLocalDev } from "@/lib/printly-local-dev";

export type StaticPuzzleAsset = {
  id: number;
  page_slug: string;
  difficulty: string;
  asset_kind: "puzzle" | "answer";
  image_url: string;
  local_file_path: string;
  sort_order: number;
};

export type StaticPuzzlePage = {
  slug: string;
  family: "sudoku" | "mazes";
  variant: string;
  title: string;
  description: string;
  seo_title: string;
  seo_description: string;
  status: "draft" | "published";
  assets: StaticPuzzleAsset[];
};

type StaticPuzzleCategorySetting = {
  slug: string;
  parent_slug: string | null;
  title: string;
  family: string;
  cover_image_url: string;
  cover_local_file_path: string;
  is_custom_cover: number;
  is_active: number;
  sort_order: number;
  updated_at: string;
};

type StaticPuzzleCategory = {
  id: number;
  slug: string;
  imagePath: string;
  title: string;
  description: string;
  manualDescription: string;
  coverImageUrl: string | null;
  coverImageUrl512: string | null;
  seoImageUrl: string | null;
  imageManifest: null;
};

const PUZZLE_ROOT = {
  id: 3578,
  slug: "puzzles",
  title: "Puzzles",
  description: "Browse free printable puzzle worksheets for kids, including Sudoku, mazes, logic puzzles, and ready-to-print PDF activities with answer keys.",
  coverKey: "imgs/puzzles/e5d23639-f323-477d-922e-48c5da0f44ef-1024.webp",
} as const;

export const PUZZLE_PAGE_DEFINITIONS = [
  { id: 3582, family: "sudoku", slug: "4x4-sudoku", title: "4x4 Sudoku", description: "Free printable 4x4 Sudoku puzzles for kids, with easy beginner grids and answer keys for kindergarten, first grade, and early logic practice.", coverKey: "imgs/puzzles/sudoku/4x4-sudoku/0655e416-c6a3-4c6c-a7af-705ab9a456fb-1024.webp" },
  { id: 3584, family: "sudoku", slug: "6x6-sudoku", title: "6x6 Sudoku", description: "Free printable 6x6 Sudoku puzzles for kids, with easy and medium grids plus answer keys for elementary logic practice and classroom activities.", coverKey: "imgs/puzzles/sudoku/6x6-sudoku/9d290ab0-a83f-457f-88ae-eb3d18814fd8-1024.webp" },
  { id: 3587, family: "sudoku", slug: "9x9-sudoku", title: "9x9 Sudoku", description: "Free printable 9x9 Sudoku puzzles with easy, medium, and hard difficulty levels, plus answer keys for students, adults, classrooms, and daily puzzle practice.", coverKey: "imgs/puzzles/sudoku/9x9-sudoku/215c88f0-9390-418e-8311-8a3ff5bffca0-1024.webp" },
  { id: 3588, family: "mazes", slug: "printable-mazes", title: "Printable Mazes", description: "Free printable mazes for kids, organized by easy, medium, and hard difficulty with square and rectangular maze worksheets and answer keys.", coverKey: "imgs/puzzles/mazes/printable-mazes/013fed15-0d1d-4680-964c-0a7436f4b231-1024.webp" },
  { id: 3590, family: "mazes", slug: "circle-mazes", title: "Circle Mazes", description: "Free printable circle mazes for kids, with easy round maze paths, light branching, and answer keys for preschool, kindergarten, and early elementary practice.", coverKey: "imgs/puzzles/mazes/circle-mazes/8809d55f-f9f4-49cf-864b-9c7face7a662-1024.webp" },
] as const;

export const PUZZLE_FAMILIES = [
  { id: 3579, slug: "sudoku", title: "Sudoku", description: "Browse free printable Sudoku puzzles for kids and classrooms, including 4x4, 6x6, and 9x9 Sudoku worksheets with answer keys.", coverKey: "imgs/puzzles/sudoku/918223c1-906d-4202-b453-d2d34c1eaad5-1024.webp" },
  { id: 3580, slug: "mazes", title: "Mazes", description: "Browse free printable maze worksheets for kids, including easy, medium, hard, rectangular, and circle mazes with answer keys.", coverKey: "imgs/puzzles/mazes/57ecee1a-81e0-49ae-a352-14c578c4d716-1024.webp" },
] as const;

const snapshotData = snapshot as {
  pages?: StaticPuzzlePage[];
  categories?: StaticPuzzleCategorySetting[];
};
const pages = snapshotData.pages ?? [];
const categorySettings = snapshotData.categories ?? [];

export function isStaticPuzzleCategoryActive(slug: string) {
  return categorySettings.find((item) => item.slug === slug)?.is_active !== 0;
}

export function getActivePuzzleFamilies() {
  if (!isStaticPuzzleCategoryActive(PUZZLE_ROOT.slug)) return [];
  return PUZZLE_FAMILIES.filter((family) => isStaticPuzzleCategoryActive(family.slug));
}

export function getActivePuzzlePageDefinitions() {
  const activeFamilies = new Set(getActivePuzzleFamilies().map((family) => family.slug));
  return PUZZLE_PAGE_DEFINITIONS.filter(
    (page) => activeFamilies.has(page.family) && isStaticPuzzleCategoryActive(page.slug),
  );
}

export function getStaticPuzzlePages() {
  return getActivePuzzlePageDefinitions().map((definition) => {
    const generated = pages.find((page) => page.slug === definition.slug);
    return generated ?? {
      ...definition,
      variant: definition.slug,
      seo_title: `${definition.title} Printables | PrintlyKiddo`,
      seo_description: definition.description,
      status: "draft" as const,
      assets: [],
    };
  });
}

export function getStaticPuzzlePage(slug: string) {
  return getStaticPuzzlePages().find((page) => page.slug === slug) ?? null;
}

function toStaticCategory(input: {
  id: number;
  slug: string;
  title: string;
  description: string;
  coverKey: string;
}, imagePath: string): StaticPuzzleCategory {
  const setting = categorySettings.find((item) => item.slug === input.slug);
  const coverKey = setting?.cover_image_url || input.coverKey;
  const coverImageUrl = buildPuzzleImageUrl(coverKey, setting?.cover_local_file_path || coverKey);
  return {
    id: input.id,
    slug: input.slug,
    imagePath,
    title: setting?.title || input.title,
    description: input.description,
    manualDescription: input.description,
    coverImageUrl,
    coverImageUrl512: coverImageUrl,
    seoImageUrl: coverImageUrl,
    imageManifest: null,
  };
}

export function getStaticPuzzleRootCategory() {
  return toStaticCategory(PUZZLE_ROOT, "puzzles");
}

export function getStaticPuzzleCategoryPage(slugParts: string[]) {
  if (slugParts[0] !== "puzzles" || slugParts.length < 1 || slugParts.length > 3) return null;
  if (!isStaticPuzzleCategoryActive(PUZZLE_ROOT.slug)) return null;
  const root = getStaticPuzzleRootCategory();
  const families = getActivePuzzleFamilies().map((family) => toStaticCategory(family, `puzzles/${family.slug}`));
  if (slugParts.length === 1) {
    return { current: root, parent: null, secondLevel: null, data: families, listingMode: "children" as const };
  }
  const familyDefinition = PUZZLE_FAMILIES.find((item) => item.slug === slugParts[1]);
  if (!familyDefinition || !isStaticPuzzleCategoryActive(familyDefinition.slug)) return null;
  const family = toStaticCategory(familyDefinition, `puzzles/${familyDefinition.slug}`);
  const definitions = getActivePuzzlePageDefinitions().filter((item) => item.family === familyDefinition.slug);
  const children = definitions.map((item) => toStaticCategory(item, `puzzles/${familyDefinition.slug}/${item.slug}`));
  if (slugParts.length === 2) {
    return { current: family, parent: root, secondLevel: null, data: children, listingMode: "children" as const };
  }
  const definition = definitions.find((item) => item.slug === slugParts[2]);
  const page = definition ? getStaticPuzzlePage(definition.slug) : null;
  if (!definition || !page) return null;
  const current = toStaticCategory({ ...definition, description: page.description }, `puzzles/${familyDefinition.slug}/${definition.slug}`);
  return { current, parent: root, secondLevel: family, data: [], listingMode: "children" as const };
}

export function getStaticPuzzleActivityGroups(pageSlug: string) {
  const page = getStaticPuzzlePage(pageSlug);
  const definition = PUZZLE_PAGE_DEFINITIONS.find((item) => item.slug === pageSlug);
  if (!page || !definition) return [];
  const answers = page.assets.filter((asset) => asset.asset_kind === "answer");
  const puzzles = page.assets.filter((asset) => asset.asset_kind === "puzzle");
  return [{
    active: {
      id: -100,
      name: "Puzzle Worksheets",
      slug: "puzzle-worksheet",
      description: page.description,
      sortOrder: 0,
      coloredLabel: false,
    },
    imgs: puzzles.map((asset, index) => {
      const answer = answers.find((item) => item.difficulty === asset.difficulty && item.sort_order === asset.sort_order);
      const imageUrl = buildPuzzleImageUrl(asset.image_url, asset.local_file_path) ?? "";
      return {
        id: asset.id || -(index + 1),
        categoryId: definition.id,
        activeId: -100,
        imageUrl,
        cardImageUrl: imageUrl,
        answerImageUrl: buildPuzzleImageUrl(answer?.image_url, answer?.local_file_path),
        title: `${page.title} ${asset.difficulty} ${asset.sort_order + 1}`,
        slug: `${page.slug}-${asset.difficulty}-${asset.sort_order + 1}`,
        description: page.description,
        difficulty: asset.difficulty === "hard" ? 3 : asset.difficulty === "medium" ? 2 : 1,
        sortOrder: index,
        isActive: true,
      };
    }),
  }];
}

export function buildPuzzleImageUrl(imageKey?: string | null, localFilePath?: string | null) {
  if (!imageKey?.trim()) return null;
  if (isPrintlyKiddoLocalDev()) {
    return buildLocalDevImageUrl({
      path: imageKey,
      localFilePath,
    });
  }
  const base = (process.env.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL?.trim() || "https://img.printlykiddo.com").replace(/\/+$/, "");
  return `${base}/${imageKey.trim().replace(/^\/+/, "")}`;
}

export function getPuzzleCoverImageUrl(page?: StaticPuzzlePage | null) {
  const asset = page?.assets.find((item) => item.asset_kind === "puzzle");
  return buildPuzzleImageUrl(asset?.image_url, asset?.local_file_path);
}

export function getPuzzleRootCoverImageUrl() {
  return getStaticPuzzleRootCategory().coverImageUrl;
}
