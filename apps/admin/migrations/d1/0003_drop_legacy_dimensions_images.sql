-- 下线「维度 / 维度图」遗留表（先 images 再 dimensions，避免外键顺序问题）
DROP TABLE IF EXISTS images;
DROP TABLE IF EXISTS dimensions;
