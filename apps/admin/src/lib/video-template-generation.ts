import { execFile } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import ffmpegStaticPath from "ffmpeg-static";

import {
  getCategoryById,
  getCategorySlugPathSegments,
  getPoseSourceById,
  saveGeneratedVideoToCycle,
} from "@/lib/admin-db";
import { resolveManagedFilePath } from "@/lib/local-image-storage";
import { buildVideoSeoFileName } from "@/lib/video-seo-file-name";

const execFileAsync = promisify(execFile);
/**
 * 搜索入口模板：保留两段拼图特色，把表达从"素材包展示"改成"免费 printable 入口"。
 * - 开头直接回答家长/老师的搜索需求，而不是先讲品牌
 * - 每个阶段用功能标签说明 coloring / tracing / scissor skills / puzzles
 * - 结尾留足时间展示免费打印 CTA，避免 15 秒内闪太快
 */
const TEMPLATE_VERSION = "shorts-printable-topic-v2";
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const FPS = 30;
const DURATION_SECONDS = 24;
const BACKGROUND_AUDIO_VOLUME = 0.15;

async function assertLocalFile(relativePath: string, label: string) {
  const absolutePath = resolveManagedFilePath(relativePath);
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`${label} 本地文件不存在：${relativePath}`);
  }
  return absolutePath;
}

function getFfmpegCandidates() {
  const importedPath =
    typeof ffmpegStaticPath === "string"
      ? ffmpegStaticPath
      : (ffmpegStaticPath as { default?: unknown } | null)?.default;
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

  return [
    process.env.FFMPEG_BIN,
    typeof importedPath === "string" ? importedPath : "",
    process.env.PWD ? path.join(process.env.PWD, "node_modules", "ffmpeg-static", binaryName) : "",
    process.env.INIT_CWD ? path.join(process.env.INIT_CWD, "node_modules", "ffmpeg-static", binaryName) : "",
    path.join(process.cwd(), "node_modules", "ffmpeg-static", binaryName),
  ].filter((item): item is string => Boolean(item));
}

async function resolveFfmpegExecutable() {
  const failed: string[] = [];

  for (const executablePath of getFfmpegCandidates()) {
    try {
      await fs.access(executablePath, fsConstants.X_OK);
      await execFileAsync(executablePath, ["-version"], { timeout: 10_000 });
      return executablePath;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      failed.push(`${executablePath} (${message})`);
    }
  }

  throw new Error(
    `项目内 ffmpeg 二进制无法运行。已尝试：${failed.join("；") || "无候选路径"}。请确认 npm install 已完成。`,
  );
}

/**
 * 在 drawtext 参数值里需要转义的字符：冒号、反斜杠、单引号。
 * 空格无需转义；含空格的路径直接写即可（参数解析按 ":" 切分）。
 */
function escapeFfmpegArgPath(p: string) {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function escapeDrawtextText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
    .replace(/%/g, "\\%");
}

function compactText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3).replace(/\s+\S*$/, "")}...`;
}

function lowerFirst(value: string) {
  if (!value) {
    return value;
  }
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function buildTopicVideoCopy(subject: string) {
  const topic = compactText(subject || "kids", 28);
  const shortTopic = compactText(subject || "kids", 22);

  return {
    hook: `Need a quick ${lowerFirst(topic)} activity?`,
    numberPuzzle: "Number sequence puzzle",
    gridPuzzle: "Grid puzzle activity",
    coloring: `${shortTopic} coloring page`,
    packTitle: `Free ${shortTopic} printables`,
    packSubtitle: "Coloring / Tracing / Cutting / Puzzles",
    sceneLabel: "For preschool homeschool and quiet time",
    cta: "Print free activities on PrintlyKiddo.com",
  };
}

/**
 * 解析一个稳定能渲染拉丁字符的 ttf/ttc 字体文件。
 * ffmpeg-static 的 fontconfig 通常加载不到，因此显式指定 fontfile 才能避免
 * 系统 fallback 到 CJK 字体导致水印被渲染成方块乱码。
 */
async function resolveFontFile() {
  // 优先圆角 sans-serif（最贴近 Poppins / Nunito 的儿童内容品牌感），
  // 再退到几何 sans，最后才用系统默认 fallback。
  const candidates = [
    process.env.FFMPEG_FONT_FILE,
    // 圆角字体（最贴近 Poppins / Nunito / Quicksand）
    "/System/Library/Fonts/SFNSRounded.ttf",
    "/System/Library/Fonts/SFCompactRounded.ttf",
    "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf",
    "/Library/Fonts/Arial Rounded MT Bold.ttf",
    // 几何 sans 兜底
    "/System/Library/Fonts/Avenir Next.ttc",
    "/System/Library/Fonts/Avenir.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Geneva.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    // Linux 常见字体
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    // Windows
    "C:\\Windows\\Fonts\\arial.ttf",
    "C:\\Windows\\Fonts\\arialbd.ttf",
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    try {
      await fs.access(candidate, fsConstants.R_OK);
      return candidate;
    } catch {
      // 继续尝试下一个候选
    }
  }
  return null;
}

/** 生成分段线性表达式：v(t) 在每个 [t_i, t_{i+1}] 段内做线性插值，端点外保持端点值。 */
function buildPiecewiseExpr(segments: Array<[number, number]>) {
  if (segments.length === 0) {
    return "0";
  }
  let expr = String(segments[segments.length - 1][1]);
  for (let i = segments.length - 1; i > 0; i--) {
    const [t1, v1] = segments[i - 1];
    const [t2, v2] = segments[i];
    if (t1 === t2) {
      continue;
    }
    const interp = `((${v1})+(t-${t1})*((${v2})-(${v1}))/${t2 - t1})`;
    expr = `if(lt(t,${t2}),${interp},${expr})`;
  }
  expr = `if(lt(t,${segments[0][0]}),${segments[0][1]},${expr})`;
  return expr;
}

/**
 * Easing 表达式构造器：替换线性 piecewise，让运动具有 magnetic snap-back 与 elastic 感。
 * 支持：hold（保持） / linear / easeOutCubic / easeOutBack（带 overshoot）/
 * easeInCubic / shake（衰减抖动）。
 */
type EasingType =
  | "hold"
  | "linear"
  | "easeOutCubic"
  | "easeOutBack"
  | "easeInCubic"
  | "shake";

interface EaseSegment {
  start: number;
  end: number;
  from: number;
  to: number;
  ease: EasingType;
  amp?: number;
  /**
   * easeOutBack 的回弹系数 c1。默认 1.70158（约 10% overshoot，标准 CSS 曲线）。
   * 0.6 ≈ 3% overshoot（"轻轻弹一下"），0.3 ≈ 1.5% overshoot。
   * 用于归位时控制 magnetic snap-back 的力度，避免画面持续抖动。
   */
  back?: number;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(3);
}

function buildSegmentExpr(seg: EaseSegment): string {
  const t0 = fmt(seg.start);
  const dt = fmt(Math.max(seg.end - seg.start, 0.001));
  const from = fmt(seg.from);
  const range = fmt(seg.to - seg.from);
  const p = `((t-${t0})/${dt})`;

  switch (seg.ease) {
    case "hold":
      return from;
    case "linear":
      return `(${from}+${range}*${p})`;
    case "easeOutCubic":
      // f(p) = 1 - (1-p)^3
      return `(${from}+${range}*(1-pow(1-${p},3)))`;
    case "easeOutBack": {
      // f(p) = 1 + c3*(p-1)^3 + c1*(p-1)^2; c3 = c1 + 1
      // 通过 back 系数控制 overshoot 力度：归位用低值（~3%），弹出用高值（~10%）
      const c1 = seg.back ?? 1.70158;
      const c3 = c1 + 1;
      return `(${from}+${range}*(1+${fmt(c3)}*pow(${p}-1,3)+${fmt(c1)}*pow(${p}-1,2)))`;
    }
    case "easeInCubic":
      return `(${from}+${range}*pow(${p},3))`;
    case "shake": {
      // 衰减包络：sin(20p)*sin(PI*p)，两端归零，中段最大
      const amp = fmt(seg.amp ?? 4);
      return `(${from}+${amp}*sin(20*${p})*sin(PI*${p}))`;
    }
  }
}

function buildEasedExpr(segments: EaseSegment[]): string {
  if (segments.length === 0) return "0";
  let expr = fmt(segments[segments.length - 1].to);
  for (let i = segments.length - 1; i >= 0; i--) {
    expr = `if(lt(t,${fmt(segments[i].end)}),${buildSegmentExpr(segments[i])},${expr})`;
  }
  return expr;
}

function buildVideoFilter(options: { fontFile: string | null; subject: string }) {
  const W = VIDEO_WIDTH;
  const H = VIDEO_HEIGHT;
  const D = DURATION_SECONDS;
  const R = FPS;
  const fontPart = options.fontFile
    ? `fontfile=${escapeFfmpegArgPath(options.fontFile)}:`
    : "";
  const copy = buildTopicVideoCopy(options.subject);
  const text = (value: string) => escapeDrawtextText(value);

  // 主体放大：从 900×900 升到 1200×1200，占画面高度 62.5%（接近 65%+ Shorts 标准）
  // 宽度方向超出画面 60px 由 overlay 自动裁切，素材主体居中不会被裁到关键内容
  const CW = 1200;
  const CH = 1200;
  const CX = (W - CW) / 2;
  const CY = (H - CH) / 2;

  // 主体画面不做全局相机漂移：之前 sin/cos 会让开场完整图轻微晃动。
  // 拼图运动仍由各块自身的 easing 完成，背景粒子保留轻微环境动效。
  const camX = "0";
  const camY = "0";

  // 竖条：10 条；主体放大后偏移幅度也跟着拉到 ±140~±220，让乱序更"狂"
  const STRIP_N = 10;
  const SW = CW / STRIP_N;
  const LABEL_H = 110;
  const STRIP_PERM = [4, 7, 0, 9, 5, 8, 3, 6, 1, 2];
  const STRIP_Y_OFFSET = [180, -150, 220, -170, 110, 200, -130, 160, -200, 180];
  // 归位错峰更明显：逐条吸附回来，形成 satisfying 节奏。
  const STRIP_STAGGER = [0, 0.08, 0.16, 0.24, 0.32, 0.4, 0.48, 0.56, 0.64, 0.72];
  const stripOrigX = (i: number) => CX + i * SW - 1;
  const stripOrigY = CY - 1;
  const stripShufX = (i: number) => CX + STRIP_PERM[i] * SW - 1;
  const stripShufY = (i: number) => CY - 1 + STRIP_Y_OFFSET[i];

  // 网格 3x3：跨象限的 PERM，每块都跑得很远，强化 shuffled 感
  const GRID_COLS = 3;
  const GRID_N = 9;
  const TW = CW / GRID_COLS;
  const TH = CH / GRID_COLS;
  const TILE_PERM = [8, 6, 5, 7, 0, 3, 2, 1, 4];
  const TILE_STAGGER = [0, 0.06, 0.12, 0.18, 0.24, 0.3, 0.36, 0.42, 0.48];
  const tileOrigX = (i: number) => CX + (i % GRID_COLS) * TW - 1;
  const tileOrigY = (i: number) => CY + Math.floor(i / GRID_COLS) * TH - 1;
  const tileShufX = (i: number) => CX + (TILE_PERM[i] % GRID_COLS) * TW - 1;
  const tileShufY = (i: number) => CY + Math.floor(TILE_PERM[i] / GRID_COLS) * TH - 1;

  const particleSpecs: Array<{
    size: number;
    alpha: number;
    x: number;
    xa: number;
    xs: number;
    xp: number;
    y: number;
    ya: number;
    ys: number;
    yp: number;
  }> = [];

  const filters: string[] = [];

  filters.push(`color=c=0xfffdf8:s=${W}x${H}:d=${D}:r=${R},format=rgba[bg]`);
  filters.push(`[0:v]scale=${CW}:${CH}:flags=bicubic,fps=${R},format=rgba,setsar=1[c0]`);
  filters.push(`[1:v]scale=${CW}:${CH}:flags=bicubic,fps=${R},format=rgba,setsar=1[b0]`);
  filters.push(`[2:v]scale=${CW}:${CH}:flags=bicubic,fps=${R},format=rgba,setsar=1[a0]`);

  particleSpecs.forEach((s, i) => {
    filters.push(
      `color=c=white@${s.alpha}:s=${s.size}x${s.size}:r=${R}:d=${D},format=rgba[p${i}]`,
    );
  });

  const cmLabels = ["[cm_open]", "[cm_inter1]", "[cm_inter2]", "[cm_close]"];
  const csLabels = Array.from({ length: STRIP_N }, (_, i) => `[cs${i}]`);
  const cgLabels = Array.from({ length: GRID_N }, (_, i) => `[cg${i}]`);
  const cAllLabels = [...cmLabels, ...csLabels, ...cgLabels];
  filters.push(`[c0]split=${cAllLabels.length}${cAllLabels.join("")}`);

  filters.push(`[cm_open]fade=out:st=0.8:d=0.25:alpha=1[cm_open_f]`);
  // 数条恢复后干净底图：5.5 起淡入与 strip fade-out 形成 crossfade，
  // 6.4 淡出衔接网格阶段
  filters.push(
    `[cm_inter1]fade=in:st=5.5:d=0.3:alpha=1,fade=out:st=6.4:d=0.3:alpha=1[cm_inter1_f]`,
  );
  // 网格恢复后干净底图：9.5 起淡入
  filters.push(`[cm_inter2]fade=in:st=9.5:d=0.3:alpha=1[cm_inter2_f]`);
  // 结尾回到完整彩图，给免费打印 CTA 留出清楚可读的时间。
  filters.push(`[cm_close]fade=in:st=14.4:d=0.6:alpha=1[cm_close_f]`);

  filters.push(`[a0][b0]xfade=transition=fade:duration=0.8:offset=11.2[color_to_outline]`);

  for (let i = 0; i < STRIP_N; i++) {
    filters.push(`[cs${i}]crop=${SW}:${CH}:${i * SW}:0[s_img_${i}]`);
    filters.push(
      `color=c=white:s=${SW}x${LABEL_H}:r=${R}:d=${D},format=rgba,` +
        `drawtext=${fontPart}text=${i + 1}:x=(w-text_w)/2:y=(h-text_h)/2:` +
        `fontsize=84:fontcolor=black[s_label_${i}]`,
    );
    filters.push(`[s_img_${i}][s_label_${i}]vstack=2[s_stacked_${i}]`);
    filters.push(
      `[s_stacked_${i}]pad=${SW + 2}:${CH + LABEL_H + 2}:1:1:black[s_padded_${i}]`,
    );
    // 条形拼图归位完成后稳住，再淡出衔接第二段拼图。
    filters.push(
      `[s_padded_${i}]fade=in:st=0.75:d=0.2:alpha=1,fade=out:st=5.5:d=0.25:alpha=1[s_unit_${i}]`,
    );
  }

  for (let i = 0; i < GRID_N; i++) {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    filters.push(`[cg${i}]crop=${TW}:${TH}:${col * TW}:${row * TH}[t_img_${i}]`);
    filters.push(`[t_img_${i}]pad=${TW + 2}:${TH + 2}:1:1:black[t_padded_${i}]`);
    filters.push(
      `[t_padded_${i}]fade=in:st=6.0:d=0.2:alpha=1,fade=out:st=9.8:d=0.25:alpha=1[t_unit_${i}]`,
    );
  }

  // ====== 合成 ======
  let chain = "[bg]";

  // 微粒子背景层：在所有主体之下，让画面"活"
  particleSpecs.forEach((s, i) => {
    const px = `(${s.x}+${s.xa}*sin(${s.xs}*t+${s.xp}))`;
    const py = `(${s.y}+${s.ya}*cos(${s.ys}*t+${s.yp}))`;
    filters.push(`${chain}[p${i}]overlay=x='${px}':y='${py}'[vp${i}]`);
    chain = `[vp${i}]`;
  });

  // Scene 1：开场完整彩图 Hook
  filters.push(
    `${chain}[cm_open_f]overlay=x='${CX}+${camX}':y='${CY}+${camY}':enable='between(t,0,1.1)'[v_open]`,
  );
  chain = "[v_open]";

  // Scene 2 & 3：10 条竖条，快速打散后逐条磁吸归位。
  for (let i = 0; i < STRIP_N; i++) {
    const ox = stripOrigX(i);
    const oy = stripOrigY;
    const sx = stripShufX(i);
    const sy = stripShufY(i);
    const st = STRIP_STAGGER[i];

    const scatterDelay = st * 0.3;
    const xExpr = buildEasedExpr([
      { start: 0.75, end: 1.0 + scatterDelay, from: ox, to: ox, ease: "hold" },
      { start: 1.0 + scatterDelay, end: 1.7 + scatterDelay, from: ox, to: sx, ease: "easeOutBack", back: 0.8 },
      { start: 1.7 + scatterDelay, end: 2.3, from: sx, to: sx, ease: "hold" },
      { start: 2.3 + st, end: 4.55 + st, from: sx, to: ox, ease: "easeOutBack", back: 0.45 },
      { start: 4.55 + st, end: 5.55, from: ox, to: ox, ease: "hold" },
    ]);
    const yExpr = buildEasedExpr([
      { start: 0.75, end: 1.0 + scatterDelay, from: oy, to: oy, ease: "hold" },
      { start: 1.0 + scatterDelay, end: 1.7 + scatterDelay, from: oy, to: sy, ease: "easeOutBack", back: 0.8 },
      { start: 1.7 + scatterDelay, end: 2.3, from: sy, to: sy, ease: "hold" },
      { start: 2.3 + st, end: 4.55 + st, from: sy, to: oy, ease: "easeOutBack", back: 0.45 },
      { start: 4.55 + st, end: 5.55, from: oy, to: oy, ease: "hold" },
    ]);

    filters.push(
      `${chain}[s_unit_${i}]overlay='${xExpr}+${camX}':'${yExpr}+${camY}':` +
        `enable='between(t,0.75,5.9)'[vs${i}]`,
    );
    chain = `[vs${i}]`;
  }

  // 数条恢复后的干净底图瞬间（5.5 起与 strip fade-out 交叉）
  filters.push(
    `${chain}[cm_inter1_f]overlay=x='${CX}+${camX}':y='${CY}+${camY}':enable='between(t,5.5,6.25)'[v_inter1]`,
  );
  chain = "[v_inter1]";

  // Scene 4 & 5：宫格拼图，第二轮 satisfying 归位。
  for (let i = 0; i < GRID_N; i++) {
    const ox = tileOrigX(i);
    const oy = tileOrigY(i);
    const sx = tileShufX(i);
    const sy = tileShufY(i);
    const st = TILE_STAGGER[i];
    // 保留轻微弧线，但幅度收敛，避免游戏广告式乱飞。
    const arcGo = (oy + sy) / 2 - 50;
    const arcBack = (oy + sy) / 2 - 50;

    const scatterDelay = st * 0.3;
    const xExpr = buildEasedExpr([
      { start: 5.8, end: 6.1 + scatterDelay, from: ox, to: ox, ease: "hold" },
      { start: 6.1 + scatterDelay, end: 6.8 + scatterDelay, from: ox, to: sx, ease: "easeOutBack", back: 0.8 },
      { start: 6.8 + scatterDelay, end: 7.05, from: sx, to: sx, ease: "hold" },
      { start: 7.05 + st, end: 9.3 + st, from: sx, to: ox, ease: "easeOutBack", back: 0.45 },
      { start: 9.3 + st, end: 9.8, from: ox, to: ox, ease: "hold" },
    ]);
    const yExpr = buildEasedExpr([
      { start: 5.8, end: 6.1 + scatterDelay, from: oy, to: oy, ease: "hold" },
      { start: 6.1 + scatterDelay, end: 6.45 + scatterDelay, from: oy, to: arcGo, ease: "easeOutCubic" },
      { start: 6.45 + scatterDelay, end: 6.8 + scatterDelay, from: arcGo, to: sy, ease: "easeOutCubic" },
      { start: 6.8 + scatterDelay, end: 7.05, from: sy, to: sy, ease: "hold" },
      { start: 7.05 + st, end: 8.6 + st, from: sy, to: arcBack, ease: "easeOutCubic" },
      { start: 8.6 + st, end: 9.3 + st, from: arcBack, to: oy, ease: "easeOutCubic" },
      { start: 9.3 + st, end: 9.8, from: oy, to: oy, ease: "hold" },
    ]);

    filters.push(
      `${chain}[t_unit_${i}]overlay='${xExpr}+${camX}':'${yExpr}+${camY}':` +
        `enable='between(t,5.8,10.05)'[vg${i}]`,
    );
    chain = `[vg${i}]`;
  }

  // 网格恢复后的干净底图瞬间（9.5 起与网格 fade-out 交叉）
  filters.push(
    `${chain}[cm_inter2_f]overlay=x='${CX}+${camX}':y='${CY}+${camY}':enable='between(t,9.8,11.05)'[v_inter2]`,
  );
  chain = "[v_inter2]";

  // Scene 6：彩图淡到黑白涂色页，说明它是可打印素材。
  filters.push(
    `${chain}[color_to_outline]overlay=x='${CX}+${camX}':y='${CY}+${camY}':enable='between(t,10.85,15.0)'[vb]`,
  );
  chain = "[vb]";

  // Scene 7：最后回到完整彩图，下一轮循环不会突兀。
  filters.push(
    `${chain}[cm_close_f]overlay=x='${CX}+${camX}':y='${CY}+${camY}':enable='between(t,14.4,${D})'[vc]`,
  );
  chain = "[vc]";

  // 完成瞬间奖励：两次归位各轻轻亮一下，静音时也能给到完成反馈。
  // 半正弦曲线中点对齐这两个时刻，制造"完成 → 闪一下"的奖励反馈。
  filters.push(
    `${chain}eq=brightness='if(between(t,5.35,5.67),0.06*sin(PI*(t-5.35)/0.32),` +
      `if(between(t,9.70,10.02),0.06*sin(PI*(t-9.70)/0.32),0))'[vr]`,
  );
  chain = "[vr]";

  filters.push(
    `${chain}drawtext=${fontPart}text=${text(copy.hook)}:` +
      `x=(w-text_w)/2:y=250:fontsize=56:fontcolor=0x2c2c2c:` +
      `alpha='if(lt(t,0.3),t/0.3,if(lt(t,1.7),1,if(lt(t,2.0),1-(t-1.7)/0.3,0)))':` +
      `enable='between(t,0,2.0)'[vtxt0]`,
  );
  chain = "[vtxt0]";

  filters.push(
    `${chain}drawtext=${fontPart}text=${text(copy.numberPuzzle)}:` +
      `x=(w-text_w)/2:y=250:fontsize=58:fontcolor=0x2c2c2c:` +
      `alpha='if(lt(t,10.0),0,if(lt(t,10.3),(t-10.0)/0.3,if(lt(t,11.0),1,if(lt(t,11.25),1-(t-11.0)/0.25,0))))':` +
      `enable='between(t,10.0,11.25)'[vtxt1]`,
  );
  chain = "[vtxt1]";

  filters.push(
    `${chain}drawtext=${fontPart}text=${text(copy.coloring)}:` +
      `x=(w-text_w)/2:y=250:fontsize=50:fontcolor=0x2c2c2c:` +
      `alpha='if(lt(t,11.35),0,if(lt(t,11.65),(t-11.35)/0.3,if(lt(t,12.8),1,if(lt(t,13.1),1-(t-12.8)/0.3,0))))':` +
      `enable='between(t,11.35,13.1)'[vtxt2]`,
  );
  chain = "[vtxt2]";

  filters.push(
    `${chain}drawtext=${fontPart}text=${text(copy.gridPuzzle)}:` +
      `x=(w-text_w)/2:y=250:fontsize=52:fontcolor=0x2c2c2c:` +
      `alpha='if(lt(t,13.15),0,if(lt(t,13.45),(t-13.15)/0.3,if(lt(t,14.45),1,if(lt(t,14.75),1-(t-14.45)/0.3,0))))':` +
      `enable='between(t,13.15,14.75)'[vtxt3]`,
  );
  chain = "[vtxt3]";

  filters.push(
    `${chain}drawtext=${fontPart}text=${text(copy.packTitle)}:` +
      `x=(w-text_w)/2:y=1488:fontsize=54:fontcolor=0x2c2c2c:` +
      `alpha='if(lt(t,15.1),0,if(lt(t,15.5),(t-15.1)/0.4,1))':` +
      `enable='between(t,15.1,${D})'[vtxt4]`,
  );
  chain = "[vtxt4]";

  filters.push(
    `${chain}drawtext=${fontPart}text=${text(copy.packSubtitle)}:` +
      `x=(w-text_w)/2:y=1558:fontsize=32:fontcolor=0x2c2c2c:` +
      `alpha='if(lt(t,15.35),0,if(lt(t,15.75),(t-15.35)/0.4,0.84))':` +
      `enable='between(t,15.35,${D})'[vtxt5]`,
  );
  chain = "[vtxt5]";

  filters.push(
    `${chain}drawtext=${fontPart}text=${text(copy.sceneLabel)}:` +
      `x=(w-text_w)/2:y=1612:fontsize=30:fontcolor=0x2c2c2c:` +
      `alpha='if(lt(t,15.6),0,if(lt(t,16.0),(t-15.6)/0.4,0.74))':` +
      `enable='between(t,15.6,${D})'[vtxt6]`,
  );
  chain = "[vtxt6]";

  filters.push(
    `${chain}drawtext=${fontPart}text=${text(copy.cta)}:` +
      `x=(w-text_w)/2:y=1668:fontsize=34:fontcolor=0x2c2c2c:` +
      `alpha='if(lt(t,15.85),0,if(lt(t,16.25),(t-15.85)/0.4,0.78))':` +
      `enable='between(t,15.85,${D})'[vtxt7]`,
  );
  chain = "[vtxt7]";

  // 品牌露出：顶部固定小字，避开 Shorts 底部 UI。
  filters.push(
    `${chain}drawtext=${fontPart}text=PrintlyKiddo.com:` +
      `x=(w-text_w)/2:y=72:fontsize=34:fontcolor=0x2c2c2c:` +
      `alpha='if(lt(t,0.3),t/0.3*0.68,0.68)'[vw]`,
  );
  chain = "[vw]";

  filters.push(`${chain}format=yuv420p[v]`);
  filters.push(
    `[3:a]atrim=0:${DURATION_SECONDS},asetpts=PTS-STARTPTS,` +
      `aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo,` +
      `apad=whole_dur=${DURATION_SECONDS},atrim=0:${DURATION_SECONDS},` +
      `afade=t=in:st=0:d=0.25,afade=t=out:st=${DURATION_SECONDS - 0.6}:d=0.6,volume=${BACKGROUND_AUDIO_VOLUME}[a]`,
  );

  return filters.join(";");
}

async function renderVideoWithFfmpeg(input: {
  sceneColorPath: string;
  outlinePath: string;
  colorPath: string;
  subject: string;
  audioPath?: string;
  outputPath: string;
}) {
  const ffmpegPath = await resolveFfmpegExecutable();
  const fontFile = await resolveFontFile();

  const audioInputArgs = input.audioPath
    ? ["-stream_loop", "-1", "-t", String(DURATION_SECONDS), "-i", input.audioPath]
    : ["-f", "lavfi", "-t", String(DURATION_SECONDS), "-i", "anullsrc=r=44100:cl=stereo"];

  const args = [
    "-y",
    "-loop",
    "1",
    "-t",
    String(DURATION_SECONDS),
    "-i",
    input.sceneColorPath,
    "-loop",
    "1",
    "-t",
    String(DURATION_SECONDS),
    "-i",
    input.outlinePath,
    "-loop",
    "1",
    "-t",
    String(DURATION_SECONDS),
    "-i",
    input.colorPath,
    ...audioInputArgs,
    "-filter_complex",
    buildVideoFilter({ fontFile, subject: input.subject }),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-r",
    String(FPS),
    "-t",
    String(DURATION_SECONDS),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    input.outputPath,
  ];

  try {
    await execFileAsync(ffmpegPath, args, {
      timeout: 180_000,
      maxBuffer: 1024 * 1024 * 10,
    });
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : "";
    const lastLines = stderr
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-8)
      .join("；");
    throw new Error(`ffmpeg 生成视频失败：${lastLines || (error instanceof Error ? error.message : "unknown")}`);
  }
}

export async function generateCategoryPuzzleVideo(input: {
  categoryId: number;
  cycleId: number;
  poseId: number;
  audioPath?: string;
}) {
  const category = await getCategoryById(input.categoryId);
  if (!category) {
    throw new Error("分类不存在。");
  }

  const pose = await getPoseSourceById(input.poseId);
  if (!pose || pose.category_id !== input.categoryId) {
    throw new Error("姿态不存在或不属于当前分类。");
  }

  const colorRelativePath = pose.color.local_file_path?.trim() || "";
  const outlineRelativePath = pose.outline.local_file_path?.trim() || "";
  const sceneColorRelativePath = pose.scene_color.local_file_path?.trim() || "";

  if (!colorRelativePath || !outlineRelativePath || !sceneColorRelativePath) {
    throw new Error("生成视频需要该姿态同时具备彩色图、线框图和带背景彩图三类原始图（请先上传完整）。");
  }

  const [colorPath, outlinePath, sceneColorPath] = await Promise.all([
    assertLocalFile(colorRelativePath, "彩色图 Asset A"),
    assertLocalFile(outlineRelativePath, "线框图 Asset B"),
    assertLocalFile(sceneColorRelativePath, "带背景彩图 Asset C"),
  ]);

  const categoryPath = await getCategorySlugPathSegments(input.categoryId);
  const fileBase = buildVideoSeoFileName({
    categoryPath,
    subject: category.slug || category.name,
    poseTitle: pose.pose_title,
    poseKey: pose.pose_key,
    uniqueId: `cy${input.cycleId}-p${pose.id}`,
  });
  const relativeOutputPath = path
    .join(
      "videos",
      "cycles",
      String(input.cycleId),
      `${fileBase}.mp4`,
    )
    .replaceAll("\\", "/");
  const absoluteOutputPath = resolveManagedFilePath(relativeOutputPath);

  await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await renderVideoWithFfmpeg({
    sceneColorPath,
    outlinePath,
    colorPath,
    subject: category.name,
    audioPath: input.audioPath,
    outputPath: absoluteOutputPath,
  });

  return saveGeneratedVideoToCycle({
    cycle_id: input.cycleId,
    category_id: input.categoryId,
    pose_id: input.poseId,
    local_file_path: relativeOutputPath,
    asset_color_path: colorRelativePath,
    asset_outline_path: outlineRelativePath,
    asset_scene_color_path: sceneColorRelativePath,
    template_version: TEMPLATE_VERSION,
  });
}
