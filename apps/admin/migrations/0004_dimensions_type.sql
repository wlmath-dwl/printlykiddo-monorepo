-- 维度表补回固定类型字段，现有数据默认归到 color
ALTER TABLE dimensions ADD COLUMN type TEXT NOT NULL DEFAULT 'color';
CREATE INDEX IF NOT EXISTS idx_dimensions_type ON dimensions(type);
