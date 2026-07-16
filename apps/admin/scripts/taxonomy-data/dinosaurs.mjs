const lines = (value) =>
  [...new Set(value.trim().split("\n").map((line) => line.trim()).filter(Boolean))];

export const dinosaursTaxonomy = {
  slug: "dinosaurs",
  name: "Dinosaurs",
  nameZh: "恐龙",
  sortOrder: 2,
  children: [
    {
      slug: "tyrannosaur-dinosaurs",
      name: "Tyrannosaur Dinosaurs",
      nameZh: "暴龙类",
      sortOrder: 1,
      items: lines(`
T-Rex
Albertosaurus
Gorgosaurus
Daspletosaurus
Tarbosaurus
Alioramus
Qianzhousaurus
Lythronax
      `),
    },
    {
      slug: "spinosaur-dinosaurs",
      name: "Spinosaur Dinosaurs",
      nameZh: "棘龙类",
      sortOrder: 2,
      items: lines(`
Suchomimus
Irritator
Oxalaia
Spinosaurus
Baryonyx
Ichthyovenator
Sigilmassasaurus
Cristatusaurus
      `),
    },
    {
      slug: "allosaur-dinosaurs",
      name: "Allosaur Dinosaurs",
      nameZh: "异特龙类",
      sortOrder: 3,
      items: lines(`
Acrocanthosaurus
Giganotosaurus
Saurophaganax
Neovenator
Concavenator
Mapusaurus
Yangchuanosaurus
Metriacanthosaurus
      `),
    },
    {
      slug: "ceratosaur-dinosaurs",
      name: "Ceratosaur Dinosaurs",
      nameZh: "角鼻龙类",
      sortOrder: 4,
      items: lines(`
Ceratosaurus
Carnotaurus
Majungasaurus
Abelisaurus
Rajasaurus
Rugops
Skorpiovenator
Masiakasaurus
      `),
    },
    {
      slug: "megalosaur-dinosaurs",
      name: "Megalosaur Dinosaurs",
      nameZh: "斑龙类",
      sortOrder: 5,
      items: lines(`
Megalosaurus
Torvosaurus
Afrovenator
Eustreptospondylus
Dubreuillosaurus
Duriavenator
Wiehenvenator
Marshosaurus
      `),
    },
    {
      slug: "early-theropod-dinosaurs",
      name: "Early Theropod Dinosaurs",
      nameZh: "早期兽脚类",
      sortOrder: 6,
      items: lines(`
Dilophosaurus
Cryolophosaurus
Monolophosaurus
Coelophysis
Herrerasaurus
Eoraptor
Liliensternus
Zupaysaurus
      `),
    },
    {
      slug: "raptors",
      name: "Raptors",
      nameZh: "迅猛龙类",
      sortOrder: 7,
      items: lines(`
Velociraptor
Deinonychus
Utahraptor
Dromaeosaurus
Microraptor
Bambiraptor
Dakotaraptor
Atrociraptor
Pyroraptor
Austroraptor
Sinornithosaurus
Zhenyuanlong
      `),
    },
    {
      slug: "oviraptor-dinosaurs",
      name: "Oviraptor Dinosaurs",
      nameZh: "窃蛋龙类",
      sortOrder: 8,
      items: lines(`
Oviraptor
Citipati
Anzu
Conchoraptor
Khaan
Gigantoraptor
Caudipteryx
Chirostenotes
      `),
    },
    {
      slug: "therizinosaurs",
      name: "Therizinosaurs",
      nameZh: "镰刀龙类",
      sortOrder: 9,
      items: lines(`
Therizinosaurus
Beipiaosaurus
Nothronychus
Erlikosaurus
Segnosaurus
Alxasaurus
Falcarius
Jianchangosaurus
Suzhousaurus
Neimongosaurus
Enigmosaurus
Erliansaurus
Martharaptor
Nanshiungosaurus
      `),
    },
    {
      slug: "ornithomimosaurs",
      name: "Ostrich Dinosaurs",
      nameZh: "似鸟龙类",
      sortOrder: 10,
      items: lines(`
Gallimimus
Ornithomimus
Struthiomimus
Deinocheirus
Anserimimus
Archaeornithomimus
Sinornithomimus
Pelecanimimus
Shenzhousaurus
Beishanlong
Garudimimus
Harpymimus
Nqwebasaurus
Hexing
      `),
    },
    {
      slug: "long-neck-dinosaurs",
      name: "Long Neck Dinosaurs",
      nameZh: "长颈恐龙",
      sortOrder: 11,
      items: lines(`
Apatosaurus
Diplodocus
Brachiosaurus
Argentinosaurus
Brontosaurus
Barosaurus
Supersaurus
Sauroposeidon
Mamenchisaurus
Camarasaurus
Nigersaurus
Amargasaurus
Giraffatitan
Dreadnoughtus
Patagotitan
Saltasaurus
      `),
    },
    {
      slug: "horned-dinosaurs",
      name: "Horned Dinosaurs",
      nameZh: "角龙类",
      sortOrder: 12,
      items: lines(`
Triceratops
Chasmosaurus
Styracosaurus
Protoceratops
Torosaurus
Centrosaurus
Pachyrhinosaurus
Diabloceratops
Pentaceratops
Einiosaurus
Achelousaurus
Nasutoceratops
Kosmoceratops
Zuniceratops
      `),
    },
    {
      slug: "duck-billed-dinosaurs",
      name: "Duck-Billed Dinosaurs",
      nameZh: "鸭嘴龙类",
      sortOrder: 13,
      items: lines(`
Parasaurolophus
Edmontosaurus
Lambeosaurus
Corythosaurus
Hadrosaurus
Maiasaura
Saurolophus
Gryposaurus
Shantungosaurus
Brachylophosaurus
Hypacrosaurus
Olorotitan
      `),
    },
    {
      slug: "iguanodont-dinosaurs",
      name: "Iguanodont Dinosaurs",
      nameZh: "禽龙类",
      sortOrder: 14,
      items: lines(`
Iguanodon
Mantellisaurus
Ouranosaurus
Tenontosaurus
Camptosaurus
Muttaburrasaurus
Fukuisaurus
Lurdusaurus
      `),
    },
    {
      slug: "small-ornithopods",
      name: "Small Plant-Eating Dinosaurs",
      nameZh: "小型植食恐龙",
      sortOrder: 15,
      items: lines(`
Hypsilophodon
Dryosaurus
Leaellynasaura
Othnielia
Parksosaurus
Thescelosaurus
Orodromeus
Zephyrosaurus
Oryctodromeus
Changchunsaurus
Jeholosaurus
Haya
Agilisaurus
Atlascopcosaurus
      `),
    },
    {
      slug: "plated-dinosaurs",
      name: "Plated Dinosaurs",
      nameZh: "剑龙类",
      sortOrder: 16,
      items: lines(`
Stegosaurus
Hesperosaurus
Wuerhosaurus
Kentrosaurus
Tuojiangosaurus
Huayangosaurus
Miragaia
Dacentrurus
Chungkingosaurus
Chialingosaurus
Gigantspinosaurus
Lexovisaurus
      `),
    },
    {
      slug: "armored-dinosaurs",
      name: "Armored Dinosaurs",
      nameZh: "甲龙类",
      sortOrder: 17,
      items: lines(`
Ankylosaurus
Euoplocephalus
Nodosaurus
Polacanthus
Saichania
Edmontonia
Gargoyleosaurus
Sauropelta
Borealopelta
Minmi
Talarurus
Pinacosaurus
Zuul
      `),
    },
    {
      slug: "dome-head-dinosaurs",
      name: "Dome Head Dinosaurs",
      nameZh: "肿头龙类",
      sortOrder: 18,
      items: lines(`
Pachycephalosaurus
Stygimoloch
Dracorex
Homalocephale
Stegoceras
Goyocephale
Prenocephale
Sphaerotholus
Tylocephale
Acrotholus
Colepiocephale
Wannanosaurus
      `),
    },
  ],
};
