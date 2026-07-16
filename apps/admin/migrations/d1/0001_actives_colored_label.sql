-- actives：与本地一致，增加 colored_label（布尔，默认 0）
-- 若线上已存在该列，apply 会报错；请见 migrations/d1/README.md 处理后再执行后续迁移。
ALTER TABLE actives ADD COLUMN colored_label INTEGER NOT NULL DEFAULT 0;
