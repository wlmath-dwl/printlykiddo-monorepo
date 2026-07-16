-- 现网遗留的 categories.keywords 已通过一次性 D1 SQL 清理；
-- 新环境本就不会创建该列，这里保留一个 noop 迁移占位，避免迁移编号断档。
SELECT 1;
