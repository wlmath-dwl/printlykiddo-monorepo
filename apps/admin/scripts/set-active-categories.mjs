import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const db = new Database(dbPath);

const activeHierarchy = {
  "Dinosaurs": {
    "Tyrannosaur Dinosaurs": ["T-Rex", "Tarbosaurus", "Albertosaurus", "Gorgosaurus", "Daspletosaurus"],
    "Spinosaur Dinosaurs": ["Suchomimus", "Irritator", "Oxalaia"],
    "Allosaur Dinosaurs": ["Acrocanthosaurus", "Giganotosaurus", "Saurophaganax"],
    "Ceratosaur Dinosaurs": ["Carnotaurus", "Ceratosaurus"],
    "Megalosaur Dinosaurs": ["Megalosaurus"],
    "Early Theropod Dinosaurs": ["Dilophosaurus"],
    "Raptors": ["Velociraptor", "Deinonychus", "Utahraptor", "Dromaeosaurus", "Microraptor", "Bambiraptor"],
    "Oviraptor Dinosaurs": ["Oviraptor"],
    "Long Neck Dinosaurs": ["Brachiosaurus", "Diplodocus", "Apatosaurus", "Argentinosaurus"],
    "Horned Dinosaurs": ["Triceratops", "Styracosaurus", "Protoceratops", "Chasmosaurus"],
    "Armored Dinosaurs": ["Ankylosaurus", "Euoplocephalus", "Nodosaurus", "Polacanthus"],
    "Plated Dinosaurs": ["Stegosaurus", "Hesperosaurus", "Wuerhosaurus", "Kentrosaurus", "Tuojiangosaurus", "Huayangosaurus"],
    "Dome Head Dinosaurs": ["Pachycephalosaurus", "Stygimoloch", "Dracorex", "Homalocephale", "Stegoceras", "Goyocephale"],
    "Duck-Billed Dinosaurs": ["Parasaurolophus", "Edmontosaurus", "Lambeosaurus"]
  },
  "Machines": {
    "Trucks": ["fire truck", "garbage truck", "tow truck", "cement mixer truck", "snowplow truck"],
    "Cars": ["police car", "race car", "taxi", "SUV", "classic car"],
    "Space": ["Rocket", "Space Shuttle", "Mars rover", "space station"],
    "Excavators": ["Excavator", "Backhoe", "bulldozer", "Forklift", "Road Roller"]
  },
  "Animals": {
    "Pets": ["Dog", "Cat", "Pet Rabbit", "Hamster", "Parakeet"],
    "Farm Animals": ["Cow", "Pig", "Horse", "Sheep", "Chicken"],
    "Safari Animals": ["Lion", "Elephant", "Giraffe", "Cheetah", "Zebra"],
    "Ocean Animals": ["Shark", "Dolphin", "Whale", "Sea Turtle", "Giant Pacific Octopus"]
  }
};

try {
  db.exec("BEGIN IMMEDIATE");

  db.prepare("UPDATE categories SET is_active = 0").run();

  const updateActive = db.prepare("UPDATE categories SET is_active = 1 WHERE id = ?");
  const findCat = db.prepare("SELECT id FROM categories WHERE lower(name) = lower(?) AND parent_id IS ?");
  const findRoot = db.prepare("SELECT id FROM categories WHERE lower(name) = lower(?) AND parent_id IS NULL");

  let activatedCount = 0;

  for (const [l1Name, l2Map] of Object.entries(activeHierarchy)) {
    const l1 = findRoot.get(l1Name);
    if (!l1) {
      console.warn(`L1 not found: ${l1Name}`);
      continue;
    }
    updateActive.run(l1.id);
    activatedCount++;

    for (const [l2Name, l3List] of Object.entries(l2Map)) {
      const l2 = findCat.get(l2Name, l1.id);
      if (!l2) {
        console.warn(`L2 not found: ${l2Name} under ${l1Name}`);
        continue;
      }
      updateActive.run(l2.id);
      activatedCount++;

      for (const l3Name of l3List) {
        const l3 = findCat.get(l3Name, l2.id);
        if (!l3) {
          console.warn(`L3 not found: ${l3Name} under ${l2Name}`);
          continue;
        }
        updateActive.run(l3.id);
        activatedCount++;
      }
    }
  }

  db.exec("COMMIT");
  console.log(`Successfully activated ${activatedCount} categories. All others are deactivated.`);
} catch (error) {
  db.exec("ROLLBACK");
  console.error("Error updating categories:", error);
} finally {
  db.close();
}
