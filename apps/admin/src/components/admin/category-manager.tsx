"use client";

import {
  DownloadOutlined,
  ExclamationCircleFilled,
  LeftOutlined,
  LinkOutlined,
  PictureOutlined,
  RightOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { Breadcrumb, Button, Card, Modal, Popconfirm, Select, Space, Switch, Table, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CategoryRecord, CategorySummaryRecord } from "@/lib/admin-types";

type CategoryResponse = {
  flat: CategoryRecord[];
};

type CategoryManagerProps = {
  initialFlat: CategoryRecord[];
  initialSummary: CategorySummaryRecord;
  currentParentId: number | null;
};

type CategoryUpdatePayload = {
  parent_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  name_zh: string | null;
  cover_image: string | null;
  sort_order: number;
  is_active: boolean;
};

const PRINTLYKIDDO_SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_PRINTLYKIDDO_SITE_URL?.trim() || "https://printlykiddo.com"
).replace(/\/+$/, "");

const MAZE_THEME_DECORATION_PROMPT = `Create one reusable themed decoration layer for a children's printable maze worksheet.

THEME: {THEME}

The same decoration layer will be reused across every maze in this theme, so the composition must be clean, consistent, and independent of any specific maze layout.

CANVAS AND COMPOSITION
- Square 1:1 canvas, 2048 x 2048 px.
- Pure white background.
- Add a narrow themed decorative border around all four outer edges.
- The outer decorations must stay within the outermost 8-10% of the canvas.
- Keep the central maze area open and uncluttered.
- Place one compact themed illustration at the exact center of the canvas.
- The center illustration must occupy only 20-22% of the canvas width and height.
- Keep at least 70% of the canvas visually clear for a 12 x 12 maze overlay.

STYLE
- Black-and-white children's coloring-page line art.
- Clean bold outlines, simple recognizable shapes, low detail, high contrast.
- Friendly and age-appropriate for children ages 6-10.
- Consistent line weight and illustration style across the border and center decoration.
- Print-friendly on A4 and US Letter paper.

STRICT EXCLUSIONS
- Do not draw a maze, maze walls, paths, grids, or solution lines.
- Do not add a title, instructions, letters, numbers, labels, START, FINISH, arrows, logos, signatures, or watermarks.
- Do not place decorations in the open maze area except for the single center illustration.
- Do not use gray shading, color, gradients, textures, shadows, or a decorative background pattern.
- Do not crop any border decoration at the canvas edges.

The final image must look like a reusable worksheet decoration layer: a slim themed outer frame, a small centered themed illustration, and a large clean white area ready for the maze to be overlaid.`;

/** CSV 单元格转义（RFC 4180） */
function csvEscape(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 按树深度优先顺序排列，便于阅读层级 */
function buildOrderedFlatForExport(flat: CategoryRecord[]): CategoryRecord[] {
  const childrenByParent = new Map<number | null, CategoryRecord[]>();
  for (const c of flat) {
    const pid = c.parent_id;
    const list = childrenByParent.get(pid) ?? [];
    list.push(c);
    childrenByParent.set(pid, list);
  }
  for (const [, list] of childrenByParent) {
    list.sort((a, b) => (a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.id - b.id));
  }
  const out: CategoryRecord[] = [];
  const visit = (pid: number | null) => {
    for (const c of childrenByParent.get(pid) ?? []) {
      out.push(c);
      visit(c.id);
    }
  };
  visit(null);
  return out;
}

function getCategoryLevel(id: number, map: Map<number, CategoryRecord>): number {
  let depth = 1;
  let cur = map.get(id);
  while (cur?.parent_id != null) {
    depth += 1;
    cur = map.get(cur.parent_id);
  }
  return depth;
}

function getCategorySlugPath(id: number, map: Map<number, CategoryRecord>): string {
  const segs: string[] = [];
  let cur: CategoryRecord | undefined = map.get(id);
  while (cur) {
    segs.unshift(cur.slug);
    cur = cur.parent_id != null ? map.get(cur.parent_id) : undefined;
  }
  return segs.join("/");
}

function getCategoryDepth(item: CategoryRecord, categoryMap: Map<number, CategoryRecord>) {
  let depth = 1;
  let cursorId = item.parent_id;

  while (cursorId !== null) {
    const parent = categoryMap.get(cursorId);
    if (!parent) {
      break;
    }
    depth += 1;
    cursorId = parent.parent_id;
  }

  return depth;
}

/** 分类行是否仍有待同步到远端的本地变更（一级～三级同一规则） */
function categoryPendingSync(record: Pick<CategoryRecord, "local_change_type">) {
  const t = record.local_change_type;
  return t === "created" || t === "updated" || t === "conflict";
}

function buildCategoryUpdatePayload(
  record: CategoryRecord,
  overrides: Partial<CategoryUpdatePayload> = {},
): CategoryUpdatePayload {
  return {
    parent_id: record.parent_id,
    name: record.name,
    slug: record.slug,
    description: record.description ?? null,
    name_zh: record.name_zh ?? null,
    cover_image: record.cover_image ?? null,
    sort_order: record.sort_order,
    is_active: record.is_active,
    ...overrides,
  };
}

function CategoryAssetBattery(props: {
  originalRowCount: number;
  uploadedOriginalCount: number;
  hasGenerated: boolean;
}) {
  const { originalRowCount, uploadedOriginalCount, hasGenerated } = props;
  const totalBars = 4;
  const isOriginalComplete = originalRowCount > 0 && uploadedOriginalCount === originalRowCount;

  let filledBars = 0;
  let color = "#ff4d4f";
  let label = "空电量：还没有生成过原始图数据";

  if (hasGenerated) {
    filledBars = 4;
    color = "#52c41a";
    label = "四格：已有功能图";
  } else if (isOriginalComplete) {
    filledBars = 3;
    color = "#1677ff";
    label = "三格：所有原始图数据都已有原始图";
  } else if (originalRowCount > 0) {
    filledBars = 1;
    color = "#faad14";
    label = "一格：已有原始图数据，但仍有记录缺少原始图";
  }

  return (
    <div title={label} aria-label={label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          width: 38,
          height: 16,
          padding: 2,
          border: `1px solid ${color}`,
          borderRadius: 3,
          boxSizing: "border-box",
          background: "#fff",
        }}
      >
        {Array.from({ length: totalBars }, (_, index) => (
          <div
            key={index}
            style={{
              flex: 1,
              height: "100%",
              borderRadius: 1,
              background: index < filledBars ? color : "#f0f0f0",
            }}
          />
        ))}
      </div>
      <div style={{ width: 3, height: 8, borderRadius: 1, background: color }} />
    </div>
  );
}

function CycleBadge({
  label,
  title,
  color,
}: {
  label: "P" | "V";
  title: string;
  color: string;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1,
        fontFamily: "Arial, sans-serif",
      }}
    >
      {label}
    </span>
  );
}

function PinPublishBadge() {
  return <CycleBadge label="P" title="已关联图片发布周期" color="#e60023" />;
}

function VideoPublishBadge() {
  return <CycleBadge label="V" title="已关联视频发布周期" color="#1677ff" />;
}

export function CategoryManager({ initialFlat, initialSummary, currentParentId }: CategoryManagerProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [loading, setLoading] = useState(false);
  const [sortSwapLoading, setSortSwapLoading] = useState(false);
  const [sortResetLoading, setSortResetLoading] = useState(false);
  const [flat, setFlat] = useState<CategoryRecord[]>(initialFlat);
  const [draggingCategoryId, setDraggingCategoryId] = useState<number | null>(null);
  const [dropTargetCategoryId, setDropTargetCategoryId] = useState<number | null>(null);
  const [pendingImgCategoryIds, setPendingImgCategoryIds] = useState<Set<number>>(
    () => new Set(initialSummary.pending_img_category_ids),
  );
  const [sourceCounts, setSourceCounts] = useState<Record<number, { total: number; uploaded: number }>>(
    () => initialSummary.source_counts,
  );
  const [imgCounts, setImgCounts] = useState<Record<number, number>>(() => initialSummary.img_counts);
  const [categoryStatsOpen, setCategoryStatsOpen] = useState(false);
  const [mazeThemePromptOpen, setMazeThemePromptOpen] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveSubmitting, setMoveSubmitting] = useState(false);
  const [movingCategory, setMovingCategory] = useState<CategoryRecord | null>(null);
  const [moveTargetParentId, setMoveTargetParentId] = useState<number | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);

    try {
      const [categoryResponse, summaryResponse] = await Promise.all([
        fetch("/api/admin/categories", { cache: "no-store" }),
        fetch("/api/admin/categories/summary", { cache: "no-store" }),
      ]);
      const [categoryData, summaryData] = (await Promise.all([
        categoryResponse.json(),
        summaryResponse.json(),
      ])) as [
        CategoryResponse | { error: string },
        CategorySummaryRecord | { error: string },
      ];

      if (!categoryResponse.ok || "error" in categoryData) {
        throw new Error("error" in categoryData ? categoryData.error : "获取分类失败。");
      }

      setFlat(categoryData.flat);

      if (summaryResponse.ok && !("error" in summaryData)) {
        setPendingImgCategoryIds(new Set(summaryData.pending_img_category_ids));
        setSourceCounts(summaryData.source_counts);
        setImgCounts(summaryData.img_counts);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "获取分类数据失败，请稍后重试。";
      messageApi.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  const categoryMap = useMemo(
    () => new Map(flat.map((item) => [item.id, item])),
    [flat],
  );
  const currentParent = currentParentId === null ? null : (categoryMap.get(currentParentId) ?? null);
  const currentLevel = currentParent ? getCategoryDepth(currentParent, categoryMap) + 1 : 1;
  const canEnterNextLevel = currentLevel < 3;
  const visibleItems = useMemo(
    () =>
      flat
        .filter((item) => item.parent_id === currentParentId)
        .sort((left, right) => {
          if (left.sort_order !== right.sort_order) {
            return left.sort_order - right.sort_order;
          }
          return left.id - right.id;
        }),
    [currentParentId, flat],
  );
  const canDragSort = visibleItems.length > 1 && !sortSwapLoading && !sortResetLoading;

  /** parent_id → 子分类（未过滤删除：listCategories 已排除已删） */
  const childrenByParent = useMemo(() => {
    const m = new Map<number | null, CategoryRecord[]>();
    for (const c of flat) {
      const p = c.parent_id;
      const list = m.get(p) ?? [];
      list.push(c);
      m.set(p, list);
    }
    return m;
  }, [flat]);
  const pendingSyncIds = useMemo(() => {
    const next = new Set<number>();
    const visit = (item: CategoryRecord): boolean => {
      let hasPending = categoryPendingSync(item) || pendingImgCategoryIds.has(item.id);
      const children = childrenByParent.get(item.id) ?? [];
      children.forEach((child) => {
        if (visit(child)) {
          hasPending = true;
        }
      });
      if (hasPending) {
        next.add(item.id);
      }
      return hasPending;
    };

    (childrenByParent.get(null) ?? []).forEach((root) => {
      visit(root);
    });

    return next;
  }, [childrenByParent, pendingImgCategoryIds]);
  const originalImgCategoryStats = useMemo(
    () => {
      const counts = new Map<number, { total: number; uploaded: number }>();
      for (const [catIdStr, stats] of Object.entries(sourceCounts)) {
        counts.set(Number(catIdStr), stats);
      }
      return counts;
    },
    [sourceCounts],
  );
  const generatedImgCategoryIds = useMemo(
    () => new Set(Object.entries(imgCounts).filter(([, count]) => count > 0).map(([id]) => Number(id))),
    [imgCounts],
  );
  const categoryDataCompleteIds = useMemo(() => {
    const completed = new Set<number>();

    for (const item of flat) {
      const stats = originalImgCategoryStats.get(item.id);
      const hasCompleteOriginals = Boolean(stats && stats.total > 0 && stats.uploaded === stats.total);
      if (generatedImgCategoryIds.has(item.id) || hasCompleteOriginals) {
        completed.add(item.id);
      }
    }

    return completed;
  }, [flat, generatedImgCategoryIds, originalImgCategoryStats]);

  /** 全站一/二/三级活跃数量与三级数据完整数量（树深度最多 3 层） */
  const rootLevelTotals = useMemo(() => {
    const l1 = flat.filter((c) => c.parent_id === null);
    const l1Ids = new Set(l1.map((c) => c.id));
    const l2 = flat.filter((c) => c.parent_id !== null && l1Ids.has(c.parent_id));
    const l2Ids = new Set(l2.map((c) => c.id));
    const l3 = flat.filter((c) => c.parent_id !== null && l2Ids.has(c.parent_id));
    const l1Active = l1.filter((c) => c.is_active).length;
    const l1InactiveComplete = l1.filter((c) => !c.is_active && categoryDataCompleteIds.has(c.id)).length;
    const l2Active = l2.filter((c) => c.is_active).length;
    const l2InactiveComplete = l2.filter((c) => !c.is_active && categoryDataCompleteIds.has(c.id)).length;
    const l3Active = l3.filter((c) => c.is_active).length;
    const l3InactiveComplete = l3.filter((c) => !c.is_active && categoryDataCompleteIds.has(c.id)).length;
    return {
      l1Total: l1.length,
      l1Active,
      l1InactiveComplete,
      l1Complete: l1Active + l1InactiveComplete,
      l2Total: l2.length,
      l2Active,
      l2InactiveComplete,
      l2Complete: l2Active + l2InactiveComplete,
      l3Total: l3.length,
      l3Active,
      l3InactiveComplete,
      l3Complete: l3Active + l3InactiveComplete,
    };
  }, [categoryDataCompleteIds, flat]);

  const countL2Under = useCallback(
    (id: number) => childrenByParent.get(id)?.length ?? 0,
    [childrenByParent],
  );

  const countL3UnderL1 = useCallback(
    (l1Id: number) => {
      const l2s = childrenByParent.get(l1Id) ?? [];
      return l2s.reduce((sum, l2) => sum + (childrenByParent.get(l2.id)?.length ?? 0), 0);
    },
    [childrenByParent],
  );

  const countActiveL3UnderL1 = useCallback(
    (l1Id: number) => {
      const l2s = childrenByParent.get(l1Id) ?? [];
      return l2s.reduce(
        (sum, l2) => sum + (childrenByParent.get(l2.id) ?? []).filter((item) => item.is_active).length,
        0,
      );
    },
    [childrenByParent],
  );

  const countL3UnderL2 = useCallback(
    (l2Id: number) => childrenByParent.get(l2Id)?.length ?? 0,
    [childrenByParent],
  );

  const countActiveL3UnderL2 = useCallback(
    (l2Id: number) => (childrenByParent.get(l2Id) ?? []).filter((item) => item.is_active).length,
    [childrenByParent],
  );
  const level2MoveOptions = useMemo(
    () =>
      flat
        .filter((item) => getCategoryDepth(item, categoryMap) === 2)
        .filter((item) => item.id !== movingCategory?.parent_id)
        .sort((left, right) => {
          const leftParent = left.parent_id === null ? null : categoryMap.get(left.parent_id);
          const rightParent = right.parent_id === null ? null : categoryMap.get(right.parent_id);
          if ((leftParent?.sort_order ?? 0) !== (rightParent?.sort_order ?? 0)) {
            return (leftParent?.sort_order ?? 0) - (rightParent?.sort_order ?? 0);
          }
          if ((leftParent?.id ?? 0) !== (rightParent?.id ?? 0)) {
            return (leftParent?.id ?? 0) - (rightParent?.id ?? 0);
          }
          if (left.sort_order !== right.sort_order) {
            return left.sort_order - right.sort_order;
          }
          return left.id - right.id;
        })
        .map((item) => {
          const parent = item.parent_id === null ? null : categoryMap.get(item.parent_id);
          const zh = item.name_zh ? ` / ${item.name_zh}` : "";
          return {
            value: item.id,
            label: `${parent?.name ?? "Root"} > ${item.name}${zh}`,
          };
        }),
    [categoryMap, flat, movingCategory?.parent_id],
  );
  const breadcrumbs = useMemo(() => {
    if (!currentParent) {
      return [{ title: "分类管理" }];
    }

    const ancestors: CategoryRecord[] = [];
    let cursor: CategoryRecord | null = currentParent;
    while (cursor) {
      ancestors.unshift(cursor);
      cursor = cursor.parent_id === null ? null : (categoryMap.get(cursor.parent_id) ?? null);
    }

    return ancestors.map((item, index) => {
      const isLast = index === ancestors.length - 1;
      const syncMark = pendingSyncIds.has(item.id) ? (
        <ExclamationCircleFilled style={{ color: "#ff4d4f" }} title="本机有未同步修改" />
      ) : null;

      return {
        title: isLast ? (
          <Space size={4}>
            <span>{item.name}</span>
            {syncMark}
          </Space>
        ) : (
          <Space size={4}>
            <Link href={`/admin/categories/${item.id}/children`}>{item.name}</Link>
            {syncMark}
          </Space>
        ),
      };
    });
  }, [categoryMap, currentParent, pendingSyncIds]);
  const currentListHref =
    currentParentId === null ? "/admin/categories" : `/admin/categories/${currentParentId}/children`;
  const parentListHref =
    currentParent?.parent_id === null || currentParent?.parent_id === undefined
      ? "/admin/categories"
      : `/admin/categories/${currentParent.parent_id}/children`;
  const createHref =
    currentParentId === null
      ? `/admin/categories/new?returnTo=${encodeURIComponent(currentListHref)}`
      : `/admin/categories/new?parentId=${currentParentId}&returnTo=${encodeURIComponent(currentListHref)}`;

  useEffect(() => {
    setFlat(initialFlat);
    setPendingImgCategoryIds(new Set(initialSummary.pending_img_category_ids));
    setSourceCounts(initialSummary.source_counts);
    setImgCounts(initialSummary.img_counts);
    setLoading(false);
  }, [initialFlat, initialSummary]);

  useEffect(() => {
    const handleSyncFinished = () => {
      void fetchCategories();
    };
    const handleLocalChanges = () => {
      void fetchCategories();
    };

    window.addEventListener("admin-sync-finished", handleSyncFinished);
    window.addEventListener("admin-local-changes", handleLocalChanges);
    return () => {
      window.removeEventListener("admin-sync-finished", handleSyncFinished);
      window.removeEventListener("admin-local-changes", handleLocalChanges);
    };
  }, [fetchCategories]);

  const handleDelete = useCallback(
    async (item: CategoryRecord) => {
      try {
        const response = await fetch(`/api/admin/categories/${item.id}`, {
          method: "DELETE",
        });
        const data = (await response.json()) as { success?: boolean; error?: string };

        if (!response.ok || data.error) {
          throw new Error(data.error || "删除分类失败。");
        }

        messageApi.success("分类已删除。");
        window.dispatchEvent(new CustomEvent("admin-local-changes"));
        await fetchCategories();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "删除分类失败，请稍后重试。";
        messageApi.error(errorMessage);
      }
    },
    [fetchCategories, messageApi],
  );

  const handleExportAllCsv = useCallback(() => {
    const map = new Map(flat.map((c) => [c.id, c]));
    const ordered = buildOrderedFlatForExport(flat);
    const header = [
      "id",
      "parent_id",
      "层级",
      "slug路径",
      "名称",
      "中文名",
      "slug",
      "描述",
      "排序",
      "启用",
      "创建时间",
      "更新时间",
    ];
    const lines = [
      header.map(csvEscape).join(","),
      ...ordered.map((row) =>
        [
          row.id,
          row.parent_id ?? "",
          getCategoryLevel(row.id, map),
          getCategorySlugPath(row.id, map),
          row.name,
          row.name_zh ?? "",
          row.slug,
          row.description ?? "",
          row.sort_order,
          row.is_active ? "1" : "0",
          row.created_at,
          row.updated_at,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ];
    const csv = `\uFEFF${lines.join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    a.href = url;
    a.download = `categories-all-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    messageApi.success("已导出全部分类 CSV。");
  }, [flat, messageApi]);
  const handleToggleActive = useCallback(
    async (record: CategoryRecord, checked: boolean) => {
      try {
        const response = await fetch(`/api/admin/categories/${record.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parent_id: record.parent_id,
            name: record.name,
            slug: record.slug,
            description: record.description ?? null,
            name_zh: record.name_zh ?? null,
            cover_image: record.cover_image ?? null,
            sort_order: record.sort_order,
            is_active: checked,
          }),
        });
        const data = (await response.json()) as CategoryRecord | { error?: string };

        if (!response.ok || "error" in data) {
          throw new Error("error" in data ? data.error : "更新状态失败。");
        }

        messageApi.success(checked ? "已启用。" : "已禁用。");
        window.dispatchEvent(new CustomEvent("admin-local-changes"));
        await fetchCategories();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "更新状态失败，请稍后重试。";
        messageApi.error(errorMessage);
      }
    },
    [fetchCategories, messageApi],
  );

  const handleSwapSortOrder = useCallback(
    async (draggedId: number, targetId: number) => {
      if (draggedId === targetId) {
        return;
      }

      const draggedRecord = flat.find((item) => item.id === draggedId);
      const targetRecord = flat.find((item) => item.id === targetId);

      if (!draggedRecord || !targetRecord) {
        messageApi.error("未找到要交换排序的分类。");
        return;
      }

      const draggedSortOrder = draggedRecord.sort_order;
      const targetSortOrder = targetRecord.sort_order;
      const shouldNormalizeVisibleOrder = draggedSortOrder === targetSortOrder;

      setSortSwapLoading(true);
      setFlat((prev) =>
        prev.map((item) => {
          if (item.id === draggedId) {
            return { ...item, sort_order: targetSortOrder };
          }
          if (item.id === targetId) {
            return { ...item, sort_order: draggedSortOrder };
          }
          return item;
        }),
      );

      try {
        const changedItems = shouldNormalizeVisibleOrder
          ? (() => {
              const reordered = [...visibleItems];
              const draggedIndex = reordered.findIndex((item) => item.id === draggedId);
              const targetIndex = reordered.findIndex((item) => item.id === targetId);

              if (draggedIndex < 0 || targetIndex < 0) {
                return [];
              }

              [reordered[draggedIndex], reordered[targetIndex]] = [
                reordered[targetIndex],
                reordered[draggedIndex],
              ];

              return reordered
                .map((item, index) => ({
                  item,
                  nextSortOrder: index + 1,
                }))
                .filter(({ item, nextSortOrder }) => item.sort_order !== nextSortOrder);
            })()
          : [
              { item: draggedRecord, nextSortOrder: targetSortOrder },
              { item: targetRecord, nextSortOrder: draggedSortOrder },
            ];

        if (changedItems.length === 0) {
          throw new Error("排序没有变化。");
        }

        const responses = await Promise.all(
          changedItems.map(({ item, nextSortOrder }) =>
            fetch(`/api/admin/categories/${item.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                buildCategoryUpdatePayload(item, { sort_order: nextSortOrder }),
              ),
            }),
          ),
        );
        const payloads = (await Promise.all(
          responses.map(async (response) => (await response.json()) as CategoryRecord | { error?: string }),
        )) as Array<CategoryRecord | { error?: string }>;
        const failedPayload = payloads.find((payload) => "error" in payload && payload.error);

        if (responses.some((response) => !response.ok) || failedPayload) {
          throw new Error(
            failedPayload && "error" in failedPayload && failedPayload.error
              ? failedPayload.error
              : "交换排序失败。",
          );
        }

        messageApi.success(
          shouldNormalizeVisibleOrder
            ? `已重排当前层级，并交换“${draggedRecord.name}”和“${targetRecord.name}”的位置。`
            : `已交换“${draggedRecord.name}”和“${targetRecord.name}”的排序。`,
        );
        window.dispatchEvent(new CustomEvent("admin-local-changes"));
        await fetchCategories();
      } catch (error) {
        await fetchCategories();
        messageApi.error(error instanceof Error ? error.message : "交换排序失败，请稍后重试。");
      } finally {
        setSortSwapLoading(false);
        setDraggingCategoryId(null);
        setDropTargetCategoryId(null);
      }
    },
    [fetchCategories, flat, messageApi, visibleItems],
  );

  const handleResetSortOrders = useCallback(() => {
    if (visibleItems.length === 0) {
      messageApi.warning("当前层级没有可重置序号的分类。");
      return;
    }

    const shouldPrioritizeActiveOnReset = currentLevel === 2 || currentLevel === 3;
    const resetOrderedItems =
      shouldPrioritizeActiveOnReset
        ? [...visibleItems].sort((left, right) => {
            if (left.is_active !== right.is_active) {
              return left.is_active ? -1 : 1;
            }
            if (left.sort_order !== right.sort_order) {
              return left.sort_order - right.sort_order;
            }
            return left.id - right.id;
          })
        : visibleItems;

    const changedItems = resetOrderedItems
      .map((item, index) => ({
        item,
        nextSortOrder: index + 1,
      }))
      .filter(({ item, nextSortOrder }) => item.sort_order !== nextSortOrder);

    if (changedItems.length === 0) {
      messageApi.info("当前层级的分类序号已经是从 1 开始的连续值。");
      return;
    }

    void modal.confirm({
      title: "确认重置分类序号？",
      content:
        shouldPrioritizeActiveOnReset
          ? `将先把启用的${currentLevel === 2 ? "二级" : "三级"}分类排在未启用前面，再把本层级 ${visibleItems.length} 条分类的排序序号重置为 1 到 ${visibleItems.length}。`
          : `将按当前显示顺序，把本层级 ${visibleItems.length} 条分类的排序序号重置为 1 到 ${visibleItems.length}。`,
      okText: "确认重置",
      cancelText: "取消",
      okButtonProps: { danger: true, loading: sortResetLoading },
      onOk: async () => {
        setSortResetLoading(true);

        try {
          const responses = await Promise.all(
            changedItems.map(({ item, nextSortOrder }) =>
              fetch(`/api/admin/categories/${item.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                  buildCategoryUpdatePayload(item, { sort_order: nextSortOrder }),
                ),
              }),
            ),
          );
          const payloads = (await Promise.all(
            responses.map(async (response) => (await response.json()) as CategoryRecord | { error?: string }),
          )) as Array<CategoryRecord | { error?: string }>;
          const failedPayload = payloads.find((payload) => "error" in payload && payload.error);

          if (responses.some((response) => !response.ok) || failedPayload) {
            throw new Error(
              failedPayload && "error" in failedPayload && failedPayload.error
                ? failedPayload.error
                : "重置分类序号失败。",
            );
          }

          messageApi.success(`已按当前顺序重置 ${changedItems.length} 条分类序号。`);
          window.dispatchEvent(new CustomEvent("admin-local-changes"));
          await fetchCategories();
        } catch (error) {
          await fetchCategories();
          const nextError =
            error instanceof Error ? error : new Error("重置分类序号失败，请稍后重试。");
          messageApi.error(nextError.message);
          throw nextError;
        } finally {
          setSortResetLoading(false);
        }
      },
    });
  }, [currentLevel, fetchCategories, messageApi, modal, sortResetLoading, visibleItems]);

  const handleOpenMoveModal = useCallback(
    (record: CategoryRecord) => {
      const targets = flat
        .filter((item) => getCategoryDepth(item, categoryMap) === 2)
        .filter((item) => item.id !== record.parent_id);

      if (targets.length === 0) {
        messageApi.warning("没有可移动到的其他二级分类。");
        return;
      }

      setMovingCategory(record);
      setMoveTargetParentId(null);
      setMoveModalOpen(true);
    },
    [categoryMap, flat, messageApi],
  );

  const handleCopyCategorySiteUrl = useCallback(
    async (record: CategoryRecord) => {
      const slugPath = getCategorySlugPath(record.id, categoryMap);
      if (!slugPath) {
        messageApi.error("未找到该分类的用户侧链接。");
        return;
      }

      const url = `${PRINTLYKIDDO_SITE_ORIGIN}/${slugPath}`;
      try {
        await navigator.clipboard.writeText(url);
        messageApi.success("用户侧链接已复制。");
      } catch {
        messageApi.error("复制失败，请检查浏览器剪贴板权限。");
      }
    },
    [categoryMap, messageApi],
  );

  const handleCancelMoveModal = useCallback(() => {
    if (moveSubmitting) {
      return;
    }

    setMoveModalOpen(false);
    setMovingCategory(null);
    setMoveTargetParentId(null);
  }, [moveSubmitting]);

  const handleMoveCategory = useCallback(async () => {
    if (!movingCategory) {
      return;
    }

    if (!moveTargetParentId) {
      messageApi.warning("请选择目标二级分类。");
      return;
    }

    const targetParent = categoryMap.get(moveTargetParentId);
    if (!targetParent || getCategoryDepth(targetParent, categoryMap) !== 2) {
      messageApi.error("目标二级分类不存在。");
      return;
    }

    const nextSortOrder =
      Math.max(0, ...(childrenByParent.get(moveTargetParentId) ?? []).map((item) => item.sort_order)) + 1;

    setMoveSubmitting(true);
    try {
      const response = await fetch(`/api/admin/categories/${movingCategory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildCategoryUpdatePayload(movingCategory, {
            parent_id: moveTargetParentId,
            sort_order: nextSortOrder,
          }),
        ),
      });
      const data = (await response.json()) as CategoryRecord | { error?: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "移动分类失败。");
      }

      messageApi.success(`已将“${movingCategory.name}”移动到“${targetParent.name}”。`);
      setMoveModalOpen(false);
      setMovingCategory(null);
      setMoveTargetParentId(null);
      window.dispatchEvent(new CustomEvent("admin-local-changes"));
      await fetchCategories();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "移动分类失败，请稍后重试。");
    } finally {
      setMoveSubmitting(false);
    }
  }, [categoryMap, childrenByParent, fetchCategories, messageApi, moveTargetParentId, movingCategory]);

  const columns = useMemo<ColumnsType<CategoryRecord>>(
    () => [
      {
        title: "中文名",
        dataIndex: "name_zh",
        key: "name_zh",
        width: 180,
        render: (val: string | null, record: CategoryRecord) => (
          <Space size={4} wrap>
            <span>{val ?? "—"}</span>
            {record.cover_image ? (
              <PictureOutlined style={{ color: "#52c41a" }} title="已设置封面图" />
            ) : null}
            {record.pin_publish_cycle_id ? <PinPublishBadge /> : null}
            {record.video_publish_cycle_id ? <VideoPublishBadge /> : null}
          </Space>
        ),
      },
      {
        title: "名称",
        dataIndex: "name",
        key: "name",
        width: currentLevel === 1 ? 180 : 240,
        ellipsis: true,
        render: (name: string, record: CategoryRecord) => {
          const hasPendingSync = pendingSyncIds.has(record.id);
          return (
            <Space size={4} style={{ maxWidth: "100%" }}>
              <span
                style={
                  hasPendingSync
                    ? { color: "#ff4d4f", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }
                    : { overflow: "hidden", textOverflow: "ellipsis" }
                }
              >
                {name}
              </span>
              {hasPendingSync ? (
                <ExclamationCircleFilled style={{ color: "#ff4d4f" }} title="本机有未同步修改" />
              ) : null}
            </Space>
          );
        },
      },
      ...(currentLevel === 1
        ? [
            {
              title: "二级数",
              key: "l2_count",
              width: 88,
              align: "right" as const,
              render: (_: unknown, record: CategoryRecord) => countL2Under(record.id),
            },
            {
              title: "三级总数",
              key: "l3_total",
              width: 96,
              align: "right" as const,
              render: (_: unknown, record: CategoryRecord) =>
                `${countL3UnderL1(record.id)}（${countActiveL3UnderL1(record.id)}）`,
            },
          ]
        : []),
      ...(currentLevel === 2
        ? [
            {
              title: "三级总数",
              key: "l3_count",
              width: 96,
              align: "right" as const,
              render: (_: unknown, record: CategoryRecord) =>
                `${countL3UnderL2(record.id)}（${countActiveL3UnderL2(record.id)}）`,
            },
          ]
        : []),
      ...(currentLevel === 3
        ? [
            {
              title: "资产状态",
              key: "asset_status",
              width: 120,
              render: (_: unknown, record: CategoryRecord) => (
                <CategoryAssetBattery
                  originalRowCount={originalImgCategoryStats.get(record.id)?.total ?? 0}
                  uploadedOriginalCount={originalImgCategoryStats.get(record.id)?.uploaded ?? 0}
                  hasGenerated={generatedImgCategoryIds.has(record.id)}
                />
              ),
            },
          ]
        : []),
      { title: "排序", dataIndex: "sort_order", key: "sort_order", width: 90 },
      {
        title: "状态",
        dataIndex: "is_active",
        key: "is_active",
        width: 90,
        render: (value: boolean, record: CategoryRecord) => (
          <Switch
            checked={value}
            checkedChildren="启用"
            unCheckedChildren="禁用"
            onChange={(checked) => void handleToggleActive(record, checked)}
          />
        ),
      },
      {
        title: "操作",
        key: "actions",
        width: currentLevel === 3 ? 290 : canEnterNextLevel ? 320 : 220,
        render: (_: unknown, record: CategoryRecord) => (
          <Space size={4}>
            <Tooltip title="复制用户侧链接">
              <Button
                type="link"
                icon={<LinkOutlined />}
                aria-label="复制用户侧链接"
                onClick={() => void handleCopyCategorySiteUrl(record)}
              />
            </Tooltip>
            {canEnterNextLevel ? (
              <Link href={`/admin/categories/${record.id}/children`}>
                <Button type="link" icon={<RightOutlined />}>
                  进入下级
                </Button>
              </Link>
            ) : null}
            <Link href={`/admin/categories/${record.id}?returnTo=${encodeURIComponent(currentListHref)}`}>
              <Button type="link">编辑</Button>
            </Link>
            {currentLevel === 3 ? (
              <Button type="link" icon={<SwapOutlined />} onClick={() => handleOpenMoveModal(record)}>
                移动
              </Button>
            ) : null}
            <Popconfirm
              title="确认删除当前分类吗？"
              description="确认后会递归删除该分类下的所有子分类，以及相关的功能图、原始图和封面图，且不可恢复。"
              okText="删除"
              cancelText="取消"
              onConfirm={() => void handleDelete(record)}
            >
              <Button type="link" danger>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [
      canEnterNextLevel,
      countActiveL3UnderL1,
      countActiveL3UnderL2,
      countL2Under,
      countL3UnderL1,
      countL3UnderL2,
      currentLevel,
      currentListHref,
      generatedImgCategoryIds,
      handleDelete,
      handleCopyCategorySiteUrl,
      handleOpenMoveModal,
      handleToggleActive,
      originalImgCategoryStats,
      pendingSyncIds,
    ],
  );

  return (
    <>
      {contextHolder}
      {modalContextHolder}
      <Card
        title={
          currentParent && breadcrumbs.length === 1 ? (
            <Space size={8}>
              <Link href={parentListHref}>
                <Button type="link" icon={<LeftOutlined />} style={{ paddingInline: 0 }}>
                  返回
                </Button>
              </Link>
              {pendingSyncIds.has(currentParent.id) ? (
                <ExclamationCircleFilled style={{ color: "#ff4d4f" }} title="上级分类本机有未同步修改" />
              ) : null}
            </Space>
          ) : (
            <Breadcrumb items={breadcrumbs} />
          )
        }
        variant="borderless"
        extra={
          <Space>
            {currentParentId === null ? (
              <Button icon={<DownloadOutlined />} onClick={handleExportAllCsv}>
                导出全部 CSV
              </Button>
            ) : null}
            {currentParent?.slug === "mazes" ? (
              <Button icon={<PictureOutlined />} onClick={() => setMazeThemePromptOpen(true)}>
                主题装饰提示词
              </Button>
            ) : null}
            <Button onClick={() => void handleResetSortOrders()} loading={sortResetLoading}>
              重置分类序号
            </Button>
            <Link href={createHref}>
              <Button>
                {currentLevel === 1 ? "新增一级分类" : currentLevel === 2 ? "新增二级分类" : "新增三级分类"}
              </Button>
            </Link>
          </Space>
        }
      >
        {currentLevel === 1 ? (
          <Button type="link" style={{ marginBottom: 16, paddingInline: 0 }} onClick={() => setCategoryStatsOpen(true)}>
            查看全部分类统计
          </Button>
        ) : null}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={visibleItems}
          loading={loading || sortSwapLoading || sortResetLoading}
          pagination={false}
          onRow={(record) => {
            const isDragging = draggingCategoryId === record.id;
            const isDropTarget = dropTargetCategoryId === record.id && draggingCategoryId !== record.id;

            return {
              draggable: canDragSort,
              onDragStart: () => {
                if (!canDragSort) {
                  return;
                }
                setDraggingCategoryId(record.id);
                setDropTargetCategoryId(record.id);
              },
              onDragOver: (event) => {
                if (!canDragSort || draggingCategoryId === null || draggingCategoryId === record.id) {
                  return;
                }
                event.preventDefault();
                if (dropTargetCategoryId !== record.id) {
                  setDropTargetCategoryId(record.id);
                }
              },
              onDrop: (event) => {
                if (!canDragSort || draggingCategoryId === null || draggingCategoryId === record.id) {
                  return;
                }
                event.preventDefault();
                void handleSwapSortOrder(draggingCategoryId, record.id);
              },
              onDragEnd: () => {
                if (!sortSwapLoading) {
                  setDraggingCategoryId(null);
                  setDropTargetCategoryId(null);
                }
              },
              style: canDragSort
                ? {
                    cursor: "move",
                    opacity: isDragging ? 0.45 : 1,
                    backgroundColor: isDropTarget ? "#e6f4ff" : undefined,
                    transition: "background-color 0.2s ease, opacity 0.2s ease",
                  }
                : undefined,
            };
          }}
        />
      </Card>
      <Modal
        title="全部分类统计"
        open={categoryStatsOpen}
        footer={null}
        width={700}
        onCancel={() => setCategoryStatsOpen(false)}
      >
        <Table
          rowKey="level"
          pagination={false}
          size="small"
          columns={[
            { title: "层级", dataIndex: "level" },
            { title: "数据总数", dataIndex: "total", align: "right" },
            { title: "未活跃完成", dataIndex: "inactiveComplete", align: "right" },
            { title: "已活跃", dataIndex: "active", align: "right" },
            { title: "已完成", dataIndex: "complete", align: "right" },
          ]}
          dataSource={[
            {
              level: "一级",
              total: rootLevelTotals.l1Total,
              inactiveComplete: rootLevelTotals.l1InactiveComplete,
              active: rootLevelTotals.l1Active,
              complete: rootLevelTotals.l1Complete,
            },
            {
              level: "二级",
              total: rootLevelTotals.l2Total,
              inactiveComplete: rootLevelTotals.l2InactiveComplete,
              active: rootLevelTotals.l2Active,
              complete: rootLevelTotals.l2Complete,
            },
            {
              level: "三级",
              total: rootLevelTotals.l3Total,
              inactiveComplete: rootLevelTotals.l3InactiveComplete,
              active: rootLevelTotals.l3Active,
              complete: rootLevelTotals.l3Complete,
            },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>合计</Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                {rootLevelTotals.l1Total + rootLevelTotals.l2Total + rootLevelTotals.l3Total}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">
                {rootLevelTotals.l1InactiveComplete +
                  rootLevelTotals.l2InactiveComplete +
                  rootLevelTotals.l3InactiveComplete}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
                {rootLevelTotals.l1Active + rootLevelTotals.l2Active + rootLevelTotals.l3Active}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                {rootLevelTotals.l1Complete + rootLevelTotals.l2Complete + rootLevelTotals.l3Complete}
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Modal>
      <Modal
        title="迷宫主题装饰图提示词"
        open={mazeThemePromptOpen}
        footer={null}
        width={820}
        onCancel={() => setMazeThemePromptOpen(false)}
      >
        <Typography.Paragraph
          type="secondary"
          copyable={{
            text: MAZE_THEME_DECORATION_PROMPT,
            tooltips: ["复制提示词", "已复制"],
          }}
        >
          复制完整提示词后，将 <Typography.Text code>{"{THEME}"}</Typography.Text> 替换为 Halloween、Christmas 等主题名称。
        </Typography.Paragraph>
        <pre
          style={{
            maxHeight: 520,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "#f7f7f7",
            border: "1px solid #eeeeee",
            borderRadius: 6,
            padding: 16,
            margin: 0,
          }}
        >
          {MAZE_THEME_DECORATION_PROMPT}
        </pre>
      </Modal>
      <Modal
        title="移动三级分类"
        open={moveModalOpen}
        onCancel={handleCancelMoveModal}
        onOk={() => void handleMoveCategory()}
        okText="确认移动"
        cancelText="取消"
        confirmLoading={moveSubmitting}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          {movingCategory ? `将“${movingCategory.name}”移动到其他二级分类下，移动后会排在目标分类末尾。` : ""}
        </Typography.Paragraph>
        <Select
          showSearch
          style={{ width: "100%" }}
          placeholder="选择目标二级分类"
          value={moveTargetParentId ?? undefined}
          options={level2MoveOptions}
          optionFilterProp="label"
          onChange={(value) => setMoveTargetParentId(value)}
        />
      </Modal>
    </>
  );
}
