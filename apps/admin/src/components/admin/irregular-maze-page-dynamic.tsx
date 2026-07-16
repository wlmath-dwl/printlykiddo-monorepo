"use client";

import dynamic from "next/dynamic";

// This tool depends on Canvas, File and Ant Design controls whose useId values
// can differ between the server tree and the hydrated browser tree. Rendering it
// only after mount avoids unstable Select input ids and unnecessary SSR work.
const IrregularMazePage = dynamic(
  () => import("@/components/admin/irregular-maze-page").then((mod) => mod.IrregularMazePage),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: 48, textAlign: "center", color: "rgba(0, 0, 0, 0.45)" }}>加载中…</div>
    ),
  },
);

export function IrregularMazePageDynamic() {
  return <IrregularMazePage />;
}
