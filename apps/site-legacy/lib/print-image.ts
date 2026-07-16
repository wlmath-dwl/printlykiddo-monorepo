/**
 * 客户端 PDF 合成。改用 jsPDF（约 107 KB gzip，比 pdf-lib 的 176 KB 小一半），
 * 兼容性更好：不依赖 `crypto.subtle` / WebAssembly，PC 与移动端浏览器（含 iOS Safari、
 * 老版 Android WebView）均可工作。
 *
 * 注意 jsPDF 坐标系：原点在左上角，Y 向下；所有绘制都以"顶部为基准"换算。
 */

const PDF_MAX_IMAGE_SIDE_PX = 1400;
const PDF_PT_PER_MM = 72 / 25.4;
const PDF_SAFE_MARGIN_PT = 12.7 * PDF_PT_PER_MM;
const PUZZLE_PAGE_MARGIN_PT = 12 * PDF_PT_PER_MM;
const PDF_TOP_CAPTION_GAP_PT = 6 * PDF_PT_PER_MM;
const PDF_DOUBLE_BLOCK_GAP_PT = 10 * PDF_PT_PER_MM;
const PDF_CAPTION_HEIGHT_PT = 6 * PDF_PT_PER_MM;
const PDF_CAPTION_FONT_SIZE_PT = 12;
const PDF_IMAGE_BORDER_WIDTH_PT = 1;
const PDF_FOOTER_QR_URL = "https://printlykiddo.com/";
const PDF_FOOTER_DOMAIN_LABEL = "printlykiddo.com";
const PDF_FOOTER_QR_SIZE_PT = 32;
const PDF_FOOTER_BOTTOM_MARGIN_PT = 16;
const PDF_PAGE_FOOTER_SPACE_PT = 46;

export type PdfPaperSize = "letter" | "a4";
export type PuzzleWorksheetPdfItem = {
  imageUrl: string;
  answerImageUrl?: string | null;
  title?: string | null;
};
export type ProgressTrackerStyle = "boxes" | "circles" | "stars";
export type ProgressTrackerFunction = {
  label: string;
  count: number;
};

const PDF_PAGE_SIZES_PT: Record<PdfPaperSize, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
};

let footerQrDataUrlPromise: Promise<string> | null = null;

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().replace(/\.pdf$/i, "");
  return `${normalized.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-") || "printables"}.pdf`;
}

function toPageLabel(count: number) {
  return count === 1 ? "1 page" : `${count} pages`;
}

function chunkItems<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function chunkPdfItemsByCaption<T extends { caption: string | null }>(
  items: T[],
  size: 1 | 2,
) {
  if (size === 1) {
    return chunkItems(items, 1);
  }

  const result: T[][] = [];
  for (let index = 0; index < items.length;) {
    const currentCaption = items[index]?.caption ?? null;
    const pageItems: T[] = [];
    while (
      index < items.length &&
      pageItems.length < size &&
      (items[index]?.caption ?? null) === currentCaption
    ) {
      pageItems.push(items[index]);
      index += 1;
    }
    result.push(pageItems);
  }
  return result;
}

function sanitizeCaption(caption?: string) {
  const normalized = caption?.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }
  return normalized.length > 42 ? `${normalized.slice(0, 39).trimEnd()}...` : normalized;
}

function getContainSize(input: {
  sourceWidth: number;
  sourceHeight: number;
  maxWidth: number;
  maxHeight: number;
}) {
  const scale = Math.min(
    input.maxWidth / input.sourceWidth,
    input.maxHeight / input.sourceHeight,
  );
  return {
    width: input.sourceWidth * scale,
    height: input.sourceHeight * scale,
  };
}

function getCenteredContainBox(input: {
  sourceWidth: number;
  sourceHeight: number;
  /** 以"顶部 Y"语义提供（与 jsPDF 一致） */
  box: { x: number; y: number; width: number; height: number };
}) {
  const size = getContainSize({
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    maxWidth: input.box.width,
    maxHeight: input.box.height,
  });

  return {
    x: input.box.x + (input.box.width - size.width) / 2,
    y: input.box.y + (input.box.height - size.height) / 2,
    width: size.width,
    height: size.height,
  };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}

function toAbsoluteImageUrl(imageUrl: string) {
  try {
    return new URL(imageUrl, window.location.origin).toString();
  } catch {
    return imageUrl;
  }
}

type RenderedPdfImage = {
  /** 以 JPEG 编码后的 dataURL，jsPDF.addImage 直接接受 */
  dataUrl: string;
  width: number;
  height: number;
};

async function renderPdfImage(
  imageUrl: string,
  options?: { grayscale?: boolean; trimWhiteMargin?: boolean },
): Promise<RenderedPdfImage> {
  const response = await fetch(imageUrl, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${imageUrl}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(
      1,
      PDF_MAX_IMAGE_SIDE_PX / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas rendering is unavailable.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = options?.grayscale ? "grayscale(1)" : "none";
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    if (options?.trimWhiteMargin) {
      const trimmed = trimWhiteCanvas(canvas, context);
      return {
        dataUrl: trimmed.toDataURL("image/jpeg", 0.92),
        width: trimmed.width,
        height: trimmed.height,
      };
    }

    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      width: targetWidth,
      height: targetHeight,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function trimWhiteCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
) {
  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] ?? 255;
      const red = data[index] ?? 255;
      const green = data[index + 1] ?? 255;
      const blue = data[index + 2] ?? 255;
      if (alpha > 8 && (red < 246 || green < 246 || blue < 246)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return canvas;
  }

  const padding = Math.round(Math.min(width, height) * 0.018);
  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropRight = Math.min(width, maxX + padding);
  const cropBottom = Math.min(height, maxY + padding);
  const cropWidth = Math.max(1, cropRight - cropX + 1);
  const cropHeight = Math.max(1, cropBottom - cropY + 1);
  const trimmed = document.createElement("canvas");
  trimmed.width = cropWidth;
  trimmed.height = cropHeight;
  const trimmedContext = trimmed.getContext("2d");
  if (!trimmedContext) {
    return canvas;
  }
  trimmedContext.fillStyle = "#ffffff";
  trimmedContext.fillRect(0, 0, cropWidth, cropHeight);
  trimmedContext.drawImage(
    canvas,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );
  return trimmed;
}

/** 单张：新窗口打开图并直接唤起打印。 */
export function printOrSaveImage(
  imageUrl: string,
  title: string,
  options?: { grayscale?: boolean },
) {
  const safeTitle = title.replace(/</g, "&lt;");
  const safeSrc = toAbsoluteImageUrl(imageUrl).replace(/"/g, "&quot;");
  const filterStyle = options?.grayscale ? "filter:grayscale(1);" : "";
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${safeTitle}</title>
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #fff;
      }
      body {
        display: flex;
        min-height: 100vh;
        align-items: center;
        justify-content: center;
      }
      img {
        max-width: 100%;
        max-height: 100vh;
        object-fit: contain;
        ${filterStyle}
      }
      @media print {
        body {
          margin: 0;
        }
      }
    </style>
  </head>
  <body>
    <img id="print-image" src="${safeSrc}" alt="">
    <script>
      const image = document.getElementById('print-image');
      const triggerPrint = () => {
        window.print();
      };
      if (image && image.complete) {
        triggerPrint();
      } else if (image) {
        image.addEventListener('load', triggerPrint, { once: true });
        image.addEventListener('error', triggerPrint, { once: true });
      } else {
        triggerPrint();
      }
    <\/script>
  </body>
</html>`;

  const htmlBlob = new Blob([html], { type: "text/html" });
  const objectUrl = URL.createObjectURL(htmlBlob);
  const w = window.open(objectUrl, "_blank");

  if (!w) {
    URL.revokeObjectURL(objectUrl);
    return;
  }

  const revoke = () => URL.revokeObjectURL(objectUrl);
  w.addEventListener("load", () => {
    setTimeout(revoke, 3000);
  }, { once: true });
}

/** 当前 tab 的所有图合并成一个多页 PDF。 */
type DownloadImagesPdfOptions = {
  fileName?: string;
  grayscale?: boolean;
  imagesPerPage?: 1 | 2;
  paperSize?: PdfPaperSize;
  captions?: string[];
};

type DownloadImagesPdfSet = DownloadImagesPdfOptions & {
  urls: string[];
};

async function createImagesPdfBlob(
  urls: string[],
  options?: DownloadImagesPdfOptions,
) {
  // 仅在用户点击下载时才下载 jsPDF chunk（约 107KB gzip）。
  const { jsPDF } = await import("jspdf");

  const imagesPerPage = options?.imagesPerPage ?? 1;
  const paperSize = options?.paperSize ?? "letter";
  const pageSize = PDF_PAGE_SIZES_PT[paperSize];

  const pdfItems = urls.map((url, index) => ({
    url,
    caption: sanitizeCaption(options?.captions?.[index]),
  }));

  const doc = new jsPDF({
    unit: "pt",
    format: [pageSize.width, pageSize.height],
    orientation: "portrait",
    compress: true,
  });
  doc.setFont("helvetica", "normal");

  const footerQrDataUrl = await getFooterQrDataUrl();
  const pages = chunkPdfItemsByCaption(pdfItems, imagesPerPage);
  let isFirstPage = true;

  function drawTopCaption(caption: string | null) {
    if (!caption) {
      return;
    }
    const maxWidth = pageSize.width - PDF_SAFE_MARGIN_PT * 2;
    doc.setFontSize(PDF_CAPTION_FONT_SIZE_PT);
    const rawTextWidth = doc.getTextWidth(caption);
    const fontSize = Math.max(
      10,
      Math.min(
        PDF_CAPTION_FONT_SIZE_PT,
        (maxWidth / Math.max(rawTextWidth, 1)) * PDF_CAPTION_FONT_SIZE_PT,
      ),
    );
    doc.setFontSize(fontSize);
    doc.setTextColor(59, 53, 44); // 与 pdf-lib rgb(0.231,0.208,0.173) 一致
    // jsPDF text 默认以基线为锚点，y 从顶向下。
    // 让 caption 顶部贴在 PDF_SAFE_MARGIN_PT，文本中央水平居中。
    doc.text(caption, pageSize.width / 2, PDF_SAFE_MARGIN_PT + fontSize, {
      align: "center",
      baseline: "alphabetic",
      maxWidth,
    });
  }

  function drawImageBorder(box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    doc.setLineWidth(PDF_IMAGE_BORDER_WIDTH_PT);
    doc.setDrawColor(0, 0, 0);
    doc.rect(box.x, box.y, box.width, box.height, "S");
  }

  for (const [pageIndex, pageItems] of pages.entries()) {
    const renderedItems: RenderedPdfImage[] = [];
    for (const item of pageItems) {
      renderedItems.push(
        await renderPdfImage(item.url, { grayscale: options?.grayscale }),
      );
    }

    if (!isFirstPage) {
      doc.addPage([pageSize.width, pageSize.height], "portrait");
    }
    isFirstPage = false;

    const contentWidth = pageSize.width - PDF_SAFE_MARGIN_PT * 2;
    const contentHeight = pageSize.height - PDF_SAFE_MARGIN_PT - PDF_PAGE_FOOTER_SPACE_PT;
    const pageCaption = pageItems[0]?.caption ?? null;
    const topCaptionBlockHeight = pageCaption
      ? PDF_CAPTION_HEIGHT_PT + PDF_TOP_CAPTION_GAP_PT
      : 0;
    /** 图片可绘制区域顶部 Y（从顶部算） */
    const imageAreaTopY = PDF_SAFE_MARGIN_PT + topCaptionBlockHeight;
    const imageAreaHeight = contentHeight - topCaptionBlockHeight;

    drawTopCaption(pageCaption);

    if (imagesPerPage === 1) {
      const rendered = renderedItems[0];
      if (!rendered) {
        continue;
      }

      const drawBox = getCenteredContainBox({
        sourceWidth: rendered.width,
        sourceHeight: rendered.height,
        box: {
          x: PDF_SAFE_MARGIN_PT,
          y: imageAreaTopY,
          width: contentWidth,
          height: imageAreaHeight,
        },
      });

      doc.addImage(
        rendered.dataUrl,
        "JPEG",
        drawBox.x,
        drawBox.y,
        drawBox.width,
        drawBox.height,
        undefined,
        "FAST",
      );
      drawImageBorder(drawBox);
      drawPdfFooter(doc, pageSize, pageIndex + 1, footerQrDataUrl);
      continue;
    }

    // 2 张/页：上下分两个等高 slot。
    const twoUpSlotHeight = Math.max(
      1,
      (imageAreaHeight - PDF_DOUBLE_BLOCK_GAP_PT) / 2,
    );
    const totalHeight =
      twoUpSlotHeight * renderedItems.length +
      PDF_DOUBLE_BLOCK_GAP_PT * Math.max(0, renderedItems.length - 1);
    const groupTopY =
      imageAreaTopY + Math.max(0, (imageAreaHeight - totalHeight) / 2);

    for (const [index, rendered] of renderedItems.entries()) {
      const slotTopY =
        groupTopY + index * (twoUpSlotHeight + PDF_DOUBLE_BLOCK_GAP_PT);
      const drawBox = getCenteredContainBox({
        sourceWidth: rendered.width,
        sourceHeight: rendered.height,
        box: {
          x: PDF_SAFE_MARGIN_PT,
          y: slotTopY,
          width: contentWidth,
          height: twoUpSlotHeight,
        },
      });

      doc.addImage(
        rendered.dataUrl,
        "JPEG",
        drawBox.x,
        drawBox.y,
        drawBox.width,
        drawBox.height,
        undefined,
        "FAST",
      );
      drawImageBorder(drawBox);
    }
    drawPdfFooter(doc, pageSize, pageIndex + 1, footerQrDataUrl);
  }

  return doc.output("blob");
}

function downloadPdfBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = sanitizeFileName(fileName);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
}

function getFooterQrDataUrl() {
  footerQrDataUrlPromise ??= import("qrcode").then(({ default: QRCode }) =>
    QRCode.toDataURL(PDF_FOOTER_QR_URL, {
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 6,
      color: {
        dark: "#3B352C",
        light: "#FFFFFF",
      },
    }),
  );

  return footerQrDataUrlPromise;
}

export async function downloadImagesPdf(
  urls: string[],
  options?: DownloadImagesPdfOptions,
) {
  if (urls.length === 0) {
    return;
  }

  const blob = await createImagesPdfBlob(urls, options);
  downloadPdfBlob(blob, options?.fileName || `printables-${toPageLabel(urls.length)}`);
}

export async function downloadImagePdfSets(
  sets: DownloadImagesPdfSet[],
) {
  const printableSets = sets.filter((set) => set.urls.length > 0);
  if (printableSets.length === 0) {
    return;
  }

  // 串行生成（jsPDF 实例之间互不影响，但串行可避免同时占用大量内存与解码线程）。
  const pdfs: Array<{ blob: Blob; fileName: string }> = [];
  for (const set of printableSets) {
    pdfs.push({
      blob: await createImagesPdfBlob(set.urls, set),
      fileName: set.fileName || `printables-${toPageLabel(set.urls.length)}`,
    });
  }

  const anchors = pdfs.map((pdf) => {
    const objectUrl = URL.createObjectURL(pdf.blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = sanitizeFileName(pdf.fileName);
    document.body.append(anchor);
    return { anchor, objectUrl };
  });

  for (const { anchor } of anchors) {
    anchor.click();
  }

  for (const { anchor, objectUrl } of anchors) {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
  }
}

function drawPdfFooter(
  doc: import("jspdf").jsPDF,
  pageSize: { width: number; height: number },
  pageNumber: number,
  qrDataUrl: string,
  options?: { showPageNumber?: boolean },
) {
  const qrX = PDF_SAFE_MARGIN_PT;
  const qrY = pageSize.height - PDF_FOOTER_BOTTOM_MARGIN_PT - PDF_FOOTER_QR_SIZE_PT;

  doc.addImage(
    qrDataUrl,
    "PNG",
    qrX,
    qrY,
    PDF_FOOTER_QR_SIZE_PT,
    PDF_FOOTER_QR_SIZE_PT,
    undefined,
    "FAST",
  );
  doc.setFontSize(10);
  doc.setTextColor(111, 104, 93);
  doc.text(
    PDF_FOOTER_DOMAIN_LABEL,
    qrX + PDF_FOOTER_QR_SIZE_PT + 7,
    qrY + PDF_FOOTER_QR_SIZE_PT / 2 + 3,
  );
  if (options?.showPageNumber !== false) {
    doc.text(
      `Page ${pageNumber}`,
      pageSize.width - PDF_SAFE_MARGIN_PT,
      pageSize.height - PDF_FOOTER_BOTTOM_MARGIN_PT,
      {
        align: "right",
      },
    );
  }
}

function drawPuzzlePageHeader(
  doc: import("jspdf").jsPDF,
  pageSize: { width: number; height: number },
  showNameDate: boolean,
) {
  if (!showNameDate) {
    return;
  }

  doc.setTextColor(59, 53, 44);
  const lineY = PUZZLE_PAGE_MARGIN_PT + 10;
  doc.setFontSize(10);
  doc.text("Name: ____________________", PUZZLE_PAGE_MARGIN_PT, lineY);
  doc.text("Date: ______________", pageSize.width - PUZZLE_PAGE_MARGIN_PT, lineY, {
    align: "right",
  });
}

function getPuzzleGridBoxes(input: {
  pageSize: { width: number; height: number };
  puzzlesPerPage: 1 | 2 | 4;
  showNameDate: boolean;
  headerBottom?: number;
}) {
  const headerBottom =
    input.headerBottom ??
    (input.showNameDate ? PUZZLE_PAGE_MARGIN_PT + 22 : PUZZLE_PAGE_MARGIN_PT);
  const top = headerBottom + 12;
  const bottom = PDF_PAGE_FOOTER_SPACE_PT;
  const contentWidth = input.pageSize.width - PUZZLE_PAGE_MARGIN_PT * 2;
  const contentHeight = input.pageSize.height - top - bottom;
  const gap = input.puzzlesPerPage === 4 ? 8 : 18;

  if (input.puzzlesPerPage === 1) {
    return [{ x: PUZZLE_PAGE_MARGIN_PT, y: top, width: contentWidth, height: contentHeight }];
  }

  if (input.puzzlesPerPage === 2) {
    const height = (contentHeight - gap) / 2;
    return [
      { x: PUZZLE_PAGE_MARGIN_PT, y: top, width: contentWidth, height },
      { x: PUZZLE_PAGE_MARGIN_PT, y: top + height + gap, width: contentWidth, height },
    ];
  }

  const width = (contentWidth - gap) / 2;
  const height = (contentHeight - gap) / 2;
  return [
    { x: PUZZLE_PAGE_MARGIN_PT, y: top, width, height },
    { x: PUZZLE_PAGE_MARGIN_PT + width + gap, y: top, width, height },
    { x: PUZZLE_PAGE_MARGIN_PT, y: top + height + gap, width, height },
    { x: PUZZLE_PAGE_MARGIN_PT + width + gap, y: top + height + gap, width, height },
  ];
}

function drawPuzzleAnswerPageHeader(
  doc: import("jspdf").jsPDF,
  pageSize: { width: number; height: number },
  sourcePageNumber: number,
) {
  doc.setTextColor(59, 53, 44);
  doc.setFontSize(16);
  doc.text(`Answer Key for Page ${sourcePageNumber}`, pageSize.width / 2, PUZZLE_PAGE_MARGIN_PT + 16, {
    align: "center",
  });
}

export async function downloadPuzzleWorksheetPdf(options: {
  items: PuzzleWorksheetPdfItem[];
  fileName: string;
  paperSize?: PdfPaperSize;
  puzzlesPerPage: 1 | 2 | 4;
  showNameDate: boolean;
  includeAnswerKey: boolean;
}) {
  if (options.items.length === 0) {
    return;
  }

  const { jsPDF } = await import("jspdf");
  const paperSize = options.paperSize ?? "letter";
  const pageSize = PDF_PAGE_SIZES_PT[paperSize];
  const doc = new jsPDF({
    unit: "pt",
    format: [pageSize.width, pageSize.height],
    orientation: "portrait",
    compress: true,
  });
  doc.setFont("helvetica", "normal");

  const footerQrDataUrl = await getFooterQrDataUrl();
  const puzzlePages = chunkItems(options.items, options.puzzlesPerPage);
  let pageNumber = 0;
  let isFirstPage = true;

  for (const [pageIndex, pageItems] of puzzlePages.entries()) {
    if (!isFirstPage) {
      doc.addPage([pageSize.width, pageSize.height], "portrait");
    }
    isFirstPage = false;
    pageNumber += 1;

    drawPuzzlePageHeader(doc, pageSize, options.showNameDate);
    const boxes = getPuzzleGridBoxes({
      pageSize,
      puzzlesPerPage: options.puzzlesPerPage,
      showNameDate: options.showNameDate,
    });

    for (const [index, item] of pageItems.entries()) {
      const box = boxes[index];
      const rendered = await renderPdfImage(item.imageUrl, {
        grayscale: true,
        trimWhiteMargin: true,
      });
      const drawBox = getCenteredContainBox({
        sourceWidth: rendered.width,
        sourceHeight: rendered.height,
        box: { ...box, y: box.y + 14, height: box.height - 14 },
      });
      doc.setTextColor(59, 53, 44);
      doc.setFontSize(12);
      doc.text(
        `Puzzle ${pageIndex * options.puzzlesPerPage + index + 1}`,
        drawBox.x,
        Math.max(box.y + 12, drawBox.y - 5),
      );
      doc.addImage(
        rendered.dataUrl,
        "JPEG",
        drawBox.x,
        drawBox.y,
        drawBox.width,
        drawBox.height,
        undefined,
        "FAST",
      );
    }

    drawPdfFooter(doc, pageSize, pageNumber, footerQrDataUrl);
  }

  if (!options.includeAnswerKey) {
    downloadPdfBlob(doc.output("blob"), options.fileName);
    return;
  }

  for (const [sourcePageIndex, sourcePageItems] of puzzlePages.entries()) {
    const answerPageItems = sourcePageItems
      .map((item, index) => ({
        answerImageUrl: item.answerImageUrl,
        puzzleNumber: sourcePageIndex * options.puzzlesPerPage + index + 1,
      }))
      .filter((item) => item.answerImageUrl);
    if (answerPageItems.length === 0) {
      continue;
    }

    doc.addPage([pageSize.width, pageSize.height], "portrait");
    pageNumber += 1;

    drawPuzzleAnswerPageHeader(doc, pageSize, sourcePageIndex + 1);
    const boxes = getPuzzleGridBoxes({
      pageSize,
      puzzlesPerPage: options.puzzlesPerPage,
      showNameDate: false,
      headerBottom: PUZZLE_PAGE_MARGIN_PT + 28,
    });
    for (const [index, item] of answerPageItems.entries()) {
      const box = boxes[index];
      if (!item.answerImageUrl) {
        continue;
      }
      const rendered = await renderPdfImage(item.answerImageUrl, {
        grayscale: true,
        trimWhiteMargin: true,
      });
      const drawBox = getCenteredContainBox({
        sourceWidth: rendered.width,
        sourceHeight: rendered.height,
        box: { ...box, y: box.y + 14, height: box.height - 14 },
      });
      doc.setTextColor(59, 53, 44);
      doc.setFontSize(12);
      doc.text(
        `Puzzle ${item.puzzleNumber} Answer`,
        drawBox.x,
        Math.max(box.y + 12, drawBox.y - 5),
      );
      doc.addImage(
        rendered.dataUrl,
        "JPEG",
        drawBox.x,
        drawBox.y,
        drawBox.width,
        drawBox.height,
        undefined,
        "FAST",
      );
    }
    drawPdfFooter(doc, pageSize, pageNumber, footerQrDataUrl);
  }

  downloadPdfBlob(doc.output("blob"), options.fileName);
}

async function drawProgressTrackerHeader(
  doc: import("jspdf").jsPDF,
  pageSize: { width: number; height: number },
  topicTitle: string,
  topicImageUrl?: string | null,
) {
  const margin = PDF_SAFE_MARGIN_PT;
  doc.setTextColor(59, 53, 44);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(`${topicTitle} Activity Chart`, pageSize.width / 2, margin + 16, {
    align: "center",
  });

  let contentY = margin + 52;

  if (topicImageUrl) {
    try {
      const rendered = await renderPdfImage(topicImageUrl, {
        grayscale: true,
        trimWhiteMargin: true,
      });
      const imageBox = getCenteredContainBox({
        sourceWidth: rendered.width,
        sourceHeight: rendered.height,
        box: {
          x: (pageSize.width - 190) / 2,
          y: contentY,
          width: 190,
          height: 118,
        },
      });
      doc.addImage(
        rendered.dataUrl,
        "JPEG",
        imageBox.x,
        imageBox.y,
        imageBox.width,
        imageBox.height,
        undefined,
        "FAST",
      );
      contentY += 130;
    } catch {
      contentY += 8;
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Name: ____________________", margin, contentY);
  doc.text("Date: ______________", pageSize.width - margin, contentY, {
    align: "right",
  });
  doc.setFontSize(11);
  doc.setTextColor(111, 104, 93);
  doc.text(
    "Complete activities and fill your chart!",
    pageSize.width / 2,
    contentY + 28,
    { align: "center" },
  );
  doc.text(
    "Color, stamp, or add a sticker each time you finish an activity.",
    pageSize.width / 2,
    contentY + 45,
    { align: "center" },
  );

  return contentY + 78;
}

function drawActivityChartRow(
  doc: import("jspdf").jsPDF,
  options: {
    label: string;
    count: number;
    style: ProgressTrackerStyle;
    pageSize: { width: number; height: number };
    y: number;
  },
) {
  const margin = PDF_SAFE_MARGIN_PT;
  const labelWidth = 205;
  const spotSize = 27;
  const spotGap = 8;
  const spotStartX = margin + labelWidth + 12;
  const availableWidth = options.pageSize.width - margin - spotStartX;
  const columns = Math.max(
    1,
    Math.floor((availableWidth + spotGap) / (spotSize + spotGap)),
  );
  const rows = Math.max(1, Math.ceil(options.count / columns));
  const rowHeight = rows * spotSize + Math.max(0, rows - 1) * 7;
  const blockHeight = Math.max(38, rowHeight);

  doc.setTextColor(59, 53, 44);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(
    options.label,
    margin,
    options.y + Math.min(19, blockHeight / 2 + 5),
  );

  const spotsTop = options.y + Math.max(0, (blockHeight - rowHeight) / 2);
  for (let index = 0; index < options.count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    drawProgressTrackerSpot(doc, {
      x: spotStartX + column * (spotSize + spotGap),
      y: spotsTop + row * (spotSize + 7),
      size: spotSize,
      style: options.style,
    });
  }

  return blockHeight;
}

function getActivityChartRowHeight(input: {
  count: number;
  pageSize: { width: number; height: number };
}) {
  const margin = PDF_SAFE_MARGIN_PT;
  const labelWidth = 205;
  const spotSize = 27;
  const spotGap = 8;
  const spotStartX = margin + labelWidth + 12;
  const availableWidth = input.pageSize.width - margin - spotStartX;
  const columns = Math.max(
    1,
    Math.floor((availableWidth + spotGap) / (spotSize + spotGap)),
  );
  const rows = Math.max(1, Math.ceil(input.count / columns));
  return Math.max(38, rows * spotSize + Math.max(0, rows - 1) * 7);
}

function getSoftStarPoints(input: {
  centerX: number;
  centerY: number;
  outerRadius: number;
  innerRadius: number;
}) {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? input.outerRadius : input.innerRadius;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    return {
      x: input.centerX + Math.cos(angle) * radius,
      y: input.centerY + Math.sin(angle) * radius,
    };
  });
}

function drawProgressTrackerSpot(
  doc: import("jspdf").jsPDF,
  options: {
    x: number;
    y: number;
    size: number;
    style: ProgressTrackerStyle;
  },
) {
  doc.setDrawColor(59, 53, 44);
  doc.setLineWidth(1.2);
  doc.setLineCap("round");
  doc.setLineJoin("round");

  if (options.style === "circles") {
    doc.circle(
      options.x + options.size / 2,
      options.y + options.size / 2,
      options.size / 2,
      "S",
    );
    return;
  }

  if (options.style === "stars") {
    const centerX = options.x + options.size / 2;
    const centerY = options.y + options.size / 2;
    const points = getSoftStarPoints({
      centerX,
      centerY,
      outerRadius: options.size * 0.48,
      innerRadius: options.size * 0.27,
    });
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      if (current && next) {
        doc.line(current.x, current.y, next.x, next.y);
      }
    }
    return;
  }

  {
    doc.roundedRect(options.x, options.y, options.size, options.size, 5, 5, "S");
  }
}

export async function downloadProgressTrackerPdf(options: {
  topicTitle: string;
  fileName: string;
  paperSize?: PdfPaperSize;
  style: ProgressTrackerStyle;
  topicImageUrl?: string | null;
  functions: ProgressTrackerFunction[];
}) {
  const enabledFunctions = options.functions.filter((item) => item.count > 0);
  if (enabledFunctions.length === 0) {
    return;
  }

  const { jsPDF } = await import("jspdf");
  const paperSize = options.paperSize ?? "letter";
  const pageSize = PDF_PAGE_SIZES_PT[paperSize];
  const doc = new jsPDF({
    unit: "pt",
    format: [pageSize.width, pageSize.height],
    orientation: "portrait",
    compress: true,
  });
  doc.setFont("helvetica", "normal");

  const footerQrDataUrl = await getFooterQrDataUrl();
  const margin = PDF_SAFE_MARGIN_PT;
  const pageBottom = pageSize.height - PDF_PAGE_FOOTER_SPACE_PT - 10;
  let pageNumber = 1;
  let y = await drawProgressTrackerHeader(
    doc,
    pageSize,
    options.topicTitle,
    options.topicImageUrl,
  );

  const rowGap = 13;

  for (const trackerFunction of enabledFunctions) {
    const rowHeight = getActivityChartRowHeight({
      count: trackerFunction.count,
      pageSize,
    });

    if (y + rowHeight > pageBottom) {
      drawPdfFooter(doc, pageSize, pageNumber, footerQrDataUrl, {
        showPageNumber: false,
      });
      doc.addPage([pageSize.width, pageSize.height], "portrait");
      pageNumber += 1;
      y = margin;
    }

    y += drawActivityChartRow(doc, {
      label: trackerFunction.label,
      count: trackerFunction.count,
      style: options.style,
      pageSize,
      y,
    }) + rowGap;
  }

  const closingGap = 28;
  y += closingGap;

  if (y + 32 > pageBottom) {
    drawPdfFooter(doc, pageSize, pageNumber, footerQrDataUrl, {
      showPageNumber: false,
    });
    doc.addPage([pageSize.width, pageSize.height], "portrait");
    pageNumber += 1;
    y = margin;
  }

  doc.setTextColor(59, 53, 44);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Great job!", pageSize.width / 2, y + 4, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(111, 104, 93);
  doc.text("You did it! Now color your picture.", pageSize.width / 2, y + 24, {
    align: "center",
  });
  drawPdfFooter(doc, pageSize, pageNumber, footerQrDataUrl, {
    showPageNumber: false,
  });

  downloadPdfBlob(doc.output("blob"), options.fileName);
}
