import Image from "next/image";

type CategoryCardImageProps = {
  src: string;
  alt: string;
  className?: string;
  /** 铺满卡片上半区（7:3 布局） */
  fillParent?: boolean;
  /** 64×64 目录缩略图，用于紧凑列表行 */
  thumb?: boolean;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  /** 用于响应式 srcset；默认按上下文给一个保守值 */
  sizes?: string;
  /** 首页入口卡片需要更大的图，减少内边距。 */
  imageScale?: "normal" | "large";
};

/**
 * 纯展示图片保持服务端渲染，避免分类卡片产生不必要的 hydration。
 * 走 next/image 自动 AVIF/WebP + 响应式 srcset，比原生 img 显著省字节。
 */
export function CategoryCardImage({
  src,
  alt,
  className,
  fillParent = false,
  thumb = false,
  loading = "lazy",
  fetchPriority,
  sizes,
  imageScale = "normal",
}: CategoryCardImageProps) {
  const shell = thumb
    ? `relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-black/[0.06] bg-white ${className ?? ""}`
    : fillParent
      ? `relative h-full w-full min-h-0 overflow-hidden bg-white ${className ?? ""}`
      : `relative aspect-square w-full overflow-hidden bg-white ${className ?? ""}`;

  const innerClassName = [
    "relative z-10",
    thumb
      ? "object-contain p-1.5 transition-opacity duration-300 group-hover:opacity-95"
      : fillParent
        ? imageScale === "large"
          ? "object-contain p-4 md:p-5"
          : "object-contain p-6 md:p-8"
        : "object-contain p-4 transition-opacity duration-300 md:p-5",
  ].join(" ");

  const resolvedSizes =
    sizes ?? (thumb ? "64px" : fillParent ? "(min-width: 1024px) 220px, (min-width: 640px) 33vw, 50vw" : "(min-width: 1024px) 240px, (min-width: 640px) 33vw, 50vw");

  return (
    <div className={shell}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={resolvedSizes}
        loading={loading}
        priority={loading === "eager" && fetchPriority === "high"}
        fetchPriority={fetchPriority}
        className={innerClassName}
      />
    </div>
  );
}
