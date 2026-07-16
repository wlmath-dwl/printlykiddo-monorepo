const lines = (value) =>
  [...new Set(value.trim().split("\n").map((line) => line.trim()).filter(Boolean))];

export const plantsTaxonomy = {
  slug: "plants",
  name: "Plants",
  nameZh: "植物",
  sortOrder: 3,
  children: [
    {
      slug: "flowers",
      name: "Flowers",
      nameZh: "花卉",
      sortOrder: 0,
      items: lines(`
Rose
Tulip
Sunflower
Lily
Daisy
Orchid
Cherry Blossom
Peony
Hydrangea
Marigold
Poppy
Daffodil
Iris
Lavender
Lotus Flower
      `),
    },
    {
      slug: "trees",
      name: "Trees",
      nameZh: "树木",
      sortOrder: 1,
      items: lines(`
Oak Tree
Maple Tree
Birch Tree
Willow Tree
Pine
Fir Tree
Spruce Tree
Cedar Tree
Cypress Tree
Juniper Tree
Palm Tree
Apple Tree
Cherry Tree
Lemon Tree
Baobab Tree
Redwood Tree
Sequoia Tree
Larch Tree
Christmas Tree
      `),
    },
    {
      slug: "shrubs",
      name: "Shrubs",
      nameZh: "灌木",
      sortOrder: 2,
      items: lines(`
Rhododendron Shrub
Boxwood Shrub
Privet Hedge
Forsythia Shrub
Lilac Bush
Rose of Sharon
Azalea Shrub
Hydrangea Shrub
Butterfly Bush
Camellia Shrub
Gardenia Shrub
Viburnum Shrub
      `),
    },
    {
      slug: "herbs",
      name: "Herbs",
      nameZh: "香草",
      sortOrder: 3,
      items: lines(`
Catmint
Bee Balm
Russian Sage
Ornamental Oregano
Hyssop
Basil Leaves
Mint
Rosemary
Thyme
Parsley Leaves
Cilantro
Chamomile
Lavender Herb
      `),
    },
    {
      slug: "succulents",
      name: "Succulents",
      nameZh: "多肉植物",
      sortOrder: 4,
      items: lines(`
Cactus
Jade Plant
Aloe Vera
Agave
Snake Plant
Echeveria
Zebra Haworthia
Christmas Cactus
Prickly Pear Cactus
String of Pearls
Burro’s Tail
Hens and Chicks
      `),
    },
    {
      slug: "aquatic-plants",
      name: "Aquatic Plants",
      nameZh: "水生植物",
      sortOrder: 5,
      items: lines(`
Lotus
Water Lily
Kelp
Duckweed
Water Hyacinth
Cattail
Seaweed
Water Lettuce
Eelgrass
Mangrove
      `),
    },
    {
      slug: "ferns",
      name: "Ferns",
      nameZh: "蕨类",
      sortOrder: 6,
      items: lines(`
Boston Fern
Fern
Maidenhair Fern
Staghorn Fern
Bird’s Nest Fern
Tree Fern
      `),
    },
    {
      slug: "vines",
      name: "Vines",
      nameZh: "藤本植物",
      sortOrder: 7,
      items: lines(`
Grapevine
Ivy
Morning Glory
Clematis
Wisteria
Honeysuckle
Passion Flower Vine
Pumpkin Vine
      `),
    },
    {
      slug: "mosses",
      name: "Mosses",
      nameZh: "苔藓",
      sortOrder: 8,
      items: lines(`
Moss
Sheet Moss
Cushion Moss
Spanish Moss
Reindeer Moss
Club Moss
      `),
    },
  ],
};

export const foodTaxonomy = {
  slug: "food",
  name: "Food",
  nameZh: "食物",
  sortOrder: 4,
  children: [
    {
      slug: "fruits",
      name: "Fruits",
      nameZh: "水果",
      sortOrder: 0,
      items: lines(`
Apple
Banana
Orange
Strawberry
Grapes
Watermelon
Pineapple
Lemon
Cherry
Peach
Pear
Mango
Blueberry
Kiwi
      `),
    },
    {
      slug: "vegetables",
      name: "Vegetables",
      nameZh: "蔬菜",
      sortOrder: 1,
      items: lines(`
Carrot
Broccoli
Tomato
Potato
Corn
Pumpkin
Cucumber
Onion
Black Pepper
Lettuce
Navy Beans
Eggplant
Mushroom
Spinach
      `),
    },
    {
      slug: "grains",
      name: "Grains",
      nameZh: "谷物",
      sortOrder: 2,
      items: lines(`
Rice
Wheat
Oats
Corn Kernels
Barley
Quinoa
Rye
Millet
Flour
Cereal
      `),
    },
    {
      slug: "beans",
      name: "Beans",
      nameZh: "豆类",
      sortOrder: 3,
      items: lines(`
Green Beans
Kidney Beans
Black Beans
Chickpeas
Lentils
Soybeans
Split Peas
Pinto Beans
      `),
    },
    {
      slug: "nuts",
      name: "Nuts",
      nameZh: "坚果",
      sortOrder: 4,
      items: lines(`
Peanuts
Almonds
Walnuts
Cashews
Pistachios
Hazelnuts
Pecans
Chestnuts
Coconut
      `),
    },
    {
      slug: "dairy",
      name: "Dairy",
      nameZh: "乳制品",
      sortOrder: 5,
      items: lines(`
Orange Juice
Cheese
Yogurt
Butter
Cottage Cheese
Cream
Milk Carton
Cheese Slice
      `),
    },
    {
      slug: "eggs",
      name: "Eggs",
      nameZh: "蛋类",
      sortOrder: 6,
      items: lines(`
Egg
Fried Egg
Boiled Egg
Scrambled Eggs
Easter Egg
Egg Carton
      `),
    },
    {
      slug: "meat",
      name: "Meat",
      nameZh: "肉类",
      sortOrder: 7,
      items: lines(`
Chicken Leg
Steak
Bacon
Sausage
Ham
Turkey Leg
Meatball
Hamburger Patty
      `),
    },
    {
      slug: "seafood",
      name: "Seafood",
      nameZh: "海鲜",
      sortOrder: 8,
      items: lines(`
Fish
Shrimp
Crab Legs
Lobster Tail
Salmon
Tuna
Oyster
Clam
Squid
Scallop
      `),
    },
    {
      slug: "bread",
      name: "Bread",
      nameZh: "面包",
      sortOrder: 9,
      items: lines(`
Toast
Bagel
Croissant
Pita Bread
Baguette
Muffin
Bun
Pancake
Waffle
      `),
    },
    {
      slug: "pasta",
      name: "Pasta",
      nameZh: "面食",
      sortOrder: 10,
      items: lines(`
Spaghetti
Macaroni
Lasagna
Ravioli
Penne
Fettuccine
Noodles
Ramen
Dumpling
      `),
    },
    {
      slug: "drinks",
      name: "Drinks",
      nameZh: "饮品",
      sortOrder: 11,
      items: lines(`
Water
Milk
Juice
Lemonade
Smoothie
Tea
Coffee
Hot Chocolate
Soda
Milkshake
      `),
    },
    {
      slug: "snacks",
      name: "Snacks",
      nameZh: "零食",
      sortOrder: 12,
      items: lines(`
Popcorn
Pretzel
Chips
Cracker
Fruit Snacks
Granola Bar
Trail Mix
Fruit Snack
      `),
    },
    {
      slug: "desserts",
      name: "Desserts",
      nameZh: "甜点",
      sortOrder: 13,
      items: lines(`
Cake
Cupcake
Ice Cream
Donut
Cookie
Pie
Brownie
Pudding
Candy
Chocolate
      `),
    },
    {
      slug: "seasonings",
      name: "Seasonings",
      nameZh: "调味料",
      sortOrder: 14,
      items: lines(`
Salt
Pepper
Sugar
Cinnamon
Garlic
Ginger
Basil
Oregano
Parsley
Vanilla
Honey
Ketchup
      `),
    },
  ],
};
