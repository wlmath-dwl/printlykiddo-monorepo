import type { FirstCategory, HomepageConfig, SpecialPage } from "@/lib/d1";
import { SITE_AUDIENCE_LABEL, SITE_RESOURCE_DESCRIPTION } from "@/lib/site-seo";
import type { Collection } from "@/lib/site-data";

type SchemaNode = Record<string, unknown>;

type BreadcrumbItem = {
  name: string;
  path: string;
};

type CategorySchemaInput = {
  path: string;
  pageTitle: string;
  pageDescription: string;
  currentTitle: string;
  slugParts: string[];
  breadcrumbs: BreadcrumbItem[];
  parentTitle?: string | null;
  secondLevelTitle?: string | null;
  selectedActiveName?: string | null;
  imageUrl?: string | null;
};

const DEFAULT_SITE_ORIGIN = "https://printlykiddo.com";
const SITE_NAME = "PrintlyKiddo";
const SITE_ALTERNATE_NAME = "PaperLogic";
const AUDIENCE_TYPE = "Parents, Teachers, Educators, and Adult Caregivers";
const DEFAULT_SITE_DESCRIPTION = SITE_RESOURCE_DESCRIPTION;

function getSiteOrigin() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_ORIGIN;
  return raw.replace(/\/+$/, "");
}

function buildUrl(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteOrigin()}${normalizedPath === "/" ? "" : normalizedPath}`;
}

function buildAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : buildUrl(value);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean))) as string[];
}

function topicMatches(value: string, pattern: RegExp) {
  return pattern.test(value.toLowerCase());
}

function inferTopics(values: Array<string | null | undefined>) {
  const topics = new Set<string>();

  for (const value of uniqueStrings(values)) {
    const normalized = value.toLowerCase();

    if (topicMatches(normalized, /animal|safari|ocean|farm|dinosaur|nature/)) {
      topics.add("Nature");
      topics.add("Biology");
    }
    if (topicMatches(normalized, /vehicle|transport/)) {
      topics.add("Transportation");
      topics.add("STEM");
    }
    if (topicMatches(normalized, /math|addition|count|number/)) {
      topics.add("Mathematics");
      topics.add("Cognitive Development");
    }
    if (topicMatches(normalized, /reading|phonics|writing|handwriting|tracing|sentence|literacy/)) {
      topics.add("Language Arts");
      topics.add("Literacy Development");
    }
    if (topicMatches(normalized, /game|matching|bingo|board/)) {
      topics.add("Logic");
      topics.add("Game-Based Learning");
    }
    if (topicMatches(normalized, /planner|routine|lesson|reward|home|management/)) {
      topics.add("Home Management");
      topics.add("Time Management");
    }
    if (topicMatches(normalized, /color|coloring|art/)) {
      topics.add("Visual Arts");
      topics.add("Fine Motor Development");
    }
    if (topicMatches(normalized, /worksheet|practice|learning|education|teacher|classroom/)) {
      topics.add("Education");
      topics.add("Early Childhood Development");
    }
  }

  if (topics.size === 0) {
    topics.add("Education");
    topics.add("Printable Learning Resources");
  }

  return Array.from(topics);
}

function inferEducationalUse(values: Array<string | null | undefined>) {
  const uses = new Set<string>(["Parent Resource", "Teaching Support"]);

  for (const value of uniqueStrings(values)) {
    const normalized = value.toLowerCase();

    if (topicMatches(normalized, /color|coloring|art/)) {
      uses.add("Visual Learning");
      uses.add("Art Activity");
    }
    if (topicMatches(normalized, /worksheet|math|reading|writing|practice|lesson/)) {
      uses.add("Lesson Plan");
      uses.add("Practice Exercise");
    }
    if (topicMatches(normalized, /game|matching|bingo|board/)) {
      uses.add("Game-Based Learning");
    }
    if (topicMatches(normalized, /planner|routine|reward|home/)) {
      uses.add("Organizing");
      uses.add("Routine Building");
    }
  }

  return Array.from(uses);
}

function buildAudience() {
  return {
    "@type": "Audience",
    audienceType: AUDIENCE_TYPE,
    name: SITE_AUDIENCE_LABEL,
  };
}

function buildPublisherRef() {
  return {
    "@id": `${getSiteOrigin()}/#organization`,
  };
}

function buildWebsiteRef() {
  return {
    "@id": `${getSiteOrigin()}/#website`,
  };
}

function buildThingList(names: string[]) {
  return names.map((name) => ({
    "@type": "Thing",
    name,
  }));
}

function buildBasePageSchema(input: {
  type: string;
  path: string;
  name: string;
  description: string;
  about: string[];
  educationalUse: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": input.type,
    url: buildUrl(input.path),
    name: input.name,
    description: input.description,
    inLanguage: "en",
    isFamilyFriendly: true,
    audience: buildAudience(),
    publisher: buildPublisherRef(),
    isPartOf: buildWebsiteRef(),
    about: buildThingList(input.about),
    educationalUse: input.educationalUse,
  } satisfies SchemaNode;
}

export function buildOrganizationSchema() {
  const origin = getSiteOrigin();

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    url: origin,
    logo: buildUrl("/logo.svg"),
    description: DEFAULT_SITE_DESCRIPTION,
    audience: buildAudience(),
    areaServed: "Worldwide",
    knowsAbout: [
      "Printable learning resources",
      "Print-at-home worksheets",
      "Classroom activities",
      "Teacher lesson support",
      "Parent-guided learning",
      "Early childhood development",
    ],
  } satisfies SchemaNode;
}

export function buildHomepageSchemas(homepage: HomepageConfig, categories: FirstCategory[]) {
  const about = inferTopics([
    homepage.title,
    homepage.description,
    homepage.seoTitle,
    homepage.seoDescription,
    ...categories.map((item) => item.title),
  ]);
  const educationalUse = inferEducationalUse([
    homepage.title,
    homepage.description,
    ...categories.map((item) => item.title),
  ]);

  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${getSiteOrigin()}/#website`,
      url: buildUrl("/"),
      name: SITE_NAME,
      alternateName: SITE_ALTERNATE_NAME,
      description: homepage.seoDescription || homepage.description,
      inLanguage: "en",
      audience: buildAudience(),
      publisher: buildPublisherRef(),
      hasPart: categories.map((item) => ({
        "@type": "CollectionPage",
        name: item.title,
        description: item.description,
        url: buildUrl(`/${item.slug}`),
      })),
      about: buildThingList(about),
      educationalUse,
    },
    {
      ...buildBasePageSchema({
        type: "WebPage",
        path: "/",
        name: homepage.seoTitle || homepage.title,
        description: homepage.seoDescription || homepage.description,
        about,
        educationalUse,
      }),
      mainEntity: buildWebsiteRef(),
    },
  ] satisfies SchemaNode[];
}

export function buildBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: buildUrl(item.path),
    })),
  } satisfies SchemaNode;
}

export function buildCategoryPageSchemas(input: CategorySchemaInput) {
  const about = inferTopics([
    input.pageTitle,
    input.pageDescription,
    input.currentTitle,
    input.parentTitle,
    input.secondLevelTitle,
    input.selectedActiveName,
    ...input.slugParts,
  ]);
  const educationalUse = inferEducationalUse([
    input.pageTitle,
    input.pageDescription,
    input.currentTitle,
    input.selectedActiveName,
    ...input.slugParts,
  ]);

  const mainSchema = {
    ...buildBasePageSchema({
      type: "CollectionPage",
      path: input.path,
      name: input.pageTitle,
      description: input.pageDescription,
      about,
      educationalUse,
    }),
    ...(input.imageUrl ? { image: [input.imageUrl] } : {}),
    ...(input.imageUrl ? { primaryImageOfPage: input.imageUrl } : {}),
    mainEntity: {
      "@type": "Thing",
      name: input.currentTitle,
      ...(input.imageUrl ? { image: input.imageUrl } : {}),
    },
  } satisfies SchemaNode;

  return [mainSchema, buildBreadcrumbSchema(input.breadcrumbs)] satisfies SchemaNode[];
}

export function buildCollectionPageSchemas(collection: Collection) {
  const path = `/collections/${collection.slug}`;
  const about = inferTopics([
    collection.title,
    collection.description,
    collection.seoTitle,
    collection.seoDescription,
    collection.category,
    ...collection.items.map((item) => `${item.title} ${item.category}`),
  ]);
  const educationalUse = inferEducationalUse([
    collection.title,
    collection.description,
    collection.category,
    ...collection.items.map((item) => item.category),
  ]);

  return [
    {
      ...buildBasePageSchema({
        type: "CreativeWork",
        path,
        name: collection.seoTitle || collection.title,
        description: collection.seoDescription || collection.description,
        about,
        educationalUse,
      }),
      genre: collection.category,
      mainEntityOfPage: buildUrl(path),
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${collection.title} items`,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      numberOfItems: collection.items.length,
      itemListElement: collection.items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "CreativeWork",
          name: item.title,
          genre: item.category,
          typicalAgeRange: item.ageRange,
        },
      })),
    },
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: collection.title, path },
    ]),
  ] satisfies SchemaNode[];
}

export function buildSpecialPageSchemas(specialPage: SpecialPage) {
  const path = `/collections/${specialPage.slug}`;
  const description =
    specialPage.seoDescription ||
    specialPage.description ||
    specialPage.subtitle ||
    "Browse this printable collection for home, homeschool, and classroom use.";
  const about = inferTopics([
    specialPage.title,
    specialPage.subtitle,
    specialPage.description,
    specialPage.seoTitle,
    specialPage.seoDescription,
    ...specialPage.items.map((item) => `${item.title} ${item.description}`),
  ]);
  const educationalUse = inferEducationalUse([
    specialPage.title,
    specialPage.subtitle,
    specialPage.description,
    ...specialPage.items.map((item) => item.title),
  ]);

  return [
    {
      ...buildBasePageSchema({
        type: "CollectionPage",
        path,
        name: specialPage.seoTitle || specialPage.title,
        description,
        about,
        educationalUse,
      }),
      ...(specialPage.heroImageUrl
        ? { image: buildAbsoluteUrl(specialPage.heroImageUrl) }
        : {}),
      mainEntityOfPage: buildUrl(path),
      mainEntity: {
        "@type": "ItemList",
        name: `${specialPage.title} printable topics`,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        numberOfItems: specialPage.items.length,
        itemListElement: specialPage.items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: buildUrl(item.url),
          item: {
            "@type": "CreativeWork",
            name: item.title,
            description: item.description,
            url: buildUrl(item.url),
            ...(item.imageUrl ? { image: buildAbsoluteUrl(item.imageUrl) } : {}),
          },
        })),
      },
    },
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Collections", path: "/collections" },
      { name: specialPage.title, path },
    ]),
  ] satisfies SchemaNode[];
}
