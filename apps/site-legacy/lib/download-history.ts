"use client";

export type DownloadHistoryCategory = {
  id: string;
  name: string;
  slug: string;
};

export type DownloadHistoryItem = {
  id: string;
  name: string;
  url: string;
  thumbnail: string | null;
  thumbnailAlt: string;
  level1: DownloadHistoryCategory | null;
  level2: DownloadHistoryCategory | null;
  activitySlugs: string[];
  activityLabels: string[];
  firstDownloadedAt: string;
  lastDownloadedAt: string;
  downloadCount: number;
};

export type DownloadHistoryStore = {
  version: 1;
  items: DownloadHistoryItem[];
};

export type DownloadHistoryInput = {
  id: string | number;
  name: string;
  url: string;
  thumbnail?: string | null;
  thumbnailAlt?: string | null;
  level1?: DownloadHistoryCategory | null;
  level2?: DownloadHistoryCategory | null;
  activitySlugs?: string[];
  activityLabels?: string[];
  /** 益智下载等需要以本次选择覆盖旧标签，避免合并过期的泛化标签。 */
  replaceActivityMetadata?: boolean;
};

const STORAGE_KEY = "printlykiddo.downloadHistory.v1";
const HISTORY_CHANGED_EVENT = "printlykiddo:download-history-changed";
/** 本机最多保留的下载历史条数，超出后丢弃最旧的记录。 */
const MAX_HISTORY_ITEMS = 1000;

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function normalizeDownloadUrl(url: string) {
  if (!url.trim()) {
    return "/";
  }

  try {
    const parsed = new URL(url, window.location.origin);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return pathname || "/";
  } catch {
    const pathOnly = url.split(/[?#]/)[0]?.replace(/\/+$/, "") || "/";
    return pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  }
}

function normalizeStore(value: unknown): DownloadHistoryStore {
  if (!value || typeof value !== "object") {
    return { version: 1, items: [] };
  }

  const maybeStore = value as Partial<DownloadHistoryStore>;
  const rawItems = Array.isArray(maybeStore.items) ? maybeStore.items : [];
  const items = rawItems
    .map((item) => normalizeItem(item))
    .filter((item): item is DownloadHistoryItem => Boolean(item))
    .sort(compareHistoryItems);

  return { version: 1, items };
}

function normalizeItem(value: unknown): DownloadHistoryItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<DownloadHistoryItem>;
  const id = String(item.id ?? "").trim();
  const name = String(item.name ?? "").trim();
  const url = normalizeDownloadUrl(String(item.url ?? ""));
  const firstDownloadedAt = parseDateString(item.firstDownloadedAt) ?? new Date().toISOString();
  const lastDownloadedAt = parseDateString(item.lastDownloadedAt) ?? firstDownloadedAt;

  if (!id || !name || !url) {
    return null;
  }

  const activitySlugs = uniqueStrings(item.activitySlugs);
  const isPuzzleWorksheet = activitySlugs.some(
    (slug) => slug === "puzzle-worksheet" || slug === "puzzle-worksheets",
  );
  const activityLabels = uniqueStrings(item.activityLabels).filter(
    (label) =>
      !isPuzzleWorksheet ||
      !["puzzle", "puzzle worksheet", "puzzle worksheets"].includes(
        label.toLowerCase(),
      ),
  );

  return {
    id,
    name,
    url,
    thumbnail: typeof item.thumbnail === "string" && item.thumbnail.trim() ? item.thumbnail : null,
    thumbnailAlt:
      typeof item.thumbnailAlt === "string" && item.thumbnailAlt.trim()
        ? item.thumbnailAlt
        : `${name} printable preview`,
    level1: normalizeCategory(item.level1),
    level2: normalizeCategory(item.level2),
    activitySlugs,
    activityLabels,
    firstDownloadedAt,
    lastDownloadedAt,
    downloadCount: Math.max(1, Number(item.downloadCount) || 1),
  };
}

function normalizeCategory(value: unknown): DownloadHistoryCategory | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const category = value as Partial<DownloadHistoryCategory>;
  const id = String(category.id ?? "").trim();
  const name = String(category.name ?? "").trim();
  const slug = String(category.slug ?? "").trim();

  if (!id || !name || !slug) {
    return null;
  }

  return { id, name, slug };
}

function parseDateString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function uniqueStrings(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      result.push(text);
    }
  }
  return result;
}

function compareHistoryItems(a: DownloadHistoryItem, b: DownloadHistoryItem) {
  return (
    new Date(b.lastDownloadedAt).getTime() -
    new Date(a.lastDownloadedAt).getTime()
  );
}

function emitHistoryChanged() {
  window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
}

export function subscribeDownloadHistory(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  function handleStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY) {
      listener();
    }
  }

  window.addEventListener(HISTORY_CHANGED_EVENT, listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(HISTORY_CHANGED_EVENT, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function readDownloadHistory(): DownloadHistoryStore {
  if (!canUseStorage()) {
    return { version: 1, items: [] };
  }

  try {
    return normalizeStore(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return { version: 1, items: [] };
  }
}

function writeDownloadHistory(store: DownloadHistoryStore) {
  if (!canUseStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    // 配额超限 / 隐私模式等写入失败时静默降级，不影响下载主流程。
    console.warn("Failed to persist download history.", error);
    return;
  }
  emitHistoryChanged();
}

export function recordDownloadHistory(inputs: DownloadHistoryInput[]) {
  if (!canUseStorage() || inputs.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const store = readDownloadHistory();
  const items = [...store.items];

  for (const input of inputs) {
    const id = String(input.id).trim();
    const name = input.name.trim();
    const url = normalizeDownloadUrl(input.url);
    if (!id || !name || !url) {
      continue;
    }

    const existingIndex = items.findIndex(
      (item) => item.id === id || normalizeDownloadUrl(item.url) === url,
    );
    const existing = existingIndex >= 0 ? items[existingIndex] : null;
    const nextItem: DownloadHistoryItem = {
      id,
      name,
      url,
      thumbnail: input.thumbnail ?? existing?.thumbnail ?? null,
      thumbnailAlt:
        input.thumbnailAlt?.trim() ||
        existing?.thumbnailAlt ||
        `${name} printable preview`,
      level1: input.level1 ?? existing?.level1 ?? null,
      level2: input.level2 ?? existing?.level2 ?? null,
      activitySlugs: input.replaceActivityMetadata
        ? uniqueStrings(input.activitySlugs)
        : mergeStrings(existing?.activitySlugs, input.activitySlugs),
      activityLabels: input.replaceActivityMetadata
        ? uniqueStrings(input.activityLabels)
        : mergeStrings(existing?.activityLabels, input.activityLabels),
      firstDownloadedAt: existing?.firstDownloadedAt ?? now,
      lastDownloadedAt: now,
      downloadCount: (existing?.downloadCount ?? 0) + 1,
    };

    if (existingIndex >= 0) {
      items.splice(existingIndex, 1, nextItem);
    } else {
      items.push(nextItem);
    }
  }

  writeDownloadHistory({
    version: 1,
    items: items.sort(compareHistoryItems).slice(0, MAX_HISTORY_ITEMS),
  });
}

function mergeStrings(previous: string[] | undefined, next: string[] | undefined) {
  return uniqueStrings([...(previous ?? []), ...(next ?? [])]);
}

export function removeDownloadHistoryItem(id: string) {
  const store = readDownloadHistory();
  writeDownloadHistory({
    version: 1,
    items: store.items.filter((item) => item.id !== id),
  });
}

export function clearDownloadHistory() {
  writeDownloadHistory({ version: 1, items: [] });
}

export function hasDownloadedItem(id: string | number, url?: string | null) {
  const normalizedUrl = url ? normalizeDownloadUrl(url) : null;
  const stringId = String(id).trim();
  return readDownloadHistory().items.some(
    (item) =>
      item.id === stringId ||
      (normalizedUrl !== null && normalizeDownloadUrl(item.url) === normalizedUrl),
  );
}
