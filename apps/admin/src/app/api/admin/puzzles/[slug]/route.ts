import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { deleteManagedPuzzleFileFromR2, uploadManagedPuzzleFileToR2 } from "@/lib/cloudflare-sync";
import { deleteManagedFile, saveManagedImageFileAtPath } from "@/lib/local-image-storage";
import {
  completeQueuedPuzzleAssetDelete,
  addStagedPuzzlePublishAssets,
  clearStagedPuzzlePublishAssets,
  clearStagedPuzzlePublishItem,
  getPuzzlePublishJob,
  getStagedPuzzlePublishItem,
  getPuzzlePage,
  listStagedPuzzlePublishAssets,
  listQueuedPuzzleAssetDeletes,
  replacePuzzleAssets,
  startOrResumePuzzlePublishJob,
  updatePuzzlePublishJob,
  writePuzzleFrontendSnapshot,
  type PuzzleAssetKind,
} from "@/lib/puzzle-local-db";
import { getPuzzlePageConfig } from "@/lib/puzzle-page-config";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const page = getPuzzlePage(slug);
  if (page) await writePuzzleFrontendSnapshot();
  return page
    ? NextResponse.json({ ...page, publish_job: getPuzzlePublishJob(slug) })
    : NextResponse.json({ error: "固定益智页面不存在。" }, { status: 404 });
}

async function saveResumableItem(request: Request, slug: string) {
  const config = getPuzzlePageConfig(slug);
  const job = getPuzzlePublishJob(slug);
  if (!config || !job) throw new Error("发布任务不存在，请重新点击开始。");
  if (job.status !== "running") throw new Error(job.status === "paused" ? "任务已经暂停。" : "任务当前不可继续。");

  const formData = await request.formData();
  const difficulty = String(formData.get("difficulty") ?? "");
  const index = Number(formData.get("index"));
  const expectedDifficulty = config.difficulties[job.difficulty_index];
  if (difficulty !== expectedDifficulty || !Number.isInteger(index) || index < 0 || index >= job.total_per_difficulty) {
    throw new Error("上传位置与当前任务进度不一致。");
  }
  if (index < job.item_index) return { job, skipped: true };
  if (index > job.item_index) throw new Error("不能跳过尚未完成的图片。");

  let existing = getStagedPuzzlePublishItem(slug, difficulty, index);
  if (existing.length === 1) {
    for (const partialAsset of existing) {
      await deleteManagedPuzzleFileFromR2(partialAsset.image_url);
      await deleteManagedFile(partialAsset.local_file_path);
    }
    clearStagedPuzzlePublishItem(slug, difficulty, index);
    existing = [];
  }
  const existingKinds = new Set(existing.map((asset) => asset.asset_kind));
  const files: Array<[PuzzleAssetKind, FormDataEntryValue | null]> = [
    ["puzzle", formData.get("puzzle")],
    ["answer", formData.get("answer")],
  ];
  for (const [kind, value] of files) {
    if (existingKinds.has(kind)) continue;
    if (!(value instanceof File) || value.size === 0) throw new Error(`${kind === "puzzle" ? "题目" : "答案"}图片缺失。`);
    const id = randomUUID().replaceAll("-", "");
    const objectKey = `imgs/puzzles/${config.family}/${config.slug}/${difficulty}/${kind}-${id}.webp`;
    const saved = await saveManagedImageFileAtPath(value, objectKey, { preset: "generated_pdf", normalize: false });
    try {
      await uploadManagedPuzzleFileToR2(objectKey, saved.local_file_path);
    } catch (error) {
      await deleteManagedFile(saved.local_file_path);
      throw error;
    }
    addStagedPuzzlePublishAssets({
      slug,
      difficulty,
      assets: [{ asset_kind: kind, image_url: objectKey, local_file_path: saved.local_file_path, sort_order: index }],
    });
  }
  const nextJob = updatePuzzlePublishJob(slug, { item_index: index + 1, last_error: "" });
  return { job: nextJob, skipped: false };
}

async function finalizeResumableDifficulty(
  slug: string,
  onProgress?: (event: CleanupProgress) => void,
) {
  const config = getPuzzlePageConfig(slug);
  const job = getPuzzlePublishJob(slug);
  if (!config || !job) throw new Error("发布任务不存在。");
  if (job.status !== "running") throw new Error("发布任务没有运行。");
  const difficulty = config.difficulties[job.difficulty_index];
  if (!difficulty) throw new Error("全部难度已经处理完成。");
  let page = getPuzzlePage(slug);
  if (job.phase !== "cleanup") {
    const staged = listStagedPuzzlePublishAssets(slug, difficulty);
    if (job.item_index !== job.total_per_difficulty || staged.length !== job.total_per_difficulty * 2) {
      throw new Error(`当前难度尚未上传完成：${job.item_index}/${job.total_per_difficulty}。`);
    }
    page = replacePuzzleAssets({
      slug,
      difficulty,
      assets: staged.map((asset) => ({
        asset_kind: asset.asset_kind,
        image_url: asset.image_url,
        local_file_path: asset.local_file_path,
        sort_order: asset.sort_order,
      })),
    });
    clearStagedPuzzlePublishAssets(slug, difficulty);
  }
  const queuedDeletes = listQueuedPuzzleAssetDeletes(slug, difficulty);
  const cleanupTotal = job.phase === "cleanup" ? job.cleanup_total : queuedDeletes.length;
  const alreadyCleaned = Math.max(0, cleanupTotal - queuedDeletes.length);
  updatePuzzlePublishJob(slug, { phase: "cleanup", cleanup_current: alreadyCleaned, cleanup_total: cleanupTotal });
  for (const [index, oldAsset] of queuedDeletes.entries()) {
    await deleteManagedPuzzleFileFromR2(oldAsset.image_url);
    await deleteManagedFile(oldAsset.local_file_path);
    completeQueuedPuzzleAssetDelete(oldAsset.id);
    updatePuzzlePublishJob(slug, { cleanup_current: alreadyCleaned + index + 1 });
    onProgress?.({ type: "cleanup", difficulty, current: alreadyCleaned + index + 1, total: cleanupTotal, imageUrl: oldAsset.image_url });
  }
  const nextDifficultyIndex = job.difficulty_index + 1;
  const completed = nextDifficultyIndex >= config.difficulties.length;
  const nextJob = updatePuzzlePublishJob(slug, {
    status: completed ? "completed" : "running",
    difficulty_index: nextDifficultyIndex,
    item_index: 0,
    phase: completed ? "completed" : "generating",
    cleanup_current: cleanupTotal,
    cleanup_total: cleanupTotal,
  });
  const snapshotPath = await writePuzzleFrontendSnapshot();
  return { page, publish_job: nextJob, snapshotPath };
}

type UploadProgress = {
  type: "upload";
  difficulty: string;
  assetKind: PuzzleAssetKind;
  kindCurrent: number;
  kindTotal: number;
  overallCurrent: number;
  overallTotal: number;
};

type CleanupProgress = {
  type: "cleanup";
  difficulty: string;
  current: number;
  total: number;
  imageUrl: string;
};

async function publishPuzzlePage(
  request: Request,
  slug: string,
  onProgress?: (event: UploadProgress | CleanupProgress) => void,
) {
  const config = getPuzzlePageConfig(slug);
  if (!config) throw new Error("固定益智页面不存在。");
  const pageConfig = config;

  const formData = await request.formData();
  const difficulty = String(formData.get("difficulty") ?? "").trim();
  if (!(config.difficulties as readonly string[]).includes(difficulty)) {
    throw new Error("该页面不支持这个难度。");
  }

  const puzzleFiles = formData.getAll("puzzles").filter((item): item is File => item instanceof File && item.size > 0);
  const answerFiles = formData.getAll("answers").filter((item): item is File => item instanceof File && item.size > 0);
  if (puzzleFiles.length === 0) throw new Error("没有收到题目图片。");
  if (answerFiles.length !== 0 && answerFiles.length !== puzzleFiles.length) {
    throw new Error("题目图和答案图数量不一致。");
  }

  const savedAssets: Array<{
    asset_kind: PuzzleAssetKind;
    image_url: string;
    local_file_path: string;
    sort_order: number;
  }> = [];
  const overallTotal = puzzleFiles.length + answerFiles.length;
  let overallCurrent = 0;

  async function saveFiles(files: File[], kind: PuzzleAssetKind) {
    for (const [index, file] of files.entries()) {
      const id = randomUUID().replaceAll("-", "");
      const objectKey = `imgs/puzzles/${pageConfig.family}/${pageConfig.slug}/${difficulty}/${kind}-${id}.webp`;
      const saved = await saveManagedImageFileAtPath(file, objectKey, {
        preset: "generated_pdf",
        normalize: false,
      });
      await uploadManagedPuzzleFileToR2(objectKey, saved.local_file_path);
      savedAssets.push({
        asset_kind: kind,
        image_url: objectKey,
        local_file_path: saved.local_file_path,
        sort_order: index,
      });
      overallCurrent += 1;
      onProgress?.({
        type: "upload",
        difficulty,
        assetKind: kind,
        kindCurrent: index + 1,
        kindTotal: files.length,
        overallCurrent,
        overallTotal,
      });
    }
  }

  await saveFiles(puzzleFiles, "puzzle");
  await saveFiles(answerFiles, "answer");
  const page = replacePuzzleAssets({ slug, difficulty, assets: savedAssets });
  const queuedDeletes = listQueuedPuzzleAssetDeletes(slug, difficulty);
  for (const [index, oldAsset] of queuedDeletes.entries()) {
    await deleteManagedPuzzleFileFromR2(oldAsset.image_url);
    await deleteManagedFile(oldAsset.local_file_path);
    completeQueuedPuzzleAssetDelete(oldAsset.id);
    onProgress?.({
      type: "cleanup",
      difficulty,
      current: index + 1,
      total: queuedDeletes.length,
      imageUrl: oldAsset.image_url,
    });
  }
  const snapshotPath = await writePuzzleFrontendSnapshot();
  return { page, snapshotPath };
}

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const wantsStream = url.searchParams.get("stream") === "1";

  try {
    if (action === "start") {
      if (!getPuzzlePageConfig(slug)) throw new Error("固定益智页面不存在。");
      return NextResponse.json({ publish_job: startOrResumePuzzlePublishJob(slug) });
    }
    if (action === "pause") {
      return NextResponse.json({ publish_job: updatePuzzlePublishJob(slug, { status: "paused" }) });
    }
    if (action === "item") {
      return NextResponse.json(await saveResumableItem(request, slug));
    }
  } catch (error) {
    if (action && action !== "pause" && getPuzzlePublishJob(slug)?.status !== "paused") {
      updatePuzzlePublishJob(slug, { status: "failed", last_error: error instanceof Error ? error.message : "发布失败" });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "发布操作失败。" }, { status: 400 });
  }

  if (action === "finalize" && wantsStream) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        try {
          const result = await finalizeResumableDifficulty(slug, send);
          send({ type: "complete", ...result });
        } catch (error) {
          updatePuzzlePublishJob(slug, { status: "failed", last_error: error instanceof Error ? error.message : "发布失败" });
          send({ type: "error", error: error instanceof Error ? error.message : "发布失败。" });
        } finally {
          controller.close();
        }
      },
    }), { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  }

  if (wantsStream) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        try {
          const result = await publishPuzzlePage(request, slug, send);
          send({ type: "complete", ...result });
        } catch (error) {
          send({ type: "error", error: error instanceof Error ? error.message : "生成并发布益智页面失败。" });
        } finally {
          controller.close();
        }
      },
    }), {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    return NextResponse.json(await publishPuzzlePage(request, slug));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成并发布益智页面失败。" },
      { status: 400 },
    );
  }
}
