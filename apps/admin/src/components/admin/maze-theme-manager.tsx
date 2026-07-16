"use client";

import {
  BulbOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
  type UploadFile,
} from "antd";
import { useCallback, useEffect, useState } from "react";

import {
  getMazeConfig,
  renderMazeImages,
} from "@/components/admin/maze-generator-page";
import { createBrowserZip, downloadBrowserBlob, type BrowserZipEntry } from "@/lib/browser-zip";
import type {
  MazeDecorationRole,
  MazeDecorationSizeLevel,
  MazeDecorationSlot,
  MazeDecorationVisualWeight,
  MazeTheme,
  MazeThemeAsset,
  MazeThemeInput,
} from "@/lib/maze-theme-types";

const ROLE_META: Record<MazeDecorationRole, { label: string; color: string }> = {
  title: { label: "标题装饰", color: "purple" },
  corner_large: { label: "四角大装饰", color: "volcano" },
  corner_medium: { label: "四角中装饰", color: "blue" },
  edge_small: { label: "边缘小装饰", color: "green" },
};
const SIZE_LEVEL_META: Record<MazeDecorationSizeLevel, string> = {
  small: "小",
  medium: "中",
  large: "大",
};
const SLOT_META: Record<MazeDecorationSlot, string> = {
  title: "标题",
  corner: "四角",
  side: "侧边",
  bottom: "底部",
  entry_exit: "入口/出口",
};
const VISUAL_WEIGHT_META: Record<MazeDecorationVisualWeight, string> = {
  light: "轻",
  normal: "普通",
  heavy: "重",
};

type AssetFormValues = {
  name: string;
  role: MazeDecorationRole;
  size_level: MazeDecorationSizeLevel;
  slot_allowed: MazeDecorationSlot[];
  visual_weight: MazeDecorationVisualWeight;
  file: UploadFile[];
};

type PromptAsset = Pick<MazeThemeAsset, "name" | "role">;

type PromptContext = {
  theme: MazeTheme;
  asset: PromptAsset;
};

function buildAssetImagePrompt(theme: MazeTheme, asset: PromptAsset) {
  const roleInstruction: Record<MazeDecorationRole, string> = {
    title: "Create a compact icon for the title area. It will appear beside the maze title, so keep it simple, balanced, and recognizable at a small size.",
    corner_large: "Create a prominent main decoration for one page corner. Make the subject bold, complete, and easy to recognize at a large size.",
    corner_medium: "Create a supporting decoration for one page corner. Keep it visually clear and slightly simpler than a main corner decoration.",
    edge_small: "Create a small compact accent for the page edge. Use a simple silhouette and minimal detail so it remains readable at a small size.",
  };

  return `Create one MONOCHROME black, white, and gray illustration for a children's printable maze.

MANDATORY STYLE: prioritize pure black and pure white. Use neutral gray only when black and white alone cannot clearly show an essential identifying feature. Do not use chromatic color under any circumstance.

THEME: ${theme.name}
IMAGE NAME: ${asset.name}
ASSET TYPE: ${ROLE_META[asset.role].label}

${roleInstruction[asset.role]}

IMAGE REQUIREMENTS
- Square 1:1 canvas.
- Pure white background (#FFFFFF).
- Start with pure black outlines, black fills, and white negative space as the default visual language.
- Black outlines and solid black filled areas are both allowed when appropriate for the subject.
- Do not add gray merely for depth, softness, decoration, lighting, or a polished rendering effect.
- Use a small amount of neutral gray only if an essential shape, overlap, material, or identifying feature would otherwise be unclear.
- When gray is necessary, keep it light, flat, localized, and limited to one gray level; gray must remain a minor part of the image.
- Prefer clear outlines, black fills, and white separation over gray shading whenever possible.
- Keep contrast strong and printable; avoid broad gray areas, gray backgrounds, gradients, muddy low contrast, photorealistic shading, or complex textures.
- Absolutely no chromatic color, colored accents, colored lighting, or tinted gray.
- The illustration must be directly related to the theme "${theme.name}" and clearly represent "${asset.name}".
- Center the complete subject with comfortable empty space around it.
- Keep the silhouette clean, distinct, and suitable for placement around a maze.
- Friendly children's worksheet style with clean outlines and simple, readable monochrome shapes.
- Crisp vector-like edges, balanced composition, high resolution.
- No maze, no maze walls, no path, no scenery, no border, no frame.
- No text, letters, numbers, labels, signatures, logos, or watermarks.
- Do not crop any part of the subject.

FINAL CHECK: the image should appear black and white at first glance. Remove all nonessential gray. Retain only minimal neutral gray that is strictly necessary to preserve a key recognizable feature, and remove every chromatic color or color tint.

Output only the finished square monochrome illustration on a pure white background.`;
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "请求失败。");
  return data;
}

function assetUrl(asset: MazeThemeAsset) {
  return `/api/admin/maze-themes/${asset.theme_id}/assets/${asset.id}`;
}

function loadAsset(asset: MazeThemeAsset): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法读取素材：${asset.name}`));
    image.src = assetUrl(asset);
  });
}

function findInkBounds(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法读取迷宫画布。");
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const visible = pixels[offset + 3] > 10;
      const notWhite = pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245;
      if (visible && notWhite) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return right < left ? { left: 0, top: 0, width, height } : {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function drawAsset(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  boxWidth: number,
  boxHeight: number,
) {
  const source = document.createElement("canvas");
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) return;
  sourceContext.drawImage(image, 0, 0);
  const bounds = findInkBounds(source);
  const scale = Math.min(boxWidth / bounds.width, boxHeight / bounds.height);
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  context.drawImage(
    image,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    x + (boxWidth - width) / 2,
    y + (boxHeight - height) / 2,
    width,
    height,
  );
}

function drawStartFinishLabels(
  context: CanvasRenderingContext2D,
  mazeX: number,
  mazeY: number,
  mazeWidth: number,
  mazeHeight: number,
) {
  context.save();
  context.fillStyle = "#202020";
  context.strokeStyle = "#202020";
  context.lineWidth = 5;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.font = "700 30px Arial, sans-serif";

  const startX = mazeX + 10;
  const startY = mazeY - 62;
  context.textAlign = "left";
  context.fillText("START", startX, startY);
  context.beginPath();
  context.moveTo(startX + 12, startY + 19);
  context.lineTo(startX + 88, startY + 19);
  context.lineTo(startX + 68, startY + 7);
  context.moveTo(startX + 88, startY + 19);
  context.lineTo(startX + 68, startY + 31);
  context.stroke();

  const finishX = mazeX + mazeWidth - 100;
  const finishY = mazeY + mazeHeight + 38;
  context.textAlign = "left";
  context.fillText("FINISH", finishX, finishY - 24);
  context.beginPath();
  context.moveTo(finishX + 8, finishY);
  context.lineTo(finishX + 96, finishY);
  context.lineTo(finishX + 76, finishY - 12);
  context.moveTo(finishX + 96, finishY);
  context.lineTo(finishX + 76, finishY + 12);
  context.stroke();
  context.restore();
}

function drawPageBorder(context: CanvasRenderingContext2D) {
  context.save();
  context.strokeStyle = "#202020";
  context.lineWidth = 3;
  context.strokeRect(PAGE_BORDER.x, PAGE_BORDER.y, PAGE_BORDER.width, PAGE_BORDER.height);
  context.restore();
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("导出主题迷宫失败。")), "image/png");
  });
}

const PAGE_BORDER = { x: 80, y: 80, width: 1440, height: 1440 };

type DecorationLayoutSlot = {
  slot: MazeDecorationSlot;
  size: MazeDecorationSizeLevel;
  x: number;
  y: number;
  width: number;
  height: number;
  allowedWeights?: MazeDecorationVisualWeight[];
  preferredNames?: string[];
  avoidNames?: string[];
};

type DecorationTemplate = {
  name: string;
  cornerSlots: DecorationLayoutSlot[];
  slots: DecorationLayoutSlot[];
};

type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function centeredSlot(
  slot: MazeDecorationSlot,
  size: MazeDecorationSizeLevel,
  centerX: number,
  centerY: number,
  boxSize: number,
): DecorationLayoutSlot {
  return {
    slot,
    size,
    x: centerX - boxSize / 2,
    y: centerY - boxSize / 2,
    width: boxSize,
    height: boxSize,
  };
}

function spreadCenters(start: number, end: number, count: number) {
  if (count <= 1) return [(start + end) / 2];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => start + step * index);
}

function buildDecorationTemplate(mazeRect: LayoutRect): DecorationTemplate {
  const borderRight = PAGE_BORDER.x + PAGE_BORDER.width;
  const borderBottom = PAGE_BORDER.y + PAGE_BORDER.height;
  const mazeRight = mazeRect.x + mazeRect.width;
  const mazeBottom = mazeRect.y + mazeRect.height;
  const smallSize = 70;
  const anchorSize = 115;
  const leftColumnCenterX = (PAGE_BORDER.x + mazeRect.x) / 2;
  const rightColumnCenterX = (mazeRight + borderRight) / 2;
  const bottomRowCenterY = (mazeBottom + borderBottom) / 2;
  const sideCentersY = spreadCenters(mazeRect.y + 120, mazeBottom - 120, 6);
  const bottomCentersX = spreadCenters(mazeRect.x + 120, mazeRight - 120, 6);

  return {
    name: "compact-themed-border",
    cornerSlots: [
      centeredSlot("corner", "medium", leftColumnCenterX, PAGE_BORDER.y + 110, anchorSize),
      centeredSlot("corner", "medium", rightColumnCenterX, bottomRowCenterY, anchorSize),
    ],
    slots: [
      ...sideCentersY.map((centerY) => centeredSlot("side", "small", leftColumnCenterX, centerY, smallSize)),
      ...sideCentersY.map((centerY) => centeredSlot("side", "small", rightColumnCenterX, centerY, smallSize)),
      ...bottomCentersX.map((centerX) => centeredSlot("bottom", "small", centerX, bottomRowCenterY, smallSize)),
    ],
  };
}

function scoreAssetForSlot(asset: MazeThemeAsset, slot: DecorationLayoutSlot) {
  const normalizedName = asset.name.toLowerCase();
  let score = Math.random();
  if (asset.size_level === slot.size) score += 5;
  if (slot.preferredNames?.some((name) => normalizedName.includes(name))) score += 20;
  if (slot.size === "large" && ["pumpkin", "ghost", "haunted_house", "black_cat"].some((name) => normalizedName.includes(name))) score += 8;
  if (slot.size === "small" && ["spider_web", "spider", "bat", "moon", "candy_corn"].some((name) => normalizedName.includes(name))) score += 6;
  if (slot.slot === "bottom" && ["pumpkin", "haunted_house", "lantern", "tombstone", "candy_bucket"].some((name) => normalizedName.includes(name))) score += 7;
  if (slot.slot === "title" && ["spider_web", "spider", "bat", "moon", "candy_corn"].some((name) => normalizedName.includes(name))) score += 7;
  return score;
}

function pickCornerAssetForSlot(
  assets: MazeThemeAsset[],
  usedAssetIds: Set<string>,
  previousAssetId: string | null,
) {
  const candidates = assets.filter((asset) =>
    ["corner_large", "corner_medium"].includes(asset.role) || asset.slot_allowed.includes("corner"),
  );
  const unused = candidates.filter((asset) => !usedAssetIds.has(asset.id));
  const notAdjacent = candidates.filter((asset) => asset.id !== previousAssetId);
  const pool = unused.length ? unused : notAdjacent.length ? notAdjacent : candidates;
  return pool
    .map((asset) => ({ asset, score: scoreAssetForSlot(asset, { slot: "corner", size: "medium", x: 0, y: 0, width: 0, height: 0 }) }))
    .sort((first, second) => second.score - first.score)[0]?.asset;
}

function pickEdgeAssetForSlot(
  assets: MazeThemeAsset[],
  slot: DecorationLayoutSlot,
  previousAssetId: string | null,
) {
  const candidates = assets.filter((asset) =>
    asset.role !== "corner_large"
    && asset.size_level !== "large"
    && asset.visual_weight !== "heavy"
    && asset.slot_allowed.includes(slot.slot),
  );
  const preferred = candidates.filter((asset) => asset.id !== previousAssetId);
  const pool = preferred.length ? preferred : candidates;
  return pool
    .map((asset) => ({ asset, score: scoreAssetForSlot(asset, slot) }))
    .sort((first, second) => second.score - first.score)[0]?.asset;
}

async function decorateMaze(
  maze: HTMLCanvasElement,
  theme: MazeTheme,
  loadedAssets: Map<string, HTMLImageElement>,
  themeText: string,
) {
  const output = document.createElement("canvas");
  output.width = 1600;
  output.height = 1600;
  const context = output.getContext("2d");
  if (!context) throw new Error("浏览器不支持 Canvas 图片合成。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, output.width, output.height);

  const bounds = findInkBounds(maze);
  const mazeAreaWidth = PAGE_BORDER.width * 0.85;
  const mazeAreaHeight = PAGE_BORDER.height * 0.78;
  const mazeArea = {
    x: PAGE_BORDER.x + (PAGE_BORDER.width - mazeAreaWidth) / 2,
    y: PAGE_BORDER.y + 165,
    width: mazeAreaWidth,
    height: mazeAreaHeight,
  };
  const scale = Math.min(mazeArea.width / bounds.width, mazeArea.height / bounds.height);
  const mazeWidth = bounds.width * scale;
  const mazeHeight = bounds.height * scale;
  const mazeX = mazeArea.x + (mazeArea.width - mazeWidth) / 2;
  const mazeY = mazeArea.y + (mazeArea.height - mazeHeight) / 2;
  const decorationTemplate = buildDecorationTemplate({ x: mazeX, y: mazeY, width: mazeWidth, height: mazeHeight });

  drawPageBorder(context);
  const usedAssetIds = new Set<string>();
  let previousCornerAssetId: string | null = null;
  for (const slot of decorationTemplate.cornerSlots) {
    const asset = pickCornerAssetForSlot(theme.assets, usedAssetIds, previousCornerAssetId);
    if (!asset) continue;
    const image = loadedAssets.get(asset.id);
    if (!image) continue;
    drawAsset(context, image, slot.x, slot.y, slot.width, slot.height);
    usedAssetIds.add(asset.id);
    previousCornerAssetId = asset.id;
  }
  let previousEdgeAssetId: string | null = null;
  for (const slot of decorationTemplate.slots) {
    const asset = pickEdgeAssetForSlot(theme.assets, slot, previousEdgeAssetId);
    if (!asset) continue;
    const image = loadedAssets.get(asset.id);
    if (!image) continue;
    drawAsset(context, image, slot.x, slot.y, slot.width, slot.height);
    previousEdgeAssetId = asset.id;
  }

  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#202020";
  context.font = "700 64px Arial, sans-serif";
  context.fillText(`${themeText} Maze`, output.width / 2, 165, 620);
  context.restore();

  context.drawImage(
    maze,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    mazeX,
    mazeY,
    mazeWidth,
    mazeHeight,
  );
  drawStartFinishLabels(context, mazeX, mazeY, mazeWidth, mazeHeight);
  return canvasBlob(output);
}

export function MazeThemeManager() {
  const [messageApi, contextHolder] = message.useMessage();
  const [themeForm] = Form.useForm<MazeThemeInput>();
  const [assetForm] = Form.useForm<AssetFormValues>();
  const [themes, setThemes] = useState<MazeTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MazeTheme | null | undefined>(undefined);
  const [assetTheme, setAssetTheme] = useState<MazeTheme | null>(null);
  const [editingAsset, setEditingAsset] = useState<MazeThemeAsset | null>(null);
  const [promptContext, setPromptContext] = useState<PromptContext | null>(null);
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const loadThemes = useCallback(async () => {
    setLoading(true);
    try {
      const items = await jsonRequest<MazeTheme[]>("/api/admin/maze-themes");
      setThemes(items);
      setEditing((current) => {
        if (!current?.id) return current;
        return items.find((item) => item.id === current.id);
      });
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "加载主题失败。");
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => { void loadThemes(); }, [loadThemes]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function openThemeModal(theme: MazeTheme | null) {
    setEditing(theme);
  }

  async function saveTheme(values: MazeThemeInput) {
    try {
      const saved = await jsonRequest<MazeTheme>(editing ? `/api/admin/maze-themes/${editing.id}` : "/api/admin/maze-themes", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? values : { name: values.name }),
      });
      if (editing) setEditing(saved);
      else setEditing(undefined);
      await loadThemes();
      messageApi.success(editing ? "主题已更新。" : "主题已创建。");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "保存主题失败。");
    }
  }

  async function uploadAsset(values: AssetFormValues) {
    if (!assetTheme) return;
    const file = values.file?.[0]?.originFileObj;
    if (!editingAsset && !file) {
      messageApi.warning("请选择素材图片。");
      return;
    }
    const form = new FormData();
    form.set("name", values.name ?? "");
    form.set("role", values.role);
    form.set("size_level", values.size_level);
    form.set("visual_weight", values.visual_weight);
    values.slot_allowed.forEach((slot) => form.append("slot_allowed", slot));
    if (file) form.set("file", file);
    try {
      await jsonRequest(
        editingAsset
          ? `/api/admin/maze-themes/${assetTheme.id}/assets/${editingAsset.id}`
          : `/api/admin/maze-themes/${assetTheme.id}/assets`,
        { method: editingAsset ? "PUT" : "POST", body: form },
      );
      setAssetTheme(null);
      setEditingAsset(null);
      assetForm.resetFields();
      await loadThemes();
      messageApi.success(editingAsset ? "素材已更新。" : "素材已添加到对应的版式角色池。");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "上传素材失败。");
    }
  }

  async function deleteAsset(asset: MazeThemeAsset) {
    try {
      await jsonRequest(assetUrl(asset), { method: "DELETE" });
      await loadThemes();
      messageApi.success("素材已删除。");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "删除素材失败。");
    }
  }

  async function generate(theme: MazeTheme) {
    if (!theme.assets.length) {
      messageApi.warning("请先给主题添加至少一个素材。");
      return;
    }
    setGenerating(true);
    try {
      const loaded = new Map<string, HTMLImageElement>();
      await Promise.all(theme.assets.map(async (asset) => loaded.set(asset.id, await loadAsset(asset))));
      const config = getMazeConfig("rectangle", theme.difficulty);
      const entries: BrowserZipEntry[] = [];
      const count = theme.maze_count;
      const safeThemeText = theme.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, "-");
      for (let index = 1; index <= count; index += 1) {
        const mazes = renderMazeImages(config);
        const file = `${safeThemeText || "themed"}-rectangle-${theme.difficulty}-${String(index).padStart(3, "0")}.png`;
        const puzzle = await decorateMaze(mazes.puzzleImage, theme, loaded, theme.name);
        entries.push({ name: `puzzles/${file}`, data: new Uint8Array(await puzzle.arrayBuffer()) });
        if (theme.include_answers) {
          const answer = await decorateMaze(mazes.answerImage, theme, loaded, theme.name);
          entries.push({ name: `answers/${file}`, data: new Uint8Array(await answer.arrayBuffer()) });
        }
        if (index % 5 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      downloadBrowserBlob(createBrowserZip(entries), `${safeThemeText || "themed"}-rectangle-mazes.zip`);
      messageApi.success(`已生成 ${count} 张主题迷宫。`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "生成主题迷宫失败。");
    } finally {
      setGenerating(false);
    }
  }

  async function previewTheme(theme: MazeTheme) {
    if (!theme.assets.length) {
      messageApi.warning("请先给主题添加至少一个素材。");
      return;
    }
    setPreviewing(true);
    try {
      const values = await themeForm.validateFields();
      const previewThemeData: MazeTheme = { ...theme, ...values };
      const loaded = new Map<string, HTMLImageElement>();
      await Promise.all(previewThemeData.assets.map(async (asset) => loaded.set(asset.id, await loadAsset(asset))));
      const config = getMazeConfig("rectangle", previewThemeData.difficulty);
      const mazes = renderMazeImages(config);
      const blob = await decorateMaze(mazes.puzzleImage, previewThemeData, loaded, previewThemeData.name);
      const nextUrl = URL.createObjectURL(blob);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
    } catch (error) {
      if (error instanceof Error) messageApi.error(error.message);
    } finally {
      setPreviewing(false);
    }
  }

  function closePreview() {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  async function saveAndGenerate() {
    if (!editing) return;
    try {
      const values = await themeForm.validateFields();
      const saved = await jsonRequest<MazeTheme>(`/api/admin/maze-themes/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setEditing(saved);
      await loadThemes();
      await generate(saved);
    } catch (error) {
      if (error instanceof Error) messageApi.error(error.message);
    }
  }

  const difficultyLabel = { easy: "简单", medium: "中等", hard: "困难" } as const;

  return (
    <>
      {contextHolder}
      <Card
        title="主题迷宫管理"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openThemeModal(null)}>添加主题</Button>}
        variant="borderless"
      >
        <Typography.Paragraph type="secondary">
          这里维护主题表。新增时只填写主题文本；素材、迷宫数量和难度统一在主题编辑中设置。生成固定使用矩形迷宫，主题文本会显示在成品顶部。
        </Typography.Paragraph>
        <Table<MazeTheme>
          rowKey="id"
          loading={loading}
          dataSource={themes}
          pagination={false}
          columns={[
            { title: "主题文本", dataIndex: "name" },
            { title: "素材", render: (_, theme) => `${theme.assets.length} 个` },
            { title: "迷宫数量", dataIndex: "maze_count" },
            { title: "难度", render: (_, theme) => <Tag>{difficultyLabel[theme.difficulty]}</Tag> },
            { title: "答案图", render: (_, theme) => theme.include_answers ? "生成" : "不生成" },
            {
              title: "操作",
              width: 190,
              render: (_, theme) => (
                <Space>
                  <Button icon={<EditOutlined />} onClick={() => openThemeModal(theme)}>编辑</Button>
                  <Popconfirm title="删除主题及其全部素材？" onConfirm={async () => { await jsonRequest(`/api/admin/maze-themes/${theme.id}`, { method: "DELETE" }); await loadThemes(); }}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? `编辑主题 · ${editing.name}` : "添加主题"}
        open={editing !== undefined}
        width={editing ? 900 : 480}
        onCancel={() => setEditing(undefined)}
        footer={editing ? [
          <Button key="cancel" onClick={() => setEditing(undefined)}>取消</Button>,
          <Button key="save" onClick={() => themeForm.submit()}>保存</Button>,
          <Button key="generate" type="primary" loading={generating} onClick={() => void saveAndGenerate()}>保存并生成 ZIP</Button>,
        ] : undefined}
        onOk={() => themeForm.submit()}
        afterOpenChange={(open) => {
          if (!open) return;
          themeForm.resetFields();
          themeForm.setFieldsValue(editing ?? { name: "" });
        }}
      >
        <Form<MazeThemeInput> form={themeForm} layout="vertical" onFinish={(values) => void saveTheme(values)}>
          <Form.Item name="name" label="主题文本" rules={[{ required: true }]}><Input maxLength={40} placeholder="例如：DINOSAUR ADVENTURE" /></Form.Item>
          {editing ? (
            <>
              <Space size="large" align="start" style={{ display: "flex" }}>
                <Form.Item name="maze_count" label="迷宫数量" rules={[{ required: true }]}><InputNumber min={1} max={100} precision={0} /></Form.Item>
                <Form.Item name="difficulty" label="难度" rules={[{ required: true }]}><Select style={{ width: 160 }} options={[{ label: "简单", value: "easy" }, { label: "中等", value: "medium" }, { label: "困难", value: "hard" }]} /></Form.Item>
                <Form.Item name="include_answers" label="答案图" rules={[{ required: true }]}><Select style={{ width: 180 }} options={[{ label: "同时生成答案", value: true }, { label: "只生成题目", value: false }]} /></Form.Item>
              </Space>
              <Card
                size="small"
                title={`主题素材（${editing.assets.length}）`}
                extra={(
                  <Space>
                    <Button icon={<EyeOutlined />} loading={previewing} onClick={() => void previewTheme(editing)}>预览生成图</Button>
                    <Button icon={<UploadOutlined />} onClick={() => setAssetTheme(editing)}>添加素材</Button>
                  </Space>
                )}
              >
                <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                  每张迷宫会先选择固定装饰模板，再按标题、四角、侧边、底部和入口/出口槽位填入素材；素材池用于提供变化，不会尽量塞满单张图。
                </Typography.Paragraph>
                {editing.assets.length ? (
                  <Space wrap>
                    {editing.assets.map((asset) => (
                      <Card key={asset.id} size="small" styles={{ body: { padding: 8 } }}>
                        <Image src={assetUrl(asset)} alt={asset.name} width={76} height={76} style={{ objectFit: "contain" }} preview={false} />
                        <div><Tag color={ROLE_META[asset.role].color}>{ROLE_META[asset.role].label}</Tag></div>
                        <div>
                          <Tag>{SIZE_LEVEL_META[asset.size_level]}</Tag>
                          <Tag>{VISUAL_WEIGHT_META[asset.visual_weight]}</Tag>
                        </div>
                        <Typography.Text ellipsis style={{ display: "block", width: 90 }}>{asset.name}</Typography.Text>
                        <Button type="text" size="small" icon={<BulbOutlined />} onClick={() => setPromptContext({ theme: editing, asset })}>生成图提示词</Button>
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingAsset(asset); setAssetTheme(editing); }}>编辑</Button>
                        <Popconfirm title="删除这个素材？" onConfirm={() => void deleteAsset(asset)}><Button type="text" danger size="small" icon={<DeleteOutlined />}>删除</Button></Popconfirm>
                      </Card>
                    ))}
                  </Space>
                ) : <Typography.Text type="secondary">暂无素材，请添加标题、四角或边缘装饰素材。</Typography.Text>}
              </Card>
            </>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title="生成图预览"
        open={Boolean(previewUrl)}
        width={760}
        footer={null}
        onCancel={closePreview}
      >
        {previewUrl ? (
          <div style={{ width: "min(72vh, 100%)", aspectRatio: "1 / 1", margin: "0 auto", border: "1px solid #d9d9d9" }}>
            <Image
              src={previewUrl}
              alt="主题迷宫预览"
              width="100%"
              height="100%"
              style={{ objectFit: "contain", display: "block" }}
              preview={false}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        title={`${editingAsset ? "编辑素材" : "添加素材"}${assetTheme ? ` · ${assetTheme.name}` : ""}`}
        open={Boolean(assetTheme)}
        onCancel={() => { setAssetTheme(null); setEditingAsset(null); }}
        onOk={() => assetForm.submit()}
        afterOpenChange={(open) => {
          if (!open) return;
          assetForm.resetFields();
          assetForm.setFieldsValue(editingAsset ? {
            name: editingAsset.name,
            role: editingAsset.role,
            size_level: editingAsset.size_level,
            slot_allowed: editingAsset.slot_allowed,
            visual_weight: editingAsset.visual_weight,
            file: [],
          } : { role: "corner_medium", size_level: "medium", slot_allowed: ["corner", "side", "bottom"], visual_weight: "normal", file: [] });
        }}
      >
        <Form form={assetForm} layout="vertical" onFinish={(values) => void uploadAsset(values)}>
          <Form.Item name="name" label="素材名称"><Input placeholder="可留空，默认使用文件名" /></Form.Item>
          <Form.Item name="role" label="放置类型" rules={[{ required: true }]}><Select options={Object.entries(ROLE_META).map(([value, meta]) => ({ value, label: meta.label }))} /></Form.Item>
          <Space size="large" align="start" style={{ display: "flex" }}>
            <Form.Item name="size_level" label="尺寸" rules={[{ required: true }]}>
              <Select style={{ width: 120 }} options={Object.entries(SIZE_LEVEL_META).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="visual_weight" label="视觉重量" rules={[{ required: true }]}>
              <Select style={{ width: 140 }} options={Object.entries(VISUAL_WEIGHT_META).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Space>
          <Form.Item name="slot_allowed" label="可用槽位" rules={[{ required: true, message: "请选择至少一个槽位。" }]}>
            <Select mode="multiple" options={Object.entries(SLOT_META).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Button
            icon={<BulbOutlined />}
            style={{ marginBottom: 20 }}
            onClick={() => {
              const name = String(assetForm.getFieldValue("name") ?? "").trim();
              const role = assetForm.getFieldValue("role");
              if (!assetTheme || !name) {
                messageApi.warning("请先填写素材名称。");
                return;
              }
              setPromptContext({ theme: assetTheme, asset: { name, role: role ?? "corner_medium" } });
            }}
          >
            生成图提示词
          </Button>
          <Form.Item
            name="file"
            label={editingAsset ? "替换图片（可选）" : "图片"}
            valuePropName="fileList"
            rules={[{
              validator: (_, value: UploadFile[]) => editingAsset || value?.length
                ? Promise.resolve()
                : Promise.reject(new Error("请选择素材图片")),
            }]}
            getValueFromEvent={(event) => event?.fileList ?? []}
          >
            <Upload accept="image/png,image/jpeg,image/webp" maxCount={1} beforeUpload={() => false}><Button icon={<UploadOutlined />}>{editingAsset ? "选择新图片" : "选择图片"}</Button></Upload>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`生成图提示词${promptContext ? ` · ${promptContext.asset.name}` : ""}`}
        open={Boolean(promptContext)}
        footer={null}
        width={760}
        onCancel={() => setPromptContext(null)}
      >
        {promptContext ? (
          <>
            <Typography.Paragraph
              copyable={{
                text: buildAssetImagePrompt(promptContext.theme, promptContext.asset),
                tooltips: ["复制提示词", "已复制"],
              }}
            >
              当前主题：{promptContext.theme.name}；当前图片：{promptContext.asset.name}。点击右侧图标复制完整提示词。
            </Typography.Paragraph>
            <pre
              style={{
                maxHeight: 520,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "#f7f7f7",
                border: "1px solid #eeeeee",
                borderRadius: 6,
                padding: 16,
                margin: 0,
              }}
            >
              {buildAssetImagePrompt(promptContext.theme, promptContext.asset)}
            </pre>
          </>
        ) : null}
      </Modal>
    </>
  );
}
