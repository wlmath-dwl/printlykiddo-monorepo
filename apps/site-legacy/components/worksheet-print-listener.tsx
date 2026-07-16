"use client";

import { useEffect } from "react";

import { printOrSaveImage } from "@/lib/print-image";

/**
 * 资源页全页面只挂这一个 client 组件，监听 [data-print-image] 触发的点击。
 * 替代之前每张 worksheet 都各挂一个 `WorksheetPrintButton`（20 张 × 1 组件 → 1 个）。
 *
 * 行为：
 * - 任何带 `data-print-image="<url>"` 的元素被点击时，触发 printOrSaveImage。
 * - 父级容器若设了 `data-print-prevent-default`（如 `<button>` 包了图片预览按钮），
 *   会阻止冒泡到外层那个"放大预览"按钮。
 */
export function WorksheetPrintListener() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Element | null;
      if (!target) {
        return;
      }
      const trigger = target.closest<HTMLElement>("[data-print-image]");
      if (!trigger) {
        return;
      }
      const imageUrl = trigger.dataset.printImage;
      if (!imageUrl) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const title = trigger.dataset.printTitle ?? "";
      const grayscale = trigger.dataset.printGrayscale === "1";
      printOrSaveImage(imageUrl, title || "Worksheet", { grayscale });
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
