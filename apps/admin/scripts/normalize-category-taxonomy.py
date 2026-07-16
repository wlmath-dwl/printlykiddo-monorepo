from __future__ import annotations

import re
import shutil
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


DB_PATH = Path("/Users/beike/2026/printly-admin/data/local-admin.sqlite")
BACKUP_PATH = DB_PATH.with_name(
    f"local-admin.before-taxonomy-normalize-{datetime.now().strftime('%Y%m%d-%H%M%S')}.sqlite"
)


ENGLISH_OVERRIDES = {
    "machines": ("Machines", "machines"),
    "orbit": ("Space", "space"),
    "cute-t-rex": ("T-Rex", "t-rex"),
    "hunting-dinosaurs": ("Meat-Eating Dinosaurs", "meat-eating-dinosaurs"),
    "horned-dinosaurs": ("Horned Dinosaurs", "horned-dinosaurs"),
    "plated-dinosaurs": ("Plated Dinosaurs", "plated-dinosaurs"),
    "armored-dinosaurs": ("Armored Dinosaurs", "armored-dinosaurs"),
    "dome-head-dinosaurs": ("Dome-Head Dinosaurs", "dome-head-dinosaurs"),
    "duck-billed-dinosaurs": ("Duck-Billed Dinosaurs", "duck-billed-dinosaurs"),
    "sports-car": ("Sports Car", "sports-car"),
    "electric-car": ("Electric Car", "electric-car"),
    "classic-car": ("Classic Car", "classic-car"),
    "convertible": ("Convertible Car", "convertible-car"),
    "coupe": ("Coupe Car", "coupe-car"),
    "hatchback": ("Hatchback Car", "hatchback-car"),
    "minivan": ("Minivan", "minivan"),
    "limousine": ("Limousine", "limousine"),
    "police-car": ("Police Car", "police-car"),
    "race-car": ("Race Car", "race-car"),
    "sedan": ("Sedan Car", "sedan-car"),
    "crossover": ("Crossover SUV", "crossover-suv"),
    "wagon": ("Station Wagon", "station-wagon"),
    "roadster": ("Roadster Car", "roadster-car"),
    "muscle-car": ("Muscle Car", "muscle-car"),
    "compact-car": ("Compact Car", "compact-car"),
    "subcompact": ("Small Car", "small-car"),
    "mid-size-sedan": ("Mid-Size Sedan", "mid-size-sedan"),
    "full-size-sedan": ("Full-Size Sedan", "full-size-sedan"),
    "luxury-sedan": ("Luxury Sedan", "luxury-sedan"),
    "executive-car": ("Business Sedan", "business-sedan"),
    "family-car": ("Family Car", "family-car"),
    "city-car": ("City Car", "city-car"),
    "microcar": ("Mini Car", "mini-car"),
    "station-wagon": ("Station Wagon", "station-wagon"),
    "liftback": ("Liftback Car", "liftback-car"),
    "fastback": ("Fastback Car", "fastback-car"),
    "grand-tourer": ("Grand Touring Car", "grand-touring-car"),
    "pony-car": ("Sport Coupe", "sport-coupe"),
    "hot-rod": ("Hot Rod Car", "hot-rod-car"),
    "rally-car": ("Rally Car", "rally-car"),
    "hybrid-car": ("Hybrid Car", "hybrid-car"),
    "box-truck": ("Box Truck", "box-truck"),
    "tanker-truck": ("Tanker Truck", "tanker-truck"),
    "flatbed-truck": ("Flatbed Truck", "flatbed-truck"),
    "pickup-truck": ("Pickup Truck", "pickup-truck"),
    "semi-truck": ("Semi Truck", "semi-truck"),
    "monster-truck": ("Monster Truck", "monster-truck"),
    "tow-truck": ("Tow Truck", "tow-truck"),
    "garbage-truck": ("Garbage Truck", "garbage-truck"),
    "delivery-truck": ("Delivery Truck", "delivery-truck"),
    "dump-truck": ("Dump Truck", "dump-truck"),
    "crane-truck": ("Crane Truck", "crane-truck"),
    "chassis-cab-truck": ("Chassis Cab Truck", "chassis-cab-truck"),
    "stake-truck": ("Stake Bed Truck", "stake-bed-truck"),
    "refrigerated-truck": ("Refrigerated Truck", "refrigerated-truck"),
    "dry-van-trailer-truck": ("Box Trailer Truck", "box-trailer-truck"),
    "car-carrier-truck": ("Car Carrier Truck", "car-carrier-truck"),
    "rollback-tow-truck": ("Flatbed Tow Truck", "flatbed-tow-truck"),
    "recycling-truck": ("Recycling Truck", "recycling-truck"),
    "school-bus": ("School Bus", "school-bus"),
    "fire-truck": ("Fire Truck", "fire-truck"),
    "police-motorcycle": ("Police Motorcycle", "police-motorcycle"),
    "sport-bike": ("Sport Motorcycle", "sport-motorcycle"),
    "supersport": ("Supersport Motorcycle", "supersport-motorcycle"),
    "naked-bike": ("Street Motorcycle", "street-motorcycle"),
    "streetfighter": ("Streetfighter Motorcycle", "streetfighter-motorcycle"),
    "cafe-racer": ("Cafe Racer Motorcycle", "cafe-racer-motorcycle"),
    "cruiser": ("Cruiser Motorcycle", "cruiser-motorcycle"),
    "power-cruiser": ("Power Cruiser Motorcycle", "power-cruiser-motorcycle"),
    "bagger": ("Bagger Motorcycle", "bagger-motorcycle"),
    "chopper": ("Chopper Motorcycle", "chopper-motorcycle"),
    "bobber": ("Bobber Motorcycle", "bobber-motorcycle"),
    "touring-motorcycle": ("Touring Motorcycle", "touring-motorcycle"),
    "sport-touring": ("Sport Touring Motorcycle", "sport-touring-motorcycle"),
    "adventure-bike": ("Adventure Motorcycle", "adventure-motorcycle"),
    "dual-sport": ("Dual-Sport Motorcycle", "dual-sport-motorcycle"),
    "enduro": ("Enduro Motorcycle", "enduro-motorcycle"),
    "dirt-bike": ("Dirt Bike", "dirt-bike"),
    "motocross-bike": ("Motocross Bike", "motocross-bike"),
    "trials-bike": ("Trials Motorcycle", "trials-motorcycle"),
    "flat-track-bike": ("Flat Track Motorcycle", "flat-track-motorcycle"),
    "standard-motorcycle": ("Standard Motorcycle", "standard-motorcycle"),
    "lightweight-motorcycle": ("Lightweight Motorcycle", "lightweight-motorcycle"),
    "commuter-motorcycle": ("Commuter Motorcycle", "commuter-motorcycle"),
    "electric-motorcycle": ("Electric Motorcycle", "electric-motorcycle"),
    "military-motorcycle": ("Military Motorcycle", "military-motorcycle"),
    "sidecar-motorcycle": ("Sidecar Motorcycle", "sidecar-motorcycle"),
    "vintage-motorcycle": ("Vintage Motorcycle", "vintage-motorcycle"),
    "classic-motorcycle": ("Classic Motorcycle", "classic-motorcycle"),
    "off-road-motorcycle": ("Off-Road Motorcycle", "off-road-motorcycle"),
    "hill-climb-motorcycle": ("Hill Climb Motorcycle", "hill-climb-motorcycle"),
    "subway-train": ("Subway Train", "subway-train"),
    "bullet-train": ("Bullet Train", "bullet-train"),
    "freight-train": ("Freight Train", "freight-train"),
    "high-speed-train": ("High-Speed Train", "high-speed-train"),
    "intercity-train": ("Intercity Train", "intercity-train"),
    "regional-train": ("Regional Train", "regional-train"),
    "commuter-train": ("Commuter Train", "commuter-train"),
    "local-train": ("Local Train", "local-train"),
    "express-train": ("Express Train", "express-train"),
    "sleeper-train": ("Sleeper Train", "sleeper-train"),
    "metro-train": ("Metro Train", "metro-train"),
    "light-rail-train": ("Light Rail Train", "light-rail-train"),
    "monorail-train": ("Monorail Train", "monorail-train"),
    "maglev-train": ("Maglev Train", "maglev-train"),
    "airport-train": ("Airport Train", "airport-train"),
    "shuttle-train": ("Shuttle Train", "shuttle-train"),
    "container-train": ("Container Train", "container-train"),
    "spaceplane": ("Space Plane", "space-plane"),
    "fighter-jet": ("Fighter Jet", "fighter-jet"),
    "seaplane": ("Seaplane", "seaplane"),
    "glider": ("Glider", "glider"),
    "hot-air-balloon": ("Hot Air Balloon", "hot-air-balloon"),
    "cargo-plane": ("Cargo Plane", "cargo-plane"),
    "cargo-airplane": ("Cargo Airplane", "cargo-airplane"),
    "propeller-plane": ("Propeller Plane", "propeller-plane"),
    "bush-plane": ("Bush Plane", "bush-plane"),
    "floatplane": ("Floatplane", "floatplane"),
    "aerobatic-plane": ("Aerobatic Plane", "aerobatic-plane"),
    "sailboat": ("Sailboat", "sailboat"),
    "speedboat": ("Speedboat", "speedboat"),
    "fishing-boat": ("Fishing Boat", "fishing-boat"),
    "rowboat": ("Rowboat", "rowboat"),
    "rescue-boat": ("Rescue Boat", "rescue-boat"),
    "tugboat": ("Tugboat", "tugboat"),
    "fireboat": ("Fireboat", "fireboat"),
    "pilot-boat": ("Pilot Boat", "pilot-boat"),
    "patrol-boat": ("Patrol Boat", "patrol-boat"),
    "coast-guard-cutter": ("Coast Guard Cutter", "coast-guard-cutter"),
    "golden-lion-tamarin": ("Golden Lion Tamarin", "golden-lion-tamarin"),
    "giant-pacific-octopus": ("Giant Pacific Octopus", "giant-pacific-octopus"),
    "painted-lady-butterfly": ("Painted Lady Butterfly", "painted-lady-butterfly"),
    "blue-tongued-skink": ("Blue-Tongued Skink", "blue-tongued-skink"),
    "red-eared-slider": ("Red-Eared Slider Turtle", "red-eared-slider-turtle"),
    "loggerhead-sea-turtle": ("Loggerhead Sea Turtle", "loggerhead-sea-turtle"),
    "green-sea-turtle": ("Green Sea Turtle", "green-sea-turtle"),
    "great-horned-owl": ("Great Horned Owl", "great-horned-owl"),
}


CHINESE_OVERRIDES = {
    "machines": "机械",
    "orbit": "太空",
    "cute-t-rex": "霸王龙",
    "hunting-dinosaurs": "肉食恐龙",
    "horned-dinosaurs": "有角恐龙",
    "plated-dinosaurs": "背板恐龙",
    "armored-dinosaurs": "装甲恐龙",
    "dome-head-dinosaurs": "圆头恐龙",
    "duck-billed-dinosaurs": "鸭嘴恐龙",
    "sports-car": "跑车",
    "convertible": "敞篷车",
    "coupe": "双门轿跑车",
    "hatchback": "掀背车",
    "minivan": "小型厢式车",
    "limousine": "豪华轿车",
    "flatbed-truck": "平板卡车",
    "police-motorcycle": "警用摩托车",
    "sport-bike": "运动摩托车",
    "supersport": "超级运动摩托车",
    "naked-bike": "街车摩托车",
    "streetfighter": "街头运动摩托车",
    "cafe-racer": "复古赛车摩托车",
    "cruiser": "巡航摩托车",
    "power-cruiser": "动力巡航摩托车",
    "bagger": "旅行边箱摩托车",
    "chopper": "改装巡航摩托车",
    "bobber": "复古改装摩托车",
    "touring-motorcycle": "旅行摩托车",
    "sport-touring": "运动旅行摩托车",
    "adventure-bike": "探险摩托车",
    "dual-sport": "双用途摩托车",
    "enduro": "耐力越野摩托车",
    "dirt-bike": "越野摩托车",
    "motocross-bike": "场地越野摩托车",
    "trials-bike": "障碍赛摩托车",
    "flat-track-bike": "平地赛摩托车",
    "standard-motorcycle": "标准摩托车",
    "lightweight-motorcycle": "轻型摩托车",
    "commuter-motorcycle": "通勤摩托车",
    "electric-motorcycle": "电动摩托车",
    "military-motorcycle": "军用摩托车",
    "sidecar-motorcycle": "挎斗摩托车",
    "vintage-motorcycle": "复古摩托车",
    "classic-motorcycle": "经典摩托车",
    "off-road-motorcycle": "越野摩托车",
    "hill-climb-motorcycle": "爬坡摩托车",
    "sedan": "轿车",
    "crossover": "跨界 SUV",
    "wagon": "旅行车",
    "roadster": "双座敞篷跑车",
    "muscle-car": "美式肌肉车",
    "subcompact": "小型汽车",
    "mid-size-sedan": "中型轿车",
    "full-size-sedan": "大型轿车",
    "executive-car": "商务轿车",
    "microcar": "微型汽车",
    "liftback": "掀背轿车",
    "fastback": "溜背轿车",
    "grand-tourer": "豪华旅行跑车",
    "pony-car": "运动轿跑车",
    "hot-rod": "改装热棒车",
    "freight-train": "货运列车",
    "local-train": "普通列车",
    "sleeper-train": "卧铺列车",
    "light-rail-train": "轻轨列车",
    "airport-train": "机场接驳列车",
    "shuttle-train": "穿梭列车",
    "container-train": "集装箱列车",
    "spaceplane": "航天飞机",
    "bush-plane": "野外飞机",
    "fireboat": "消防船",
    "tugboat": "拖船",
    "pilot-boat": "引航船",
    "patrol-boat": "巡逻艇",
    "golden-lion-tamarin": "金狮狨",
    "giant-pacific-octopus": "巨型太平洋章鱼",
    "painted-lady-butterfly": "彩纹蝴蝶",
    "blue-tongued-skink": "蓝舌石龙子",
    "red-eared-slider": "红耳龟",
    "loggerhead-sea-turtle": "红海龟",
    "green-sea-turtle": "绿海龟",
    "great-horned-owl": "大角鸮",
}

ID_OVERRIDES = {
    5: {"name": "Machines", "name_zh": "机械", "slug": "machines"},
    244: {"name": "Skink", "name_zh": "石龙子", "slug": "skink"},
    615: {"parent_id": 735},
    616: {"parent_id": 735},
    618: {"parent_id": 735},
    674: {"name": "Tow Truck", "name_zh": "拖车", "slug": "tow-truck"},
    677: {"name": "Bullet Train", "name_zh": "子弹头列车", "slug": "bullet-train"},
    690: {"name": "Seaplane", "name_zh": "水上飞机", "slug": "seaplane"},
    826: {"name": "Rhode Island Chicken", "name_zh": "罗德岛红鸡", "slug": "rhode-island-chicken"},
    838: {"name": "Tilapia Fish", "name_zh": "罗非鱼", "slug": "tilapia-fish"},
    864: {"name": "Small Antelope", "name_zh": "小羚羊", "slug": "small-antelope"},
    885: {"name": "Golden Lion Monkey", "name_zh": "金狮猴", "slug": "golden-lion-monkey"},
    141: {"name": "Honey Bear", "name_zh": "蜜熊", "slug": "kinkajou"},
    900: {"name": "Bearcat", "name_zh": "熊狸", "slug": "binturong"},
    901: {"name": "Big-Nosed Monkey", "name_zh": "长鼻猴", "slug": "proboscis-monkey"},
    903: {"name": "Red-Eyed Tree Frog", "name_zh": "红眼树蛙", "slug": "red-eyed-tree-frog"},
    971: {"name": "Arctic Seabird", "name_zh": "北极海鸟", "slug": "arctic-seabird"},
    976: {"name": "Weasel", "name_zh": "黄鼠狼", "slug": "weasel"},
    989: {"name": "Porpoise", "name_zh": "鼠海豚", "slug": "dalls-porpoise"},
    997: {"name": "Cuttlefish", "name_zh": "墨鱼", "slug": "common-cuttlefish"},
    1000: {"name": "Blue Tang", "name_zh": "蓝唐鱼", "slug": "blue-tang"},
    1006: {"name": "Manatee", "name_zh": "海牛", "slug": "west-indian-manatee"},
    1021: {"name": "Blue and Yellow Macaw", "name_zh": "蓝黄金刚鹦鹉", "slug": "blue-and-yellow-macaw"},
    1060: {"name": "Fire Ant", "name_zh": "火蚁", "slug": "fire-ant"},
    1090: {"name": "Blue Tongue Lizard", "name_zh": "蓝舌蜥蜴", "slug": "blue-tongue-lizard"},
    1115: {"name": "Ridley Sea Turtle", "name_zh": "雷德利海龟", "slug": "ridley-sea-turtle"},
    1119: {"name": "Red-Eared Slider", "name_zh": "红耳龟", "slug": "red-eared-slider"},
    1121: {"name": "Estate Car", "name_zh": "旅行车", "slug": "estate-car"},
    1124: {"name": "Compact Car", "name_zh": "紧凑型汽车", "slug": "compact-car"},
    1136: {"name": "Touring Sports Car", "name_zh": "旅行跑车", "slug": "touring-sports-car"},
    1144: {"name": "Cab Chassis Truck", "name_zh": "底盘驾驶室卡车", "slug": "cab-chassis-truck"},
    1145: {"name": "Open Bed Truck", "name_zh": "开放货台卡车", "slug": "open-bed-truck"},
    1148: {"name": "Cargo Van", "name_zh": "货运面包车", "slug": "cargo-van"},
    1150: {"name": "Box Trailer Truck", "name_zh": "厢式拖车卡车", "slug": "box-trailer-truck"},
    1151: {"name": "Car Carrier Truck", "name_zh": "运车卡车", "slug": "car-carrier-truck"},
    1152: {"name": "Flatbed Tow Truck", "name_zh": "平板拖车", "slug": "flatbed-tow-truck"},
    1153: {"name": "Wrecker Truck", "name_zh": "清障拖车", "slug": "wrecker-truck"},
    1161: {"name": "Ladder Fire Truck", "name_zh": "云梯消防车", "slug": "ladder-fire-truck"},
    1162: {"name": "Bucket Utility Truck", "name_zh": "高空作业车", "slug": "bucket-utility-truck"},
    1163: {"name": "Boom Utility Truck", "name_zh": "吊臂作业车", "slug": "boom-utility-truck"},
    1165: {"name": "Stake Bed Truck", "name_zh": "栏板卡车", "slug": "stake-bed-truck"},
    1166: {"name": "Rigid Truck", "name_zh": "刚性卡车", "slug": "rigid-truck"},
    1192: {"name": "Dial-a-Ride Bus", "name_zh": "预约接送巴士", "slug": "dial-a-ride-bus"},
    1193: {"name": "Park Ride Bus", "name_zh": "停车换乘巴士", "slug": "park-ride-bus"},
    1196: {"name": "Prison Bus", "name_zh": "囚犯转运巴士", "slug": "prison-bus"},
    1207: {"name": "Street Sport Motorcycle", "name_zh": "街头运动摩托车", "slug": "street-sport-motorcycle"},
    1208: {"name": "Retro Racing Motorcycle", "name_zh": "复古赛车摩托车", "slug": "retro-racing-motorcycle"},
    1210: {"name": "Sport Cruiser Motorcycle", "name_zh": "高性能巡航摩托车", "slug": "sport-cruiser-motorcycle"},
    1211: {"name": "Bagger Motorcycle", "name_zh": "边箱旅行摩托车", "slug": "bagger-motorcycle"},
    1213: {"name": "Bobber Motorcycle", "name_zh": "定制巡航摩托车", "slug": "bobber-motorcycle"},
    1217: {"name": "Dual-Sport Motorcycle", "name_zh": "公路越野两用摩托车", "slug": "dual-sport-motorcycle"},
    1218: {"name": "Trail Motorcycle", "name_zh": "林道摩托车", "slug": "trail-motorcycle"},
    1281: {"name": "Radar Plane", "name_zh": "预警飞机", "slug": "radar-plane"},
    1305: {"name": "Search and Rescue Helicopter", "name_zh": "搜救直升机", "slug": "search-and-rescue-helicopter"},
    1365: {"name": "Quiet Submarine", "name_zh": "静音潜艇", "slug": "aip-submarine"},
    1380: {"name": "Rescue Mini Submarine", "name_zh": "深海救援潜艇", "slug": "rescue-submersible"},
    1395: {"name": "Salvage Support Submarine", "name_zh": "打捞支援潜艇", "slug": "salvage-support-submarine"},
    1399: {"name": "Swing Arm Crane", "name_zh": "动臂塔吊", "slug": "luffing-crane"},
    1400: {"name": "Self Raising Crane", "name_zh": "自升式起重机", "slug": "self-raising-crane"},
    1408: {"name": "Carry Crane", "name_zh": "搬运起重机", "slug": "carry-crane"},
    1410: {"name": "Wheeled Gantry Crane", "name_zh": "轮式门式起重机", "slug": "wheeled-gantry-crane"},
    1411: {"name": "Rail Gantry Crane", "name_zh": "轨道门式起重机", "slug": "rail-gantry-crane"},
    1412: {"name": "Port Crane", "name_zh": "港口起重机", "slug": "port-crane"},
    1427: {"name": "Straight Arm Crane", "name_zh": "水平变幅起重机", "slug": "level-luffing-crane"},
    1441: {"name": "Zero-Tail Excavator", "name_zh": "零尾挖掘机", "slug": "zero-tail-excavator"},
    1442: {"name": "Short Tail Excavator", "name_zh": "短尾挖掘机", "slug": "short-tail-excavator"},
    1455: {"name": "Pipe-Laying Machine", "name_zh": "铺管机", "slug": "pipelayer"},
    1458: {"name": "Tunnel Cutter", "name_zh": "隧道掘进机", "slug": "roadheader"},
    1460: {"name": "Pile Hammer Machine", "name_zh": "打桩锤机", "slug": "vibratory-hammer-rig"},
    1461: {"name": "Rock Breaker Machine", "name_zh": "岩石破碎机", "slug": "rock-breaker-machine"},
    1465: {"name": "Claw Excavator", "name_zh": "抓斗挖掘机", "slug": "clamshell-excavator"},
    1464: {"name": "Trenching Machine", "name_zh": "开沟机", "slug": "trenching-machine"},
    1500: {"name": "Small Tractor", "name_zh": "小型拖拉机", "slug": "small-tractor"},
    1508: {"name": "Four-Wheel Drive Tractor", "name_zh": "四驱拖拉机", "slug": "four-wheel-drive-tractor"},
    1509: {"name": "Two-Wheel Drive Tractor", "name_zh": "两驱拖拉机", "slug": "two-wheel-drive-tractor"},
    2131: {"name": "St John's Wort", "name_zh": "圣约翰草", "slug": "st-johns-wort"},
    2141: {"name": "Hen and Chicks Succulent", "name_zh": "母鸡与小鸡多肉", "slug": "hen-and-chicks-succulent"},
    2155: {"name": "Crown of Thorns", "name_zh": "麒麟花", "slug": "crown-of-thorns"},
    2208: {"name": "Aquarium Banana Plant", "name_zh": "水族香蕉草", "slug": "aquarium-banana-plant"},
    2213: {"name": "Blue Flag Iris", "name_zh": "蓝旗鸢尾", "slug": "blue-flag-iris"},
    2276: {"name": "Black-Eyed Susan Vine", "name_zh": "黑眼苏珊藤", "slug": "black-eyed-susan-vine"},
    2283: {"name": "Cup Vine", "name_zh": "杯碟藤", "slug": "cup-vine"},
    2285: {"name": "Scarlet Bean Vine", "name_zh": "红花菜豆藤", "slug": "scarlet-bean-vine"},
    2324: {"name": "Rough Feather Moss", "name_zh": "粗羽苔藓", "slug": "rough-feather-moss"},
    2445: {"name": "Cracked Wheat", "name_zh": "碎小麦", "slug": "cracked-wheat"},
    2557: {"name": "Sunny Egg", "name_zh": "太阳蛋", "slug": "sunny-egg"},
    2603: {"name": "Tilapia Fillet", "name_zh": "罗非鱼片", "slug": "tilapia-fillet"},
    2616: {"name": "Fish Sticks", "name_zh": "鱼条", "slug": "fish-sticks"},
    2621: {"name": "Crab Sticks", "name_zh": "蟹味棒", "slug": "crab-sticks"},
    2669: {"name": "Pad Thai Noodles", "name_zh": "泰式炒河粉", "slug": "pad-thai-noodles"},
    2685: {"name": "Ribbon Pasta", "name_zh": "宽面条", "slug": "ribbon-pasta"},
    2734: {"name": "Fruit Roll", "name_zh": "果丹皮卷", "slug": "fruit-roll"},
    2767: {"name": "Extra Virgin Olive Oil", "name_zh": "特级橄榄油", "slug": "extra-virgin-olive-oil"},
}


BAD_ZH_VALUES = {
    "号牌",
    "裸体自行车",
    "咖啡馆赛车手",
    "巴格鲁",
    "砍刀",
    "浮标",
    "双人运动",
    "泥土自行车",
    "试验自行车",
    "平轨自行车",
    "adj.自由兑换",
    "25t平板车",
    "底盘出租车卡车",
    "桩车",
    "干货车拖车",
    "车载卡车",
    "回滚拖车",
    "貨车",
    "货车",
    "本地火车；",
    "轨枕列车",
    "灌木丛平面",
    "监狱转运巴士",
    "金狮罗望子",
    "巨型太平洋章鱼馆",
    "彩绘蝴蝶夫人",
    "蓝舌头",
    "红耳滑块",
    "绿海龟池塘",
    "加长型的轿车",
    "四门轿车",
    "車",
    "雙座敞篷車",
    "小骄车",
    "快背車",
    "热破",
    "拖吊車",
    "水上飛機",
}

SMALL_WORDS = {"and", "of", "the", "a", "an", "to", "for", "in", "on"}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def titleize_from_slug(slug: str) -> str:
    parts = re.split(r"-+", slug.strip())
    out = []
    for idx, part in enumerate(parts):
        if not part:
            continue
        upper = part.upper()
        if upper in {"T", "R", "X"}:
            out.append(upper)
            continue
        if part.lower() in SMALL_WORDS and idx != 0:
            out.append(part.lower())
            continue
        if re.fullmatch(r"[a-z]\d+", part.lower()):
            out.append(part.upper())
            continue
        out.append(part.capitalize())
    text = " ".join(out)
    text = text.replace("T Rex", "T-Rex")
    text = text.replace("Hot Air Balloon", "Hot Air Balloon")
    return text


def slugify(text: str) -> str:
    text = text.lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text or "category"


def normalize_english_name(slug: str, current_name: str) -> tuple[str, str]:
    if slug in ENGLISH_OVERRIDES:
        return ENGLISH_OVERRIDES[slug]

    name = (current_name or "").strip()
    auto_name = titleize_from_slug(slug)
    auto_slug = slugify(auto_name)

    if not name:
        return auto_name, auto_slug

    if name == name.lower() or "-" in name or re.search(r"\b[a-z]{2,}\b", name):
        return auto_name, auto_slug

    return name, slug


def normalize_chinese_name(slug: str, current_zh: str | None) -> str | None:
    if slug in CHINESE_OVERRIDES:
        return CHINESE_OVERRIDES[slug]

    zh = (current_zh or "").strip()
    if not zh:
        return None

    zh = zh.replace("；", "").replace(",", "、").replace(" ,", "、")
    zh = zh.replace("(", "（").replace(")", "）")
    zh = re.sub(r"\s+", "", zh)

    if zh in BAD_ZH_VALUES:
        return None

    if any(token in zh for token in ["adj.", "25t", "馆", "池塘"]) and slug not in CHINESE_OVERRIDES:
        return None

    return zh or None


def main() -> None:
    if not DB_PATH.exists():
        raise SystemExit(f"DB not found: {DB_PATH}")

    shutil.copy2(DB_PATH, BACKUP_PATH)
    print(f"Backup created: {BACKUP_PATH}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    rows = cur.execute(
        """
        SELECT id, parent_id, name, name_zh, slug, sync_status
        FROM categories
        WHERE deleted_at IS NULL
        ORDER BY id
        """
    ).fetchall()

    slug_owner = {row["slug"]: row["id"] for row in rows}

    def unique_slug(desired: str, category_id: int) -> str:
        if not desired:
            desired = "category"
        existing = slug_owner.get(desired)
        if existing is None or existing == category_id:
            slug_owner[desired] = category_id
            return desired
        index = 2
        while True:
            candidate = f"{desired}-{index}"
            existing = slug_owner.get(candidate)
            if existing is None or existing == category_id:
                slug_owner[candidate] = category_id
                return candidate
            index += 1

    timestamp = now_iso()
    changed = []

    for row in rows:
        category_id = row["id"]
        current_parent_id = row["parent_id"]
        current_name = row["name"]
        current_zh = row["name_zh"]
        current_slug = row["slug"]
        sync_status = row["sync_status"]

        override = ID_OVERRIDES.get(category_id, {})
        next_name, slug_hint = normalize_english_name(current_slug, current_name)
        next_slug = unique_slug(slug_hint, category_id)
        next_zh = normalize_chinese_name(current_slug, current_zh)
        next_parent_id = override.get("parent_id", current_parent_id)

        if "name" in override:
            next_name = str(override["name"])
        if "slug" in override:
            next_slug = unique_slug(str(override["slug"]), category_id)
        if "name_zh" in override:
            next_zh = override["name_zh"]

        if (
            next_parent_id == current_parent_id
            and next_name == current_name
            and next_slug == current_slug
            and (next_zh or None) == (current_zh or None)
        ):
            continue

        next_sync_status = "pending_create" if sync_status == "pending_create" else "pending_update"
        cur.execute(
            """
            UPDATE categories
            SET parent_id = ?, name = ?, slug = ?, name_zh = ?, updated_at = ?, local_updated_at = ?, sync_status = ?
            WHERE id = ?
            """,
            (
                next_parent_id,
                next_name,
                next_slug,
                next_zh,
                timestamp,
                timestamp,
                next_sync_status,
                category_id,
            ),
        )
        changed.append(
            {
                "id": category_id,
                "old_parent_id": current_parent_id,
                "new_parent_id": next_parent_id,
                "old_name": current_name,
                "new_name": next_name,
                "old_slug": current_slug,
                "new_slug": next_slug,
                "old_name_zh": current_zh,
                "new_name_zh": next_zh,
            }
        )

    conn.commit()
    conn.close()

    print(f"Changed categories: {len(changed)}")
    for row in changed[:120]:
        print(row)


if __name__ == "__main__":
    main()
