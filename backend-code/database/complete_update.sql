-- 完整的数据库更新脚本
-- 执行此脚本以修复所有问题

USE lunjun_app;

-- 1. 添加订单成功/失败计数字段
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS success_count INT DEFAULT 0 COMMENT '成功生成的文档数量';

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS fail_count INT DEFAULT 0 COMMENT '失败的文档数量';

-- 2. 更新现有completed状态的订单
UPDATE orders 
SET success_count = 1, fail_count = 0 
WHERE status = 'completed' AND (success_count IS NULL OR success_count = 0);

-- 3. 更新现有failed状态的订单
UPDATE orders 
SET success_count = 0, fail_count = 1 
WHERE status = 'failed' AND (fail_count IS NULL OR fail_count = 0);

-- 4. 确保payment_orders表有is_first_recharge字段
ALTER TABLE payment_orders 
ADD COLUMN IF NOT EXISTS is_first_recharge TINYINT(1) DEFAULT 0 COMMENT '是否首充订单';

-- 5. 用户表增加首充标记
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS has_used_first_recharge TINYINT(1) DEFAULT 0 COMMENT '是否已领取首充奖励';

-- 5. 查看当前首充状态（调试用）
SELECT 
  u.id as user_id,
  u.phone,
  COUNT(po.id) as paid_orders_count,
  SUM(po.credits) as total_credits,
  GROUP_CONCAT(CONCAT('订单', po.id, ':¥', po.amount, '=', po.credits, '积分') SEPARATOR ', ') as orders
FROM users u
LEFT JOIN payment_orders po ON u.id = po.user_id AND po.status = 'paid'
GROUP BY u.id, u.phone;

-- 6. 显示异常的首充使用情况（如果有）
SELECT 
  po.id,
  po.user_id,
  po.package_id,
  po.amount,
  po.credits,
  po.status,
  po.created_at,
  po.is_first_recharge
FROM payment_orders po
WHERE po.package_id = 1 AND po.amount = 1.00 AND po.credits = 50
ORDER BY po.created_at DESC
LIMIT 10;

SELECT '✅ 数据库更新完成！' as message;

-- 7. 添加orders表降重结果字段（AI降重功能必需）
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS result_content LONGTEXT DEFAULT NULL COMMENT '降重结果内容';

-- 8. 文档表补齐创作订单关联与状态字段（学术写作功能必需）
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS order_id BIGINT(20) DEFAULT NULL COMMENT '关联订单ID' AFTER credits_cost;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed' COMMENT '文档状态' AFTER order_id;


