export type PinterestImageVariant = "long" | "coloring" | "play" | "count" | "cutout" | "tracing" | string | null | undefined;

const PINTEREST_VARIANT_FILE_PART: Record<string, string> = {
  long: "activity-pack",
  coloring: "coloring-page",
  tracing: "tracing-worksheet",
  play: "grid-puzzle",
  cutout: "cut-out-activity",
  count: "number-sequencing-puzzle",
};

function slugifyPinterestFilePart(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "kids";
}

function cleanFileExtension(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized || "png";
}

export function buildPinterestImageFileName(input: {
  subject: string | null | undefined;
  variant: PinterestImageVariant;
  extension?: string;
  descriptor?: string | null;
}) {
  const subject = slugifyPinterestFilePart(input.subject?.trim() || "kids");
  const contentType = PINTEREST_VARIANT_FILE_PART[input.variant || ""] ?? "printable-activity";
  const descriptor = input.descriptor?.trim() ? slugifyPinterestFilePart(input.descriptor) : "";
  const extension = cleanFileExtension(input.extension ?? "png");
  const baseName = ["free-printable", subject, contentType, descriptor].filter(Boolean).join("-");

  return `${baseName.slice(0, 120).replace(/-+$/g, "")}.${extension}`;
}
