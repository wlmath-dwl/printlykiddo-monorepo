import { randomUUID } from "node:crypto";

import slugify from "slugify";

function normalizeSegment(value: string) {
  const normalized = slugify(value, {
    lower: true,
    strict: true,
    trim: true,
  });

  return normalized || "item";
}

function getFileExtension(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  return normalized.endsWith(".webp") ? ".webp" : ".webp";
}

export function buildImgObjectKey(input: {
  categorySlugPath: string[];
  activeSlug: string;
  fileName: string;
  variant?: "default" | "card";
}) {
  const fileId = randomUUID().replaceAll("-", "");
  const categoryPath = input.categorySlugPath.map(normalizeSegment).join("/");
  const activeSlug = normalizeSegment(input.activeSlug);
  const extension = getFileExtension(input.fileName);
  const suffix = input.variant === "card" ? "-card" : "";

  return `imgs/${categoryPath}/${activeSlug}/${fileId}${suffix}${extension}`;
}

export function buildImgObjectKeys(input: {
  categorySlugPath: string[];
  activeSlug: string;
  fileName: string;
}) {
  const fileId = randomUUID().replaceAll("-", "");
  const categoryPath = input.categorySlugPath.map(normalizeSegment).join("/");
  const activeSlug = normalizeSegment(input.activeSlug);
  const extension = getFileExtension(input.fileName);

  return {
    image_url: `imgs/${categoryPath}/${activeSlug}/${fileId}${extension}`,
    image_url_card: `imgs/${categoryPath}/${activeSlug}/${fileId}-card${extension}`,
  };
}
