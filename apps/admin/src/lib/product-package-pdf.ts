import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import sharp from "sharp";

import type { ProductPackageRecord } from "@/lib/admin-types";
import { getLocalDatabase, getProductPackageById } from "@/lib/admin-db";
import { readManagedFile, resolveManagedFilePath } from "@/lib/local-image-storage";

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const MARGIN = 54;
const OUTPUT_ROOT = "product-packages";
const ACTIVITY_LABELS: Record<string, string> = {
  "coloring-pages": "Creative Coloring Activity",
  "tracing-worksheets": "Fine Motor Line Practice",
  cut: "Cut and Paste Matching Activity",
  "grid-puzzles": "Spatial Reasoning Grid Puzzle",
  "number-sequencing": "Number Order Puzzle",
};
const ACTIVITY_ORDER = [
  "coloring-pages",
  "tracing-worksheets",
  "cut",
  "grid-puzzles",
  "number-sequencing",
];

type PackageImageRow = {
  id: number;
  category_id: number;
  active_slug: string;
  active_name: string;
  image_url: string;
  local_file_path: string | null;
  title: string | null;
};

type ResolvedActivityPage = {
  categoryName: string;
  activeSlug: string;
  activityTitle: string;
  image: PackageImageRow | null;
};

type BuildContext = {
  productPackage: ProductPackageRecord;
  fullPages: ResolvedActivityPage[];
  copy: Record<string, unknown>;
};

function parseIdList(value: unknown) {
  if (value === null || value === undefined) {
    return [];
  }
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  } catch {
    return [];
  }
}

function parseCopy(value: string | null) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function textOf(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function weeklyFlowOf(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = item as Record<string, unknown>;
    return {
      day: textOf(record.day),
      focus: textOf(record.focus),
      activities: arrayOfStrings(record.activities),
    };
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word;
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function drawWrappedText(options: {
  page: PDFPage;
  text: string;
  font: PDFFont;
  size: number;
  x: number;
  y: number;
  maxWidth: number;
  lineHeight?: number;
  color?: ReturnType<typeof rgb>;
}) {
  const lineHeight = options.lineHeight ?? options.size * 1.35;
  let y = options.y;
  for (const line of wrapText(options.text, options.font, options.size, options.maxWidth)) {
    options.page.drawText(line, {
      x: options.x,
      y,
      size: options.size,
      font: options.font,
      color: options.color ?? rgb(0.12, 0.12, 0.12),
    });
    y -= lineHeight;
  }
  return y;
}

async function readImageBuffer(row: PackageImageRow) {
  const candidates = [row.local_file_path, row.image_url].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (/^https?:\/\//i.test(candidate)) {
      const response = await fetch(candidate);
      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }
      continue;
    }
    try {
      return await readManagedFile(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function embedImage(
  pdfDoc: PDFDocument,
  row: PackageImageRow,
) {
  const source = await readImageBuffer(row);
  if (!source) {
    return null;
  }
  const png = await sharp(source).rotate().png().toBuffer();
  return pdfDoc.embedPng(png);
}

function fitRect(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: width * scale,
    height: height * scale,
  };
}

function drawTitle(page: PDFPage, font: PDFFont, title: string, subtitle?: string) {
  page.drawText(title, {
    x: MARGIN,
    y: LETTER_HEIGHT - 72,
    size: 20,
    font,
    color: rgb(0.08, 0.08, 0.08),
  });
  if (subtitle) {
    page.drawText(subtitle, {
      x: MARGIN,
      y: LETTER_HEIGHT - 98,
      size: 10,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
  }
}

async function drawActivityImagePage(options: {
  pdfDoc: PDFDocument;
  page: PDFPage;
  fonts: { regular: PDFFont; bold: PDFFont };
  activity: ResolvedActivityPage;
}) {
  const { page, fonts, activity, pdfDoc } = options;
  drawTitle(page, fonts.bold, activity.activityTitle, activity.categoryName);

  if (!activity.image) {
    page.drawRectangle({
      x: MARGIN,
      y: 180,
      width: LETTER_WIDTH - MARGIN * 2,
      height: 430,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
    });
    drawWrappedText({
      page,
      text: "Missing asset for this activity. Generate or upload the worksheet image, then regenerate this product PDF.",
      font: fonts.regular,
      size: 13,
      x: MARGIN + 24,
      y: 400,
      maxWidth: LETTER_WIDTH - MARGIN * 2 - 48,
    });
    return;
  }

  const embedded = await embedImage(pdfDoc, activity.image);
  if (!embedded) {
    return;
  }
  const fitted = fitRect(embedded.width, embedded.height, LETTER_WIDTH - 90, 610);
  page.drawImage(embedded, {
    x: (LETTER_WIDTH - fitted.width) / 2,
    y: 72,
    width: fitted.width,
    height: fitted.height,
  });
}

function getCoverActivities(fullPages: ResolvedActivityPage[]) {
  const priority = ["cut", "grid-puzzles", "number-sequencing", "coloring-pages", "tracing-worksheets"];
  const byCategory = new Map<string, ResolvedActivityPage[]>();
  fullPages.forEach((activity) => {
    if (!activity.image) {
      return;
    }
    byCategory.set(activity.categoryName, [...(byCategory.get(activity.categoryName) ?? []), activity]);
  });

  return [...byCategory.values()]
    .map((activities) =>
      activities.sort((a, b) => priority.indexOf(a.activeSlug) - priority.indexOf(b.activeSlug))[0],
    )
    .filter((activity): activity is ResolvedActivityPage => Boolean(activity?.image))
    .slice(0, 5);
}

async function addCoverPage(
  pdfDoc: PDFDocument,
  context: BuildContext,
  fonts: { regular: PDFFont; bold: PDFFont },
) {
  const page = pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  page.drawRectangle({ x: 0, y: 0, width: LETTER_WIDTH, height: LETTER_HEIGHT, color: rgb(0.96, 0.98, 1) });
  page.drawText(context.productPackage.parent_category_name, {
    x: MARGIN,
    y: LETTER_HEIGHT - 150,
    size: 36,
    font: fonts.bold,
    color: rgb(0.08, 0.17, 0.28),
  });
  page.drawText(context.productPackage.target_label || "Kindergarten", {
    x: MARGIN,
    y: LETTER_HEIGHT - 192,
    size: 26,
    font: fonts.bold,
    color: rgb(0.09, 0.32, 0.67),
  });
  page.drawText("Activity Pack", {
    x: MARGIN,
    y: LETTER_HEIGHT - 225,
    size: 26,
    font: fonts.bold,
    color: rgb(0.09, 0.32, 0.67),
  });
  drawWrappedText({
    page,
    text: context.productPackage.subtitle || "No Prep Fine Motor, Puzzle & Cut-and-Paste Printables",
    font: fonts.regular,
    size: 15,
    x: MARGIN,
    y: LETTER_HEIGHT - 270,
    maxWidth: LETTER_WIDTH - MARGIN * 2,
  });

  const coverActivities = getCoverActivities(context.fullPages);
  const gap = 14;
  const cardWidth = Math.min(
    150,
    (LETTER_WIDTH - MARGIN * 2 - Math.max(0, coverActivities.length - 1) * gap) /
      Math.max(1, coverActivities.length),
  );
  const cardHeight = 145;
  const totalWidth = coverActivities.length * cardWidth + Math.max(0, coverActivities.length - 1) * gap;
  let x = (LETTER_WIDTH - totalWidth) / 2;
  for (const activity of coverActivities) {
    if (!activity.image) {
      continue;
    }
    page.drawRectangle({
      x,
      y: 300,
      width: cardWidth,
      height: cardHeight,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.9, 0.96),
      borderWidth: 1,
    });
    const embedded = await embedImage(pdfDoc, activity.image);
    if (embedded) {
      const fitted = fitRect(embedded.width, embedded.height, cardWidth - 20, cardHeight - 34);
      page.drawImage(embedded, {
        x: x + (cardWidth - fitted.width) / 2,
        y: 320 + (cardHeight - 34 - fitted.height) / 2,
        width: fitted.width,
        height: fitted.height,
      });
    }
    page.drawText(activity.categoryName, {
      x: x + 12,
      y: 310,
      size: 9,
      font: fonts.bold,
      color: rgb(0.15, 0.15, 0.15),
    });
    x += cardWidth + gap;
  }

  const names = context.productPackage.items.map((item) => item.display_name || item.category_name).join(" • ");
  drawWrappedText({
    page,
    text: names,
    font: fonts.regular,
    size: 13,
    x: MARGIN,
    y: 210,
    maxWidth: LETTER_WIDTH - MARGIN * 2,
    color: rgb(0.25, 0.25, 0.25),
  });
  page.drawText("Printly Kiddo", {
    x: MARGIN,
    y: 72,
    size: 13,
    font: fonts.bold,
    color: rgb(0.08, 0.17, 0.28),
  });
}

function addTeacherPages(pdfDoc: PDFDocument, context: BuildContext, fonts: { regular: PDFFont; bold: PDFFont }) {
  const teacher = pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  drawTitle(teacher, fonts.bold, "Teacher Notes", context.productPackage.title);
  let y = LETTER_HEIGHT - 145;
  y = drawWrappedText({
    page: teacher,
    text: textOf(context.copy.teacherNotes, `${context.productPackage.title} is ready to print and use for classroom centers, morning work, homeschool, and early finishers.`),
    font: fonts.regular,
    size: 13,
    x: MARGIN,
    y,
    maxWidth: LETTER_WIDTH - MARGIN * 2,
  });
  y -= 24;
  teacher.drawText("Skills Covered", { x: MARGIN, y, size: 16, font: fonts.bold });
  y -= 28;
  for (const skill of arrayOfStrings(context.copy.skills)) {
    teacher.drawText(`- ${skill}`, { x: MARGIN + 8, y, size: 12, font: fonts.regular });
    y -= 20;
  }

  const flow = pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  drawTitle(flow, fonts.bold, "Suggested Weekly Flow", "Print and follow the daily structure.");
  y = LETTER_HEIGHT - 145;
  for (const item of weeklyFlowOf(context.copy.weeklyFlow)) {
    flow.drawText(`${item.day}: ${item.focus}`, { x: MARGIN, y, size: 14, font: fonts.bold });
    y -= 22;
    flow.drawText(item.activities.join(" + "), { x: MARGIN + 18, y, size: 12, font: fonts.regular });
    y -= 34;
  }

  const checklist = pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  drawTitle(checklist, fonts.bold, "Activity Checklist", context.productPackage.parent_category_name);
  y = LETTER_HEIGHT - 140;
  for (const item of context.productPackage.items) {
    checklist.drawText(item.display_name || item.category_name, { x: MARGIN, y, size: 13, font: fonts.bold });
    y -= 22;
    for (const activity of Object.values(ACTIVITY_LABELS)) {
      checklist.drawText(`[ ] ${activity}`, { x: MARGIN + 18, y, size: 11, font: fonts.regular });
      y -= 17;
    }
    y -= 10;
    if (y < 90) {
      y = LETTER_HEIGHT - 100;
    }
  }
}

function addBonusPages(pdfDoc: PDFDocument, context: BuildContext, fonts: { regular: PDFFont; bold: PDFFont }) {
  const vocabulary = pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  drawTitle(vocabulary, fonts.bold, `${context.productPackage.parent_category_name} Vocabulary Cards`);
  const names = context.productPackage.items.map((item) => item.display_name || item.category_name);
  names.forEach((name, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + col * 252;
    const y = LETTER_HEIGHT - 175 - row * 95;
    vocabulary.drawRectangle({
      x,
      y,
      width: 220,
      height: 68,
      borderColor: rgb(0.55, 0.65, 0.75),
      borderWidth: 1,
    });
    vocabulary.drawText(name, { x: x + 22, y: y + 26, size: 18, font: fonts.bold });
  });

  const writing = pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  drawTitle(writing, fonts.bold, `My Favorite ${context.productPackage.parent_category_name}`);
  let y = LETTER_HEIGHT - 155;
  const prompts = [
    `My favorite ${context.productPackage.parent_category_name.toLowerCase()} animal is ____________________.`,
    "I like it because ________________________________________________.",
    "One thing I learned is ____________________________________________.",
  ];
  prompts.forEach((prompt) => {
    writing.drawText(prompt, { x: MARGIN, y, size: 13, font: fonts.regular });
    y -= 58;
  });
  writing.drawRectangle({
    x: MARGIN,
    y: 110,
    width: LETTER_WIDTH - MARGIN * 2,
    height: 300,
    borderColor: rgb(0.72, 0.72, 0.72),
    borderWidth: 1,
  });
  writing.drawText("Draw your favorite animal here.", {
    x: MARGIN + 14,
    y: 385,
    size: 11,
    font: fonts.regular,
    color: rgb(0.45, 0.45, 0.45),
  });

  const terms = pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  drawTitle(terms, fonts.bold, "Terms of Use", "Printly Kiddo");
  drawWrappedText({
    page: terms,
    text: "This resource is for personal classroom, homeschool, or family use. Please do not redistribute, resell, upload to shared drives, or claim the pages as your own. Thank you for respecting the time and work behind this printable activity pack.",
    font: fonts.regular,
    size: 13,
    x: MARGIN,
    y: LETTER_HEIGHT - 150,
    maxWidth: LETTER_WIDTH - MARGIN * 2,
  });
}

function resolvePackageActivityPages(productPackage: ProductPackageRecord) {
  const db = getLocalDatabase();
  const pages: ResolvedActivityPage[] = [];
  const imageByIdStatement = db.prepare(
    `SELECT
      imgs.id,
      imgs.category_id,
      imgs.image_url,
      imgs.local_file_path,
      imgs.title,
      actives.slug AS active_slug,
      actives.name AS active_name
     FROM imgs
     INNER JOIN actives ON actives.id = imgs.active_id
     WHERE imgs.id = ?
       AND imgs.deleted_at IS NULL
     LIMIT 1`,
  );
  const poseStatement = db.prepare(
    `SELECT color_generated_img_ids, outline_generated_img_ids, scene_color_generated_img_ids
     FROM img_source_poses
     WHERE id = ?
     LIMIT 1`,
  );

  for (const item of productPackage.items) {
    const pose = poseStatement.get(item.pose_id) as
      | {
          color_generated_img_ids: string | null;
          outline_generated_img_ids: string | null;
          scene_color_generated_img_ids: string | null;
        }
      | undefined;
    const imageIds = [
      ...parseIdList(pose?.outline_generated_img_ids),
      ...parseIdList(pose?.color_generated_img_ids),
      ...parseIdList(pose?.scene_color_generated_img_ids),
    ];
    const rows = imageIds
      .map((id) => imageByIdStatement.get(id) as PackageImageRow | undefined)
      .filter((row): row is PackageImageRow => Boolean(row));
    const byActiveSlug = new Map(rows.map((row) => [row.active_slug, row]));

    ACTIVITY_ORDER.forEach((activeSlug) => {
      pages.push({
        categoryName: item.display_name || item.category_name,
        activeSlug,
        activityTitle: `${item.display_name || item.category_name} ${ACTIVITY_LABELS[activeSlug]}`,
        image: byActiveSlug.get(activeSlug) ?? null,
      });
    });
  }

  return pages;
}

async function buildPdf(context: BuildContext, options?: { preview?: boolean }) {
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
  await addCoverPage(pdfDoc, context, fonts);
  addTeacherPages(pdfDoc, context, fonts);

  const activityPages = options?.preview ? context.fullPages.slice(0, 6) : context.fullPages;
  for (const activity of activityPages) {
    const page = pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
    await drawActivityImagePage({ pdfDoc, page, fonts, activity });
  }

  if (!options?.preview) {
    addBonusPages(pdfDoc, context, fonts);
  }

  return Buffer.from(await pdfDoc.save());
}

async function writePdf(relativePath: string, buffer: Buffer) {
  const absolutePath = resolveManagedFilePath(relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
}

export async function generateProductPackagePdfFiles(packageId: number) {
  const productPackage = await getProductPackageById(packageId);
  if (!productPackage) {
    throw new Error("产品包不存在。");
  }
  if (productPackage.items.length === 0) {
    throw new Error("产品包还没有选择三级类目。");
  }

  const context: BuildContext = {
    productPackage,
    fullPages: resolvePackageActivityPages(productPackage),
    copy: parseCopy(productPackage.copy_json),
  };
  const fullPdf = await buildPdf(context);
  const previewPdf = await buildPdf(context, { preview: true });
  const baseDir = path.join(OUTPUT_ROOT, productPackage.slug);
  const pdfFilePath = path.join(baseDir, `${productPackage.slug}.pdf`);
  const previewFilePath = path.join(baseDir, `${productPackage.slug}-preview.pdf`);
  await writePdf(pdfFilePath, fullPdf);
  await writePdf(previewFilePath, previewPdf);

  const db = getLocalDatabase();
  const timestamp = new Date().toISOString();
  db.prepare(
    "UPDATE product_packages SET pdf_file_path = ?, preview_file_path = ?, status = 'ready', updated_at = ? WHERE id = ?",
  ).run(pdfFilePath, previewFilePath, timestamp, packageId);

  return {
    productPackage: await getProductPackageById(packageId),
    pdf_file_path: pdfFilePath,
    preview_file_path: previewFilePath,
  };
}

export async function readProductPackagePdfFile(packageId: number, kind: "pdf" | "preview") {
  const productPackage = await getProductPackageById(packageId);
  const relativePath = kind === "preview" ? productPackage?.preview_file_path : productPackage?.pdf_file_path;
  if (!productPackage || !relativePath) {
    throw new Error("PDF 尚未生成。");
  }
  return {
    fileName: path.basename(relativePath),
    buffer: await readFile(resolveManagedFilePath(relativePath)),
  };
}
