"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type SiteHeaderNavChild = {
  label: string;
  href: string;
  imageUrl?: string | null;
  description?: string;
  icon?: "maze" | "sudoku" | "word-search" | "flashcards";
  disabled?: boolean;
};

export type SiteHeaderNavItem = {
  label: string;
  href: string;
  tone?: "primary" | "secondary";
  children?: SiteHeaderNavChild[];
  columns?: 2 | 3;
};

function isTopLevelNavActive(item: SiteHeaderNavItem, pathname: string): boolean {
  const itemIsActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const childIsActive = item.children?.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`)) ?? false;
  return itemIsActive || childIsActive;
}

type SiteHeaderNavProps = { items: SiteHeaderNavItem[]; activePath?: string };

function DesktopMenu({ item, active }: { item: SiteHeaderNavItem; active: boolean }) {
  const children = item.children ?? [];
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeWhenOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)} className={[
        "flex items-center gap-1.5 pb-1 font-semibold transition-colors",
        active ? "text-chocolate" : "text-chocolate/75 hover:text-chocolate",
      ].join(" ")}>
        {item.label}
        <svg className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 16 16" fill="none" aria-hidden><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open ? <div role="menu" className={`absolute right-0 top-full z-50 mt-3 overflow-hidden rounded-xl border border-[#E8E2D8] bg-white p-2 shadow-[0_16px_40px_rgba(61,53,34,0.14)] ${item.columns === 2 ? "w-52" : "w-[min(520px,calc(100vw-2rem))]"}`}>
        <div className={item.columns === 2 ? "grid grid-cols-1" : "grid grid-cols-2 gap-x-2"}>
          {children.map((child) => child.disabled ? (
            <span key={child.label} className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-charcoal/35"><span>{child.label}</span><span className="text-[10px] uppercase tracking-wide">Soon</span></span>
          ) : (
            <Link onClick={() => setOpen(false)} key={child.href} href={child.href} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-chocolate/75 transition hover:bg-brand-soft hover:text-chocolate">{child.label}</Link>
          ))}
        </div>
      </div> : null}
    </div>
  );
}

export function SiteHeaderNav({ items, activePath = "" }: SiteHeaderNavProps) {
  if (!items.length) return null;
  return <nav className="flex items-center gap-3 text-sm font-semibold sm:gap-6 sm:text-base lg:gap-8" aria-label="Main">
    {items.map((item) => {
      const active = isTopLevelNavActive(item, activePath);
      return item.children?.length ? <DesktopMenu key={item.label} item={item} active={active} /> : <Link key={item.href} href={item.href} className={active ? "text-chocolate" : "text-chocolate/75 hover:text-chocolate"}>{item.label}</Link>;
    })}
  </nav>;
}
