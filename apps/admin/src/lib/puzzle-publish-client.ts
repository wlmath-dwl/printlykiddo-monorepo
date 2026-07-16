export type PuzzleUploadProgressEvent = {
  type: "upload";
  difficulty: string;
  assetKind: "puzzle" | "answer";
  kindCurrent: number;
  kindTotal: number;
  overallCurrent: number;
  overallTotal: number;
};

export type PuzzleCleanupProgressEvent = {
  type: "cleanup";
  difficulty: string;
  current: number;
  total: number;
  imageUrl: string;
};

export type PuzzlePublishJob = {
  page_slug: string;
  status: "running" | "paused" | "completed" | "failed";
  difficulty_index: number;
  item_index: number;
  total_per_difficulty: number;
  phase: "generating" | "cleanup" | "completed";
  cleanup_current: number;
  cleanup_total: number;
  last_error: string;
  updated_at: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "发布接口请求失败。");
  return body;
}

export async function startOrResumePuzzlePublish(slug: string) {
  return readJson<{ publish_job: PuzzlePublishJob }>(
    await fetch(`/api/admin/puzzles/${slug}?action=start`, { method: "POST" }),
  );
}

export async function getPuzzlePublishState<T>(slug: string) {
  return readJson<T & { publish_job: PuzzlePublishJob | null }>(
    await fetch(`/api/admin/puzzles/${slug}`, { cache: "no-store" }),
  );
}

export async function pausePuzzlePublish(slug: string) {
  return readJson<{ publish_job: PuzzlePublishJob }>(
    await fetch(`/api/admin/puzzles/${slug}?action=pause`, { method: "POST" }),
  );
}

export async function uploadPuzzlePublishItem(input: {
  slug: string;
  difficulty: string;
  index: number;
  puzzle: Blob;
  answer: Blob;
  fileName: string;
}) {
  const form = new FormData();
  form.set("difficulty", input.difficulty);
  form.set("index", String(input.index));
  form.set("puzzle", input.puzzle, input.fileName);
  form.set("answer", input.answer, input.fileName);
  return readJson<{ job: PuzzlePublishJob; skipped: boolean }>(
    await fetch(`/api/admin/puzzles/${input.slug}?action=item`, { method: "POST", body: form }),
  );
}

export async function finalizePuzzlePublishDifficulty<T>(
  slug: string,
  onCleanup?: (event: PuzzleCleanupProgressEvent) => void,
) {
  const response = await fetch(`/api/admin/puzzles/${slug}?action=finalize&stream=1`, { method: "POST" });
  return readPuzzlePublishStream<T>(response, undefined, onCleanup);
}

export async function readPuzzlePublishStream<T>(
  response: Response,
  onUpload?: (event: PuzzleUploadProgressEvent) => void,
  onCleanup?: (event: PuzzleCleanupProgressEvent) => void,
): Promise<T> {
  if (!response.ok || !response.body) {
    throw new Error("发布接口连接失败。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | null = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as
        | PuzzleUploadProgressEvent
        | PuzzleCleanupProgressEvent
        | { type: "complete"; page: T }
        | { type: "error"; error: string };
      if (event.type === "upload") onUpload?.(event);
      if (event.type === "cleanup") onCleanup?.(event);
      if (event.type === "complete") result = event.page;
      if (event.type === "error") throw new Error(event.error);
    }
    if (done) break;
  }

  if (!result) throw new Error("发布完成，但接口没有返回页面数据。");
  return result;
}
