import {
  buildLocalDevImageUrl,
  isPrintlyKiddoLocalDev,
} from "@/lib/printly-local-dev";

/** TDK（title / description）里使用的站点标识 */
export const SITE_DOMAIN_LABEL = "printlykiddo.com";

export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ||
  "https://printlykiddo.com";

/** 页眉 / 页脚展示用品牌名（与 D1 下发的首页文案可独立配置） */
export const SITE_BRAND_NAME = "PrintlyKiddo";

/** 全站稳定受众表达：帮助搜索与广告系统理解这是成人挑选、下载、打印资源站 */
export const SITE_AUDIENCE_LABEL = "parents, teachers, and other adult caregivers";

export const SITE_RESOURCE_DESCRIPTION =
  "Free printables, coloring pages, tracing sheets, and ready-to-print PDF resources for parents, teachers, and other adult caregivers.";

function getImageBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL?.trim() || "https://img.printlykiddo.com"
  ).replace(/\/+$/, "");
}

export const SITE_IMAGE_ORIGIN = (() => {
  try {
    return new URL(getImageBaseUrl()).origin;
  } catch {
    return "https://img.printlykiddo.com";
  }
})();

/**
 * 相对路径：线上拼 CDN；本地 dev 走 printlykiddo 自己的本地图片路由。
 * 绝对 http(s) 地址原样返回。
 */
export function resolveSiteImageUrl(imagePath: string) {
  const raw = imagePath.trim();
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  if (isPrintlyKiddoLocalDev()) {
    const path = raw.replace(/^\/+/, "");
    return buildLocalDevImageUrl({ path });
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${getImageBaseUrl()}${path}`;
}

/**
 * 库表中的素材地址：`image_url` + 可选 `local_file_path`（pending 时优先读本地文件）。
 */
export function resolveMaterialImageUrlFromDatabase(
  imageUrlRaw: string,
  localFilePath?: string | null,
): string {
  if (isPrintlyKiddoLocalDev() && localFilePath?.trim()) {
    return buildLocalDevImageUrl({
      localFilePath: localFilePath.trim(),
    });
  }
  return resolveSiteImageUrl(imageUrlRaw);
}

/** 首页页眉 logo（R2：imgs/site/logo.webp） */
export const SITE_HOME_LOGO_URL = resolveSiteImageUrl("imgs/site/logo.webp");
