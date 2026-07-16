import type { GeneratedVideoRecord } from "@/lib/admin-types";
import { buildVideoSeoFileName } from "@/lib/video-seo-file-name";

export function buildVideoPreviewUrl(localFilePath: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("path", localFilePath);
  return `/api/admin/generated-videos/preview?${searchParams.toString()}`;
}

export function buildDownloadFileName(record: GeneratedVideoRecord) {
  const fileBase = buildVideoSeoFileName({
    categoryPath: record.category_slug_path,
    subject: record.category_name || `category-${record.category_id}`,
    poseTitle: record.pose_title,
    poseKey: record.pose_key,
    uniqueId: `v${record.id}`,
  });
  return `${fileBase}.mp4`;
}

function normalizeText(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function buildSeoKeyword(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildHashtag(value: string) {
  return `#${value.replace(/[^a-zA-Z0-9]+/g, "")}`;
}

function trimTitle(value: string) {
  if (value.length <= 95) {
    return value;
  }
  return `${value.slice(0, 92).replace(/\s+\S*$/, "")}...`;
}

export function buildYoutubeUploadCopy(record: GeneratedVideoRecord) {
  const categoryEn = normalizeText(record.category_name, `Category ${record.category_id}`);
  const subject = categoryEn.replace(/\s+/g, " ");
  const subjectKeyword = buildSeoKeyword(subject);
  const title = trimTitle(`Free ${subject} Printables for Kids | Coloring Pages and Activities`);
  const description = [
    `Free printable ${subjectKeyword} activities for kids including coloring pages, tracing worksheets, scissor skills practice, number sequence puzzles, and grid puzzles from PrintlyKiddo.com.`,
    "",
    "Great for preschool, kindergarten, homeschool, classroom activities, and quiet time.",
    "",
    "Topics:",
    `free ${subjectKeyword} printables`,
    `${subjectKeyword} coloring pages`,
    `${subjectKeyword} worksheets for kids`,
    `${subject} printable`,
    `${subject} tracing worksheets`,
    `${subject} scissor skills activity`,
    `${subject} number sequence puzzle`,
    `${subject} grid puzzle`,
  ].join("\n");
  const tags = [
    `free ${subject} printables`,
    `${subject} printable`,
    `${subject} activities for kids`,
    `${subject} coloring pages`,
    `${subject} worksheets`,
    `${subject} tracing worksheets`,
    `${subject} scissor skills`,
    `${subject} number sequence puzzle`,
    `${subject} grid puzzle`,
    "printable activities",
    "kids printables",
    "preschool worksheets",
    "kindergarten worksheets",
    "homeschool printables",
    "classroom activities",
    "YouTube Shorts",
    "PrintlyKiddo",
  ].join(", ");
  const hashtags = [
    buildHashtag(subject),
    "#PrintableActivities",
    "#KidsActivities",
    "#PreschoolPrintables",
    "#TeacherResources",
    "#Shorts",
  ].join(" ");
  const uploadSettings = [
    "Category: Education",
    "Language: English",
    "Playlist: Printable Activities for Kids",
    "Audience: Made for kids when uploading, because this is kids-directed printable learning content.",
    `Suggested thumbnail text: Free ${subject} Printables`,
  ].join("\n");

  return { title, description, tags, hashtags, uploadSettings };
}

export function formatYoutubeUploadCopy(record: GeneratedVideoRecord) {
  const copy = buildYoutubeUploadCopy(record);
  return [
    `标题\n${copy.title}`,
    `描述\n${copy.description}`,
    `标签\n${copy.tags}`,
    `Hashtags\n${copy.hashtags}`,
    `上传设置建议\n${copy.uploadSettings}`,
  ].join("\n\n");
}
