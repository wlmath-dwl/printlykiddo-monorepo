export type ResourceItem = {
  id: number;
  title: string;
  category: string;
  ageRange: string;
};

export type Collection = {
  slug: string;
  title: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  category: string;
  ctaLabel: string;
  items: ResourceItem[];
};

export const categories = [
  {
    slug: "coloring",
    title: "Coloring",
    description: "Free printable coloring pages for calm, creative play.",
  },
  {
    slug: "worksheets",
    title: "Worksheets",
    description: "Skill-building practice sheets for math, reading, and writing.",
  },
  {
    slug: "games",
    title: "Games",
    description: "Screen-free printable games for family and classroom time.",
  },
  {
    slug: "planners",
    title: "Planners",
    description: "Simple planning sheets for home learning and daily routines.",
  },
];

export const childCategoriesByParentSlug: Record<
  string,
  { slug: string; title: string; description: string }[]
> = {
  coloring: [
    {
      slug: "animals",
      title: "Animals",
      description: "Printable animal coloring sheets for quiet, creative playtime.",
    },
    {
      slug: "dinosaurs",
      title: "Dinosaurs",
      description: "Simple dinosaur pages for preschool and early elementary kids.",
    },
    {
      slug: "vehicles",
      title: "Vehicles",
      description: "Cars, trucks, and transport-themed coloring activities.",
    },
  ],
  worksheets: [
    {
      slug: "math",
      title: "Math",
      description: "Early math practice sheets for counting, numbers, and operations.",
    },
    {
      slug: "reading",
      title: "Reading",
      description: "Phonics, tracing, and reading readiness printables for young learners.",
    },
    {
      slug: "writing",
      title: "Writing",
      description: "Handwriting, tracing, and sentence-building worksheet packs.",
    },
  ],
  games: [
    {
      slug: "matching",
      title: "Matching",
      description: "Simple matching games for classroom centers and home activities.",
    },
    {
      slug: "bingo",
      title: "Bingo",
      description: "Printable bingo variations for themed learning and family fun.",
    },
    {
      slug: "board-games",
      title: "Board Games",
      description: "Screen-free printable board games kids can play together.",
    },
  ],
  planners: [
    {
      slug: "daily-routines",
      title: "Daily Routines",
      description: "Visual routine charts to support home learning and family schedules.",
    },
    {
      slug: "lesson-plans",
      title: "Lesson Plans",
      description: "Teacher-friendly planning pages for weekly and thematic lessons.",
    },
    {
      slug: "reward-charts",
      title: "Reward Charts",
      description: "Positive habit and behavior tracking printables for kids.",
    },
  ],
};

export const collections: Collection[] = [
  {
    slug: "addition-worksheets",
    title: "12 Fun Addition Worksheets for Kindergarten",
    description:
      "A complete printable pack for helping early learners practice counting, number bonds, and basic addition.",
    seoTitle: "Addition Worksheets for Kindergarten | printlykiddo.com",
    seoDescription:
      "Download a warm, minimalist set of printable addition worksheets for kindergarten and early elementary learners.",
    category: "Worksheets",
    ctaLabel: "Download Full Pack",
    items: [
      { id: 1, title: "Apple Counting", category: "Math", ageRange: "Ages 4-6" },
      { id: 2, title: "Count and Add", category: "Math", ageRange: "Ages 4-6" },
      { id: 3, title: "Number Line Practice", category: "Math", ageRange: "Ages 5-7" },
      { id: 4, title: "Picture Addition", category: "Math", ageRange: "Ages 4-6" },
      { id: 5, title: "Simple Sums", category: "Math", ageRange: "Ages 5-7" },
      { id: 6, title: "Missing Number", category: "Math", ageRange: "Ages 5-7" },
    ],
  },
  {
    slug: "animal-coloring-pack",
    title: "Animal Coloring Pack for Ages 3-8",
    description:
      "A printable collection of friendly animal pages designed for quiet time, centers, and take-home learning.",
    seoTitle: "Animal Coloring Pages | printlykiddo.com",
    seoDescription:
      "Browse a printable pack of easy animal coloring pages for preschool and elementary kids.",
    category: "Coloring",
    ctaLabel: "View Printable Pack",
    items: [
      { id: 7, title: "Forest Friends", category: "Coloring", ageRange: "Ages 3-6" },
      { id: 8, title: "Ocean Animals", category: "Coloring", ageRange: "Ages 3-7" },
      { id: 9, title: "Farm Favorites", category: "Coloring", ageRange: "Ages 3-6" },
      { id: 10, title: "Safari Set", category: "Coloring", ageRange: "Ages 4-8" },
    ],
  },
];

export function getCollectionBySlug(slug: string) {
  return collections.find((collection) => collection.slug === slug) ?? null;
}
