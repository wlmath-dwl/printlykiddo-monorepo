export type SvgMetadata = {
  width: number;
  height: number;
  viewBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type SvgVectorLayer = {
  color: string;
  pathTag: string;
};

const DEFAULT_VIEWBOX_SIZE = 1000;

function parseNumber(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseSvgMetadata(svgText: string): SvgMetadata {
  const svgTagMatch = svgText.match(/<svg\b([^>]*)>/i);
  const attrs = svgTagMatch?.[1] ?? "";
  const viewBoxMatch = attrs.match(/viewBox="([^"]+)"/i);

  if (viewBoxMatch) {
    const [x, y, width, height] = viewBoxMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map((part) => Number.parseFloat(part));

    if (
      [x, y, width, height].every((item) => Number.isFinite(item)) &&
      width > 0 &&
      height > 0
    ) {
      return {
        width: parseNumber(attrs.match(/\bwidth="([^"]+)"/i)?.[1]) ?? width,
        height: parseNumber(attrs.match(/\bheight="([^"]+)"/i)?.[1]) ?? height,
        viewBox: { x, y, width, height },
      };
    }
  }

  const width = parseNumber(attrs.match(/\bwidth="([^"]+)"/i)?.[1]) ?? DEFAULT_VIEWBOX_SIZE;
  const height = parseNumber(attrs.match(/\bheight="([^"]+)"/i)?.[1]) ?? DEFAULT_VIEWBOX_SIZE;

  return {
    width,
    height,
    viewBox: {
      x: 0,
      y: 0,
      width,
      height,
    },
  };
}

export function extractSvgPathTags(svgText: string) {
  return svgText.match(/<path\b[^>]*\/?>/gi) ?? [];
}

export function buildLayeredVectorSvg(options: {
  width: number;
  height: number;
  layers: SvgVectorLayer[];
}) {
  const { width, height, layers } = options;
  const content = layers
    .map((layer) => `  ${layer.pathTag.replace(/fill="[^"]*"/i, `fill="${layer.color}"`)}`)
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" version="1.1">
${content}
</svg>`;
}
