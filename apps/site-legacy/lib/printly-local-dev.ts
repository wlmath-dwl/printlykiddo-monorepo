/**
 * 与 `lib/d1.ts` 中 `getRemoteDatabase` 一致：`next dev` 时走本地 sqlite。
 * 图片在 dev 下也走 printlykiddo 自己的本地文件路由，不依赖 admin 服务是否启动。
 * 线上（production）始终用远端 D1 + CDN，不受此处影响。
 */

/** 是否处于 Next.js 本地开发（`next dev`） */
export function isPrintlyKiddoLocalDev(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.PRINTLY_STATIC_RENDER !== "1"
  );
}

/** 本地开发下统一走前台自己的图片代理路由。 */
export function buildLocalDevImageUrl(options: {
  path?: string | null;
  localFilePath?: string | null;
  categoryImageId?: string | null;
}) {
  const params = new URLSearchParams();

  if (options.path?.trim()) {
    params.set("path", options.path.trim());
  }
  if (options.localFilePath?.trim()) {
    params.set("local_file_path", options.localFilePath.trim());
  }
  if (options.categoryImageId?.trim()) {
    params.set("category_image_id", options.categoryImageId.trim());
  }

  return `/api/local-dev/image?${params.toString()}`;
}
