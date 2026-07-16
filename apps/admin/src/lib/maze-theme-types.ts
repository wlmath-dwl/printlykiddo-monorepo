export type MazeDecorationRole = "title" | "corner_large" | "corner_medium" | "edge_small";
export type MazeDecorationSizeLevel = "small" | "medium" | "large";
export type MazeDecorationSlot = "title" | "corner" | "side" | "bottom" | "entry_exit";
export type MazeDecorationVisualWeight = "light" | "normal" | "heavy";
export type MazeThemeDifficulty = "easy" | "medium" | "hard";

export type MazeThemeAsset = {
  id: string;
  theme_id: string;
  name: string;
  role: MazeDecorationRole;
  size_level: MazeDecorationSizeLevel;
  slot_allowed: MazeDecorationSlot[];
  visual_weight: MazeDecorationVisualWeight;
  file_name: string;
  mime_type: string;
  created_at: string;
};

export type MazeTheme = {
  id: string;
  name: string;
  difficulty: MazeThemeDifficulty;
  maze_count: number;
  include_answers: boolean;
  assets: MazeThemeAsset[];
  created_at: string;
  updated_at: string;
};

export type MazeThemeInput = {
  name: string;
  difficulty?: MazeThemeDifficulty;
  maze_count?: number;
  include_answers?: boolean;
};
