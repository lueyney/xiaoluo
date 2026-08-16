-- 添加订单成功/失败计数字段
-- 用于支持部分成功的场景

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS success_count INT DEFAULT 0 COMMENT '成功生成的文档数量';

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS fail_count INT DEFAULT 0 COMMENT '失败的文档数量';

-- 更新现有completed状态的订单
UPDATE orders 
SET success_count = 1, fail_count = 0 
WHERE status = 'completed' AND success_count IS NULL;

-- 更新现有failed状态的订单
UPDATE orders 
SET success_count = 0, fail_count = 1 
WHERE status = 'failed' AND fail_count IS NULL;

