/** 允许在「本地数据」模块中浏览的表（顺序即侧栏顺序）；勿在此文件引入 Node/better-sqlite3，以便客户端安全导入。 */
export const LOCAL_DB_VIEW_TABLES = [
  { name: "categories", label: "分类 categories" },
  { name: "actives", label: "功能 actives" },
  { name: "imgs", label: "图片 imgs" },
  { name: "img_sources", label: "原始图 img_sources" },
  { name: "img_source_poses", label: "姿态图 img_source_poses" },
  { name: "special_pages", label: "专题页 special_pages" },
  { name: "product_packages", label: "产品包 product_packages" },
  { name: "product_package_items", label: "产品包条目 product_package_items" },
  { name: "backlink_exchanges", label: "外链网站 backlink_exchanges" },
  { name: "homepage_config", label: "首页配置 homepage_config" },
  { name: "puzzle_pages", label: "益智页面 puzzle_pages" },
  { name: "puzzle_categories", label: "益智分类与封面 puzzle_categories" },
  { name: "puzzle_assets", label: "益智素材 puzzle_assets" },
  { name: "puzzle_asset_delete_queue", label: "益智旧图清理队列" },
  { name: "tool_pages", label: "前台工具 tool_pages" },
  { name: "sync_outbox", label: "同步队列 sync_outbox" },
  { name: "category_image_delete_queue", label: "分类图删除队列" },
  { name: "sync_runtime_lock", label: "同步锁 sync_runtime_lock" },
  { name: "video_publish_cycles", label: "视频周期 video_publish_cycles" },
  { name: "category_video_publish_cycles", label: "类型视频周期关联" },
  { name: "generated_videos", label: "生成视频 generated_videos" },
] as const;

export type LocalDbViewTableName = (typeof LOCAL_DB_VIEW_TABLES)[number]["name"];
