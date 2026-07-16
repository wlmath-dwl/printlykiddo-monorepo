-- 下线废弃的「功能-分类关联」表；功能改为全局共享，不再按分类单独关联
DROP INDEX IF EXISTS idx_active_categories_category_id;
DROP TABLE IF EXISTS active_categories;
