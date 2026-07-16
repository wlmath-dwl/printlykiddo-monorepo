import type { CSSProperties } from "react";

export const DEFAULT_COLLECTION_THEME_COLOR = "#7ADDE8";

export function normalizeCollectionThemeColor(value?: string | null) {
  return /^#[0-9A-F]{6}$/i.test(value?.trim() || "")
    ? String(value).trim().toUpperCase()
    : DEFAULT_COLLECTION_THEME_COLOR;
}

type RgbColor = [red: number, green: number, blue: number];

function darken([red, green, blue]: RgbColor, amount: number): RgbColor {
  const scale = 1 - amount;

  return [red, green, blue].map((channel) =>
    Math.round(channel * scale),
  ) as RgbColor;
}

function toHex([red, green, blue]: RgbColor) {
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function relativeLuminance([red, green, blue]: RgbColor) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(first: RgbColor, second: RgbColor) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

export function buildCollectionThemeStyle(value?: string | null): CSSProperties {
  const color = normalizeCollectionThemeColor(value);
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const rgb: RgbColor = [red, green, blue];
  const button = darken(rgb, 0.24);
  const buttonHover = darken(rgb, 0.26);
  const buttonActive = darken(rgb, 0.27);
  const darkInk: RgbColor = [52, 46, 32];
  const lightInk: RgbColor = [255, 255, 255];
  const buttonInk =
    contrastRatio(buttonActive, darkInk) >= contrastRatio(buttonActive, lightInk)
      ? darkInk
      : lightInk;

  return {
    "--collection-theme": color,
    "--collection-theme-rgb": `${red} ${green} ${blue}`,
    "--collection-button": toHex(button),
    "--collection-button-hover": toHex(buttonHover),
    "--collection-button-active": toHex(buttonActive),
    "--collection-button-rgb": button.join(" "),
    "--collection-button-ink": toHex(buttonInk),
  } as CSSProperties;
}
