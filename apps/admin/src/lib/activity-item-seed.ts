export type ActivitySeedItem = readonly [slug: string, name: string, word: string, tags?: readonly string[]];
export type ActivitySeedTopic = {
  name: string;
  slug: string;
  group?: string;
  icon: string;
  tags: readonly string[];
  items: readonly ActivitySeedItem[];
};

// Canonical MVP vocabulary supplied for Activity Item Library. Duplicate slugs
// intentionally create Topic <-> Item reuse (for example Candy and Star).
export const ACTIVITY_ITEM_SEED: readonly ActivitySeedTopic[] = [
  { name: "Pets", slug: "pets", group: "Animals", icon: "🐶", tags: ["animal", "pet"], items: [
    ["dog", "Dog", "DOG", ["mammal"]], ["cat", "Cat", "CAT", ["mammal"]], ["rabbit", "Rabbit", "RABBIT", ["mammal"]],
    ["hamster", "Hamster", "HAMSTER"], ["guinea-pig", "Guinea Pig", "GUINEA PIG"], ["fish", "Fish", "FISH"],
    ["bird", "Bird", "BIRD"], ["turtle", "Turtle", "TURTLE"], ["frog", "Frog", "FROG"],
  ] },
  { name: "Farm Animals", slug: "farm-animals", group: "Animals", icon: "🐄", tags: ["animal", "farm"], items: [
    ["cow", "Cow", "COW"], ["pig", "Pig", "PIG"], ["horse", "Horse", "HORSE"], ["chicken", "Chicken", "CHICKEN"],
    ["duck", "Duck", "DUCK"], ["sheep", "Sheep", "SHEEP"], ["goat", "Goat", "GOAT"], ["rooster", "Rooster", "ROOSTER"],
    ["donkey", "Donkey", "DONKEY"], ["turkey", "Turkey", "TURKEY"],
  ] },
  { name: "Wild Animals", slug: "wild-animals", group: "Animals", icon: "🦁", tags: ["animal", "wild"], items: [
    ["lion", "Lion", "LION"], ["tiger", "Tiger", "TIGER"], ["elephant", "Elephant", "ELEPHANT"], ["giraffe", "Giraffe", "GIRAFFE"],
    ["zebra", "Zebra", "ZEBRA"], ["bear", "Bear", "BEAR"], ["panda", "Panda", "PANDA"], ["monkey", "Monkey", "MONKEY"],
    ["fox", "Fox", "FOX"], ["wolf", "Wolf", "WOLF"], ["deer", "Deer", "DEER"], ["kangaroo", "Kangaroo", "KANGAROO"],
  ] },
  { name: "Ocean Animals", slug: "ocean-animals", group: "Animals", icon: "🐬", tags: ["animal", "ocean"], items: [
    ["shark", "Shark", "SHARK"], ["whale", "Whale", "WHALE"], ["dolphin", "Dolphin", "DOLPHIN"], ["octopus", "Octopus", "OCTOPUS"],
    ["crab", "Crab", "CRAB"], ["starfish", "Starfish", "STARFISH"], ["seahorse", "Seahorse", "SEAHORSE"],
    ["jellyfish", "Jellyfish", "JELLYFISH"], ["sea-turtle", "Sea Turtle", "SEA TURTLE"],
  ] },
  { name: "Dinosaurs", slug: "dinosaurs", icon: "🦕", tags: ["dinosaur"], items: [
    ["tyrannosaurus", "Tyrannosaurus Rex", "T REX"], ["triceratops", "Triceratops", "TRICERATOPS"],
    ["velociraptor", "Velociraptor", "VELOCIRAPTOR"], ["stegosaurus", "Stegosaurus", "STEGOSAURUS"],
    ["brachiosaurus", "Brachiosaurus", "BRACHIOSAURUS"], ["brontosaurus", "Brontosaurus", "BRONTOSAURUS"],
    ["ankylosaurus", "Ankylosaurus", "ANKYLOSAURUS"], ["spinosaurus", "Spinosaurus", "SPINOSAURUS"],
    ["pterodactyl", "Pterodactyl", "PTERODACTYL"], ["fossil", "Fossil", "FOSSIL"], ["bone", "Bone", "BONE"],
  ] },
  { name: "Land Vehicles", slug: "land-vehicles", group: "Vehicles", icon: "🚗", tags: ["vehicle"], items: [
    ["car", "Car", "CAR"], ["bus", "Bus", "BUS"], ["truck", "Truck", "TRUCK"], ["train", "Train", "TRAIN"],
    ["bike", "Bike", "BIKE"], ["motorcycle", "Motorcycle", "MOTORCYCLE"], ["tractor", "Tractor", "TRACTOR"],
  ] },
  { name: "Special Vehicles", slug: "special-vehicles", group: "Vehicles", icon: "🚒", tags: ["vehicle"], items: [
    ["fire-truck", "Fire Truck", "FIRE TRUCK", ["community"]], ["ambulance", "Ambulance", "AMBULANCE", ["community"]],
    ["police-car", "Police Car", "POLICE CAR", ["community"]], ["school-bus", "School Bus", "SCHOOL BUS", ["school"]],
  ] },
  { name: "Air and Space Vehicles", slug: "air-and-space-vehicles", group: "Vehicles", icon: "✈️", tags: [], items: [
    ["airplane", "Airplane", "AIRPLANE", ["vehicle"]], ["helicopter", "Helicopter", "HELICOPTER", ["vehicle"]],
    ["rocket", "Rocket", "ROCKET", ["space"]], ["spaceship", "Spaceship", "SPACESHIP", ["space"]],
  ] },
  { name: "Fruits", slug: "fruits", group: "Food", icon: "🍎", tags: ["food", "fruit"], items: [
    ["apple", "Apple", "APPLE"], ["banana", "Banana", "BANANA"], ["orange", "Orange", "ORANGE"],
    ["strawberry", "Strawberry", "STRAWBERRY"], ["watermelon", "Watermelon", "WATERMELON"], ["grape", "Grape", "GRAPE"],
    ["cherry", "Cherry", "CHERRY"], ["peach", "Peach", "PEACH"], ["pear", "Pear", "PEAR"], ["pineapple", "Pineapple", "PINEAPPLE"],
  ] },
  { name: "Snacks", slug: "snacks", group: "Food", icon: "🍪", tags: ["food"], items: [
    ["cookie", "Cookie", "COOKIE"], ["cake", "Cake", "CAKE"], ["pizza", "Pizza", "PIZZA"], ["candy", "Candy", "CANDY"],
    ["ice-cream", "Ice Cream", "ICE CREAM"], ["donut", "Donut", "DONUT"], ["popcorn", "Popcorn", "POPCORN"],
    ["chocolate", "Chocolate", "CHOCOLATE"],
  ] },
  { name: "Halloween", slug: "halloween", icon: "🎃", tags: ["holiday"], items: [
    ["pumpkin", "Pumpkin", "PUMPKIN"], ["ghost", "Ghost", "GHOST"], ["bat", "Bat", "BAT"], ["witch", "Witch", "WITCH"],
    ["spider", "Spider", "SPIDER"], ["monster", "Monster", "MONSTER"], ["skeleton", "Skeleton", "SKELETON"],
    ["vampire", "Vampire", "VAMPIRE"], ["zombie", "Zombie", "ZOMBIE"], ["candy", "Candy", "CANDY"],
  ] },
  { name: "Christmas", slug: "christmas", icon: "🎄", tags: ["holiday"], items: [
    ["santa", "Santa", "SANTA"], ["elf", "Elf", "ELF"], ["reindeer", "Reindeer", "REINDEER"],
    ["christmas-tree", "Christmas Tree", "CHRISTMAS TREE"], ["gift", "Gift", "GIFT"], ["snowman", "Snowman", "SNOWMAN"],
    ["bell", "Bell", "BELL"], ["star", "Star", "STAR"],
  ] },
  { name: "Space", slug: "space", icon: "🚀", tags: ["space"], items: [
    ["sun", "Sun", "SUN"], ["moon", "Moon", "MOON"], ["star", "Star", "STAR"], ["earth", "Earth", "EARTH"],
    ["mars", "Mars", "MARS"], ["planet", "Planet", "PLANET"], ["astronaut", "Astronaut", "ASTRONAUT"],
    ["alien", "Alien", "ALIEN"], ["galaxy", "Galaxy", "GALAXY"],
  ] },
  { name: "Weather", slug: "weather", group: "Nature", icon: "🌦️", tags: ["weather"], items: [
    ["cloud", "Cloud", "CLOUD"], ["rain", "Rain", "RAIN"], ["snow", "Snow", "SNOW"], ["rainbow", "Rainbow", "RAINBOW"],
    ["wind", "Wind", "WIND"], ["storm", "Storm", "STORM"], ["lightning", "Lightning", "LIGHTNING"],
  ] },
  { name: "Plants", slug: "plants", group: "Nature", icon: "🌱", tags: [], items: [
    ["tree", "Tree", "TREE", ["plant"]], ["flower", "Flower", "FLOWER", ["plant"]], ["leaf", "Leaf", "LEAF", ["plant"]],
    ["grass", "Grass", "GRASS", ["plant"]], ["seed", "Seed", "SEED", ["plant"]], ["mushroom", "Mushroom", "MUSHROOM", ["nature"]],
  ] },
  { name: "Community Helpers", slug: "community-helpers", icon: "👩‍🚒", tags: ["community"], items: [
    ["doctor", "Doctor", "DOCTOR"], ["nurse", "Nurse", "NURSE"], ["teacher", "Teacher", "TEACHER"],
    ["firefighter", "Firefighter", "FIREFIGHTER"], ["police-officer", "Police Officer", "POLICE OFFICER"], ["farmer", "Farmer", "FARMER"],
    ["chef", "Chef", "CHEF"], ["pilot", "Pilot", "PILOT"], ["dentist", "Dentist", "DENTIST"], ["mail-carrier", "Mail Carrier", "MAIL CARRIER"],
  ] },
  { name: "School", slug: "school", icon: "🎒", tags: ["school"], items: [
    ["book", "Book", "BOOK"], ["pencil", "Pencil", "PENCIL"], ["eraser", "Eraser", "ERASER"], ["ruler", "Ruler", "RULER"],
    ["scissors", "Scissors", "SCISSORS"], ["glue", "Glue", "GLUE"], ["backpack", "Backpack", "BACKPACK"],
    ["crayon", "Crayon", "CRAYON"], ["paper", "Paper", "PAPER"],
  ] },
  { name: "Shapes", slug: "shapes", icon: "🔷", tags: ["shape"], items: [
    ["circle", "Circle", "CIRCLE"], ["square", "Square", "SQUARE"], ["triangle", "Triangle", "TRIANGLE"],
    ["rectangle", "Rectangle", "RECTANGLE"], ["oval", "Oval", "OVAL"], ["star-shape", "Star", "STAR"],
    ["heart", "Heart", "HEART"], ["diamond", "Diamond", "DIAMOND"], ["hexagon", "Hexagon", "HEXAGON"],
  ] },
  { name: "Numbers", slug: "numbers", icon: "🔢", tags: ["number"], items: [
    ["one", "One", "ONE"], ["two", "Two", "TWO"], ["three", "Three", "THREE"], ["four", "Four", "FOUR"],
    ["five", "Five", "FIVE"], ["six", "Six", "SIX"], ["seven", "Seven", "SEVEN"], ["eight", "Eight", "EIGHT"],
    ["nine", "Nine", "NINE"], ["ten", "Ten", "TEN"],
  ] },
];

export type ActivitySupplementTopic = Omit<ActivitySeedTopic, "items"> & {
  itemSlugs: readonly string[];
  newItems?: readonly ActivitySeedItem[];
};

// SEO-informed additions. Aggregate topics intentionally reuse existing Items;
// content topics add only independently recognizable, image-friendly objects.
export const ACTIVITY_ITEM_SUPPLEMENT: readonly ActivitySupplementTopic[] = [
  { name: "Thanksgiving", slug: "thanksgiving", icon: "🦃", tags: ["holiday", "thanksgiving"],
    itemSlugs: ["turkey", "pumpkin", "leaf"], newItems: [
      ["corn", "Corn", "CORN"], ["pie", "Pie", "PIE"], ["acorn", "Acorn", "ACORN"],
      ["cranberry", "Cranberry", "CRANBERRY"], ["cornucopia", "Cornucopia", "CORNUCOPIA"],
      ["pilgrim-hat", "Pilgrim Hat", "PILGRIM HAT"], ["harvest-basket", "Harvest Basket", "HARVEST BASKET"],
    ] },
  { name: "Spring", slug: "spring", group: "Seasons", icon: "🌷", tags: ["season", "spring"],
    itemSlugs: ["flower", "rain", "rainbow", "bird", "frog", "rabbit", "tree", "leaf"], newItems: [
      ["bee", "Bee", "BEE", ["animal", "insect"]], ["butterfly", "Butterfly", "BUTTERFLY", ["animal", "insect"]],
      ["ladybug", "Ladybug", "LADYBUG", ["animal", "insect"]], ["umbrella", "Umbrella", "UMBRELLA"], ["tulip", "Tulip", "TULIP", ["plant"]],
    ] },
  { name: "Summer", slug: "summer", group: "Seasons", icon: "🏖️", tags: ["season", "summer"],
    itemSlugs: ["sun", "watermelon", "ice-cream"], newItems: [
      ["beach-ball", "Beach Ball", "BEACH BALL"], ["sunglasses", "Sunglasses", "SUNGLASSES"],
      ["flip-flops", "Flip Flops", "FLIP FLOPS"], ["sandcastle", "Sandcastle", "SANDCASTLE"],
      ["bucket", "Bucket", "BUCKET"], ["shovel", "Shovel", "SHOVEL"], ["surfboard", "Surfboard", "SURFBOARD"],
      ["seashell", "Seashell", "SEASHELL"], ["sunscreen", "Sunscreen", "SUNSCREEN"],
    ] },
  { name: "Autumn", slug: "autumn", group: "Seasons", icon: "🍂", tags: ["season", "autumn", "fall"],
    itemSlugs: ["leaf", "pumpkin", "apple", "mushroom", "acorn"], newItems: [
      ["scarecrow", "Scarecrow", "SCARECROW"], ["rake", "Rake", "RAKE"],
      ["hay-bale", "Hay Bale", "HAY BALE"], ["sweater", "Sweater", "SWEATER"],
    ] },
  { name: "Winter", slug: "winter", group: "Seasons", icon: "❄️", tags: ["season", "winter"],
    itemSlugs: ["snow", "snowman"], newItems: [
      ["scarf", "Scarf", "SCARF"], ["mittens", "Mittens", "MITTENS"], ["boots", "Boots", "BOOTS"],
      ["coat", "Coat", "COAT"], ["sled", "Sled", "SLED"], ["snowflake", "Snowflake", "SNOWFLAKE"],
      ["hot-chocolate", "Hot Chocolate", "HOT CHOCOLATE"], ["ice-skates", "Ice Skates", "ICE SKATES"],
    ] },
  { name: "Easter", slug: "easter", icon: "🐣", tags: ["holiday", "easter"],
    itemSlugs: ["rabbit", "flower", "tulip"], newItems: [
      ["egg", "Egg", "EGG"], ["basket", "Basket", "BASKET"], ["chick", "Chick", "CHICK", ["animal"]], ["carrot", "Carrot", "CARROT", ["food", "vegetable"]],
    ] },
  { name: "Valentine's Day", slug: "valentines-day", icon: "💝", tags: ["holiday", "valentine"],
    itemSlugs: ["heart", "candy", "gift", "chocolate"], newItems: [
      ["rose", "Rose", "ROSE", ["plant"]], ["envelope", "Envelope", "ENVELOPE"], ["love-letter", "Love Letter", "LOVE LETTER"],
      ["teddy-bear", "Teddy Bear", "TEDDY BEAR", ["toy"]], ["balloon", "Balloon", "BALLOON"],
    ] },
  { name: "Musical Instruments", slug: "musical-instruments", icon: "🎵", tags: ["music", "instrument"],
    itemSlugs: [], newItems: [
      ["guitar", "Guitar", "GUITAR"], ["piano", "Piano", "PIANO"], ["drum", "Drum", "DRUM"], ["violin", "Violin", "VIOLIN"],
      ["trumpet", "Trumpet", "TRUMPET"], ["flute", "Flute", "FLUTE"], ["saxophone", "Saxophone", "SAXOPHONE"],
      ["tambourine", "Tambourine", "TAMBOURINE"], ["xylophone", "Xylophone", "XYLOPHONE"], ["microphone", "Microphone", "MICROPHONE"],
    ] },
  { name: "Sports", slug: "sports", icon: "⚽", tags: ["sport"],
    itemSlugs: [], newItems: [
      ["soccer-ball", "Soccer Ball", "SOCCER BALL"], ["basketball", "Basketball", "BASKETBALL"],
      ["baseball", "Baseball", "BASEBALL"], ["football", "Football", "FOOTBALL"], ["tennis-racket", "Tennis Racket", "TENNIS RACKET"],
      ["golf-club", "Golf Club", "GOLF CLUB"], ["baseball-bat", "Baseball Bat", "BASEBALL BAT"],
      ["helmet", "Helmet", "HELMET"], ["trophy", "Trophy", "TROPHY"], ["whistle", "Whistle", "WHISTLE"],
    ] },
  { name: "Animals", slug: "animals", icon: "🐾", tags: [], itemSlugs: [
    "dog", "cat", "rabbit", "hamster", "guinea-pig", "fish", "bird", "turtle", "frog", "cow", "pig", "horse", "chicken", "duck",
    "sheep", "goat", "rooster", "donkey", "turkey", "lion", "tiger", "elephant", "giraffe", "zebra", "bear", "panda", "monkey", "fox",
    "wolf", "deer", "kangaroo", "shark", "whale", "dolphin", "octopus", "crab", "starfish", "seahorse", "jellyfish", "sea-turtle",
    "bee", "butterfly", "ladybug", "chick",
  ] },
  { name: "Food", slug: "food", icon: "🍽️", tags: [], itemSlugs: [
    "apple", "banana", "orange", "strawberry", "watermelon", "grape", "cherry", "peach", "pear", "pineapple", "cookie", "cake", "pizza",
    "candy", "ice-cream", "donut", "popcorn", "chocolate", "corn", "pie", "cranberry", "carrot", "hot-chocolate",
  ] },
  { name: "Vehicles", slug: "vehicles", icon: "🚙", tags: [], itemSlugs: [
    "car", "bus", "truck", "train", "bike", "motorcycle", "tractor", "fire-truck", "ambulance", "police-car", "school-bus", "airplane", "helicopter", "rocket", "spaceship",
  ] },
  { name: "Nature", slug: "nature", icon: "🌿", tags: [], itemSlugs: [
    "cloud", "rain", "snow", "rainbow", "wind", "storm", "lightning", "tree", "flower", "leaf", "grass", "seed", "mushroom", "sun",
    "acorn", "bee", "butterfly", "ladybug", "tulip", "rose", "snowflake",
  ] },
  { name: "Holidays", slug: "holidays", icon: "🎉", tags: [], itemSlugs: [
    "pumpkin", "ghost", "bat", "witch", "spider", "monster", "skeleton", "vampire", "zombie", "candy", "santa", "elf", "reindeer",
    "christmas-tree", "gift", "snowman", "bell", "star", "turkey", "leaf", "corn", "pie", "acorn", "cranberry", "cornucopia", "pilgrim-hat",
    "harvest-basket", "rabbit", "flower", "tulip", "egg", "basket", "chick", "carrot", "heart", "chocolate", "rose", "envelope", "love-letter",
    "teddy-bear", "balloon",
  ] },
];

export const ACTIVITY_TOPIC_DESCRIPTION_ZH: Record<string, string> = {
  pets: "宠物", "farm-animals": "农场动物", "wild-animals": "野生动物", "ocean-animals": "海洋动物",
  dinosaurs: "恐龙", "land-vehicles": "陆地交通工具", "special-vehicles": "特种车辆",
  "air-and-space-vehicles": "航空与航天器", fruits: "水果", snacks: "零食", halloween: "万圣节",
  christmas: "圣诞节", space: "太空", weather: "天气", plants: "植物", "community-helpers": "社区工作者",
  school: "学校", shapes: "形状", numbers: "数字",
  thanksgiving: "感恩节", spring: "春天", summer: "夏天", autumn: "秋天", winter: "冬天", easter: "复活节",
  "valentines-day": "情人节", "musical-instruments": "乐器", sports: "运动", animals: "动物", food: "食物",
  vehicles: "交通工具", nature: "自然", holidays: "节日",
};

export const ACTIVITY_ITEM_DESCRIPTION_ZH: Record<string, string> = {
  dog: "狗", cat: "猫", rabbit: "兔子", hamster: "仓鼠", "guinea-pig": "豚鼠", fish: "鱼", bird: "鸟",
  turtle: "乌龟", frog: "青蛙", cow: "奶牛", pig: "猪", horse: "马", chicken: "鸡", duck: "鸭子", sheep: "绵羊",
  goat: "山羊", rooster: "公鸡", donkey: "驴", turkey: "火鸡", lion: "狮子", tiger: "老虎", elephant: "大象",
  giraffe: "长颈鹿", zebra: "斑马", bear: "熊", panda: "熊猫", monkey: "猴子", fox: "狐狸", wolf: "狼", deer: "鹿",
  kangaroo: "袋鼠", shark: "鲨鱼", whale: "鲸鱼", dolphin: "海豚", octopus: "章鱼", crab: "螃蟹", starfish: "海星",
  seahorse: "海马", jellyfish: "水母", "sea-turtle": "海龟", tyrannosaurus: "霸王龙", triceratops: "三角龙",
  velociraptor: "迅猛龙", stegosaurus: "剑龙", brachiosaurus: "腕龙", brontosaurus: "雷龙", ankylosaurus: "甲龙",
  spinosaurus: "棘龙", pterodactyl: "翼手龙", fossil: "化石", bone: "骨头", car: "汽车", bus: "公共汽车", truck: "卡车",
  train: "火车", bike: "自行车", motorcycle: "摩托车", tractor: "拖拉机", "fire-truck": "消防车", ambulance: "救护车",
  "police-car": "警车", "school-bus": "校车", airplane: "飞机", helicopter: "直升机", rocket: "火箭", spaceship: "宇宙飞船",
  apple: "苹果", banana: "香蕉", orange: "橙子", strawberry: "草莓", watermelon: "西瓜", grape: "葡萄", cherry: "樱桃",
  peach: "桃子", pear: "梨", pineapple: "菠萝", cookie: "曲奇饼", cake: "蛋糕", pizza: "披萨", candy: "糖果",
  "ice-cream": "冰淇淋", donut: "甜甜圈", popcorn: "爆米花", chocolate: "巧克力", pumpkin: "南瓜", ghost: "幽灵",
  bat: "蝙蝠", witch: "女巫", spider: "蜘蛛", monster: "怪物", skeleton: "骷髅", vampire: "吸血鬼", zombie: "僵尸",
  santa: "圣诞老人", elf: "精灵", reindeer: "驯鹿", "christmas-tree": "圣诞树", gift: "礼物", snowman: "雪人",
  bell: "铃铛", star: "星星", sun: "太阳", moon: "月亮", earth: "地球", mars: "火星", planet: "行星", astronaut: "宇航员",
  alien: "外星人", galaxy: "银河系", cloud: "云", rain: "雨", snow: "雪", rainbow: "彩虹", wind: "风", storm: "暴风雨",
  lightning: "闪电", tree: "树", flower: "花", leaf: "叶子", grass: "草", seed: "种子", mushroom: "蘑菇", doctor: "医生",
  nurse: "护士", teacher: "老师", firefighter: "消防员", "police-officer": "警察", farmer: "农民", chef: "厨师", pilot: "飞行员",
  dentist: "牙医", "mail-carrier": "邮递员", book: "书", pencil: "铅笔", eraser: "橡皮", ruler: "尺子", scissors: "剪刀",
  glue: "胶水", backpack: "书包", crayon: "蜡笔", paper: "纸", circle: "圆形", square: "正方形", triangle: "三角形",
  rectangle: "长方形", oval: "椭圆形", "star-shape": "星形", heart: "心形", diamond: "菱形", hexagon: "六边形",
  one: "一", two: "二", three: "三", four: "四", five: "五", six: "六", seven: "七", eight: "八", nine: "九", ten: "十",
  corn: "玉米", pie: "派", acorn: "橡果", cranberry: "蔓越莓", cornucopia: "丰饶角", "pilgrim-hat": "清教徒帽",
  "harvest-basket": "丰收篮", bee: "蜜蜂", butterfly: "蝴蝶", ladybug: "瓢虫", umbrella: "雨伞", tulip: "郁金香",
  "beach-ball": "沙滩球", sunglasses: "太阳镜", "flip-flops": "人字拖", sandcastle: "沙堡", bucket: "水桶", shovel: "铲子",
  surfboard: "冲浪板", seashell: "贝壳", sunscreen: "防晒霜", scarecrow: "稻草人", rake: "耙子", "hay-bale": "干草捆",
  sweater: "毛衣", scarf: "围巾", mittens: "连指手套", boots: "靴子", coat: "外套", sled: "雪橇", snowflake: "雪花",
  "hot-chocolate": "热巧克力", "ice-skates": "冰鞋", egg: "鸡蛋", basket: "篮子", chick: "小鸡", carrot: "胡萝卜",
  rose: "玫瑰", envelope: "信封", "love-letter": "情书", "teddy-bear": "泰迪熊", balloon: "气球", guitar: "吉他",
  piano: "钢琴", drum: "鼓", violin: "小提琴", trumpet: "小号", flute: "长笛", saxophone: "萨克斯管",
  tambourine: "铃鼓", xylophone: "木琴", microphone: "麦克风", "soccer-ball": "足球", basketball: "篮球",
  baseball: "棒球", football: "美式足球", "tennis-racket": "网球拍", "golf-club": "高尔夫球杆", "baseball-bat": "棒球棒",
  helmet: "头盔", trophy: "奖杯", whistle: "哨子",
};

export type ActivityTopicGroupSeed = {
  name: string;
  slug: string;
  description: string;
  topicSlugs: readonly string[];
};

export const ACTIVITY_TOPIC_GROUP_SEED: readonly ActivityTopicGroupSeed[] = [
  { name: "Animals", slug: "animals", description: "动物", topicSlugs: ["animals", "pets", "farm-animals", "wild-animals", "ocean-animals", "dinosaurs"] },
  { name: "Science", slug: "science", description: "自然科学", topicSlugs: ["nature", "weather", "plants", "space"] },
  { name: "Vehicles", slug: "vehicles", description: "交通工具", topicSlugs: ["vehicles", "land-vehicles", "special-vehicles", "air-and-space-vehicles"] },
  { name: "Food", slug: "food", description: "食物", topicSlugs: ["food", "fruits", "snacks"] },
  { name: "Holidays", slug: "holidays", description: "节日", topicSlugs: ["holidays", "halloween", "christmas", "thanksgiving", "easter", "valentines-day"] },
  { name: "Seasons", slug: "seasons", description: "季节", topicSlugs: ["spring", "summer", "autumn", "winter"] },
  { name: "Learning", slug: "learning", description: "学习与兴趣", topicSlugs: ["community-helpers", "school", "shapes", "numbers", "musical-instruments", "sports"] },
];
