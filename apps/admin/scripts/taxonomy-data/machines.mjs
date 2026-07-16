const lines = (value) =>
  [...new Set(value.trim().split("\n").map((line) => line.trim()).filter(Boolean))];

export const machinesTaxonomy = {
  slug: "machines",
  name: "Machines",
  nameZh: "机械",
  sortOrder: 1,
  children: [
    {
      slug: "cars",
      name: "Cars",
      nameZh: "汽车",
      sortOrder: 0,
      items: lines(`
Sedan Car
SUV
classic car
police car
taxi
race car
Sports Car
Convertible Car
Coupe Car
Hatchback Car
Electric Car
Limousine
Minivan
Muscle Car
Hot Rod Car
      `),
    },
    {
      slug: "trucks",
      name: "Trucks",
      nameZh: "卡车",
      sortOrder: 1,
      items: lines(`
tow truck
garbage truck
cement mixer truck
snowplow truck
fire truck
pickup truck
Dump Truck
Semi Truck
Monster Truck
Delivery Truck
Box Truck
Flatbed Truck
Tanker Truck
Car Carrier Truck
Logging Truck
Armored Truck
Ambulance
Crane Truck
Bucket Truck
Recycling Truck
      `),
    },
    {
      slug: "buses",
      name: "Buses",
      nameZh: "巴士",
      sortOrder: 2,
      items: lines(`
city bus
commuter bus
Double Decker Bus
school bus
vintage bus
tour bus
intercity bus
minibus
Shuttle Bus
Coach Bus
Electric Bus
Trolleybus
Articulated Bus
Airport Bus
Sightseeing Bus
Open Top Bus
      `),
    },
    {
      slug: "motorcycles",
      name: "Motorcycles",
      nameZh: "摩托车",
      sortOrder: 3,
      items: lines(`
Sport Motorcycle
dirt bike
Motorcycle
Scooter
Cruiser Motorcycle
Chopper Motorcycle
Touring Motorcycle
Electric Motorcycle
Police Motorcycle
Sidecar Motorcycle
Vintage Motorcycle
Adventure Motorcycle
      `),
    },
    {
      slug: "trains",
      name: "Trains",
      nameZh: "火车",
      sortOrder: 4,
      items: lines(`
high-speed train
bullet train
Train
Passenger Train
Steam Train
Subway
Freight Train
Monorail
Tram
Light Rail Train
Maglev Train
Sleeper Train
Electric Locomotive
Diesel Locomotive
Cable Car
      `),
    },
    {
      slug: "airplanes",
      name: "Airplanes",
      nameZh: "飞机",
      sortOrder: 5,
      items: lines(`
Airplane
Fighter Jet
Cargo Plane
Propeller Plane
Biplane
Seaplane
Glider
Business Jet
Firefighting Plane
Crop Duster
Bomber Plane
      `),
    },
    {
      slug: "helicopters",
      name: "Helicopters",
      nameZh: "直升机",
      sortOrder: 6,
      items: lines(`
Helicopter
Police Helicopter
Rescue Helicopter
Firefighting Helicopter
Military Helicopter
Attack Helicopter
Transport Helicopter
Coast Guard Helicopter
Sightseeing Helicopter
Air Ambulance
      `),
    },
    {
      slug: "ships",
      name: "Ships",
      nameZh: "轮船",
      sortOrder: 7,
      items: lines(`
Ship
Boat
Sailboat
Speedboat
Yacht
Pirate Ship
Cargo Ship
Fishing Boat
Cruise Ship
Ferry
Tugboat
Fireboat
Rescue Boat
Canoe
Kayak
Rowboat
Aircraft Carrier
Battleship
      `),
    },
    {
      slug: "submarines",
      name: "Submarines",
      nameZh: "潜艇",
      sortOrder: 8,
      items: lines(`
Submarine
Military Submarine
Nuclear Submarine
Mini Submarine
Research Submarine
Rescue Submarine
Tourist Submarine
Deep Sea Submersible
Underwater Robot
      `),
    },
    {
      slug: "cranes",
      name: "Cranes",
      nameZh: "起重机",
      sortOrder: 9,
      items: lines(`
Crane
Tower Crane
Mobile Crane
Truck Crane
Crawler Crane
Gantry Crane
Container Crane
Harbor Crane
Floating Crane
Overhead Crane
Jib Crane
Mini Crane
      `),
    },
    {
      slug: "excavators",
      name: "Excavators",
      nameZh: "挖掘机",
      sortOrder: 10,
      items: lines(`
Excavator
Backhoe
Forklift
Road Roller
bulldozer
Mini Excavator
Wheel Loader
Skid Steer Loader
Trencher
Motor Grader
Paver
Pile Driver
Telescopic Handler
Backhoe Loader
Compact Track Loader
      `),
    },
    {
      slug: "orbit",
      name: "Space",
      nameZh: "太空",
      sortOrder: 11,
      items: lines(`
Rocket
Space Shuttle
space station
Mars rover
satellite
Spacecraft
Space Capsule
Space Telescope
Spacesuit
Lunar Lander
Mars Helicopter
Space Probe
Rover
Starship
Crew Dragon
Moon Boots
Oxygen Tank
      `),
    },
    {
      slug: "tractors",
      name: "Tractors",
      nameZh: "拖拉机",
      sortOrder: 12,
      items: lines(`
Tractor
Farm Tractor
Small Tractor
Lawn Tractor
Garden Tractor
Crawler Tractor
Loader Tractor
Snow Tractor
Electric Tractor
Vintage Tractor
Classic Tractor
Steam Tractor
      `),
    },
  ],
};
