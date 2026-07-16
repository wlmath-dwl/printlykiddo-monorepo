"use client";

import { PictureOutlined } from "@ant-design/icons";
import { Button, Modal, Progress, Space, Tag, Tree, Typography, message } from "antd";
import type { DataNode } from "antd/es/tree";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CategoryRecord, ImgSourceListItem } from "@/lib/admin-types";
import type { ColorSourceBatchJob, ColorSourceBatchSnapshot } from "@/lib/color-source-batch";

const { Text } = Typography;

type CategoryResponse = { flat: CategoryRecord[] };
type ImgSourcesResponse = { items: ImgSourceListItem[] };
type ErrorResponse = { error: string };
type RunResponse = { started: boolean; already_running: boolean; empty: boolean; batch_run: ColorSourceBatchSnapshot };
type PauseResponse = { paused: boolean; already_stopped: boolean; batch_run: ColorSourceBatchSnapshot };
type ResumeResponse = { resumed: boolean; already_running: boolean; batch_run: ColorSourceBatchSnapshot };

function getErrorMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null && "error" in data && typeof (data as { error?: unknown }).error === "string")
    return (data as { error: string }).error;
  return fallback;
}

function getJobStatusTag(job: ColorSourceBatchJob) {
  if (job.status === "running") return <Tag color="processing">生成中</Tag>;
  if (job.status === "success") return <Tag color="success">已完成</Tag>;
  if (job.status === "error") return <Tag color="error">失败</Tag>;
  if (job.status === "skipped") return <Tag>已跳过</Tag>;
  return <Tag>等待中</Tag>;
}

function getCategoryDepth(item: CategoryRecord, map: Map<number, CategoryRecord>) {
  let depth = 1;
  let cursorId = item.parent_id;
  while (cursorId !== null) {
    const parent = map.get(cursorId);
    if (!parent) break;
    depth += 1;
    cursorId = parent.parent_id;
  }
  return depth;
}

function buildCategoryTree(
  flat: CategoryRecord[],
  colorSourcesByCategory: Map<number, ImgSourceListItem[]>,
): { tree: DataNode[]; rootKeys: number[]; enabledThirdLevelIds: Set<number> } {
  const map = new Map(flat.map((c) => [c.id, c]));
  const childrenByParent = new Map<number | null, CategoryRecord[]>();
  for (const c of flat) {
    const list = childrenByParent.get(c.parent_id) ?? [];
    list.push(c);
    childrenByParent.set(c.parent_id, list);
  }

  // A 3rd-level category is "all done" if all its color sources have uploaded images
  const allColorSourcesDone = (catId: number): boolean => {
    const sources = colorSourcesByCategory.get(catId) ?? [];
    if (sources.length === 0) return false; // no sources = nothing to generate = not "done"
    return sources.every((s) => Boolean(s.image_url?.trim() && s.local_file_path?.trim()));
  };

  const disabledThirdLevel = new Set<number>();
  for (const c of flat) {
    if (getCategoryDepth(c, map) === 3 && allColorSourcesDone(c.id)) {
      disabledThirdLevel.add(c.id);
    }
  }

  // Also disable 3rd-level categories that have NO color sources with prompts (nothing to generate)
  for (const c of flat) {
    if (getCategoryDepth(c, map) === 3 && !disabledThirdLevel.has(c.id)) {
      const sources = colorSourcesByCategory.get(c.id) ?? [];
      const hasGeneratable = sources.some((s) =>
        !Boolean(s.image_url?.trim() && s.local_file_path?.trim()) &&
        Boolean(s.prompt_text_en?.trim() || s.prompt_text_zh?.trim()),
      );
      if (!hasGeneratable) {
        disabledThirdLevel.add(c.id);
      }
    }
  }

  const allDescendantsDisabled = (nodeId: number): boolean => {
    const children = childrenByParent.get(nodeId) ?? [];
    if (children.length === 0) return disabledThirdLevel.has(nodeId);
    return children.every((child) => allDescendantsDisabled(child.id));
  };

  const build = (parentId: number | null): DataNode[] => {
    const items = childrenByParent.get(parentId) ?? [];
    return items
      .sort((a, b) => (a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.id - b.id))
      .map((item) => {
        const is3rdDone = disabledThirdLevel.has(item.id);
        const isParentAllDone = !is3rdDone && allDescendantsDisabled(item.id);
        const label = item.name_zh ? `${item.name_zh}（${item.name}）` : item.name;

        // Count for 3rd-level: how many color sources have images vs total
        let suffix = "";
        if (getCategoryDepth(item, map) === 3) {
          const sources = colorSourcesByCategory.get(item.id) ?? [];
          const uploaded = sources.filter((s) => Boolean(s.image_url?.trim() && s.local_file_path?.trim())).length;
          if (sources.length > 0) suffix = ` (${uploaded}/${sources.length})`;
          if (is3rdDone && sources.length > 0) suffix = " ✓ 全部已生成";
        } else if (isParentAllDone) {
          suffix = " ✓ 全部已生成";
        }

        return {
          key: item.id,
          title: `${label}${suffix}`,
          children: build(item.id),
        };
      });
  };

  const tree = build(null);
  const allThirdLevelIds = new Set(flat.filter((c) => getCategoryDepth(c, map) === 3).map((c) => c.id));
  const enabledThirdLevelIds = allThirdLevelIds;
  return { tree, rootKeys: tree.map((n) => n.key as number), enabledThirdLevelIds };
}

export function ColorSourceBatchToolbar() {
  const [messageApi, contextHolder] = message.useMessage();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<ColorSourceBatchSnapshot | null>(null);
  const [categoryTree, setCategoryTree] = useState<DataNode[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<number[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [enabledThirdLevelIds, setEnabledThirdLevelIds] = useState<Set<number>>(new Set());
  const handledRunKeyRef = useRef<string | null>(null);
  const observedRunningRunIdRef = useRef<string | null>(null);
  const autoOpenedRunKeyRef = useRef<string | null>(null);

  const fetchStatus = useCallback(async (): Promise<ColorSourceBatchSnapshot | null> => {
    try {
      const response = await fetch("/api/admin/color-source-batch/status", { cache: "no-store" });
      const data = (await response.json()) as ColorSourceBatchSnapshot | ErrorResponse;
      if (!response.ok) throw new Error(getErrorMessage(data, "获取状态失败。"));
      setRun(data as ColorSourceBatchSnapshot);
      return data as ColorSourceBatchSnapshot;
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "获取状态失败。");
      return null;
    }
  }, [messageApi]);

  const fetchCategories = useCallback(async () => {
    setCategoryLoading(true);
    try {
      const [catResponse, srcResponse] = await Promise.all([
        fetch("/api/admin/categories", { cache: "no-store" }),
        fetch("/api/admin/img-sources?all=1", { cache: "no-store" }),
      ]);
      const catData = (await catResponse.json()) as CategoryResponse | ErrorResponse;
      const srcData = (await srcResponse.json()) as ImgSourcesResponse | ErrorResponse;
      if (!catResponse.ok || "error" in catData) return;

      const colorSourcesByCategory = new Map<number, ImgSourceListItem[]>();
      if (srcResponse.ok && !("error" in srcData)) {
        for (const src of srcData.items) {
          if (src.source_kind === "color") {
            const list = colorSourcesByCategory.get(src.category_id) ?? [];
            list.push(src);
            colorSourcesByCategory.set(src.category_id, list);
          }
        }
      }

      const result = buildCategoryTree(catData.flat, colorSourcesByCategory);
      setCategoryTree(result.tree);
      setExpandedKeys(result.rootKeys);
      setEnabledThirdLevelIds(result.enabledThirdLevelIds);
    } finally {
      setCategoryLoading(false);
    }
  }, []);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);
  useEffect(() => {
    if (run?.status !== "running") return;
    const timer = window.setInterval(() => { void fetchStatus(); }, 2000);
    return () => window.clearInterval(timer);
  }, [fetchStatus, run?.status]);

  useEffect(() => {
    if (!run || (run.status !== "running" && run.status !== "paused")) return;
    const runKey = `${run.run_id ?? "none"}:${run.status}`;
    observedRunningRunIdRef.current = run.run_id ?? null;
    if (autoOpenedRunKeyRef.current === runKey) return;
    autoOpenedRunKeyRef.current = runKey;
    setModalOpen(true);
  }, [run]);

  useEffect(() => {
    if (!run || run.status === "idle" || run.status === "running") return;
    const currentRunId = run.run_id ?? "none";
    if (observedRunningRunIdRef.current !== currentRunId) {
      handledRunKeyRef.current = `${currentRunId}:${run.status}`;
      return;
    }
    const runKey = `${currentRunId}:${run.status}`;
    if (handledRunKeyRef.current === runKey) return;
    handledRunKeyRef.current = runKey;
    observedRunningRunIdRef.current = null;
    window.dispatchEvent(new CustomEvent("admin-local-changes"));
    if (run.status === "paused") { messageApi.info(run.error || "已暂停。"); return; }
    if (run.status === "failed") { messageApi.error(run.error || "执行失败。"); return; }
    const errorCount = run.jobs.filter((j) => j.status === "error").length;
    if (errorCount > 0) { messageApi.warning(`完成，但有 ${errorCount} 条失败。`); return; }
    messageApi.success(`彩图生成完成：共处理 ${run.processed_count} 条。`);
  }, [messageApi, run]);

  const counts = useMemo(() => {
    const jobs = run?.jobs ?? [];
    return {
      success: jobs.filter((j) => j.status === "success").length,
      error: jobs.filter((j) => j.status === "error").length,
      skipped: jobs.filter((j) => j.status === "skipped").length,
    };
  }, [run]);

  const percent = useMemo(() => {
    if (!run?.total_count) return 0;
    return Math.round((run.processed_count / run.total_count) * 100);
  }, [run]);

  const effectiveCount = useMemo(
    () => checkedKeys.filter((k) => enabledThirdLevelIds.has(k)).length,
    [checkedKeys, enabledThirdLevelIds],
  );

  const openSelector = useCallback(async () => {
    setCheckedKeys([]);
    setSelectorOpen(true);
    const current = await fetchStatus();
    if (current?.status === "running" || current?.status === "paused") {
      setSelectorOpen(false);
      setModalOpen(true);
      return;
    }
    await fetchCategories();
  }, [fetchCategories, fetchStatus]);

  const confirmAndRun = useCallback(async () => {
    if (checkedKeys.length === 0) { messageApi.warning("请至少选择一个分类。"); return; }
    setSelectorOpen(false);
    setLoading(true);
    setModalOpen(true);
    try {
      const response = await fetch("/api/admin/color-source-batch/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_ids: checkedKeys }),
      });
      const data = (await response.json()) as RunResponse | ErrorResponse;
      if (!response.ok || "error" in data) throw new Error(getErrorMessage(data, "启动失败。"));
      setRun(data.batch_run);
      if (data.empty) messageApi.info("选中的分类下没有需要生成彩图的原始图（均已有图片或无提示词）。");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "启动失败。");
    } finally { setLoading(false); }
  }, [checkedKeys, messageApi]);

  const pauseRun = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/color-source-batch/pause", { method: "POST" });
      const data = (await response.json()) as PauseResponse | ErrorResponse;
      if (!response.ok || "error" in data) throw new Error(getErrorMessage(data, "暂停失败。"));
      setRun(data.batch_run);
      if (!data.already_stopped) messageApi.success("已请求暂停。");
    } catch (error) { messageApi.error(error instanceof Error ? error.message : "暂停失败。"); }
    finally { setLoading(false); }
  }, [messageApi]);

  const resumeRun = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/color-source-batch/resume", { method: "POST" });
      const data = (await response.json()) as ResumeResponse | ErrorResponse;
      if (!response.ok || "error" in data) throw new Error(getErrorMessage(data, "继续失败。"));
      setRun(data.batch_run);
    } catch (error) { messageApi.error(error instanceof Error ? error.message : "继续失败。"); }
    finally { setLoading(false); }
  }, [messageApi]);

  return (
    <Space size={12}>
      {contextHolder}
      <Button icon={<PictureOutlined />} onClick={() => void openSelector()} loading={loading}>
        批量生成彩图
      </Button>

      <Modal
        title="选择要生成彩图的分类"
        open={selectorOpen}
        onCancel={() => setSelectorOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setSelectorOpen(false)}>取消</Button>,
          <Button key="confirm" type="primary" disabled={effectiveCount === 0} onClick={() => void confirmAndRun()} loading={loading}>
            确认执行（{effectiveCount} 个三级分类）
          </Button>,
        ]}
        width={560}
        destroyOnHidden
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
          勾选需要生成彩图的分类。已有全部彩图或无提示词的三级分类显示为禁用态。使用 Gemini 图片模型根据提示词生成彩图原始图。
        </Text>
        {categoryLoading ? (
          <Text type="secondary">加载分类中...</Text>
        ) : (
          <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: 8 }}>
            <Tree
              checkable
              virtual
              height={400}
              treeData={categoryTree}
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpandedKeys(keys)}
              checkedKeys={checkedKeys}
              onCheck={(keys) => {
                const checked = Array.isArray(keys) ? keys : keys.checked;
                setCheckedKeys(checked.filter((k): k is number => typeof k === "number"));
              }}
            />
          </div>
        )}
      </Modal>

      <Modal
        title="批量生成彩图原始图"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={[
          run?.status === "running" ? <Button key="pause" onClick={() => void pauseRun()} loading={loading}>暂停</Button> : null,
          run?.status === "paused" ? <Button key="resume" type="primary" onClick={() => void resumeRun()} loading={loading}>继续</Button> : null,
          <Button key="close" onClick={() => setModalOpen(false)}>关闭</Button>,
        ]}
        width={920}
        destroyOnHidden
      >
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Text type="secondary">
            调用 Gemini 图片模型（gemini-2.0-flash）根据提示词为每个彩图原始图生成图片。已有图片的会自动跳过。关闭弹窗不会中断后台执行。
          </Text>
          {run?.pause_requested && run.status === "running" ? <Text type="warning">已收到暂停请求，当前这一条完成后会暂停。</Text> : null}
          {run?.error ? <Text type="danger">{run.error}</Text> : null}
          <Progress percent={percent} />
          <Text>
            总数 {run?.total_count ?? 0} 条，已完成 {run?.processed_count ?? 0} 条，成功 {counts.success} 条，失败 {counts.error} 条，跳过 {counts.skipped} 条。
          </Text>
          <div style={{ maxHeight: 460, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 8, padding: 12 }}>
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              {(run?.jobs ?? []).map((job, index, list) => (
                <div key={`${job.source_id}`} style={{ paddingBottom: 12, borderBottom: index === list.length - 1 ? "none" : "1px solid #f0f0f0" }}>
                  <Space wrap size={8}>
                    <Text strong>{job.category_name}</Text>
                    <Text>{job.source_title}</Text>
                    {getJobStatusTag(job)}
                  </Space>
                  <div style={{ marginTop: 4 }}><Text type="secondary">{job.message}</Text></div>
                </div>
              ))}
              {(run?.jobs?.length ?? 0) === 0 ? <Text type="secondary">当前还没有运行记录。</Text> : null}
            </Space>
          </div>
        </Space>
      </Modal>
    </Space>
  );
}
