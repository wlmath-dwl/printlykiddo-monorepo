import { buildSmoothCutoutBuffer } from "@/lib/smooth-cutout";

export async function buildCategoryCutoutImageBuffer(sourceBuffer: Buffer) {
  return buildSmoothCutoutBuffer(sourceBuffer, 1280);
}
