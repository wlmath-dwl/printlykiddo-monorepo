export type PosePromptPresetSpec = {
  titleZh: string;
  titleEn: string;
};

const ROAD_VEHICLE_THEME_PATTERN =
  /(vehicle|vehicles|car|cars|truck|trucks|bus|buses|van|vans|taxi|taxis|sedan|sedans|suv|suvs|motorcycle|motorcycles|tractor|tractors|ambulance|fire truck|police car|汽车|车辆|卡车|公交|巴士|客车|货车|轿车|出租车|摩托车|拖拉机|警车|消防车|救护车)/i;

export const ROAD_VEHICLE_POSE_SPECS: PosePromptPresetSpec[] = [
  { titleZh: "侧面行驶", titleEn: "Side Driving" },
  { titleZh: "前侧三分之三", titleEn: "Three-Quarter Front" },
  { titleZh: "正面视角", titleEn: "Frontal View" },
  { titleZh: "后侧三分之三", titleEn: "Three-Quarter Rear" },
];

export function isRoadVehicleTheme(theme: string, ancestors: string[] = []) {
  const context = [theme, ...ancestors].join(" ");
  return ROAD_VEHICLE_THEME_PATTERN.test(context);
}

export function getRoadVehiclePosePromptInstruction() {
  return `特殊固定规则：
- 如果当前主题属于道路车辆类（如 car、bus、truck、van、taxi、sedan、SUV、motorcycle、tractor，以及对应中文车辆主题），不要自由发挥，必须固定输出以下 4 条，顺序也必须保持一致：
[
  {"titleZh":"侧面行驶","titleEn":"Side Driving"},
  {"titleZh":"前侧三分之三","titleEn":"Three-Quarter Front"},
  {"titleZh":"正面视角","titleEn":"Frontal View"},
  {"titleZh":"后侧三分之三","titleEn":"Three-Quarter Rear"}
]
- 道路车辆类主题下，这 4 条是强制规则，不允许替换成其他标题，不允许增删，不允许改顺序。`;
}
