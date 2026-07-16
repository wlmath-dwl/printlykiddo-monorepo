import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

/**
 * 让 ISR / `unstable_cache` 数据写到 R2，跨 Worker 实例与重启都共享。
 * 没有这一项，所有 `revalidate` 与 `unstable_cache` 都只活在当前实例的内存里，
 * 实例一切换或冷启动就会重新打 D1。
 *
 * 桶 binding 名固定是 `NEXT_INC_CACHE_R2_BUCKET`（OpenNext 内部读取），
 * 写入前缀默认 `incremental-cache/`，与图片代理 worker 用的 `imgs/` 完全隔离。
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
