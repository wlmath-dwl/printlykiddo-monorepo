import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { CATEGORIES_CACHE_TAG } from "@/lib/d1";

export const runtime = "nodejs";

const DEFAULT_ISR_R2_PREFIX = "incremental-cache";
const R2_DELETE_BATCH_SIZE = 1000;

type R2ListResult = {
  objects: Array<{ key: string }>;
} & (
  | { truncated: true; cursor: string }
  | { truncated: false }
);

type IncrementalCacheBucket = {
  list(options: {
    prefix: string;
    cursor?: string;
    limit: number;
  }): Promise<R2ListResult>;
  delete(keys: string[]): Promise<void>;
};

type EnvWithIsrCache = CloudflareEnv & {
  NEXT_INC_CACHE_R2_BUCKET?: IncrementalCacheBucket;
  NEXT_INC_CACHE_R2_PREFIX?: string;
};

function normalizeR2Prefix(value: string | undefined) {
  const prefix = value?.trim().replace(/^\/+|\/+$/g, "") || DEFAULT_ISR_R2_PREFIX;
  return `${prefix}/`;
}

async function clearR2IncrementalCache() {
  const { env } = getCloudflareContext();
  const typedEnv = env as EnvWithIsrCache;
  const bucket = typedEnv.NEXT_INC_CACHE_R2_BUCKET;

  if (!bucket) {
    throw new Error("Missing NEXT_INC_CACHE_R2_BUCKET binding");
  }

  const prefix = normalizeR2Prefix(typedEnv.NEXT_INC_CACHE_R2_PREFIX);
  let cursor: string | undefined;
  let deleted = 0;

  do {
    const listed: R2ListResult = await bucket.list({
      prefix,
      cursor,
      limit: R2_DELETE_BATCH_SIZE,
    });
    const keys = listed.objects.map((object: { key: string }) => object.key);

    if (keys.length > 0) {
      await bucket.delete(keys);
      deleted += keys.length;
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return { prefix, deleted };
}

/**
 * 给 admin 同步数据后调用，触发前台全站缓存失效。
 *
 * 设计原则：
 * - 简单：admin 不需要关心改了什么，调一次就行
 * - 安全：用 Bearer token 校验，避免外部恶意 purge
 * - 容错：admin 通知失败不应影响 admin 业务流程，所以 admin 端用 fire-and-forget
 *
 * 调用方式：
 *   POST /api/revalidate
 *   Authorization: Bearer <REVALIDATE_TOKEN>
 *
 * 部署后需要物理清空 R2 ISR 时，加 `?purge=isr`。
 * `purge=isr` 会同时强制 layout 路径失效，避免旧 HTML/RSC 继续引用已替换的资源。
 * 不带 purge 时默认只刷新数据 tag，适合轻量数据刷新。
 */
export async function POST(request: Request) {
  const expectedToken = process.env.REVALIDATE_TOKEN;
  if (!expectedToken) {
    return NextResponse.json(
      { error: "Server missing REVALIDATE_TOKEN" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("Authorization") || "";
  if (auth !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const shouldPurgeIsr = searchParams.get("purge") === "isr";
    const shouldRevalidateLayout =
      shouldPurgeIsr || searchParams.get("scope") === "layout";
    const r2IncrementalCache = shouldPurgeIsr
      ? await clearR2IncrementalCache()
      : null;

    // 1. 清掉所有 unstable_cache 标了 categories tag 的条目
    //    （目前是 getFirstCategories；未来给 actives / imgs / homepage 加 tag 时同样在这里追加）
    revalidateTag(CATEGORIES_CACHE_TAG);

    if (shouldRevalidateLayout) {
      // 强制全站路径失效只用于手动维护场景。
      // 日常后台同步不走这里，避免三级页客户端导航被大量 RSC 重新生成拖住。
      revalidatePath("/", "layout");
    }

    return NextResponse.json({
      ok: true,
      revalidated: {
        tags: [CATEGORIES_CACHE_TAG],
        paths: shouldRevalidateLayout ? ["/"] : [],
        scope: shouldRevalidateLayout ? "layout" : "data",
      },
      r2IncrementalCache,
      now: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}

/** 拒绝其它方法，避免被 GET 请求误触发。 */
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405 },
  );
}
