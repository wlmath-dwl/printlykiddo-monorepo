/** @type {import('next').NextConfig} */
const imageProxyOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL?.trim();
  if (!raw) {
    return "https://img.printlykiddo.com";
  }
  return raw.replace(/\/+$/, "");
})();

let imageProxyHostname = "img.printlykiddo.com";
try {
  imageProxyHostname = new URL(imageProxyOrigin).hostname || imageProxyHostname;
} catch {
  // 保留默认 hostname
}

const makeCategoryRedirects = (pairs) =>
  pairs.flatMap(([source, destination]) => {
    if (!source.endsWith("/:path*") || !destination.endsWith("/:path*")) {
      return [{ source, destination, permanent: true }];
    }

    const exactSource = source.slice(0, -"/:path*".length);
    const exactDestination = destination.slice(0, -"/:path*".length);

    return [
      { source: exactSource, destination: exactDestination, permanent: true },
      { source, destination, permanent: true },
    ];
  });

const makeChildCategoryRedirectPairs = (root, sourceCategory, destinationCategory, slugs) =>
  slugs.map((slug) => [
    `/${root}/${sourceCategory}/${slug}/:path*`,
    `/${root}/${destinationCategory}/${slug}/:path*`,
  ]);

const dinosaurCategoryRedirects = makeCategoryRedirects([
  ["/dinosaurs/carnivorous-dinosaurs/t-rex/:path*", "/dinosaurs/tyrannosaur-dinosaurs/t-rex/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/albertosaurus/:path*", "/dinosaurs/tyrannosaur-dinosaurs/albertosaurus/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/gorgosaurus/:path*", "/dinosaurs/tyrannosaur-dinosaurs/gorgosaurus/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/daspletosaurus/:path*", "/dinosaurs/tyrannosaur-dinosaurs/daspletosaurus/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/tarbosaurus/:path*", "/dinosaurs/tyrannosaur-dinosaurs/tarbosaurus/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/suchomimus/:path*", "/dinosaurs/spinosaur-dinosaurs/suchomimus/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/irritator/:path*", "/dinosaurs/spinosaur-dinosaurs/irritator/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/oxalaia/:path*", "/dinosaurs/spinosaur-dinosaurs/oxalaia/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/acrocanthosaurus/:path*", "/dinosaurs/allosaur-dinosaurs/acrocanthosaurus/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/giganotosaurus/:path*", "/dinosaurs/allosaur-dinosaurs/giganotosaurus/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/saurophaganax/:path*", "/dinosaurs/allosaur-dinosaurs/saurophaganax/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/neovenator/:path*", "/dinosaurs/allosaur-dinosaurs"],
  ["/dinosaurs/carnivorous-dinosaurs/concavenator/:path*", "/dinosaurs/allosaur-dinosaurs"],
  ["/dinosaurs/carnivorous-dinosaurs/mapusaurus/:path*", "/dinosaurs/allosaur-dinosaurs"],
  ["/dinosaurs/carnivorous-dinosaurs/yangchuanosaurus/:path*", "/dinosaurs/allosaur-dinosaurs"],
  ["/dinosaurs/carnivorous-dinosaurs/metriacanthosaurus/:path*", "/dinosaurs/allosaur-dinosaurs"],
  ["/dinosaurs/carnivorous-dinosaurs/ceratosaurus/:path*", "/dinosaurs/ceratosaur-dinosaurs/ceratosaurus/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/carnotaurus/:path*", "/dinosaurs/ceratosaur-dinosaurs/carnotaurus/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/majungasaurus/:path*", "/dinosaurs/ceratosaur-dinosaurs"],
  ["/dinosaurs/carnivorous-dinosaurs/megalosaurus/:path*", "/dinosaurs/megalosaur-dinosaurs/megalosaurus/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/torvosaurus/:path*", "/dinosaurs/megalosaur-dinosaurs"],
  ["/dinosaurs/carnivorous-dinosaurs/dilophosaurus/:path*", "/dinosaurs/early-theropod-dinosaurs/dilophosaurus/:path*"],
  ["/dinosaurs/carnivorous-dinosaurs/cryolophosaurus/:path*", "/dinosaurs/early-theropod-dinosaurs"],
  ["/dinosaurs/carnivorous-dinosaurs/monolophosaurus/:path*", "/dinosaurs/early-theropod-dinosaurs"],
  ["/dinosaurs/raptors/oviraptor/:path*", "/dinosaurs/oviraptor-dinosaurs/oviraptor/:path*"],
  ["/dinosaurs/duck-billed-dinosaurs/iguanodon/:path*", "/dinosaurs/duck-billed-dinosaurs"],
  ["/dinosaurs/carnivorous-dinosaurs", "/dinosaurs"],
  ["/dinosaurs/carnivorous-dinosaurs/:path*", "/dinosaurs"],
]);

const animalCategoryRedirects = makeCategoryRedirects([
  ["/animals/amphibians/tree-frog/:path*", "/animals/forest-animals/tree-frog/:path*"],
  ["/animals/jungle-animals/tree-frog/:path*", "/animals/forest-animals/tree-frog/:path*"],
  ["/animals/pets/axolotl/:path*", "/animals/amphibians"],
]);

const prehistoricCategoryRedirects = [
  ...makeCategoryRedirects([
    // 物种从 /animals/prehistoric-animals/<种> 迁到 /prehistoric-animals/<大类>/<种>
    ["/animals/prehistoric-animals/mammoth/:path*", "/prehistoric-animals/ice-age-mammals/mammoth/:path*"],
    ["/animals/prehistoric-animals/saber-toothed-tiger/:path*", "/prehistoric-animals/ice-age-mammals/saber-toothed-tiger/:path*"],
    ["/animals/prehistoric-animals/woolly-rhinoceros/:path*", "/prehistoric-animals/ice-age-mammals/woolly-rhinoceros/:path*"],
    ["/animals/prehistoric-animals/dire-wolf/:path*", "/prehistoric-animals/ice-age-mammals/dire-wolf/:path*"],
    ["/animals/prehistoric-animals/mosasaurus/:path*", "/prehistoric-animals/marine-reptiles/mosasaurus/:path*"],
    ["/animals/prehistoric-animals/plesiosaur/:path*", "/prehistoric-animals/marine-reptiles/plesiosaur/:path*"],
    // Early Humans 命名更自然地调整为 Prehistoric People。
    ...makeChildCategoryRedirectPairs("prehistoric-animals", "early-humans", "prehistoric-people", [
      "neanderthal",
      "homo-erectus",
      "australopithecus",
      "homo-habilis",
      "paranthropus",
      "homo-floresiensis",
      "ardipithecus",
      "cro-magnon",
    ]),
    ["/prehistoric-animals/early-humans/:path*", "/prehistoric-animals/prehistoric-people/:path*"],
  ]),
  // 一级分类页
  { source: "/animals/prehistoric-animals", destination: "/prehistoric-animals", permanent: true },
];

const machinesCategoryRedirects = makeCategoryRedirects([
  // Excavators 二级改名为 Construction Vehicles
  ["/machines/excavators/:path*", "/machines/construction-vehicles/:path*"],
  // 去重：Trucks/Crane Truck 合并到 Cranes/Truck Crane
  ["/machines/trucks/crane-truck/:path*", "/machines/cranes/truck-crane/:path*"],
]);

const plantsCategoryRedirects = makeCategoryRedirects([
  // Shrubs 去后缀（仅活跃项需要重定向）
  ["/plants/shrubs/rhododendron-shrub/:path*", "/plants/shrubs/rhododendron/:path*"],
  ["/plants/shrubs/boxwood-shrub/:path*", "/plants/shrubs/boxwood/:path*"],
  // Sugarcane 从 Grasses 迁入 Crops，并用 Plant 后缀与食物语义区分。
  ["/plants/grasses/sugarcane/:path*", "/plants/crops/sugarcane-plant/:path*"],
]);

const foodCategoryRedirects = makeCategoryRedirects([
  // Staple Foods 拆分为 Grains / Bread / Pasta / Noodles。
  ["/food/staple-foods/rice/:path*", "/food/grains/rice/:path*"],
  ["/food/staple-foods/wheat/:path*", "/food/grains/wheat/:path*"],
  ["/food/staple-foods/oats/:path*", "/food/grains/oats/:path*"],
  ["/food/staple-foods/cereal/:path*", "/food/grains/cereal/:path*"],
  ["/food/staple-foods/flour/:path*", "/food/grains/flour/:path*"],
  ["/food/staple-foods/bread/:path*", "/food/bread/bread-loaf/:path*"],
  ["/food/staple-foods/toast/:path*", "/food/bread/toast/:path*"],
  ["/food/staple-foods/bagel/:path*", "/food/bread/bagel/:path*"],
  ["/food/staple-foods/croissant/:path*", "/food/bread/croissant/:path*"],
  ["/food/staple-foods/baguette/:path*", "/food/bread/baguette/:path*"],
  ["/food/staple-foods/pita-bread/:path*", "/food/bread/pita-bread/:path*"],
  ["/food/staple-foods/bun/:path*", "/food/bread/bun/:path*"],
  ["/food/staple-foods/tortilla/:path*", "/food/bread/tortilla/:path*"],
  ["/food/staple-foods/naan/:path*", "/food/bread/naan/:path*"],
  ["/food/staple-foods/spaghetti/:path*", "/food/pasta/spaghetti/:path*"],
  ["/food/staple-foods/macaroni/:path*", "/food/pasta/macaroni/:path*"],
  ["/food/staple-foods/lasagna/:path*", "/food/pasta/lasagna/:path*"],
  ["/food/staple-foods/ravioli/:path*", "/food/pasta/ravioli/:path*"],
  ["/food/staple-foods/penne/:path*", "/food/pasta/penne/:path*"],
  ["/food/staple-foods/fettuccine/:path*", "/food/pasta/fettuccine/:path*"],
  ["/food/staple-foods/noodles/:path*", "/food/noodles/noodle-bowl/:path*"],
  ["/food/staple-foods/ramen/:path*", "/food/noodles/ramen/:path*"],
  ["/food/staple-foods/udon/:path*", "/food/noodles/udon/:path*"],
  ["/food/staple-foods/soba/:path*", "/food/noodles/soba/:path*"],
  ["/food/staple-foods/rice-noodles/:path*", "/food/noodles/rice-noodles/:path*"],
  ["/food/staple-foods/pancake/:path*", "/food/dishes/pancake/:path*"],
  ["/food/staple-foods/waffle/:path*", "/food/dishes/waffle/:path*"],

  // Condiments 拆分为 Seasonings / Sauces。
  ["/food/condiments/ketchup/:path*", "/food/sauces/ketchup/:path*"],
  ["/food/condiments/mustard/:path*", "/food/sauces/mustard/:path*"],
  ["/food/condiments/mayonnaise/:path*", "/food/sauces/mayonnaise/:path*"],
  ["/food/condiments/honey/:path*", "/food/sauces/honey/:path*"],
  ["/food/condiments/jam/:path*", "/food/sauces/jam/:path*"],
  ["/food/condiments/maple-syrup/:path*", "/food/sauces/maple-syrup/:path*"],
  ["/food/condiments/soy-sauce/:path*", "/food/sauces/soy-sauce/:path*"],
  ["/food/condiments/vinegar/:path*", "/food/sauces/vinegar/:path*"],

  // 其他分类边界调整与去重。
  ["/food/beans/peanuts/:path*", "/food/nuts/peanuts/:path*"],
  ["/food/dairy/ice-cream/:path*", "/food/desserts/ice-cream/:path*"],
  ["/food/snacks/corn-dog/:path*", "/food/dishes/corn-dog/:path*"],
  ["/food/dairy/milk-carton/:path*", "/food/dairy/milk/:path*"],
  ["/food/eggs/easter-egg/:path*", "/holidays/cultural-holidays/easter/:path*"],
  ["/food/nuts/acorns/:path*", "/food/nuts/:path*"],

  // 子项精确映射之后再处理旧分类的剩余路径。
  ["/food/staple-foods/:path*", "/food/grains/:path*"],
  ["/food/condiments/:path*", "/food/seasonings/:path*"],
]);

const buildingsCategoryRedirects = makeCategoryRedirects([
  // Living Buildings 拆分为住宅、公共建筑、商业建筑和休闲场馆。
  ...makeChildCategoryRedirectPairs("buildings", "living-buildings", "homes", [
    "apartment-building",
    "cottage",
    "cabin",
    "farmhouse",
    "villa",
    "townhouse",
    "bungalow",
    "hut",
    "tree-house",
    "igloo",
  ]),
  ...makeChildCategoryRedirectPairs("buildings", "living-buildings", "public-buildings", [
    "school",
    "kindergarten",
    "university",
    "hospital",
    "clinic",
    "library",
    "fire-station",
    "police-station",
    "post-office",
    "city-hall",
    "courthouse",
    "community-center",
  ]),
  ...makeChildCategoryRedirectPairs("buildings", "living-buildings", "commercial-buildings", [
    "restaurant",
    "cafe",
    "bakery",
    "grocery-store",
    "supermarket",
    "toy-store",
    "bookstore",
    "bank",
    "office-building",
    "hotel",
  ]),
  ...makeChildCategoryRedirectPairs("buildings", "living-buildings", "recreation", [
    "museum",
    "theater",
    "movie-theater",
    "gym",
    "stadium",
    "swimming-pool",
    "zoo",
    "aquarium-building",
  ]),

  // Transport Buildings 统一为更自然的 Transportation。
  ...makeChildCategoryRedirectPairs("buildings", "transport-buildings", "transportation", [
    "train-station",
    "subway-station",
    "bus-station",
    "bus-stop-shelter",
    "tram-station",
    "airport",
    "airport-terminal",
    "airport-hangar",
    "harbor",
    "ferry-terminal",
    "train-depot",
    "bus-depot",
    "parking-garage",
    "garage",
    "gas-station",
    "car-wash",
    "toll-booth",
    "control-tower",
    "rest-stop",
    "boat-house",
  ]),

  // Industrial Buildings 中的农场建筑独立成类。
  ...makeChildCategoryRedirectPairs("buildings", "industrial-buildings", "farm-buildings", [
    "barn",
    "silo",
    "greenhouse",
    "farm-building",
    "windmill",
    "storage-shed",
  ]),

  // Infrastructure 中拆出桥梁和地标，Water Park 归入 Recreation。
  ...makeChildCategoryRedirectPairs("buildings", "infrastructure", "bridges", [
    "bridge",
    "suspension-bridge",
    "stone-bridge",
    "wooden-bridge",
    "covered-bridge",
    "drawbridge",
    "arch-bridge",
    "rope-bridge",
  ]),
  ...makeChildCategoryRedirectPairs("buildings", "infrastructure", "landmarks", [
    "clock-tower",
    "bell-tower",
    "skyscraper",
    "tower",
    "observation-tower",
    "radio-tower",
  ]),
  ["/buildings/infrastructure/water-park/:path*", "/buildings/recreation/water-park/:path*"],

  // Historic Buildings 中拆出宗教建筑和地标。
  ...makeChildCategoryRedirectPairs("buildings", "historic-buildings", "religious-buildings", [
    "temple",
    "church",
    "cathedral",
    "mosque",
    "pagoda",
    "shrine",
    "chapel",
    "monastery",
  ]),
  ...makeChildCategoryRedirectPairs("buildings", "historic-buildings", "landmarks", [
    "stonehenge",
    "great-wall",
    "monument",
    "memorial",
    "obelisk",
    "leaning-tower",
    "statue",
    "triumphal-arch",
  ]),

  // 去重或移除的主题跳转到最接近的保留页。
  ["/buildings/living-buildings/tent/:path*", "/buildings/homes/:path*"],
  ["/buildings/industrial-buildings/red-barn/:path*", "/buildings/farm-buildings/barn/:path*"],
  ["/buildings/industrial-buildings/shed/:path*", "/buildings/farm-buildings/storage-shed/:path*"],
  ["/buildings/historic-buildings/medieval-castle/:path*", "/buildings/historic-buildings/castle/:path*"],
  ["/buildings/historic-buildings/ruins/:path*", "/buildings/historic-buildings/ancient-ruins/:path*"],
  ["/buildings/historic-buildings/ancient-palace/:path*", "/buildings/historic-buildings/palace/:path*"],

  // 精确子项之后再兜底旧二级分类。
  ["/buildings/living-buildings/:path*", "/buildings/homes/:path*"],
  ["/buildings/transport-buildings/:path*", "/buildings/transportation/:path*"],
]);

const holidaysCategoryRedirects = makeCategoryRedirects([
  // Family Holidays / Family & Celebrations 统一为 Family Celebrations。
  ...makeChildCategoryRedirectPairs("holidays", "family-holidays", "family-celebrations", [
    "birthday",
    "mothers-day",
    "fathers-day",
    "grandparents-day",
    "childrens-day",
    "wedding",
    "baby-shower",
    "anniversary",
  ]),
  ["/holidays/family-holidays/valentines-day/:path*", "/holidays/popular-holidays/valentines-day/:path*"],

  // Cultural Holidays / 旧 Popular Holidays slug 迁到规范的 popular-holidays。
  ...makeChildCategoryRedirectPairs("holidays", "cultural-holidays", "popular-holidays", [
    "christmas",
    "halloween",
    "easter",
    "thanksgiving",
    "new-year",
    "new-years-eve",
    "st-patricks-day",
  ]),
  ["/holidays/cultural-holidays/independence-day/:path*", "/holidays/popular-holidays/fourth-of-july/:path*"],
  ["/holidays/cultural-holidays/lunar-new-year/:path*", "/holidays/world-holidays/lunar-new-year/:path*"],

  // Holidays Around the World 简化为 World Holidays，Eid 同时明确为 Eid al-Fitr。
  ...makeChildCategoryRedirectPairs("holidays", "holidays-around-the-world", "world-holidays", [
    "lunar-new-year",
    "day-of-the-dead",
    "hanukkah",
    "diwali",
    "cinco-de-mayo",
    "mardi-gras",
    "kwanzaa",
  ]),
  ["/holidays/holidays-around-the-world/eid/:path*", "/holidays/world-holidays/eid-al-fitr/:path*"],

  // Fun & Awareness Days 简化为 Special Days。
  ...makeChildCategoryRedirectPairs("holidays", "awareness-days", "special-days", [
    "earth-day",
    "april-fools-day",
    "groundhog-day",
    "arbor-day",
    "world-book-day",
    "world-animal-day",
    "world-oceans-day",
  ]),

  // 早期 Seasonal Activities 中的返校主题已归入 School Days。
  ["/holidays/seasonal-activities/back-to-school/:path*", "/holidays/school-days/back-to-school/:path*"],
  ["/holidays/seasons/back-to-school/:path*", "/holidays/school-days/back-to-school/:path*"],

  // 精确映射后再兜底已下线的旧二级分类。
  ["/holidays/family-holidays/:path*", "/holidays/family-celebrations/:path*"],
  ["/holidays/cultural-holidays/:path*", "/holidays/popular-holidays/:path*"],
  ["/holidays/holidays-around-the-world/:path*", "/holidays/world-holidays/:path*"],
  ["/holidays/awareness-days/:path*", "/holidays/special-days/:path*"],
  ["/holidays/seasonal-activities/:path*", "/holidays/seasons/:path*"],
]);

const nextConfig = {
  reactStrictMode: true,
  images: {
    /**
     * 源图已经是部署在 R2/CDN 上的 webp，且 OpenNext 在 Cloudflare Workers
     * 上不内置图片优化器（无 sharp）。关闭 /_next/image 转码：
     * - 浏览器直接打到 img.printlykiddo.com，CDN 命中率最高
     * - next/image 的 lazy/priority/width-height 防 CLS 等行为仍然保留
     * - 部署到 Cloudflare 不会因为 /_next/image 路径异常而踩坑
     */
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    localPatterns: [
      {
        pathname: "/api/local-dev/image",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: imageProxyHostname,
      },
      // 本地 dev 图片代理（NEXT_PUBLIC_IMAGE_PROXY_BASE_URL 指向 localhost 时使用）
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
      },
    ],
  },
  async redirects() {
    return [
      ...dinosaurCategoryRedirects,
      ...animalCategoryRedirects,
      {
        source: "/animals/forest-animals/gray-wolf",
        destination: "/animals/forest-animals/wolf",
        permanent: true,
      },
      {
        source: "/machines/orbit/space-station-3",
        destination: "/machines/orbit/space-station",
        permanent: true,
      },
      {
        source: "/dinosaurs/plated-dinosaurs-2",
        destination: "/dinosaurs/plated-dinosaurs",
        permanent: true,
      },
      {
        source: "/buildings/living-buildings/cabin-3",
        destination: "/buildings/homes/cabin",
        permanent: true,
      },
      {
        source: "/dinosaurs/horned-dinosaurs/styracosaurus-3",
        destination: "/dinosaurs/horned-dinosaurs/styracosaurus",
        permanent: true,
      },
      {
        source: "/dinosaurs/armored-dinosaurs/nodosaurus-3",
        destination: "/dinosaurs/armored-dinosaurs/nodosaurus",
        permanent: true,
      },
      {
        source: "/dinosaurs/early-theropod-dinosaurs/cryolophosaurus-3",
        destination: "/dinosaurs/early-theropod-dinosaurs/cryolophosaurus",
        permanent: true,
      },
      {
        source: "/plants/trees/maple-tree-3",
        destination: "/plants/trees/maple-tree",
        permanent: true,
      },
      {
        source: "/animals/farm-animals/alpaca-3",
        destination: "/animals/farm-animals/alpaca",
        permanent: true,
      },
      {
        source: "/buildings/public-buildings/school-3",
        destination: "/buildings/public-buildings/school",
        permanent: true,
      },
      {
        source: "/prehistoric-animals/marine-reptiles/plesiosaur-3",
        destination: "/prehistoric-animals/marine-reptiles/plesiosaur",
        permanent: true,
      },
      {
        source: "/animals/prehistoric-animals/big-mosasaurus",
        destination: "/prehistoric-animals/marine-reptiles/mosasaurus",
        permanent: true,
      },
      {
        source: "/food/vegetables/tomato-3",
        destination: "/food/vegetables/tomato",
        permanent: true,
      },
      {
        source: "/animals/prehistoric-animals/mosasaurus-3",
        destination: "/prehistoric-animals/marine-reptiles/mosasaurus",
        permanent: true,
      },
      {
        source: "/animals/pets/puppy-3",
        destination: "/animals/pets/puppy",
        permanent: true,
      },
      {
        source: "/puzzles/mazes/easy-mazes",
        destination: "/puzzles/mazes/printable-mazes",
        permanent: true,
      },
      {
        source: "/puzzles/mazes/medium-mazes",
        destination: "/puzzles/mazes/printable-mazes",
        permanent: true,
      },
      {
        source: "/puzzles/sudoku/easy-9x9-sudoku",
        destination: "/puzzles/sudoku/9x9-sudoku",
        permanent: true,
      },
      {
        source: "/puzzles/sudoku/medium-9x9-sudoku",
        destination: "/puzzles/sudoku/9x9-sudoku",
        permanent: true,
      },
      {
        source: "/puzzles/sudoku/hard-9x9-sudoku",
        destination: "/puzzles/sudoku/9x9-sudoku",
        permanent: true,
      },
      ...prehistoricCategoryRedirects,
      ...machinesCategoryRedirects,
      ...plantsCategoryRedirects,
      ...foodCategoryRedirects,
      ...buildingsCategoryRedirects,
      ...holidaysCategoryRedirects,
    ];
  },
  async headers() {
    /**
     * 给 HTML / 普通响应统一加上安全头。
     * `_headers` 文件是 Cloudflare Pages 约定，OpenNext on Workers 不会读取它，
     * 必须用 next.config.js 的 async headers 注入。
     */
    const isDev = process.env.NODE_ENV !== "production";

    const securityHeaders = [
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value:
          "interest-cohort=(), camera=(), microphone=(), geolocation=()",
      },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // 下载历史页完全依赖本机 localStorage，内容因人而异，
        // 且需要始终加载最新构建，禁止任何层级缓存该页 HTML。
        source: "/download-history",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0",
          },
        ],
      },
      {
        // 静态资源：
        // - 生产构建文件名带内容 hash，内容变文件名就变，可安全永久缓存。
        // - 开发模式文件名固定（page.js 等），永久缓存会导致改了代码仍加载旧文件，
        //   因此 dev 下禁用缓存，保证改完即见。
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: isDev
              ? "no-store, must-revalidate"
              : "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/sitemap.xml",
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/robots.txt",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=3600" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare")
    .then(({ initOpenNextCloudflareForDev }) =>
      initOpenNextCloudflareForDev())
    .catch((error) => {
      console.warn("Failed to initialize Cloudflare dev bindings.", error);
    });
}
