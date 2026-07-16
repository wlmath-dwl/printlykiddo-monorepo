import Image from "next/image";
import Link from "next/link";

import type { HomeCategoryCard } from "@/lib/d1";

type HomeCategoryGridProps = {
  categories: HomeCategoryCard[];
};

function formatCategoryTitle(title: string) {
  return title.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function getCategoryPreviewUrl(category: HomeCategoryCard) {
  return category.coverImageUrl ?? category.coverImageUrl512 ?? category.seoImageUrl;
}

function formatPrintableCount(count: number) {
  if (count <= 0) {
    return "Printable pages";
  }
  if (count < 100) {
    return `${count}+ printable pages`;
  }
  return `${Math.floor(count / 100) * 100}+ printable pages`;
}

function CategoryEntryCard({
  category,
  imageLoading,
  imageFetchPriority,
}: {
  category: HomeCategoryCard;
  imageLoading: "eager" | "lazy";
  imageFetchPriority?: "high" | "low" | "auto";
}) {
  const previewUrl = getCategoryPreviewUrl(category);

  return (
    <Link
      href={`/${category.slug}`}
      className="group flex min-h-[190px] flex-col rounded-xl border border-[#EAEAEA] bg-white p-3 text-left transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#FAFAFA]"
    >
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-[10px] bg-white">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt=""
            fill
            sizes="(min-width: 1280px) 200px, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 480px) 50vw, 100vw"
            loading={imageLoading}
            priority={imageLoading === "eager" && imageFetchPriority === "high"}
            fetchPriority={imageFetchPriority}
            className="object-scale-down p-2"
            aria-hidden
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-base font-semibold text-chocolate/45">
            {formatCategoryTitle(category.title).slice(0, 1)}
          </span>
        )}
      </div>

      <h3 className="mt-3 w-full truncate text-center text-base font-semibold leading-tight text-chocolate">
        {formatCategoryTitle(category.title)}
      </h3>
      <p className="mt-1 w-full truncate text-center text-xs font-medium leading-4 text-charcoal/52">
        {formatPrintableCount(category.printableCount)}
      </p>
    </Link>
  );
}

export function HomeCategoryGrid({ categories }: HomeCategoryGridProps) {
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {categories.map((category) => (
          <CategoryEntryCard
            key={category.id}
            category={category}
            imageLoading="lazy"
          />
        ))}
      </div>
    </div>
  );
}
