type VideoSeoFileNameInput = {
  categoryPath?: Array<string | null | undefined>;
  subject?: string | null;
  poseTitle?: string | null;
  poseKey?: string | null;
  uniqueId: string | number;
};

function toSlugPart(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isGenericPoseSlug(value: string) {
  return /^pose-\d+$/u.test(value) || /^default-pose$/u.test(value);
}

export function buildVideoSeoFileName(input: VideoSeoFileNameInput) {
  const categoryParts = (input.categoryPath || []).map(toSlugPart).filter(Boolean);
  const subjectPart = toSlugPart(input.subject);
  const poseTitlePart = toSlugPart(input.poseTitle);
  const poseKeyPart = toSlugPart(input.poseKey);
  const posePart = poseTitlePart || (isGenericPoseSlug(poseKeyPart) ? "" : poseKeyPart);
  const uniquePart = toSlugPart(String(input.uniqueId)) || "v";

  return [...(categoryParts.length ? categoryParts : [subjectPart || "printable"]), posePart, "puzzle", uniquePart]
    .filter(Boolean)
    .join("-");
}
