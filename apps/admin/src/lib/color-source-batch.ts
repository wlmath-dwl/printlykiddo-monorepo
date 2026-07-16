import { randomUUID } from "node:crypto";

import {
  getCategoryById,
  listAllImgSources,
  listCategories,
  listImgSourcesByCategory,
  updateImgSource,
} from "@/lib/admin-db";
import type { CategoryRecord, ImgSourceListItem } from "@/lib/admin-types";
import { generateImageFromTextPrompt } from "@/lib/google-image-variant-test";
import { getEffectiveEnglishPromptTextForImgSource } from "@/lib/img-source-prompt-generation";
import { saveGeneratedImgSourceBuffer } from "@/lib/img-source-storage";
import { getCategorySlugPathSegments } from "@/lib/admin-db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColorSourceBatchJobStatus = "pending" | "running" | "success" | "error" | "skipped";

export type ColorSourceBatchJob = {
  source_id: number;
  category_id: number;
  category_name: string;
  source_title: string;
  status: ColorSourceBatchJobStatus;
  message: string;
};

export type ColorSourceBatchSnapshot = {
  run_id: string | null;
  status: "idle" | "running" | "paused" | "completed" | "failed";
  started_at: string | null;
  finished_at: string | null;
  processed_count: number;
  total_count: number;
  pause_requested: boolean;
  jobs: ColorSourceBatchJob[];
  error: string | null;
};

// ---------------------------------------------------------------------------
// Runtime store
// ---------------------------------------------------------------------------

const RUNTIME_NAMESPACE = "__printlyAdminColorSourceBatchRuntime";

type RuntimeStore = ColorSourceBatchSnapshot & {
  worker_active: boolean;
  consecutive_failure_count: number;
};

function getStore(): RuntimeStore {
  const g = globalThis as typeof globalThis & { [RUNTIME_NAMESPACE]?: RuntimeStore };
  if (!g[RUNTIME_NAMESPACE]) {
    g[RUNTIME_NAMESPACE] = {
      run_id: null, status: "idle", started_at: null, finished_at: null,
      processed_count: 0, total_count: 0, pause_requested: false,
      jobs: [], error: null, worker_active: false, consecutive_failure_count: 0,
    };
  }
  return g[RUNTIME_NAMESPACE];
}

function now() { return new Date().toISOString(); }

function getSnapshot(): ColorSourceBatchSnapshot {
  const s = getStore();
  return {
    run_id: s.run_id, status: s.status, started_at: s.started_at, finished_at: s.finished_at,
    processed_count: s.processed_count, total_count: s.total_count, pause_requested: s.pause_requested,
    jobs: s.jobs, error: s.error,
  };
}

function finalizeRun(status: "completed" | "failed" | "paused", error?: string) {
  const s = getStore();
  s.status = status;
  s.finished_at = now();
  if (error) s.error = error;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function hasUploadedSource(item: Pick<ImgSourceListItem, "image_url" | "local_file_path"> | null | undefined) {
  return Boolean(item?.image_url?.trim() && item?.local_file_path?.trim());
}

function collectAncestorNames(parentId: number | null, categoryMap: Map<number, CategoryRecord>) {
  const chain: string[] = [];
  let id = parentId;
  while (id !== null) {
    const row = categoryMap.get(id);
    if (!row) break;
    chain.unshift(row.name);
    id = row.parent_id;
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Build pending jobs
// ---------------------------------------------------------------------------

async function buildPendingJobs(categoryIds: number[]): Promise<ColorSourceBatchJob[]> {
  const [categories, allSources] = await Promise.all([listCategories(), listAllImgSources()]);
  const categoryMap = new Map(categories.flat.map((c) => [c.id, c]));

  // Expand selected IDs to all descendant 3rd-level categories
  const thirdLevelIds = new Set<number>();
  const collectDescendants = (parentId: number) => {
    const cat = categoryMap.get(parentId);
    if (cat && getCategoryDepth(cat, categoryMap) === 3) thirdLevelIds.add(parentId);
    for (const c of categories.flat) {
      if (c.parent_id === parentId) collectDescendants(c.id);
    }
  };
  for (const id of categoryIds) collectDescendants(id);

  // Group color sources by category
  const colorSourcesByCategory = new Map<number, ImgSourceListItem[]>();
  for (const src of allSources.items) {
    if (src.source_kind === "color" && thirdLevelIds.has(src.category_id)) {
      const list = colorSourcesByCategory.get(src.category_id) ?? [];
      list.push(src);
      colorSourcesByCategory.set(src.category_id, list);
    }
  }

  const jobs: ColorSourceBatchJob[] = [];
  for (const catId of thirdLevelIds) {
    const sources = colorSourcesByCategory.get(catId) ?? [];
    for (const src of sources) {
      // Skip if already has uploaded image
      if (hasUploadedSource(src)) continue;
      // Skip if no prompt text
      const prompt = src.prompt_text_en?.trim() || src.prompt_text_zh?.trim() || "";
      if (!prompt) continue;

      const cat = categoryMap.get(catId);
      const catPath = cat
        ? `${collectAncestorNames(cat.parent_id, categoryMap).join(" > ")} > ${cat.name}`
        : `分类 #${catId}`;

      jobs.push({
        source_id: src.id,
        category_id: catId,
        category_name: catPath,
        source_title: src.title?.trim() || `原始图 #${src.id}`,
        status: "pending",
        message: "等待生成彩图。",
      });
    }
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

async function runPendingJobs(runId: string) {
  const store = getStore();
  if (store.worker_active) return;
  store.worker_active = true;

  try {
    for (let i = 0; i < store.jobs.length; i++) {
      if (store.run_id !== runId) break;
      if (store.pause_requested) { finalizeRun("paused"); break; }

      const job = store.jobs[i];
      if (job.status !== "pending") continue;

      job.status = "running";
      job.message = "正在调用 Gemini 生成彩图...";

      try {
        // Re-fetch source to get latest state
        const sources = await listImgSourcesByCategory(job.category_id);
        const freshSource = sources.items.find((s) => s.id === job.source_id);
        if (!freshSource) {
          job.status = "skipped";
          job.message = "原始图记录不存在，跳过。";
          store.processed_count += 1;
          continue;
        }
        if (hasUploadedSource(freshSource)) {
          job.status = "skipped";
          job.message = "已有彩图，跳过。";
          store.processed_count += 1;
          continue;
        }

        const effectivePrompt = getEffectiveEnglishPromptTextForImgSource(freshSource);
        if (!effectivePrompt) {
          job.status = "skipped";
          job.message = "没有提示词文本，跳过。";
          store.processed_count += 1;
          continue;
        }

        job.message = "正在调用 Gemini 图片模型生成彩图...";
        const imageResult = await generateImageFromTextPrompt(effectivePrompt, {
          onProgress: (msg) => { job.message = msg; },
        });

        job.message = "正在保存生成的图片文件...";
        const categorySlugPath = await getCategorySlugPathSegments(job.category_id);
        const savedFile = await saveGeneratedImgSourceBuffer(
          Buffer.from(imageResult.base64Data, "base64"),
          categorySlugPath,
        );

        await updateImgSource(freshSource.id, {
          source_kind: "color",
          image_url: savedFile.image_url,
          local_file_path: savedFile.local_file_path,
          title: freshSource.title,
          description: freshSource.description,
          prompt_key: freshSource.prompt_key,
          prompt_group: freshSource.prompt_group,
          prompt_text_zh: freshSource.prompt_text_zh,
          prompt_text_en: freshSource.prompt_text_en,
          sort_order: freshSource.sort_order,
          is_active: freshSource.is_active,
        });

        job.status = "success";
        job.message = "彩图生成并保存成功。";
        store.processed_count += 1;
        store.consecutive_failure_count = 0;
      } catch (error) {
        const msg = error instanceof Error ? error.message : "生成失败。";
        job.status = "error";
        job.message = msg;
        store.processed_count += 1;
        store.consecutive_failure_count += 1;
        if (store.consecutive_failure_count >= 5) {
          store.error = "连续失败 5 次，已自动暂停。";
          finalizeRun("paused");
          break;
        }
      }
    }
    if (store.status === "running") finalizeRun("completed");
  } catch (error) {
    finalizeRun("failed", error instanceof Error ? error.message : "批量生成失败。");
  } finally {
    store.worker_active = false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getColorSourceBatchStatus(): Promise<ColorSourceBatchSnapshot> {
  return getSnapshot();
}

export async function startColorSourceBatch(categoryIds: number[]) {
  const current = getSnapshot();
  if (current.status === "running") return { started: false, already_running: true, empty: false, batch_run: current };
  if (current.status === "paused") return { started: false, already_running: false, empty: false, batch_run: current };

  const jobs = await buildPendingJobs(categoryIds);
  if (jobs.length === 0) {
    const s = getStore();
    s.run_id = null; s.status = "idle"; s.started_at = null; s.finished_at = now();
    s.processed_count = 0; s.total_count = 0; s.pause_requested = false;
    s.jobs = []; s.error = null; s.consecutive_failure_count = 0;
    return { started: false, already_running: false, empty: true, batch_run: getSnapshot() };
  }

  const s = getStore();
  const runId = randomUUID();
  s.run_id = runId; s.status = "running"; s.started_at = now(); s.finished_at = null;
  s.processed_count = 0; s.total_count = jobs.length; s.pause_requested = false;
  s.jobs = jobs; s.error = null; s.consecutive_failure_count = 0;
  void runPendingJobs(runId);
  return { started: true, already_running: false, empty: false, batch_run: getSnapshot() };
}

export async function pauseColorSourceBatch() {
  const s = getStore();
  if (s.status !== "running") return { paused: false, already_stopped: true, batch_run: getSnapshot() };
  s.pause_requested = true;
  return { paused: true, already_stopped: false, batch_run: getSnapshot() };
}

export async function resumeColorSourceBatch() {
  const s = getStore();
  if (s.status === "running") return { resumed: false, already_running: true, batch_run: getSnapshot() };
  if (s.status !== "paused") return { resumed: false, already_running: false, batch_run: getSnapshot() };
  s.status = "running"; s.pause_requested = false; s.finished_at = null; s.error = null; s.consecutive_failure_count = 0;
  const runId = s.run_id ?? randomUUID();
  s.run_id = runId;
  void runPendingJobs(runId);
  return { resumed: true, already_running: false, batch_run: getSnapshot() };
}
