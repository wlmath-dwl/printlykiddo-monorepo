# printlykiddo

## 本地开发

这个项目在不同运行方式下使用不同数据库：

- `npm run dev`：读取本机 sqlite，支持本地热更新
- `npm run preview` / `npm run deploy`：继续连接 Cloudflare D1

### 1. 安装依赖

```bash
npm install
```

### 2. 拉取一份本地 sqlite

首次在这台机器启动前，先把远程 D1 数据同步到本机 sqlite：

```bash
npm run db:pull
```

默认读取并写入 `../printly-admin/data/local-admin.sqlite`，前台站点、sitemap 生成和本地图片代理都复用这一份 `printly-admin` 数据。也可以通过环境变量 `LOCAL_SQLITE_PATH` 自定义位置。

### 3. 先登录 Cloudflare

执行 `npm run db:pull` 前，需要先确认 `wrangler` 已登录。

先检查：

```bash
wrangler whoami
```

如果还没登录，执行：

```bash
wrangler login
```

登录成功后，才能从远程 D1 拉取最新数据到本机 sqlite。

### 4. 启动开发环境

```bash
npm run dev
```

启动后访问：

```text
http://localhost:3000
```

## 常见问题

### 本地启动时报找不到 sqlite 数据库

如果看到类似错误：

```text
Local sqlite database not found
```

通常说明还没有先执行：

```bash
npm run db:pull
```

如果 `db:pull` 失败，再检查：

```bash
wrangler whoami
```

## 其他命令

类型检查：

```bash
npm run typecheck
```

本地 Cloudflare 预览：

```bash
npm run preview
```

部署：

```bash
npm run deploy
```

部署前会自动执行 `npm run sitemap`，根据本地 sqlite 刷新 `public/sitemap.xml`。
如需手动单独更新 sitemap，可执行：

```bash
npm run sitemap
```
