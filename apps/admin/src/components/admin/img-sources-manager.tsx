"use client";

import { DownloadOutlined, EyeOutlined, PlusOutlined, SwapOutlined, UploadOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Upload,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile, UploadProps } from "antd/es/upload/interface";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ActiveListItem,
  CategoryRecord,
  GeneratedVideoRecord,
  ImgListItem,
  ImgSourceListItem,
  PinPublishCycleRecord,
  PoseSourceListItem,
  VideoPublishCycleRecord,
} from "@/lib/admin-types";
import {
  buildCategoryCutoutSourcePreviewUrl,
  replaceGeneratedCutImgsWithClientOutput,
  uploadGeneratedCategoryImgFile,
} from "@/lib/category-cutout-client";
import { getCopyPromptTextForImgSource } from "@/lib/img-source-prompt-generation";
import {
  buildOutlineVariantPrompt,
  buildSceneColorVariantPrompt,
} from "@/lib/google-image-variant-test";
import { buildPinterestImageFileName } from "@/lib/pinterest-file-name";

type ImgSourcesManagerProps = {
  categoryId?: number;
  showPromptButtons?: boolean;
};

type PoseSourceListResponse = {
  items: PoseSourceListItem[];
};

type ImgSourceListResponse = {
  items: ImgSourceListItem[];
};

type ImgListResponse = {
  items: ImgListItem[];
};

type ActiveListResponse = {
  items: ActiveListItem[];
};

type CategoryListResponse = {
  flat: CategoryRecord[];
};

type VideoCycleListResponse = {
  items: VideoPublishCycleRecord[];
};

type PinCycleListResponse = {
  items: PinPublishCycleRecord[];
};

type PoseTitleFormValues = {
  pose_title?: string;
  pose_title_zh?: string;
};

type UploadedSourceFile = {
  image_url: string;
  local_file_path: string;
  file_name: string;
};

type GenerateImgResponse = {
  items?: ImgListItem[];
  generated_count?: number;
  drafted_count?: number;
  deleted_count?: number;
  error?: string;
};
type GeneratedVideoResponse = GeneratedVideoRecord & {
  audio_file_used?: boolean;
};

type ImgSourceKind = ImgSourceListItem["source_kind"];
type PoseSourceKindRecord = PoseSourceListItem["color"];
type GenerateVariant = "coloring" | "tracing" | "cut" | "numbers" | "grid";
type GeneratedImgFilter = GenerateVariant;
type PinVariant = "long" | "coloring" | "play" | "count" | "cutout" | "tracing";
type PoseTableRow = PoseSourceListItem & {
  currentSource: PoseSourceKindRecord;
  source_kind: ImgSourceKind;
};
type PinCopy = {
  title: string;
  description: string;
  link: string;
  board: string;
  section: string;
  altText: string;
  tags: string[];
};
type PinPreviewItem = {
  key: PinVariant;
  label: string;
  fileName: string;
  dataUrl: string;
  width: number;
  height: number;
  copy: PinCopy;
};

const { Text } = Typography;

const PRINTLYKIDDO_SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_PRINTLYKIDDO_SITE_URL?.trim() || "https://printlykiddo.com"
).replace(/\/+$/u, "");
const VIDEO_AUDIO_ACCEPT = "audio/*,.aac,.flac,.m4a,.mp3,.mp4,.ogg,.wav,.webm";
const VIDEO_AUDIO_MAX_SIZE = 80 * 1024 * 1024;

const SOURCE_KIND_META: Record<
  ImgSourceKind,
  {
    label: string;
    generateButtonText: string;
    confirmTitle: string;
    confirmDescription: string;
    variants: GenerateVariant[];
  }
> = {
  outline: {
    label: "线框图",
    generateButtonText: "生成",
    confirmTitle: "确认重生成该线框图对应的功能图吗？",
    confirmDescription: "会删除当前分类下对应功能的旧图，再基于这张线框图重新生成。",
    variants: ["coloring", "tracing"],
  },
  color: {
    label: "彩图",
    generateButtonText: "生成",
    confirmTitle: "确认重生成该彩图对应的功能图吗？",
    confirmDescription: "会删除当前分类下对应功能的旧图，再基于这张彩图重新生成。",
    variants: ["cut"],
  },
  scene_color: {
    label: "带背景彩图",
    generateButtonText: "生成",
    confirmTitle: "确认重生成该带背景彩图对应的功能图吗？",
    confirmDescription: "会删除当前分类下对应功能的旧图，再基于这张带背景彩图重新生成。",
    variants: ["numbers", "grid"],
  },
};

const GENERATED_IMG_FILTER_META: Record<
  GeneratedImgFilter,
  {
    label: string;
    activeSlug: string;
  }
> = {
  cut: { label: "剪纸图", activeSlug: "cut" },
  numbers: { label: "数字拼图", activeSlug: "number-sequencing" },
  grid: { label: "网格拼图", activeSlug: "grid-puzzles" },
  coloring: { label: "涂色图", activeSlug: "coloring-pages" },
  tracing: { label: "描红图", activeSlug: "tracing-worksheets" },
};

const PIN_BG_COLOR = "#F0F7F7";
const PIN_CARD_COLOR = "#FFFFFF";
const PIN_TEXT_COLOR = "#2D3436";
const PIN_BORDER_COLOR = "#E3E7EA";

const PIN_VARIANT_META: Record<PinVariant, { label: string; width: number; height: number }> = {
  long: { label: "A 全家桶", width: 1000, height: 2100 },
  count: { label: "B 数条拼图", width: 1000, height: 1500 },
  coloring: { label: "C 涂色线稿", width: 1000, height: 1500 },
  play: { label: "D 网格拼图", width: 1000, height: 1500 },
  cutout: { label: "E 剪纸", width: 1000, height: 1500 },
  tracing: { label: "F 描红", width: 1000, height: 1500 },
};

const PIN_WORKSHEET_NO_REFERENCE_BOX = {
  x: 30,
  y: 260,
  width: 940,
  height: 940,
};

function toTitleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function clampPinText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const sliced = normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  return `${sliced}…`;
}

function buildCategorySlugPath(categoryId: number, flat: CategoryRecord[], fallbackSlug: string) {
  const categoryMap = new Map(flat.map((category) => [category.id, category]));
  const segments: string[] = [];
  const seen = new Set<number>();
  let current = categoryMap.get(categoryId) ?? null;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.slug.trim()) {
      segments.unshift(current.slug.trim());
    }
    current = current.parent_id ? categoryMap.get(current.parent_id) ?? null : null;
  }

  if (segments.length) {
    return segments.join("/");
  }

  return fallbackSlug.trim() || "printable";
}

type PinCategoryContext = {
  primary: string;
  secondary: string;
  subject: string;
};

function buildPinCategoryContext(
  categoryId: number,
  flat: CategoryRecord[],
  fallbackSubject: string,
): PinCategoryContext {
  const categoryMap = new Map(flat.map((category) => [category.id, category]));
  const path: CategoryRecord[] = [];
  const seen = new Set<number>();
  let current = categoryMap.get(categoryId) ?? null;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent_id ? categoryMap.get(current.parent_id) ?? null : null;
  }

  return {
    primary: path[0]?.name?.trim() || "Printables",
    secondary: path[1]?.name?.trim() || "",
    subject: path.at(-1)?.name?.trim() || fallbackSubject,
  };
}

function buildPinTitle(title: string) {
  return clampPinText(title, 100);
}

function cleanPinTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.toLowerCase().trim()).filter(Boolean))].slice(0, 10);
}

function buildPinterestCopy(input: {
  variant: PinVariant;
  category: PinCategoryContext;
  link: string;
}): PinCopy {
  const { primary, secondary, subject } = input.category;
  const titleSubject = toTitleCase(subject);
  const lowerSubject = subject.toLowerCase();
  const lowerSecondary = secondary.toLowerCase();
  const section = secondary || primary;
  const collectionPhrase = secondary ? ` from our ${lowerSecondary} collection` : "";

  if (input.variant === "long") {
    return {
      title: buildPinTitle(`Free Printable ${titleSubject} Activity Pack for Kids`),
      description: clampPinText(
        `Free printable ${lowerSubject} activity pack for kids${collectionPhrase}. Includes coloring, tracing, cut-out, number sequencing, and grid puzzle pages for preschool and kindergarten.`,
        240,
      ),
      link: input.link,
      board: "Free Printable Activities for Kids",
      section,
      altText: clampPinText(
        `Printable ${lowerSubject} activity pack preview with coloring, tracing, number puzzle, grid puzzle, and cut-out activity pages.`,
        220,
      ),
      tags: cleanPinTags([
        `${lowerSubject} activity pack`,
        `free printable ${lowerSubject}`,
        `${lowerSubject} activities`,
        "printable activity pack",
        "printable activities for kids",
        "free printables",
        "kids activities",
        "preschool worksheets",
        "kindergarten worksheets",
        "classroom activities",
      ]),
    };
  }

  if (input.variant === "coloring") {
    return {
      title: buildPinTitle(`Free Printable ${titleSubject} Coloring Page for Kids`),
      description: clampPinText(
        `Free printable ${lowerSubject} coloring page for kids. A simple coloring worksheet for preschool, kindergarten, classroom centers, and quiet time.`,
        220,
      ),
      link: input.link,
      board: "Free Coloring Pages for Kids",
      section,
      altText: clampPinText(
        `Black-and-white printable ${lowerSubject} coloring page for kids.`,
        220,
      ),
      tags: cleanPinTags([
        `${lowerSubject} coloring page`,
        `${lowerSubject} coloring pages`,
        `printable ${lowerSubject} coloring page`,
        `free printable ${lowerSubject}`,
        "printable coloring pages",
        "kids coloring pages",
        "preschool coloring page",
        "kindergarten coloring page",
        "free coloring pages",
      ]),
    };
  }

  if (input.variant === "tracing") {
    return {
      title: buildPinTitle(`Free Printable ${titleSubject} Tracing Worksheet for Kids`),
      description: clampPinText(
        `Free printable ${lowerSubject} tracing worksheet for kids. A simple pre-writing and pen control activity for preschool and kindergarten.`,
        220,
      ),
      link: input.link,
      board: "Free Tracing Worksheets for Kids",
      section,
      altText: clampPinText(
        `Printable ${lowerSubject} tracing worksheet for kids with light practice lines.`,
        220,
      ),
      tags: cleanPinTags([
        `${lowerSubject} tracing worksheet`,
        `${lowerSubject} tracing`,
        `printable ${lowerSubject} tracing worksheet`,
        `free printable ${lowerSubject}`,
        "pre writing worksheets",
        "pen control worksheet",
        "tracing worksheets",
        "fine motor skills",
        "preschool worksheets",
        "kindergarten worksheets",
      ]),
    };
  }

  if (input.variant === "play") {
    return {
      title: buildPinTitle(`Free Printable ${titleSubject} Grid Puzzle for Kids`),
      description: clampPinText(
        `Free printable ${lowerSubject} grid puzzle for kids. A simple cut-and-match activity for visual logic, problem solving, and fine motor practice.`,
        220,
      ),
      link: input.link,
      board: "Free Logic & Grid Puzzles",
      section,
      altText: clampPinText(
        `Printable ${lowerSubject} grid puzzle worksheet with cut-and-match picture pieces.`,
        220,
      ),
      tags: cleanPinTags([
        `${lowerSubject} grid puzzle`,
        `printable ${lowerSubject} grid puzzle`,
        `${lowerSubject} puzzle`,
        `free printable ${lowerSubject}`,
        "logic puzzle for kids",
        "printable puzzle",
        "cut and paste worksheet",
        "educational games",
        "kids activities",
        "fine motor skills",
      ]),
    };
  }

  if (input.variant === "cutout") {
    return {
      title: buildPinTitle(`Free Printable ${titleSubject} Cut-Out Activity for Kids`),
      description: clampPinText(
        `Free printable ${lowerSubject} cut-out activity for kids. A simple scissor skills worksheet for preschool, kindergarten, and winter animal crafts.`,
        220,
      ),
      link: input.link,
      board: "Free Cut-Out Activities for Kids",
      section,
      altText: clampPinText(
        `Printable ${lowerSubject} cut-out worksheet for kids with dashed cutting lines for scissor skills practice.`,
        220,
      ),
      tags: cleanPinTags([
        `${lowerSubject} cut out`,
        `${lowerSubject} cut out activity`,
        `printable ${lowerSubject} cut out`,
        `free printable ${lowerSubject}`,
        "animal cut out",
        "scissor skills worksheets",
        "cutting practice",
        "preschool cutting practice",
        "paper crafts for kids",
        "fine motor skills",
      ]),
    };
  }

  return {
    title: buildPinTitle(`Free Printable ${titleSubject} Number Sequencing Puzzle`),
    description: clampPinText(
      `Free printable ${lowerSubject} number sequencing puzzle for kids. Order the numbered strips from 1 to 10 for counting, number order, and fine motor practice.`,
      220,
    ),
    link: input.link,
    board: "Free Number Sequencing Puzzles",
    section,
    altText: clampPinText(
      `Printable ${lowerSubject} number sequencing puzzle with picture strips numbered 1 to 10.`,
      220,
    ),
    tags: cleanPinTags([
      `${lowerSubject} number puzzle`,
      `${lowerSubject} number sequencing puzzle`,
      `printable ${lowerSubject} number sequencing puzzle`,
      `free printable ${lowerSubject}`,
      "number puzzle 1-10",
      "number sequencing puzzle",
      "preschool math",
      "counting activity",
      "educational printables",
      "fine motor skills",
    ]),
  };
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      return;
    }
    lines.push(line);
    line = word;
  });

  if (line) {
    lines.push(line);
  }

  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawPaperImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: {
    radius?: number;
    background?: string;
    shadowBlur?: number;
    shadowOffsetY?: number;
    imageScale?: number;
    imageFilter?: string;
    imageAlpha?: number;
    fit?: "contain" | "cover";
  },
) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.08)";
  ctx.shadowBlur = options?.shadowBlur ?? 12;
  ctx.shadowOffsetY = options?.shadowOffsetY ?? 4;
  ctx.fillStyle = options?.background ?? PIN_CARD_COLOR;
  drawRoundedRect(ctx, x, y, width, height, options?.radius ?? 18);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = PIN_BORDER_COLOR;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.clip();

  const fitMode = options?.fit ?? "contain";
  const fitScale =
    fitMode === "cover"
      ? Math.max(width / image.naturalWidth, height / image.naturalHeight)
      : Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const requestedScale = options?.imageScale ?? 1;
  const imageScale = fitMode === "cover" ? requestedScale : Math.min(requestedScale, 1);
  const scale = fitScale * imageScale;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.filter = options?.imageFilter ?? "none";
  ctx.globalAlpha = options?.imageAlpha ?? 1;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}

function drawPinTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  top: number,
  options?: { fontSize?: number; minFontSize?: number; maxLines?: number; boxHeight?: number },
) {
  const normalizedText = text.trim();
  const maxWidth = width - 140;
  const minFontSize = options?.minFontSize ?? 34;
  let fontSize = options?.fontSize ?? 58;
  let lineHeight = fontSize * 1.08;
  let lines: string[] = [];

  ctx.save();
  ctx.fillStyle = PIN_TEXT_COLOR;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  while (fontSize >= minFontSize) {
    ctx.font = `700 ${fontSize}px Inter, Montserrat, Arial, sans-serif`;
    lines = wrapCanvasText(ctx, normalizedText, maxWidth);
    const allLinesFit = lines.every((line) => ctx.measureText(line).width <= maxWidth);
    if (lines.length <= (options?.maxLines ?? 3) && allLinesFit) {
      break;
    }
    fontSize -= 2;
  }

  lineHeight = fontSize * 1.08;
  ctx.font = `700 ${fontSize}px Inter, Montserrat, Arial, sans-serif`;
  const visibleLines = lines.slice(0, options?.maxLines ?? 3);
  const blockHeight = visibleLines.length * lineHeight;
  const y = top + Math.max(0, ((options?.boxHeight ?? blockHeight) - blockHeight) / 2);
  visibleLines.forEach((line, index) => {
    ctx.fillText(line, width / 2, y + index * lineHeight);
  });
  ctx.restore();
}

function drawPinBrand(ctx: CanvasRenderingContext2D, width: number, y: number) {
  ctx.save();
  ctx.fillStyle = PIN_TEXT_COLOR;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 31px Inter, Montserrat, Arial, sans-serif";
  ctx.fillText("Get Free PDFs at PrintlyKiddo.com", width / 2, y);
  ctx.restore();
}

function drawPinLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number) {
  ctx.save();
  ctx.fillStyle = PIN_TEXT_COLOR;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "800 28px Inter, Montserrat, Arial, sans-serif";
  ctx.fillText(text, x + width / 2, y);
  ctx.restore();
}

async function loadPinImage(url: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return image;
}

async function buildPosePinPreviews(input: {
  row: PoseSourceListItem;
  link: string;
  category: PinCategoryContext;
  assets: {
    color?: string;
    sceneColor?: string;
    outline?: string;
    coloring?: string;
    tracing?: string;
    cut?: string;
    numbers?: string;
    grid?: string;
  };
}) {
  const subject = toTitleCase(input.category.subject || input.row.category_name || "Printable");
  const copyByVariant = (variant: PinVariant) =>
    buildPinterestCopy({
      variant,
      category: input.category,
      link: input.link,
    });
  const sourceImages = await Promise.all(
    Object.entries(input.assets)
      .filter((entry): entry is [keyof typeof input.assets, string] => Boolean(entry[1]))
      .map(async ([key, url]) => [key, await loadPinImage(url)] as const),
  );
  const images = new Map(sourceImages);
  const getExactImage = (key: keyof typeof input.assets) => images.get(key);
  const getImage = (key: keyof typeof input.assets) =>
    images.get(key) ?? images.get("color") ?? images.get("sceneColor") ?? images.get("outline");

  const render = (variant: PinVariant) => {
    const meta = PIN_VARIANT_META[variant];
    const canvas = document.createElement("canvas");
    canvas.width = meta.width;
    canvas.height = meta.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("当前浏览器不支持 Canvas。");
    }

    ctx.fillStyle = PIN_BG_COLOR;
    ctx.fillRect(0, 0, meta.width, meta.height);
    ctx.fillStyle = PIN_TEXT_COLOR;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (variant === "long") {
      drawPinTitle(ctx, `${subject} Activity Pack`, 1000, 48, { fontSize: 54, minFontSize: 34, maxLines: 3, boxHeight: 145 });
      const hero = getExactImage("color") ?? getImage("color") ?? getImage("sceneColor");
      if (hero) drawPaperImage(ctx, hero, 90, 245, 820, 560, { radius: 12 });

      const matrix: Array<[keyof typeof input.assets, string]> = [
        ["coloring", "Coloring"],
        ["numbers", "Counting"],
        ["grid", "Puzzle"],
        ["tracing", "Tracing"],
      ];
      matrix.forEach(([key, label], index) => {
        const image = getExactImage(key) ?? getImage(key);
        const x = index % 2 === 0 ? 90 : 530;
        const y = index < 2 ? 915 : 1335;
        if (image) {
          drawPaperImage(ctx, image, x, y, 380, 330, {
            radius: 12,
            imageScale: 1.04,
            fit: key === "numbers" || key === "grid" ? "cover" : "contain",
          });
        }
        drawPinLabel(ctx, label, x, y + 350, 380);
      });
      drawPinBrand(ctx, 1000, 2000);
    } else if (variant === "coloring") {
      const outline = getExactImage("coloring") ?? getExactImage("outline") ?? getImage("outline");
      drawPinTitle(ctx, `${subject} Coloring Page`, 1000, 20, { fontSize: 46, minFontSize: 32, maxLines: 3, boxHeight: 120 });
      if (outline) {
        drawPaperImage(
          ctx,
          outline,
          PIN_WORKSHEET_NO_REFERENCE_BOX.x,
          PIN_WORKSHEET_NO_REFERENCE_BOX.y,
          PIN_WORKSHEET_NO_REFERENCE_BOX.width,
          PIN_WORKSHEET_NO_REFERENCE_BOX.height,
          { radius: 12 },
        );
      }
      drawPinBrand(ctx, 1000, 1435);
    } else if (variant === "tracing") {
      const tracing = getExactImage("tracing") ?? getExactImage("outline") ?? getImage("outline");
      drawPinTitle(ctx, `${subject} Tracing Worksheet`, 1000, 20, { fontSize: 46, minFontSize: 32, maxLines: 3, boxHeight: 120 });
      if (tracing) {
        drawPaperImage(
          ctx,
          tracing,
          PIN_WORKSHEET_NO_REFERENCE_BOX.x,
          PIN_WORKSHEET_NO_REFERENCE_BOX.y,
          PIN_WORKSHEET_NO_REFERENCE_BOX.width,
          PIN_WORKSHEET_NO_REFERENCE_BOX.height,
          { radius: 12 },
        );
      }
      drawPinBrand(ctx, 1000, 1435);
    } else if (variant === "play") {
      const grid = getImage("grid");
      drawPinTitle(ctx, `${subject} Grid Puzzle`, 1000, 20, { fontSize: 46, minFontSize: 32, maxLines: 3, boxHeight: 120 });
      if (grid) {
        drawPaperImage(
          ctx,
          grid,
          PIN_WORKSHEET_NO_REFERENCE_BOX.x,
          PIN_WORKSHEET_NO_REFERENCE_BOX.y,
          PIN_WORKSHEET_NO_REFERENCE_BOX.width,
          PIN_WORKSHEET_NO_REFERENCE_BOX.height,
          { radius: 12, fit: "cover" },
        );
      }
      drawPinBrand(ctx, 1000, 1435);
    } else if (variant === "cutout") {
      const cut = getExactImage("cut") ?? getImage("cut");
      drawPinTitle(ctx, `${subject} Cut-Out Activity`, 1000, 20, { fontSize: 46, minFontSize: 32, maxLines: 3, boxHeight: 120 });
      if (cut) {
        drawPaperImage(
          ctx,
          cut,
          PIN_WORKSHEET_NO_REFERENCE_BOX.x,
          PIN_WORKSHEET_NO_REFERENCE_BOX.y,
          PIN_WORKSHEET_NO_REFERENCE_BOX.width,
          PIN_WORKSHEET_NO_REFERENCE_BOX.height,
          { radius: 12, fit: "cover" },
        );
      }
      drawPinBrand(ctx, 1000, 1435);
    } else {
      const numbers = getImage("numbers") ?? getImage("grid");
      drawPinTitle(ctx, `${subject} Number Puzzle`, 1000, 20, { fontSize: 46, minFontSize: 32, maxLines: 3, boxHeight: 120 });
      if (numbers) {
        drawPaperImage(
          ctx,
          numbers,
          PIN_WORKSHEET_NO_REFERENCE_BOX.x,
          PIN_WORKSHEET_NO_REFERENCE_BOX.y,
          PIN_WORKSHEET_NO_REFERENCE_BOX.width,
          PIN_WORKSHEET_NO_REFERENCE_BOX.height,
          { radius: 12, fit: "cover" },
        );
      }
      drawPinBrand(ctx, 1000, 1435);
    }

    return {
      key: variant,
      label: meta.label,
      fileName: buildPinterestImageFileName({
        subject,
        variant,
        descriptor: input.row.pose_key,
      }),
      dataUrl: canvas.toDataURL("image/png"),
      width: meta.width,
      height: meta.height,
      copy: copyByVariant(variant),
    };
  };

  return (["long", "count", "coloring", "tracing", "play", "cutout"] as PinVariant[]).map(render);
}

function resolveGeneratedVariantByActiveSlug(activeSlug?: string | null) {
  const matched = (Object.entries(GENERATED_IMG_FILTER_META) as Array<
    [GeneratedImgFilter, (typeof GENERATED_IMG_FILTER_META)[GeneratedImgFilter]]
  >).find(([, meta]) => meta.activeSlug === activeSlug);
  return matched?.[0] ?? null;
}

function buildSourcePreviewUrl(record: Pick<PoseSourceKindRecord, "image_url">) {
  return buildCategoryCutoutSourcePreviewUrl(record);
}

function buildGeneratedImgPreviewUrl(record: ImgListItem) {
  if (record.file_sync_status === "draft") {
    return null;
  }

  const searchParams = new URLSearchParams();

  if (record.image_url?.trim()) {
    searchParams.set("path", record.image_url.trim());
  }

  if (record.local_file_path?.trim()) {
    searchParams.set("local_file_path", record.local_file_path.trim());
  }

  return searchParams.size ? `/api/admin/imgs/preview?${searchParams.toString()}` : null;
}

function getBaseName(filePath?: string | null) {
  if (!filePath?.trim()) {
    return "";
  }
  const normalized = filePath.replaceAll("\\", "/");
  return normalized.split("/").pop() || normalized;
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/u, "");
}

function getPoseDisplayInfo(record: Pick<PoseSourceListItem, "pose_title" | "pose_title_zh">) {
  if (record.pose_title?.trim()) {
    return record.pose_title.trim();
  }
  if (record.pose_title_zh?.trim()) {
    return record.pose_title_zh.trim();
  }
  return "未设置姿态词";
}

function getSourceDisplayInfo(record: Pick<PoseSourceKindRecord, "local_file_path" | "prompt_group">) {
  const fileName = getBaseName(record.local_file_path);
  if (fileName) {
    return stripExtension(fileName);
  }
  return record.prompt_group?.trim() || "未命名原始图";
}

function hasUploadedSource(record: Pick<PoseSourceKindRecord, "image_url" | "local_file_path"> | null | undefined) {
  return Boolean(record?.image_url?.trim() && record?.local_file_path?.trim());
}

function getPoseSourceByKind(record: PoseSourceListItem, sourceKind: ImgSourceKind) {
  if (sourceKind === "outline") {
    return record.outline;
  }
  if (sourceKind === "scene_color") {
    return record.scene_color;
  }
  return record.color;
}

export function ImgSourcesManager({ categoryId, showPromptButtons = true }: ImgSourcesManagerProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [poseForm] = Form.useForm<PoseTitleFormValues>();
  const [poseItems, setPoseItems] = useState<PoseSourceListItem[]>([]);
  const [sourceItems, setSourceItems] = useState<ImgSourceListItem[]>([]);
  const [actives, setActives] = useState<ActiveListItem[]>([]);
  const [categoryFlat, setCategoryFlat] = useState<CategoryRecord[]>([]);
  const [generatedImgs, setGeneratedImgs] = useState<ImgListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [sourceKindFilter, setSourceKindFilter] = useState<ImgSourceKind>("color");
  const [generatedImgFilter, setGeneratedImgFilter] = useState<GeneratedImgFilter>("cut");
  const [editingPoseRecord, setEditingPoseRecord] = useState<PoseSourceListItem | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinPreviewItems, setPinPreviewItems] = useState<PinPreviewItem[]>([]);
  const [pinGenerating, setPinGenerating] = useState(false);
  const [pinModalTitle, setPinModalTitle] = useState("Pin 图预览");
  const [pinSaving, setPinSaving] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoPoseForModal, setVideoPoseForModal] = useState<PoseSourceListItem | null>(null);
  const [cycleTab, setCycleTab] = useState<"pin" | "video">("pin");
  const [pinCycles, setPinCycles] = useState<PinPublishCycleRecord[]>([]);
  const [videoCycles, setVideoCycles] = useState<VideoPublishCycleRecord[]>([]);
  const [loadingPinCycles, setLoadingPinCycles] = useState(false);
  const [loadingVideoCycles, setLoadingVideoCycles] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatingVideoPoseId, setGeneratingVideoPoseId] = useState<number | null>(null);
  const [selectedPinCycleId, setSelectedPinCycleId] = useState<number | null>(null);
  const [selectedVideoCycleId, setSelectedVideoCycleId] = useState<number | null>(null);
  const [selectedVideoAudioFile, setSelectedVideoAudioFile] = useState<File | null>(null);
  const [selectedVideoAudioFileList, setSelectedVideoAudioFileList] = useState<UploadFile[]>([]);
  /** 与 VideoCycleManager 一致：Modal Portal 延后到客户端，避免 SSR hydration 不一致 */
  const [videoModalMounted, setVideoModalMounted] = useState(false);

  useEffect(() => {
    setVideoModalMounted(true);
  }, []);

  const fetchData = useCallback(async () => {
    if (!categoryId) {
      setPoseItems([]);
      setSourceItems([]);
      setActives([]);
      setCategoryFlat([]);
      setGeneratedImgs([]);
      return;
    }

    setLoading(true);
    try {
      const [poseResponse, sourcesResponse, imgsResponse, activesResponse, categoriesResponse] = await Promise.all([
        fetch(`/api/admin/pose-sources?category_id=${categoryId}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/img-sources?category_id=${categoryId}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/imgs?category_id=${categoryId}`, {
          cache: "no-store",
        }),
        fetch("/api/admin/actives", {
          cache: "no-store",
        }),
        fetch("/api/admin/categories", {
          cache: "no-store",
        }),
      ]);
      const [poseData, sourcesData, imgsData, activesData, categoriesData] = (await Promise.all([
        poseResponse.json(),
        sourcesResponse.json(),
        imgsResponse.json(),
        activesResponse.json(),
        categoriesResponse.json(),
      ])) as [
        PoseSourceListResponse | { error?: string },
        ImgSourceListResponse | { error?: string },
        ImgListResponse | { error?: string },
        ActiveListResponse | { error?: string },
        CategoryListResponse | { error?: string },
      ];

      if (!poseResponse.ok || !("items" in poseData)) {
        throw new Error("error" in poseData ? poseData.error : "获取姿态列表失败。");
      }

      if (!sourcesResponse.ok || !("items" in sourcesData)) {
        throw new Error("error" in sourcesData ? sourcesData.error : "获取原始图列表失败。");
      }

      if (!imgsResponse.ok || !("items" in imgsData)) {
        throw new Error("error" in imgsData ? imgsData.error : "获取功能图片失败。");
      }

      if (!activesResponse.ok || !("items" in activesData)) {
        throw new Error("error" in activesData ? activesData.error : "获取功能列表失败。");
      }

      if (!categoriesResponse.ok || !("flat" in categoriesData)) {
        throw new Error("error" in categoriesData ? categoriesData.error : "获取分类列表失败。");
      }

      setPoseItems(poseData.items);
      setSourceItems(sourcesData.items);
      setGeneratedImgs(imgsData.items);
      setActives(activesData.items);
      setCategoryFlat(categoriesData.flat);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "获取分类图片数据失败。");
    } finally {
      setLoading(false);
    }
  }, [categoryId, messageApi]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handleLocalChanges = () => {
      void fetchData();
    };

    window.addEventListener("admin-local-changes", handleLocalChanges);
    return () => {
      window.removeEventListener("admin-local-changes", handleLocalChanges);
    };
  }, [fetchData]);

  useEffect(() => {
    if (!editingPoseRecord) {
      return;
    }

    poseForm.setFieldsValue({
      pose_title: editingPoseRecord.pose_title ?? "",
      pose_title_zh: editingPoseRecord.pose_title_zh ?? "",
    });
  }, [editingPoseRecord, poseForm]);

  const fetchVideoCycles = useCallback(async () => {
    setLoadingVideoCycles(true);
    try {
      const response = await fetch("/api/admin/video-cycles", { cache: "no-store" });
      const data = (await response.json()) as VideoCycleListResponse | { error?: string };
      if (!response.ok || !("items" in data)) {
        throw new Error("error" in data ? data.error : "获取视频周期失败。");
      }

      setVideoCycles(data.items);
      setSelectedVideoCycleId((current) => current ?? data.items[0]?.id ?? null);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "获取视频周期失败。");
    } finally {
      setLoadingVideoCycles(false);
    }
  }, [messageApi]);

  const fetchPinCycles = useCallback(async () => {
    setLoadingPinCycles(true);
    try {
      const response = await fetch("/api/admin/pin-publish-cycles", { cache: "no-store" });
      const data = (await response.json()) as PinCycleListResponse | { error?: string };
      if (!response.ok || !("items" in data)) {
        throw new Error("error" in data ? data.error : "获取图片周期失败。");
      }

      setPinCycles(data.items);
      setSelectedPinCycleId((current) => current ?? data.items[0]?.id ?? null);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "获取图片周期失败。");
    } finally {
      setLoadingPinCycles(false);
    }
  }, [messageApi]);

  const handleOpenCycleModal = useCallback(
    (record: PoseSourceListItem) => {
      if (!categoryId) {
        messageApi.warning("请先保存当前三级分类，再管理周期。");
        return;
      }

      setVideoPoseForModal(record);
      setVideoModalOpen(true);
      setCycleTab("pin");
      setSelectedVideoAudioFile(null);
      setSelectedVideoAudioFileList([]);
      void fetchPinCycles();
      void fetchVideoCycles();
    },
    [categoryId, fetchPinCycles, fetchVideoCycles, messageApi],
  );

  const handleCloseCycleModal = useCallback(() => {
    setVideoModalOpen(false);
    setSelectedVideoAudioFile(null);
    setSelectedVideoAudioFileList([]);
  }, []);

  const videoAudioUploadProps = useMemo<UploadProps>(
    () => ({
      accept: VIDEO_AUDIO_ACCEPT,
      beforeUpload: (file) => {
        const fileType = file.type.toLowerCase();
        const isSupported =
          fileType.startsWith("audio/") ||
          fileType === "video/mp4" ||
          /\.(aac|flac|m4a|mp3|mp4|ogg|wav|webm)$/iu.test(file.name);
        if (!isSupported) {
          messageApi.warning("请上传常见音频文件。");
          return Upload.LIST_IGNORE;
        }
        if (file.size > VIDEO_AUDIO_MAX_SIZE) {
          messageApi.warning("音乐文件不能超过 80MB。");
          return Upload.LIST_IGNORE;
        }

        setSelectedVideoAudioFile(file);
        setSelectedVideoAudioFileList([
          {
            uid: file.uid,
            name: file.name,
            status: "done",
            size: file.size,
            type: file.type,
          },
        ]);
        return false;
      },
      fileList: selectedVideoAudioFileList,
      maxCount: 1,
      onChange: (info) => {
        const latestFile = info.fileList.at(-1);
        const originFile = latestFile?.originFileObj;
        if (originFile instanceof File) {
          setSelectedVideoAudioFile(originFile);
        }
      },
      onRemove: () => {
        setSelectedVideoAudioFile(null);
        setSelectedVideoAudioFileList([]);
        return true;
      },
    }),
    [messageApi, selectedVideoAudioFileList],
  );

  const activeNameById = useMemo(
    () => new Map(actives.map((active) => [active.id, active.name])),
    [actives],
  );
  const activeSlugById = useMemo(
    () => new Map(actives.map((active) => [active.id, active.slug])),
    [actives],
  );
  const sourceById = useMemo(
    () => new Map(sourceItems.map((item) => [item.id, item])),
    [sourceItems],
  );
  const findGeneratedPreviewUrl = useCallback(
    (sourceId: number | null, variant: GenerateVariant) => {
      if (!sourceId) {
        return null;
      }

      const source = sourceById.get(sourceId);
      if (!source) {
        return null;
      }

      const expectedActiveSlug = GENERATED_IMG_FILTER_META[variant].activeSlug;
      const matched = generatedImgs.find(
        (item) =>
          source.generated_img_ids.includes(item.id) &&
          activeSlugById.get(item.active_id) === expectedActiveSlug,
      );

      return matched ? buildGeneratedImgPreviewUrl(matched) : null;
    },
    [activeSlugById, generatedImgs, sourceById],
  );
  const handleConfirmGeneratePin = useCallback(async () => {
    if (!videoPoseForModal) {
      messageApi.warning("未选择姿态。");
      return;
    }
    if (!categoryId || !selectedPinCycleId) {
      messageApi.warning("请选择要保存到的图片周期。");
      return;
    }

    setPinSaving(true);
    setPinModalTitle(`${videoPoseForModal.category_name} · ${getPoseDisplayInfo(videoPoseForModal)}`);
    setPinModalOpen(true);
    setPinGenerating(true);
    setPinPreviewItems([]);

    try {
      const slugPath = buildCategorySlugPath(
        videoPoseForModal.category_id,
        categoryFlat,
        videoPoseForModal.category_slug,
      );
      const category = buildPinCategoryContext(
        videoPoseForModal.category_id,
        categoryFlat,
        videoPoseForModal.category_name || "Printable",
      );
      const link = `${PRINTLYKIDDO_SITE_ORIGIN}/${slugPath}`;
      const assets = {
        color: buildSourcePreviewUrl(videoPoseForModal.color) ?? undefined,
        sceneColor: buildSourcePreviewUrl(videoPoseForModal.scene_color) ?? undefined,
        outline: buildSourcePreviewUrl(videoPoseForModal.outline) ?? undefined,
        coloring: findGeneratedPreviewUrl(videoPoseForModal.outline.source_id, "coloring") ?? undefined,
        tracing: findGeneratedPreviewUrl(videoPoseForModal.outline.source_id, "tracing") ?? undefined,
        cut: findGeneratedPreviewUrl(videoPoseForModal.color.source_id, "cut") ?? undefined,
        numbers: findGeneratedPreviewUrl(videoPoseForModal.scene_color.source_id, "numbers") ?? undefined,
        grid: findGeneratedPreviewUrl(videoPoseForModal.scene_color.source_id, "grid") ?? undefined,
      };

      if (!Object.values(assets).some(Boolean)) {
        messageApi.warning("当前姿态还没有可用于生成 Pin 的原始图或功能图。");
        setPinModalOpen(false);
        return;
      }

      const items = await buildPosePinPreviews({ row: videoPoseForModal, link, category, assets });
      const response = await fetch(`/api/admin/categories/${videoPoseForModal.category_id}/pin-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycle_id: selectedPinCycleId,
          pose_id: videoPoseForModal.id,
          items: items.map((item) => ({
            variant_key: item.key,
            label: item.label,
            image_url: item.dataUrl,
            title: item.copy.title,
            description: item.copy.description,
            link: item.copy.link,
            board: item.copy.board,
            section: item.copy.section,
            alt_text: item.copy.altText,
            tags: item.copy.tags,
          })),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok || data.error) {
        throw new Error(data.error || "保存 Pin 图文到周期失败。");
      }

      setPinPreviewItems(items);
      handleCloseCycleModal();
      setVideoPoseForModal(null);
      messageApi.success("Pin 图文已保存到图片周期。");
      window.dispatchEvent(new CustomEvent("admin-local-changes"));
      await fetchData();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "生成并保存 Pin 失败。");
      setPinModalOpen(false);
    } finally {
      setPinGenerating(false);
      setPinSaving(false);
    }
  }, [
    categoryFlat,
    categoryId,
    fetchData,
    findGeneratedPreviewUrl,
    handleCloseCycleModal,
    messageApi,
    selectedPinCycleId,
    videoPoseForModal,
  ]);

  const handleConfirmGenerateVideo = useCallback(async () => {
    if (!videoPoseForModal) {
      messageApi.warning("未选择姿态。");
      return;
    }
    if (!categoryId || !selectedVideoCycleId) {
      messageApi.warning("请选择要关联的视频周期。");
      return;
    }

    setGeneratingVideo(true);
    setGeneratingVideoPoseId(videoPoseForModal.id);
    try {
      const body = new FormData();
      body.append("cycle_id", String(selectedVideoCycleId));
      body.append("pose_id", String(videoPoseForModal.id));
      if (selectedVideoAudioFile) {
        body.append("audio_expected", "1");
        body.append("audio_file", selectedVideoAudioFile, selectedVideoAudioFile.name);
      }

      const response = await fetch(`/api/admin/categories/${categoryId}/generate-video`, {
        method: "POST",
        body,
      });
      const data = (await response.json()) as GeneratedVideoResponse | { error?: string };
      if (!response.ok || !("local_file_path" in data)) {
        throw new Error("error" in data ? data.error : "生成视频失败。");
      }

      messageApi.success(
        `视频已生成${data.audio_file_used ? "（含背景音乐）" : "（静音）"}：${data.local_file_path}`,
      );
      handleCloseCycleModal();
      setVideoPoseForModal(null);
      window.dispatchEvent(new CustomEvent("admin-local-changes"));
      await fetchData();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "生成视频失败。");
    } finally {
      setGeneratingVideo(false);
      setGeneratingVideoPoseId(null);
    }
  }, [
    categoryId,
    fetchData,
    handleCloseCycleModal,
    messageApi,
    selectedVideoAudioFile,
    selectedVideoCycleId,
    videoPoseForModal,
  ]);

  const sortedPoseItems = useMemo(
    () =>
      poseItems
        .slice()
        .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id),
    [poseItems],
  );
  const filteredPoseItems = useMemo<PoseTableRow[]>(
    () =>
      sortedPoseItems.map((item) => ({
        ...item,
        currentSource: getPoseSourceByKind(item, sourceKindFilter),
        source_kind: sourceKindFilter,
      })),
    [sortedPoseItems, sourceKindFilter],
  );
  const filteredGeneratedImgs = useMemo(
    () =>
      generatedImgs
        .filter((item) => activeSlugById.get(item.active_id) === GENERATED_IMG_FILTER_META[generatedImgFilter].activeSlug)
        .slice()
        .sort(
          (left, right) =>
            (activeNameById.get(left.active_id) || "").localeCompare(activeNameById.get(right.active_id) || "") ||
            left.sort_order - right.sort_order ||
            left.id - right.id,
        ),
    [activeNameById, activeSlugById, generatedImgFilter, generatedImgs],
  );
  const currentCategory = useMemo(
    () => categoryFlat.find((item) => item.id === categoryId) ?? null,
    [categoryFlat, categoryId],
  );
  const generatedImgSourceByImgId = useMemo(() => {
    const map = new Map<number, ImgSourceListItem>();
    sourceItems.forEach((item) => {
      item.generated_img_ids.forEach((imgId) => {
        map.set(imgId, item);
      });
    });
    return map;
  }, [sourceItems]);

  const handleOpenPoseEditor = useCallback((record: PoseSourceListItem) => {
    setEditingPoseRecord(record);
  }, []);

  const handleSavePoseInfo = useCallback(async () => {
    if (!editingPoseRecord) {
      return;
    }

    try {
      const values = await poseForm.validateFields();
      setRunningKey(`pose-info:${editingPoseRecord.id}`);
      const response = await fetch(`/api/admin/pose-sources/${editingPoseRecord.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pose_title: values.pose_title ?? null,
          pose_title_zh: values.pose_title_zh ?? null,
        }),
      });
      const data = (await response.json()) as PoseSourceListItem | { error?: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "更新姿态词失败。");
      }

      messageApi.success("姿态词已同步更新。");
      setEditingPoseRecord(null);
      poseForm.resetFields();
      await fetchData();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) {
        return;
      }
      messageApi.error(error instanceof Error ? error.message : "更新姿态词失败。");
    } finally {
      setRunningKey((current) =>
        current === `pose-info:${editingPoseRecord.id}` ? null : current,
      );
    }
  }, [editingPoseRecord, fetchData, messageApi, poseForm]);

  const handleDeletePose = useCallback(
    async (record: PoseSourceListItem) => {
      try {
        setRunningKey(`delete-pose:${record.id}`);
        const response = await fetch(`/api/admin/pose-sources/${record.id}`, {
          method: "DELETE",
        });
        const data = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(data.error || "删除姿态失败。");
        }

        messageApi.success("姿态已删除。");
        await fetchData();
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "删除姿态失败。");
      } finally {
        setRunningKey((current) =>
          current === `delete-pose:${record.id}` ? null : current,
        );
      }
    },
    [fetchData, messageApi],
  );

  const handleReplaceSource = useCallback(
    async (record: PoseSourceListItem, sourceKind: ImgSourceKind, file: File) => {
      setRunningKey(`replace:${record.id}:${sourceKind}`);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category_id", String(record.category_id));

        const uploadResponse = await fetch("/api/admin/img-sources/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = (await uploadResponse.json()) as UploadedSourceFile | { error?: string };

        if (!uploadResponse.ok || "error" in uploadData) {
          throw new Error("error" in uploadData ? uploadData.error : "上传原始图失败。");
        }

        if (!("image_url" in uploadData) || !("local_file_path" in uploadData)) {
          throw new Error("上传原始图返回数据无效。");
        }

        const response = await fetch(`/api/admin/pose-sources/${record.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_kind: sourceKind,
            image_url: uploadData.image_url,
            local_file_path: uploadData.local_file_path,
          }),
        });
        const data = (await response.json()) as PoseSourceListItem | { error?: string };

        if (!response.ok || "error" in data) {
          throw new Error("error" in data ? data.error : "替换原始图失败。");
        }

        const currentSource = getPoseSourceByKind(record, sourceKind);
        messageApi.success(hasUploadedSource(currentSource) ? "原始图已替换。" : "原始图已上传。");
        window.dispatchEvent(new CustomEvent("admin-local-changes"));
        await fetchData();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "替换原始图失败。";
        messageApi.error(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setRunningKey((current) =>
          current === `replace:${record.id}:${sourceKind}` ? null : current,
        );
      }
    },
    [fetchData, messageApi],
  );

  const handleDeleteGeneratedImg = useCallback(
    async (id: number) => {
      try {
        setRunningKey(`img:${id}`);
        const response = await fetch(`/api/admin/imgs/${id}`, {
          method: "DELETE",
        });
        const data = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(data.error || "删除功能图失败。");
        }

        messageApi.success("功能图已删除。");
        window.dispatchEvent(new CustomEvent("admin-local-changes"));
        await fetchData();
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "删除功能图失败。");
      } finally {
        setRunningKey((current) => (current === `img:${id}` ? null : current));
      }
    },
    [fetchData, messageApi],
  );

  const handleUploadGeneratedImg = useCallback(
    async (record: ImgListItem, file: File) => {
      setRunningKey(`upload-img:${record.id}`);
      try {
        await uploadGeneratedCategoryImgFile(record, file);

        const variant = resolveGeneratedVariantByActiveSlug(activeSlugById.get(record.active_id));
        messageApi.success(
          variant === "cut"
            ? record.file_sync_status === "draft"
              ? "剪纸图已上传。"
              : "剪纸图已替换。"
            : "功能图已上传。",
        );
        window.dispatchEvent(new CustomEvent("admin-local-changes"));
        await fetchData();
      } catch (error) {
        const text = error instanceof Error ? error.message : "上传功能图失败。";
        messageApi.error(text);
        throw new Error(text);
      } finally {
        setRunningKey((current) => (current === `upload-img:${record.id}` ? null : current));
      }
    },
    [activeSlugById, fetchData, messageApi],
  );

  const triggerGeneratedImgUpload = useCallback(
    (record: ImgListItem) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          void handleUploadGeneratedImg(record, file);
        }
      };
      input.click();
    },
    [handleUploadGeneratedImg],
  );

  const handleGenerateBySource = useCallback(
    (record: PoseTableRow) => {
      const source = record.currentSource.source_id
        ? sourceById.get(record.currentSource.source_id) ?? null
        : null;

      if (!hasUploadedSource(record.currentSource) || !source) {
        modal.warning({
          title: "这条原始图还没有上传图片",
          content: `请先在左侧缩略图右下角点击上传图标，为「${getPoseDisplayInfo(record)}」上传${SOURCE_KIND_META[record.source_kind].label}后再生成功能图。`,
          okText: "知道了",
        });
        return;
      }

      const meta = SOURCE_KIND_META[source.source_kind];
      const runGenerate = async () => {
        setRunningKey(`source:${record.id}:${record.source_kind}`);
        try {
          const response = await fetch(`/api/admin/img-sources/${source.id}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source_kind: source.source_kind,
              variants: meta.variants,
              replace_existing: true,
            }),
          });
          const data = (await response.json()) as GenerateImgResponse;

          if (!response.ok) {
            throw new Error(data.error || "生成功能图片失败。");
          }

          const clientCutCount = await replaceGeneratedCutImgsWithClientOutput({
            generatedItems: data.items ?? [],
            sources: [
              {
                ...source,
                generated_img_ids: [
                  ...new Set([...(source.generated_img_ids ?? []), ...(data.items ?? []).map((item) => item.id)]),
                ],
              },
            ],
            actives,
          });
          messageApi.success(
            clientCutCount > 0
              ? `已删除 ${data.deleted_count ?? 0} 张旧图，生成 ${data.generated_count ?? meta.variants.length} 张新图，并已用测试页算法重建 ${clientCutCount} 张剪纸图。`
              : `已删除 ${data.deleted_count ?? 0} 张旧图，生成 ${data.generated_count ?? meta.variants.length} 张新图。`,
          );
          window.dispatchEvent(new CustomEvent("admin-local-changes"));
          await fetchData();
        } catch (error) {
          messageApi.error(error instanceof Error ? error.message : "生成功能图片失败。");
        } finally {
          setRunningKey((current) =>
            current === `source:${record.id}:${record.source_kind}` ? null : current,
          );
        }
      };

      void modal.confirm({
        title: meta.confirmTitle,
        content: `${meta.confirmDescription}
当前姿态：${getPoseDisplayInfo(record)}`,
        okText: "确认生成",
        cancelText: "取消",
        onOk: () => {
          window.setTimeout(() => {
            void runGenerate();
          }, 0);
        },
      });
    },
    [actives, fetchData, messageApi, modal, sourceById],
  );

  const handleCopyPrompt = useCallback(
    async (record: PoseTableRow) => {
      const source = record.currentSource.source_id
        ? sourceById.get(record.currentSource.source_id) ?? null
        : null;
      const prompt = source ? getCopyPromptTextForImgSource(source) : "";
      if (!prompt) {
        messageApi.warning("当前这条彩图还没有可复制提示词。");
        return;
      }

      try {
        await navigator.clipboard.writeText(prompt);
        messageApi.success("提示词已复制。");
      } catch {
        messageApi.error("复制失败，请检查浏览器剪贴板权限。");
      }
    },
    [messageApi, sourceById],
  );

  const handleDownloadSource = useCallback(
    (record: PoseTableRow) => {
      const previewUrl = buildSourcePreviewUrl(record.currentSource);
      if (!previewUrl) {
        messageApi.warning("当前原始图还没有可下载文件。");
        return;
      }

      const link = document.createElement("a");
      link.href = previewUrl;
      link.download =
        getBaseName(record.currentSource.local_file_path) || `${getPoseDisplayInfo(record)}.webp`;
      link.click();
    },
    [messageApi],
  );

  const handleDownloadGeneratedImg = useCallback(
    (record: ImgListItem) => {
      const previewUrl = buildGeneratedImgPreviewUrl(record);
      if (!previewUrl) {
        messageApi.warning("当前功能图还没有可下载文件。");
        return;
      }

      const link = document.createElement("a");
      link.href = previewUrl;
      link.download =
        getBaseName(record.local_file_path) ||
        `${record.title || record.active_name || `generated-img-${record.id}`}.webp`;
      link.click();
    },
    [messageApi],
  );

  const handleCancelPin = useCallback(async () => {
    if (!categoryId) {
      return;
    }

    setPinSaving(true);
    try {
      const response = await fetch(`/api/admin/categories/${categoryId}/pin-items`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok || data.error) {
        throw new Error(data.error || "取消 Pin 失败。");
      }
      messageApi.success("已取消当前三级类型的 Pin 周期数据。");
      window.dispatchEvent(new CustomEvent("admin-local-changes"));
      await fetchData();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "取消 Pin 失败。");
    } finally {
      setPinSaving(false);
    }
  }, [categoryId, fetchData, messageApi]);

  const handleDownloadPin = useCallback((item: PinPreviewItem) => {
    const link = document.createElement("a");
    link.href = item.dataUrl;
    link.download = item.fileName;
    link.click();
  }, []);

  const handleCopyPinText = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        messageApi.success(`${label}已复制。`);
      } catch {
        messageApi.error("复制失败，请检查浏览器剪贴板权限。");
      }
    },
    [messageApi],
  );

  const handleRegenerateGeneratedImg = useCallback(
    (record: ImgListItem) => {
      const source = generatedImgSourceByImgId.get(record.id);
      const variant = resolveGeneratedVariantByActiveSlug(activeSlugById.get(record.active_id));

      if (!source) {
        messageApi.warning("当前功能图暂时找不到对应原始图，无法单独重新生成。");
        return;
      }

      if (!variant) {
        messageApi.warning("当前功能图类型暂不支持单独重新生成。");
        return;
      }

      const runRegenerate = async () => {
        setRunningKey(`regenerate-img:${record.id}`);
        try {
          const response = await fetch(`/api/admin/img-sources/${source.id}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source_kind: source.source_kind,
              variants: [variant],
              replace_existing: true,
            }),
          });
          const data = (await response.json()) as GenerateImgResponse;

          if (!response.ok) {
            throw new Error(data.error || "重新生成功能图失败。");
          }

          const clientCutCount = await replaceGeneratedCutImgsWithClientOutput({
            generatedItems: data.items ?? [],
            sources: [
              {
                ...source,
                generated_img_ids: [
                  ...new Set([...(source.generated_img_ids ?? []), ...(data.items ?? []).map((item) => item.id)]),
                ],
              },
            ],
            actives,
          });
          messageApi.success(
            clientCutCount > 0
              ? `已删除 ${data.deleted_count ?? 0} 张旧图，重新生成 ${data.generated_count ?? 1} 张新图，并已用测试页算法重建 ${clientCutCount} 张剪纸图。`
              : `已删除 ${data.deleted_count ?? 0} 张旧图，重新生成 ${data.generated_count ?? 1} 张新图。`,
          );
          window.dispatchEvent(new CustomEvent("admin-local-changes"));
          await fetchData();
        } catch (error) {
          messageApi.error(error instanceof Error ? error.message : "重新生成功能图失败。");
        } finally {
          setRunningKey((current) => (current === `regenerate-img:${record.id}` ? null : current));
        }
      };

      void modal.confirm({
        title: "确认重新生成这张功能图吗？",
        content: `会基于对应原始图重新生成当前这一个功能类型，并替换旧图。
当前图：${record.title || record.active_name || "未命名功能图"}
对应原始图：${getSourceDisplayInfo(source)}`,
        okText: "确认重生成",
        cancelText: "取消",
        onOk: () => {
          window.setTimeout(() => {
            void runRegenerate();
          }, 0);
        },
      });
    },
    [activeSlugById, actives, fetchData, generatedImgSourceByImgId, messageApi, modal],
  );

  const handleAddPose = useCallback(async () => {
    if (!categoryId) {
      return;
    }

    setRunningKey("add-pose");
    try {
      const response = await fetch("/api/admin/pose-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: categoryId,
        }),
      });
      const data = (await response.json()) as PoseSourceListItem | { error?: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "创建姿态失败。");
      }

      messageApi.success("已添加一组姿态原始图（彩图 + 线框图 + 带背景彩图）。");
      await fetchData();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "添加姿态失败。");
    } finally {
      setRunningKey((current) => (current === "add-pose" ? null : current));
    }
  }, [categoryId, fetchData, messageApi]);

  const sourceColumns = useMemo<ColumnsType<PoseTableRow>>(
    () => [
      {
        title: "预览",
        key: "preview",
        width: 110,
        render: (_value, record) => {
          const previewUrl = buildSourcePreviewUrl(record.currentSource);
          return (
            <div
              style={{
                position: "relative",
                width: 72,
                height: 72,
              }}
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={getPoseDisplayInfo(record)}
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: "contain",
                    borderRadius: 8,
                    background: "#fafafa",
                    border: "1px solid #f0f0f0",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 8,
                    background: "#fafafa",
                    border: "1px dashed #d9d9d9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#999",
                    fontSize: 12,
                    textAlign: "center",
                    padding: 8,
                  }}
                >
                  待上传
                </div>
              )}
              <Upload
                accept="image/*"
                showUploadList={false}
                customRequest={async ({ file, onError, onSuccess }) => {
                  if (!(file instanceof File)) {
                    onError?.(new Error("无效的原始图文件。"));
                    return;
                  }

                  try {
                    await handleReplaceSource(record, record.source_kind, file);
                    onSuccess?.({}, file);
                  } catch (error) {
                    onError?.(error instanceof Error ? error : new Error("替换原始图失败。"));
                  }
                }}
              >
                <Button
                  type="primary"
                  shape="circle"
                  size="small"
                  icon={hasUploadedSource(record.currentSource) ? <SwapOutlined /> : <UploadOutlined />}
                  loading={runningKey === `replace:${record.id}:${record.source_kind}`}
                  style={{
                    position: "absolute",
                    right: -6,
                    bottom: -6,
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                  }}
                />
              </Upload>
            </div>
          );
        },
      },
      {
        title: "类型",
        dataIndex: "source_kind",
        width: 130,
        render: (value: ImgSourceKind) => SOURCE_KIND_META[value].label,
      },
      {
        title: "原始图信息",
        key: "info",
        render: (_value, record) => (
          <div>
            <Space size={8} wrap>
              <span>{getPoseDisplayInfo(record)}</span>
              {record.video_publish_cycle_id ? (
                <Tag color="blue" style={{ borderRadius: 999 }}>
                  V
                </Tag>
              ) : null}
              {record.pin_publish_cycle_id ? (
                <Tag color="purple" style={{ borderRadius: 999 }}>
                  P
                </Tag>
              ) : null}
              <Button type="link" style={{ padding: 0 }} onClick={() => handleOpenPoseEditor(record)}>
                编辑
              </Button>
            </Space>
            {record.pose_title_zh?.trim() && record.pose_title_zh.trim() !== record.pose_title?.trim() ? (
              <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                中文姿态：{record.pose_title_zh.trim()}
              </Text>
            ) : null}
          </div>
        ),
      },
      {
        title: "状态",
        key: "status",
        width: 110,
        render: (_value, record) =>
          hasUploadedSource(record.currentSource) ? <Tag color="green">已上传</Tag> : <Tag>待上传</Tag>,
      },
      {
        title: "提示词",
        key: "prompt",
        width: 110,
        render: (_value, record) =>
          record.source_kind === "color" && record.currentSource.source_id ? (
            <Button type="link" onClick={() => void handleCopyPrompt(record)}>
              复制提示词
            </Button>
          ) : (
            <Text type="secondary">-</Text>
          ),
      },
      {
        title: "操作",
        key: "actions",
        width: 460,
        render: (_value, record) => {
          const previewUrl = buildSourcePreviewUrl(record.currentSource);
          const poseReadyForVideo =
            Boolean(record.color.local_file_path?.trim()) &&
            Boolean(record.outline.local_file_path?.trim()) &&
            Boolean(record.scene_color.local_file_path?.trim());
          return (
            <Space size={4} wrap>
              {previewUrl ? (
                <Button
                  type="link"
                  icon={<EyeOutlined />}
                  onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                >
                  预览
                </Button>
              ) : null}
              {previewUrl ? (
                <Button type="link" icon={<DownloadOutlined />} onClick={() => void handleDownloadSource(record)}>
                  下载
                </Button>
              ) : null}
              <Button
                type="link"
                loading={runningKey === `source:${record.id}:${record.source_kind}`}
                onClick={() => void handleGenerateBySource(record)}
              >
                {SOURCE_KIND_META[record.source_kind].generateButtonText}
              </Button>
              <Button
                type="link"
                title={poseReadyForVideo ? undefined : "请先为该姿态上传彩图、线框图、带背景彩图"}
                disabled={!poseReadyForVideo}
                loading={generatingVideo && generatingVideoPoseId === record.id}
                onClick={() => handleOpenCycleModal(record)}
              >
                周期
              </Button>
              <Popconfirm
                title="确认删除这组姿态原始图吗？"
                description={`会删除当前三级分类下姿态「${getPoseDisplayInfo(record)}」对应的彩图、线框图和带背景彩图记录。`}
                okText="删除"
                cancelText="取消"
                onConfirm={() => void handleDeletePose(record)}
              >
                <Button type="link" danger loading={runningKey === `delete-pose:${record.id}`}>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          );
        },
      },
    ],
    [
      generatingVideo,
      generatingVideoPoseId,
      handleCopyPrompt,
      handleDeletePose,
      handleDownloadSource,
      handleGenerateBySource,
      handleOpenCycleModal,
      handleOpenPoseEditor,
      handleReplaceSource,
      runningKey,
    ],
  );

  const generatedImgColumns = useMemo<ColumnsType<ImgListItem>>(
    () => [
      {
        title: "预览",
        key: "preview",
        width: 110,
        render: (_value, record) => {
          const previewUrl = buildGeneratedImgPreviewUrl(record);
          return previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={record.title ?? record.active_name}
              style={{
                width: 72,
                height: 72,
                objectFit: "contain",
                borderRadius: 8,
                background: "#fafafa",
                border: "1px solid #f0f0f0",
              }}
            />
          ) : (
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 8,
                background: "#fafafa",
                border: "1px dashed #d9d9d9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#999",
                fontSize: 12,
                textAlign: "center",
                lineHeight: 1.4,
                padding: 6,
              }}
            >
              待上传
            </div>
          );
        },
      },
      {
        title: "分类",
        dataIndex: "active_name",
        width: 140,
      },
      {
        title: "Name / Slug",
        key: "info",
        render: (_value, record) => (
          <div>
            <Space size={6} wrap>
              <span>{record.title || "-"}</span>
              {record.file_sync_status === "draft" ? <Tag color="gold">待上传</Tag> : null}
            </Space>
            <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
              {record.slug || "-"}
            </Text>
          </div>
        ),
      },
      {
        title: "操作",
        key: "actions",
        width: 320,
        render: (_value, record) => {
          const previewUrl = buildGeneratedImgPreviewUrl(record);
          const variant = resolveGeneratedVariantByActiveSlug(activeSlugById.get(record.active_id));
          const isCutVariant = variant === "cut";
          return (
            <Space size={4} wrap>
              <Button
                type="link"
                disabled={!previewUrl}
                onClick={() => previewUrl && window.open(previewUrl, "_blank", "noopener,noreferrer")}
              >
                预览
              </Button>
              <Button
                type="link"
                icon={<DownloadOutlined />}
                disabled={!previewUrl}
                onClick={() => void handleDownloadGeneratedImg(record)}
              >
                下载
              </Button>
              <Button
                type="link"
                icon={<UploadOutlined />}
                loading={runningKey === `upload-img:${record.id}`}
                onClick={() =>
                  isCutVariant
                    ? triggerGeneratedImgUpload(record)
                    : window.location.assign(`/admin/imgs/${record.id}`)
                }
              >
                {isCutVariant
                  ? record.file_sync_status === "draft"
                    ? "上传剪纸图"
                    : "替换剪纸图"
                  : "编辑"}
              </Button>
              <Button
                type="link"
                loading={runningKey === `regenerate-img:${record.id}`}
                onClick={() => void handleRegenerateGeneratedImg(record)}
              >
                重新生成
              </Button>
              <Popconfirm
                title="确认删除这张功能图吗？"
                okText="删除"
                cancelText="取消"
                onConfirm={() => void handleDeleteGeneratedImg(record.id)}
              >
                <Button type="link" danger loading={runningKey === `img:${record.id}`}>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          );
        },
      },
    ],
    [
      activeSlugById,
      handleDeleteGeneratedImg,
      handleDownloadGeneratedImg,
      handleRegenerateGeneratedImg,
      runningKey,
      triggerGeneratedImgUpload,
    ],
  );

  return (
    <>
      {contextHolder}
      {modalContextHolder}
      <Card title="原始图管理" variant="borderless">
        {!categoryId ? (
          <div>请先保存分类，再管理该分类下的原始图。</div>
        ) : (
          <>
            <Divider style={{ marginTop: 0 }}>原始图表</Divider>
            {showPromptButtons ? (
              <Space wrap style={{ marginBottom: 8 }}>
                <Button
                  onClick={() => {
                    const prompt = buildOutlineVariantPrompt();
                    void navigator.clipboard.writeText(prompt).then(() => messageApi.success("线框图提示词已复制"));
                  }}
                >
                  复制线框图提示词
                </Button>
                <Button
                  onClick={() => {
                    const prompt = buildSceneColorVariantPrompt();
                    void navigator.clipboard.writeText(prompt).then(() => messageApi.success("带背景彩图提示词已复制"));
                  }}
                >
                  复制带背景彩图提示词
                </Button>
              </Space>
            ) : null}
            <Space wrap style={{ marginBottom: 16 }}>
              <Button
                icon={<PlusOutlined />}
                loading={runningKey === "add-pose"}
                onClick={() => void handleAddPose()}
              >
                添加姿态
              </Button>
              <Button
                type={sourceKindFilter === "color" ? "primary" : "default"}
                onClick={() => setSourceKindFilter("color")}
              >
                彩图
              </Button>
              <Button
                type={sourceKindFilter === "outline" ? "primary" : "default"}
                onClick={() => setSourceKindFilter("outline")}
              >
                线框图
              </Button>
              <Button
                type={sourceKindFilter === "scene_color" ? "primary" : "default"}
                onClick={() => setSourceKindFilter("scene_color")}
              >
                带背景彩图
              </Button>
              {currentCategory?.pin_publish_cycle_id ? (
                <Popconfirm
                  title="确认取消当前三级类型的 Pin 数据吗？"
                  description="会清空它保存到发布周期里的 Pin 图文，并重新生成对应周期排期。"
                  okText="取消 Pin"
                  cancelText="保留"
                  onConfirm={() => void handleCancelPin()}
                >
                  <Button danger loading={pinSaving}>
                    取消 Pin
                  </Button>
                </Popconfirm>
              ) : null}
            </Space>
            <Table
              rowKey="id"
              loading={loading}
              columns={sourceColumns}
              dataSource={filteredPoseItems}
              pagination={false}
              locale={{
                emptyText: `当前筛选下暂无${SOURCE_KIND_META[sourceKindFilter].label}记录`,
              }}
            />
            <Divider>功能图表</Divider>
            <Space wrap style={{ marginBottom: 16 }}>
              {(Object.keys(GENERATED_IMG_FILTER_META) as GeneratedImgFilter[]).map((filterKey) => (
                <Button
                  key={filterKey}
                  type={generatedImgFilter === filterKey ? "primary" : "default"}
                  onClick={() => setGeneratedImgFilter(filterKey)}
                >
                  {GENERATED_IMG_FILTER_META[filterKey].label}
                </Button>
              ))}
            </Space>
            <Table
              rowKey="id"
              loading={loading}
              columns={generatedImgColumns}
              dataSource={filteredGeneratedImgs}
              pagination={false}
              locale={{ emptyText: `当前筛选下暂无${GENERATED_IMG_FILTER_META[generatedImgFilter].label}` }}
            />
          </>
        )}
      </Card>

      {videoModalMounted ? (
        <Modal
          title="周期"
          open={videoModalOpen}
          onCancel={() => {
            handleCloseCycleModal();
            setVideoPoseForModal(null);
          }}
          onOk={() => void (cycleTab === "pin" ? handleConfirmGeneratePin() : handleConfirmGenerateVideo())}
          okText="确认生成"
          cancelText="取消"
          confirmLoading={cycleTab === "pin" ? pinSaving : generatingVideo}
          destroyOnHidden
        >
          {videoPoseForModal ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              当前姿态：{getPoseDisplayInfo(videoPoseForModal)}。确认后会按当前姿态生成素材和文案，并写入所选周期。
            </Typography.Paragraph>
          ) : null}
          <Tabs
            activeKey={cycleTab}
            onChange={(key) => setCycleTab(key === "video" ? "video" : "pin")}
            items={[
              {
                key: "pin",
                label: "图片周期",
                children: (
                  <Form.Item label="选择图片周期">
                    <Select
                      showSearch
                      optionFilterProp="label"
                      loading={loadingPinCycles}
                      value={selectedPinCycleId ?? undefined}
                      placeholder="请选择图片周期"
                      onChange={(value) => setSelectedPinCycleId(value)}
                      options={pinCycles.map((item) => ({
                        value: item.id,
                        label: `#${item.id}（${item.start_date} ~ ${item.end_date}，${item.category_count} 个类型）`,
                      }))}
                    />
                  </Form.Item>
                ),
              },
              {
                key: "video",
                label: "视频周期",
                children: (
                  <Space orientation="vertical" style={{ width: "100%" }} size={12}>
                    <Form.Item label="选择视频周期" style={{ marginBottom: 0 }}>
                      <Select
                        showSearch
                        optionFilterProp="label"
                        loading={loadingVideoCycles}
                        value={selectedVideoCycleId ?? undefined}
                        placeholder="请选择视频周期"
                        onChange={(value) => setSelectedVideoCycleId(value)}
                        options={videoCycles.map((item) => ({
                          value: item.id,
                          label: `#${item.id}（${item.start_date} ~ ${item.end_date}，${item.category_count} 个类型）`,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item label="背景音乐" style={{ marginBottom: 0 }}>
                      <Upload {...videoAudioUploadProps}>
                        <Button icon={<UploadOutlined />}>上传音乐</Button>
                      </Upload>
                    </Form.Item>
                  </Space>
                ),
              },
            ]}
          />
          <Typography.Text type="secondary">如果没有可选周期，请先到对应周期管理页创建。</Typography.Text>
        </Modal>
      ) : null}

      <Modal
        title={pinModalTitle}
        open={pinModalOpen}
        onCancel={() => setPinModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setPinModalOpen(false)}>
            关闭
          </Button>,
        ]}
        width={860}
        destroyOnHidden
      >
        {pinGenerating ? (
          <Text type="secondary">正在临时生成 Pin 图...</Text>
        ) : (
          <Tabs
            items={pinPreviewItems.map((item) => ({
              key: item.key,
              label: item.label,
              children: (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(280px, 360px) 1fr",
                    gap: 20,
                    alignItems: "start",
                  }}
                >
                  <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                    <Space orientation="vertical" size={4}>
                      <Text type="secondary">
                        {item.width} x {item.height}px
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {item.fileName}
                      </Text>
                    </Space>
                    <Button type="primary" icon={<DownloadOutlined />} onClick={() => handleDownloadPin(item)}>
                      下载图片
                    </Button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.dataUrl}
                      alt={item.label}
                      style={{
                        display: "block",
                        width: "100%",
                        maxHeight: 640,
                        objectFit: "contain",
                        border: "1px solid #f0f0f0",
                        borderRadius: 8,
                        background: "#fafafa",
                      }}
                    />
                  </Space>
                  <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                    {[
                      { label: "标题", value: item.copy.title, minRows: 1, maxRows: 2 },
                      { label: "描述", value: item.copy.description, minRows: 4, maxRows: 6 },
                      { label: "链接", value: item.copy.link, minRows: 1, maxRows: 2 },
                      { label: "建议图板", value: item.copy.board, minRows: 1, maxRows: 1 },
                      { label: "建议分区", value: item.copy.section, minRows: 1, maxRows: 1 },
                      { label: "替代文本", value: item.copy.altText, minRows: 3, maxRows: 5 },
                      { label: "标签", value: item.copy.tags.join(", "), minRows: 2, maxRows: 3 },
                    ].map((field) => (
                      <div key={field.label}>
                        <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text strong>{field.label}</Text>
                          <Button
                            size="small"
                            onClick={() => void handleCopyPinText(field.value, field.label)}
                          >
                            复制
                          </Button>
                        </Space>
                        <Input.TextArea
                          readOnly
                          value={field.value}
                          autoSize={{ minRows: field.minRows, maxRows: field.maxRows }}
                        />
                      </div>
                    ))}
                  </Space>
                </div>
              ),
            }))}
          />
        )}
      </Modal>

      <Modal
        title="编辑姿态词"
        open={Boolean(editingPoseRecord)}
        forceRender
        onCancel={() => {
          setEditingPoseRecord(null);
          poseForm.resetFields();
        }}
        onOk={() => void handleSavePoseInfo()}
        okText="保存"
        cancelText="取消"
        confirmLoading={
          editingPoseRecord
            ? runningKey === `pose-info:${editingPoseRecord.id}`
            : false
        }
        destroyOnHidden
      >
        <Form form={poseForm} layout="vertical">
          <Form.Item
            label="姿态词"
            name="pose_title"
            rules={[{ required: true, whitespace: true, message: "请输入姿态词" }]}
          >
            <Input placeholder="例如：flat / globular / trailing" />
          </Form.Item>
          <Form.Item
            label="姿态中文（可选）"
            name="pose_title_zh"
            extra="不填时会默认复用上面的姿态词，用于复制提示词和内部姿态数据。"
          >
            <Input placeholder="例如：扁平姿态 / 球形姿态 / 下垂姿态" />
          </Form.Item>
          <Text type="secondary">
            保存后，会同步更新该姿态对应的彩图、线框图和带背景彩图提示数据。
          </Text>
        </Form>
      </Modal>
    </>
  );
}
