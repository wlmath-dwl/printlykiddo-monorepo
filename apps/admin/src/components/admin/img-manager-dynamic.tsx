"use client";

import dynamic from "next/dynamic";

import type { ActiveRecord, CategoryTreeNode, ImgListItem } from "@/lib/admin-types";

// Ant Design Select/TreeSelect 等依赖 useId；在 Server Component 里不能用 dynamic({ ssr: false })，故放在 Client 边界内。
const ImgManager = dynamic(
  () => import("@/components/admin/img-manager").then((mod) => mod.ImgManager),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: 48, textAlign: "center", color: "rgba(0, 0, 0, 0.45)" }}>加载中…</div>
    ),
  },
);

export type ImgManagerDynamicProps = {
  initialItems: ImgListItem[];
  categoryTree: CategoryTreeNode[];
  actives: ActiveRecord[];
};

export function ImgManagerDynamic(props: ImgManagerDynamicProps) {
  return <ImgManager {...props} />;
}
