"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

type PreviewImage = {
  src: string;
  title: string;
};

const LightboxModal = dynamic(
  () => import("./worksheet-image-lightbox-modal").then((mod) => mod.LightboxModal),
  { ssr: false },
);

/**
 * 仅注册全局点击/键盘监听，捕获到带 data-worksheet-preview-src 的按钮才挂载真正的 Modal。
 * 这样资源页首屏不需要为还没用到的弹框付出额外 bytes。
 */
export function WorksheetImageLightbox() {
  const [preview, setPreview] = useState<PreviewImage | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const trigger = (event.target as Element | null)?.closest<HTMLButtonElement>(
        "[data-worksheet-preview-src]",
      );
      if (!trigger) {
        return;
      }
      const src = trigger.dataset.worksheetPreviewSrc;
      if (!src) {
        return;
      }
      setPreview({
        src,
        title: trigger.dataset.worksheetPreviewTitle || "Worksheet preview",
      });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreview(null);
      }
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!preview) {
    return null;
  }

  return <LightboxModal preview={preview} onClose={() => setPreview(null)} />;
}
