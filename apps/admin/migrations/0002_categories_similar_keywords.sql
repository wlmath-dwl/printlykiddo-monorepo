-- 分类表增加扩展关键词字段（SEO），多个词用空格分隔
ALTER TABLE categories ADD COLUMN similar_keywords TEXT NULL;
