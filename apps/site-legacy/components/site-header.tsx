import Link from "next/link";

import {
  SiteHeaderNav,
  type SiteHeaderNavItem,
} from "@/components/site-header-nav";

type SiteHeaderProps = {
  items?: SiteHeaderNavItem[];
  /** 当前路径用于服务端高亮一级导航，避免整段导航水合。 */
  activePath?: string;
  subtle?: boolean;
  /** 有值时用 CDN 图替代首字母块（仅首页等需要时传入） */
  logoImageUrl?: string | null;
};

const defaultItems: SiteHeaderNavItem[] = [];

function SiteBrandIcon() {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-brand shadow-[0_8px_18px_rgba(61,53,34,0.08)] ring-1 ring-[#3D3522]/10"
    >
      <svg
        className="size-7"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M16 9h25l9 9v37H16z"
          fill="#FFFDF7"
          stroke="#3D3522"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path
          d="M41 9v10h9"
          fill="#FFE7A3"
          stroke="#3D3522"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path
          d="M23 25h11c5 0 8 3 8 7s-3 7-8 7h-6v8h-5z"
          stroke="#3D3522"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path
          d="M42 28v19M42 38l9-10M42 38l10 9"
          stroke="#3D3522"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M23 18h11" stroke="#2C7A7B" strokeWidth="3" strokeLinecap="round" />
        <path d="M23 52h18" stroke="#E35F4F" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function SiteWordmark() {
  return (
    <Link
      href="/"
      aria-label="Go to PrintlyKiddo home"
      className="inline-flex min-w-0 items-center gap-3 text-[18px] font-bold leading-none tracking-[0] text-[#3B352C] transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45 sm:text-[20px]"
    >
      <SiteBrandIcon />
      <span>
        Printly<span className="font-semibold text-[#C58B00]">Kiddo</span>
      </span>
    </Link>
  );
}

export function SiteHeader({
  items = defaultItems,
  activePath = "",
  subtle: _subtle = false,
  logoImageUrl: _logoImageUrl = null,
}: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full bg-cream/90 backdrop-blur-md supports-[backdrop-filter]:bg-cream/78">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-12">
        <div className="flex items-center justify-between gap-3 lg:gap-6">
          <SiteWordmark />

          <SiteHeaderNav items={items} activePath={activePath} />
        </div>
      </div>
    </header>
  );
}
