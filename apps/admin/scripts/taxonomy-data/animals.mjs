const lines = (value) =>
  [...new Set(value.trim().split("\n").map((line) => line.trim()).filter(Boolean))];

export const animalsTaxonomy = {
  slug: "animals",
  name: "Animals",
  nameZh: "动物",
  sortOrder: 0,
  children: [
    {
      slug: "pets",
      name: "Pets",
      nameZh: "宠物",
      sortOrder: 1,
      items: lines(`
Dog
Cat
Parakeet
Pet Rabbit
Hamster
Labrador Retriever
Puppy
Kitten
Guinea Pig
Goldfish
Betta Fish
Cockatiel
Ferret
Chinchilla
      `),
    },
    {
      slug: "farm-animals",
      name: "Farm Animals",
      nameZh: "农场动物",
      sortOrder: 2,
      items: lines(`
Cow
Pig
Sheep
Horse
Chicken
Calf
Piglet
Goat
Duck
Donkey
Rooster
Turkey
Lamb
Pony
Alpaca
      `),
    },
    {
      slug: "safari-animals",
      name: "Safari Animals",
      nameZh: "草原动物",
      sortOrder: 3,
      items: lines(`
Lion
Elephant
Giraffe
Zebra
Cheetah
Rhinoceros
Hippopotamus
Leopard
Meerkat
Warthog
Ostrich
Gazelle
Baboon
      `),
    },
    {
      slug: "jungle-animals",
      name: "Jungle Animals",
      nameZh: "丛林动物",
      sortOrder: 8,
      items: lines(`
Monkey
Tiger
Toucan
Sloth
Jaguar
Gorilla
Orangutan
Macaw
Chameleon
Boa Constrictor
Tapir
      `),
    },
    {
      slug: "forest-animals",
      name: "Forest Animals",
      nameZh: "森林动物",
      sortOrder: 6,
      items: lines(`
Deer
Fawn
Wolf
Fox
Coyote
Bear
Squirrel
Rabbit
Penguin
Hedgehog
Moose
Beaver
Skunk
Chipmunk
Tree Frog
      `),
    },
    {
      slug: "arctic-animals",
      name: "Arctic Animals",
      nameZh: "极地动物",
      sortOrder: 7,
      items: lines(`
Polar Bear
Arctic Fox
Seal
Walrus
Reindeer
Arctic Hare
Snowy Owl
Narwhal
Orca
Beluga Whale
      `),
    },
    {
      slug: "ocean-animals",
      name: "Ocean Animals",
      nameZh: "海洋动物",
      sortOrder: 4,
      items: lines(`
Blue Whale
Dolphin
Shark
Sea Turtle
Giant Pacific Octopus
Humpback Whale
Sperm Whale
Octopus
Jellyfish
Seahorse
Starfish
Crab
Lobster
Stingray
Clownfish
      `),
    },
    {
      slug: "prehistoric-animals",
      name: "Prehistoric Animals",
      nameZh: "史前动物",
      sortOrder: 5,
      items: lines(`
Mammoth
Saber-toothed Tiger
Woolly Rhinoceros
Dire Wolf
Mosasaurus
Plesiosaur
      `),
    },
    {
      slug: "desert-animals",
      name: "Desert Animals",
      nameZh: "沙漠动物",
      sortOrder: 9,
      items: lines(`
Camel
Fennec Fox
Addax
Oryx
Jerboa
Sand Cat
Roadrunner
Desert Tortoise
Horned Lizard
Scorpion
      `),
    },
    {
      slug: "australian-animals",
      name: "Australian Animals",
      nameZh: "澳大利亚动物",
      sortOrder: 10,
      items: lines(`
Kangaroo
Koala
Wombat
Wallaby
Quokka
Tasmanian Devil
Echidna
Platypus
Kookaburra
Emu
      `),
    },
    {
      slug: "freshwater-animals",
      name: "Freshwater Animals",
      nameZh: "淡水动物",
      sortOrder: 11,
      items: lines(`
Frog
Toad
Tadpole
Newt
Dragonfly
Pond Snail
Water Strider
Minnow
Water Boatman
Diving Beetle
      `),
    },
    {
      slug: "mountain-animals",
      name: "Mountain Animals",
      nameZh: "高山动物",
      sortOrder: 12,
      items: lines(`
Mountain Goat
Bighorn Sheep
Ibex
Yak
Snow Leopard
Marmot
Pika
Chamois
Condor
Markhor
Tahr
Bharal
Argali
Mouflon
Himalayan Monal
Rock Ptarmigan
Vicuna
Guanaco
Klipspringer
Gelada
      `),
    },
  ],
};
