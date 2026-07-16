# D1（线上）结构迁移：与本地 `local-admin.sqlite` 对齐

本目录供 **Cloudflare D1** 使用，与仓库根目录 `migrations/*.sql`（偏文档/手工参考）区分。配置已写入 `wrangler.jsonc` 的 `d1_databases[].migrations_dir`。

## 对齐内容（以本地为准）

- `actives`：增加 `colored_label`（`INTEGER NOT NULL DEFAULT 0`）。
- `imgs`：去掉 `style_tag_id` / `level_tag_id` 及对 `tags` 的外键；索引与 `migrations/0015_remove_tags_add_colored_label.sql` 一致。
- 删除 `active_tags`、`tags` 表（若存在）。
- `0003`：删除废弃的 `images`、`dimensions` 表（旧「维度图」流程，与当前 `imgs` 无关）。

> **说明**：`img_sources`、`source_kind` 等为后台本地素材表，**默认不同步到 D1**；线上 Worker 若未使用该表，无需在 D1 执行。若你单独在线上建了 `img_sources`，可手工执行根目录 `migrations/0016_img_sources_add_source_kind.sql`。

## 执行方式（线上）

在 `printly-admin` 目录、已配置 `CLOUDFLARE_API_TOKEN`：

```bash
npx wrangler d1 migrations apply kid-print --remote
```

仅预览将执行的迁移（不写入）：

```bash
npx wrangler d1 migrations list kid-print --remote
```

## `0001` 已存在 `colored_label` 时

若报错类似 `duplicate column name: colored_label`，说明线上该列已加过：

1. 将 `migrations/d1/0001_actives_colored_label.sql` 内容临时改成一行合法 SQL，例如：`SELECT 1;`
2. 再执行 `npx wrangler d1 migrations apply kid-print --remote`（只会把 0001 标记为已执行并继续 0002）
3. 或向团队约定：新环境保留完整 `0001`，老环境按上面方式 noop 一次即可

## 数据以谁为准

- **表结构**：以本仓库 + 本地 `getDb()` 启动逻辑为准，用上述命令把 **线上 D1** 拉到一致。
- **业务数据**：仍以你们既定流程为准（例如本地 `sync` 推送、或从远端覆盖本地等）；本迁移**不删除** `imgs` 行，仅重建表并复制列子集。

## 回滚

D1 无自动回滚。应用前建议在 Cloudflare 控制台对数据库做备份或导出。
