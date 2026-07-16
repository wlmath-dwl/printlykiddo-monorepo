import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  MazeDecorationRole,
  MazeDecorationSizeLevel,
  MazeDecorationSlot,
  MazeDecorationVisualWeight,
  MazeTheme,
  MazeThemeAsset,
  MazeThemeInput,
} from "@/lib/maze-theme-types";

const DATA_DIR = path.join(process.cwd(), "data", "maze-themes");
const INDEX_FILE = path.join(DATA_DIR, "themes.json");
const ASSET_DIR = path.join(DATA_DIR, "assets");
const ALLOWED_TYPES = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
]);
const MAZE_ASSET_ROLES = ["title", "corner_large", "corner_medium", "edge_small"] as const;
const MAZE_ASSET_SIZE_LEVELS = ["small", "medium", "large"] as const;
const MAZE_ASSET_SLOTS = ["title", "corner", "side", "bottom", "entry_exit"] as const;
const MAZE_ASSET_VISUAL_WEIGHTS = ["light", "normal", "heavy"] as const;

function normalizeAssetRole(role: unknown): MazeDecorationRole {
  if (MAZE_ASSET_ROLES.includes(role as MazeDecorationRole)) return role as MazeDecorationRole;
  if (role === "entrance" || role === "exit") return "corner_large";
  return "corner_medium";
}

function inferAssetDefaults(name: string, role: MazeDecorationRole) {
  const normalizedName = name.toLowerCase().replace(/[\s-]+/g, "_");
  if (["spider_web", "spider", "bat", "moon", "candy_corn"].some((key) => normalizedName.includes(key))) {
    return {
      size_level: "small" as const,
      slot_allowed: ["title", "corner", "side", "entry_exit"] as MazeDecorationSlot[],
      visual_weight: "light" as const,
    };
  }
  if (["pumpkin", "ghost", "haunted_house", "black_cat"].some((key) => normalizedName.includes(key))) {
    return {
      size_level: "large" as const,
      slot_allowed: ["corner", "bottom", "side"] as MazeDecorationSlot[],
      visual_weight: "heavy" as const,
    };
  }
  if (["tombstone", "skull", "lantern", "broom", "witch_hat", "candy_bucket", "bare_tree"].some((key) => normalizedName.includes(key))) {
    return {
      size_level: "medium" as const,
      slot_allowed: ["corner", "side", "bottom"] as MazeDecorationSlot[],
      visual_weight: "normal" as const,
    };
  }
  if (role === "title") {
    return {
      size_level: "small" as const,
      slot_allowed: ["title", "corner"] as MazeDecorationSlot[],
      visual_weight: "light" as const,
    };
  }
  if (role === "corner_large") {
    return {
      size_level: "large" as const,
      slot_allowed: ["corner", "bottom"] as MazeDecorationSlot[],
      visual_weight: "heavy" as const,
    };
  }
  if (role === "edge_small") {
    return {
      size_level: "small" as const,
      slot_allowed: ["title", "side", "entry_exit"] as MazeDecorationSlot[],
      visual_weight: "light" as const,
    };
  }
  return {
    size_level: "medium" as const,
    slot_allowed: ["corner", "side", "bottom"] as MazeDecorationSlot[],
    visual_weight: "normal" as const,
  };
}

function normalizeSizeLevel(sizeLevel: unknown, fallback: MazeDecorationSizeLevel): MazeDecorationSizeLevel {
  return MAZE_ASSET_SIZE_LEVELS.includes(sizeLevel as MazeDecorationSizeLevel)
    ? sizeLevel as MazeDecorationSizeLevel
    : fallback;
}

function normalizeSlotAllowed(slotAllowed: unknown, fallback: MazeDecorationSlot[]): MazeDecorationSlot[] {
  if (!Array.isArray(slotAllowed)) return fallback;
  const normalized = slotAllowed.filter((slot): slot is MazeDecorationSlot =>
    MAZE_ASSET_SLOTS.includes(slot as MazeDecorationSlot),
  );
  return normalized.length ? Array.from(new Set(normalized)) : fallback;
}

function normalizeVisualWeight(
  visualWeight: unknown,
  fallback: MazeDecorationVisualWeight,
): MazeDecorationVisualWeight {
  return MAZE_ASSET_VISUAL_WEIGHTS.includes(visualWeight as MazeDecorationVisualWeight)
    ? visualWeight as MazeDecorationVisualWeight
    : fallback;
}

function normalizeAsset(asset: MazeThemeAsset): MazeThemeAsset {
  const role = normalizeAssetRole(asset.role);
  const inferred = inferAssetDefaults(asset.name, role);
  const size_level = normalizeSizeLevel(asset.size_level, inferred.size_level);
  return {
    ...asset,
    role,
    size_level,
    slot_allowed: normalizeSlotAllowed(asset.slot_allowed, inferred.slot_allowed),
    visual_weight: normalizeVisualWeight(asset.visual_weight, inferred.visual_weight),
  };
}

async function readThemes(): Promise<MazeTheme[]> {
  try {
    const themes = JSON.parse(await readFile(INDEX_FILE, "utf8")) as Array<
      MazeTheme & Partial<MazeThemeInput>
    >;
    return themes.map((theme) => ({
      id: theme.id,
      ...cleanInput(theme),
      assets: Array.isArray(theme.assets)
        ? theme.assets.map((asset) => normalizeAsset(asset))
        : [],
      created_at: theme.created_at,
      updated_at: theme.updated_at,
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function saveThemes(themes: MazeTheme[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(INDEX_FILE, `${JSON.stringify(themes, null, 2)}\n`, "utf8");
}

function cleanInput(input: MazeThemeInput) {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("请输入主题名称。");
  const difficulty = (["easy", "medium", "hard"] as const).includes(input.difficulty ?? "easy")
    ? input.difficulty ?? "easy"
    : "easy";
  return {
    name,
    difficulty,
    maze_count: Math.min(100, Math.max(1, Math.round(Number(input.maze_count ?? 1)))),
    include_answers: input.include_answers !== false,
  };
}

export async function listMazeThemes() {
  return readThemes();
}

export async function createMazeTheme(input: MazeThemeInput) {
  const themes = await readThemes();
  const now = new Date().toISOString();
  const theme: MazeTheme = {
    id: randomUUID(),
    ...cleanInput(input),
    assets: [],
    created_at: now,
    updated_at: now,
  };
  themes.unshift(theme);
  await saveThemes(themes);
  return theme;
}

export async function updateMazeTheme(id: string, input: MazeThemeInput) {
  const themes = await readThemes();
  const index = themes.findIndex((theme) => theme.id === id);
  if (index < 0) throw new Error("迷宫主题不存在。");
  themes[index] = { ...themes[index], ...cleanInput(input), updated_at: new Date().toISOString() };
  await saveThemes(themes);
  return themes[index];
}

export async function deleteMazeTheme(id: string) {
  const themes = await readThemes();
  const theme = themes.find((item) => item.id === id);
  if (!theme) throw new Error("迷宫主题不存在。");
  await Promise.all(theme.assets.map((asset) => rm(assetPath(asset), { force: true })));
  await saveThemes(themes.filter((item) => item.id !== id));
}

function assetPath(asset: Pick<MazeThemeAsset, "id" | "file_name">) {
  return path.join(ASSET_DIR, `${asset.id}${path.extname(asset.file_name)}`);
}

export async function addMazeThemeAsset(
  themeId: string,
  file: File,
  role: MazeDecorationRole,
  name: string,
  options?: {
    size_level?: MazeDecorationSizeLevel;
    slot_allowed?: MazeDecorationSlot[];
    visual_weight?: MazeDecorationVisualWeight;
  },
) {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("素材仅支持 PNG、JPG 和 WebP。");
  if (file.size > 10 * 1024 * 1024) throw new Error("单个素材不能超过 10MB。");
  if (!MAZE_ASSET_ROLES.includes(role)) {
    throw new Error("素材类型不正确。");
  }
  const themes = await readThemes();
  const theme = themes.find((item) => item.id === themeId);
  if (!theme) throw new Error("迷宫主题不存在。");
  const assetName = name.trim() || file.name.replace(/\.[^.]+$/, "");
  const inferred = inferAssetDefaults(assetName, role);
  const sizeLevel = normalizeSizeLevel(options?.size_level, inferred.size_level);
  const asset: MazeThemeAsset = {
    id: randomUUID(),
    theme_id: themeId,
    name: assetName,
    role,
    size_level: sizeLevel,
    slot_allowed: normalizeSlotAllowed(options?.slot_allowed, inferred.slot_allowed),
    visual_weight: normalizeVisualWeight(options?.visual_weight, inferred.visual_weight),
    file_name: file.name,
    mime_type: file.type,
    created_at: new Date().toISOString(),
  };
  await mkdir(ASSET_DIR, { recursive: true });
  await writeFile(assetPath(asset), Buffer.from(await file.arrayBuffer()));
  theme.assets.push(asset);
  theme.updated_at = new Date().toISOString();
  await saveThemes(themes);
  return asset;
}

export async function deleteMazeThemeAsset(themeId: string, assetId: string) {
  const themes = await readThemes();
  const theme = themes.find((item) => item.id === themeId);
  if (!theme) throw new Error("迷宫主题不存在。");
  const asset = theme.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error("主题素材不存在。");
  theme.assets = theme.assets.filter((item) => item.id !== assetId);
  theme.updated_at = new Date().toISOString();
  await rm(assetPath(asset), { force: true });
  await saveThemes(themes);
}

export async function updateMazeThemeAsset(
  themeId: string,
  assetId: string,
  input: {
    name: string;
    role: MazeDecorationRole;
    size_level?: MazeDecorationSizeLevel;
    slot_allowed?: MazeDecorationSlot[];
    visual_weight?: MazeDecorationVisualWeight;
    file?: File | null;
  },
) {
  const themes = await readThemes();
  const theme = themes.find((item) => item.id === themeId);
  if (!theme) throw new Error("迷宫主题不存在。");
  const asset = theme.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error("主题素材不存在。");
  if (!MAZE_ASSET_ROLES.includes(input.role)) {
    throw new Error("素材类型不正确。");
  }

  const name = input.name.trim();
  if (!name) throw new Error("请输入素材名称。");
  const previousPath = assetPath(asset);
  if (input.file) {
    if (!ALLOWED_TYPES.has(input.file.type)) throw new Error("素材仅支持 PNG、JPG 和 WebP。");
    if (input.file.size > 10 * 1024 * 1024) throw new Error("单个素材不能超过 10MB。");
    const nextFileName = input.file.name;
    const nextPath = assetPath({ id: asset.id, file_name: nextFileName });
    await mkdir(ASSET_DIR, { recursive: true });
    await writeFile(nextPath, Buffer.from(await input.file.arrayBuffer()));
    if (nextPath !== previousPath) await rm(previousPath, { force: true });
    asset.file_name = nextFileName;
    asset.mime_type = input.file.type;
  }

  asset.name = name;
  asset.role = input.role;
  const inferred = inferAssetDefaults(name, input.role);
  asset.size_level = normalizeSizeLevel(input.size_level, inferred.size_level);
  asset.slot_allowed = normalizeSlotAllowed(input.slot_allowed, inferred.slot_allowed);
  asset.visual_weight = normalizeVisualWeight(input.visual_weight, inferred.visual_weight);
  theme.updated_at = new Date().toISOString();
  await saveThemes(themes);
  return asset;
}

export async function readMazeThemeAsset(themeId: string, assetId: string) {
  const themes = await readThemes();
  const asset = themes
    .find((item) => item.id === themeId)
    ?.assets.find((item) => item.id === assetId);
  if (!asset) return null;
  return { asset, buffer: await readFile(assetPath(asset)) };
}
