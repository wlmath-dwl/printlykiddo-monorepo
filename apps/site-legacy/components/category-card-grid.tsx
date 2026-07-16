import { CategoryCardImage } from "@/components/category-card-image";
import { DownloadedBadge } from "@/components/downloaded-badge";
import type { ChildCategory, FirstCategory } from "@/lib/d1";

/** 一级 / 二级列表卡片字段一致 */
type CategoryCardItem = FirstCategory | ChildCategory;

type CategoryCardGridProps = {
  items: CategoryCardItem[];
  badgeLabel: string;
  imageUrlBuilder?: (item: CategoryCardItem) => string | null;
  hrefBuilder?: (item: CategoryCardItem) => string | null;
  /** 覆盖默认栅格，例如首页 `xl:grid-cols-4` */
  gridClassName?: string;
  /** 首屏内预计可见的图片数量；这些图片不使用 lazy。 */
  imagePriorityCount?: number;
  /** 仅三级入口使用：按本机下载历史显示 Downloaded 标记。 */
  showDownloadedBadges?: boolean;
  /**
   * 网格中的第一张图是否充当 LCP 候选（fetchPriority=high）。
   * 页面已有 hero 图时设 false，避免与 hero 抢 LCP。
   */
  firstImageIsLcpCandidate?: boolean;
  /**
   * mosaic：大图竖卡（首页主类目）
   * home：首页入口卡片，轻量、规整、适合四列浏览
   * directory：小竖卡，上图 + 居中名称（子类目总览）
   */
  layout?: "mosaic" | "home" | "directory";
};

function formatCategoryDisplayTitle(title: string) {
  return title.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

/** 竖向大卡：暖色块 + 上图下文 */
const mosaicCardClass =
  "group flex aspect-[4/5] w-full flex-col overflow-hidden rounded-3xl border-0 bg-warm-card shadow-none transition-transform duration-300 ease-out hover:-translate-y-1";

const homeCardClass =
  "group flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-black/[0.06] bg-white shadow-[0_10px_28px_rgba(58,42,25,0.06)] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(58,42,25,0.09)]";

/** 目录小竖卡：全宽方图 + 底部标题区，比横条更高、更易扫 */
const directoryCardClass =
  "group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-panel-line bg-white shadow-none transition-colors duration-200 hover:border-panel-line";

export function CategoryDirectoryCard({
  id,
  title,
  badgeLabel,
  imageUrl,
  href,
  imageLoading,
  imageFetchPriority,
  showDownloadedBadge = false,
}: {
  title: string;
  id?: number | string;
  badgeLabel: string;
  imageUrl: string | null;
  href: string | null;
  imageLoading: "eager" | "lazy";
  imageFetchPriority?: "high" | "low" | "auto";
  showDownloadedBadge?: boolean;
}) {
  const imageBlock = imageUrl ? (
    <div className="relative aspect-square w-full shrink-0 border-b border-black/[0.06] bg-white">
      {showDownloadedBadge && id !== undefined ? (
        <DownloadedBadge id={id} url={href} />
      ) : null}
      <CategoryCardImage
        src={imageUrl}
        alt={title}
        fillParent
        className="!bg-white"
        loading={imageLoading}
        fetchPriority={imageFetchPriority}
      />
    </div>
  ) : (
    <div
      className="relative flex aspect-square w-full shrink-0 items-center justify-center border-b border-black/[0.06] bg-white text-sm font-semibold uppercase tracking-wider text-warm-coffee/45"
      aria-hidden
    >
      {showDownloadedBadge && id !== undefined ? (
        <DownloadedBadge id={id} url={href} />
      ) : null}
      {(title || badgeLabel).slice(0, 2)}
    </div>
  );

  const footer = (
    <div className="flex items-center justify-center px-3 py-2.5">
      <h3 className="line-clamp-2 w-full min-w-0 text-center text-sm font-semibold leading-snug tracking-wide text-warm-ink">
        {formatCategoryDisplayTitle(title)}
      </h3>
    </div>
  );

  const body = (
    <>
      {imageBlock}
      {footer}
    </>
  );

  if (href) {
    return (
      <a href={href} className={directoryCardClass}>
        {body}
      </a>
    );
  }

  return <article className={directoryCardClass}>{body}</article>;
}

function HomeCard({
  category,
  badgeLabel,
  imageUrl,
  href,
  imageLoading,
  imageFetchPriority,
}: {
  category: CategoryCardItem;
  badgeLabel: string;
  imageUrl: string | null;
  href: string | null;
  imageLoading: "eager" | "lazy";
  imageFetchPriority?: "high" | "low" | "auto";
}) {
  const imageBlock = imageUrl ? (
    <div className="relative aspect-square w-full shrink-0 border-b border-black/[0.05] bg-white">
      <CategoryCardImage
        src={imageUrl}
        alt={category.title}
        fillParent
        className="!bg-white"
        loading={imageLoading}
        fetchPriority={imageFetchPriority}
        sizes="(min-width: 1280px) 180px, (min-width: 768px) 22vw, 42vw"
      />
    </div>
  ) : (
    <div className="flex aspect-square w-full shrink-0 items-center justify-center border-b border-black/[0.05] bg-white">
      <div className="rounded-full border border-chocolate/10 bg-white px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-chocolate/45">
        {badgeLabel}
      </div>
    </div>
  );

  const footer = (
    <div className="flex min-h-[3.75rem] items-center justify-center px-4 py-3">
      <h3 className="line-clamp-2 min-w-0 text-center text-base font-bold leading-snug tracking-tight text-warm-ink md:text-lg">
        {formatCategoryDisplayTitle(category.title)}
      </h3>
    </div>
  );

  const body = (
    <>
      {imageBlock}
      {footer}
    </>
  );

  if (href) {
    return (
      <a href={href} className={homeCardClass}>
        {body}
      </a>
    );
  }

  return <article className={homeCardClass}>{body}</article>;
}

export function CategoryCardGrid({
  items,
  badgeLabel,
  imageUrlBuilder,
  hrefBuilder,
  gridClassName,
  imagePriorityCount = 0,
  firstImageIsLcpCandidate = true,
  showDownloadedBadges = false,
  layout = "mosaic",
}: CategoryCardGridProps) {
  function getImageLoading(index: number): "eager" | "lazy" {
    return index < imagePriorityCount ? "eager" : "lazy";
  }

  function getImageFetchPriority(index: number): "high" | undefined {
    return firstImageIsLcpCandidate && imagePriorityCount > 0 && index === 0
      ? "high"
      : undefined;
  }

  if (layout === "directory") {
    const grid =
      gridClassName ??
      "mt-6 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

    return (
      <div className={grid}>
        {items.map((category, index) => (
          <CategoryDirectoryCard
            key={category.id}
            id={category.id}
            title={category.title}
            badgeLabel={badgeLabel}
            imageUrl={
              imageUrlBuilder?.(category) ?? category.coverImageUrl ?? null
            }
            href={hrefBuilder?.(category) ?? null}
            imageLoading={getImageLoading(index)}
            imageFetchPriority={getImageFetchPriority(index)}
            showDownloadedBadge={showDownloadedBadges}
          />
        ))}
      </div>
    );
  }

  if (layout === "home") {
    const grid =
      gridClassName ??
      "mt-8 grid w-full grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 md:gap-5";

    return (
      <div className={grid}>
        {items.map((category, index) => (
          <HomeCard
            key={category.id}
            category={category}
            badgeLabel={badgeLabel}
            imageUrl={
              imageUrlBuilder?.(category) ?? category.coverImageUrl ?? null
            }
            href={hrefBuilder?.(category) ?? null}
            imageLoading={getImageLoading(index)}
            imageFetchPriority={getImageFetchPriority(index)}
          />
        ))}
      </div>
    );
  }

  const grid =
    gridClassName ??
    "mt-8 grid w-full grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={grid}>
      {items.map((category, index) => {
        const href = hrefBuilder?.(category) ?? null;
        const imageUrl = imageUrlBuilder?.(category) ?? category.coverImageUrl;

        const topRegion = imageUrl ? (
          <div className="relative min-h-0 min-w-0 flex-[7]">
            <CategoryCardImage
              src={imageUrl}
              alt={category.title}
              fillParent
              loading={getImageLoading(index)}
              fetchPriority={getImageFetchPriority(index)}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-[7] items-center justify-center bg-white p-8">
            <div className="rounded-full border border-chocolate/10 bg-cream/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-chocolate/55">
              {badgeLabel}
            </div>
          </div>
        );

        const labelRegion = (
          <div className="flex flex-[3] flex-shrink-0 items-center justify-between gap-3 bg-warm-card px-6 py-5">
            <h3 className="min-w-0 flex-1 text-left text-xl font-bold tracking-tight text-chocolate">
              {formatCategoryDisplayTitle(category.title)}
            </h3>
            <span
              className="shrink-0 text-base font-normal text-chocolate/35 transition-colors duration-300 group-hover:text-chocolate/55"
              aria-hidden
            >
              →
            </span>
          </div>
        );

        const cardInner = (
          <div className="flex h-full min-h-0 flex-col">
            {topRegion}
            {labelRegion}
          </div>
        );

        if (href) {
          return (
            <a key={category.id} href={href} className={mosaicCardClass}>
              {cardInner}
            </a>
          );
        }

        return (
          <article key={category.id} className={mosaicCardClass}>
            {cardInner}
          </article>
        );
      })}
    </div>
  );
}
