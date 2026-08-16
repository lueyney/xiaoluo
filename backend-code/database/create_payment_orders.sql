-- 创建支付订单表
CREATE TABLE IF NOT EXISTS `payment_orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `package_id` INT NOT NULL COMMENT '套餐ID',
  `amount` DECIMAL(10, 2) NOT NULL COMMENT '支付金额（元）',
  `credits` INT NOT NULL COMMENT '获得积分',
  `status` ENUM('pending', 'paid', 'failed', 'cancelled') DEFAULT 'pending' COMMENT '订单状态',
  `trade_no` VARCHAR(64) COMMENT '支付平台交易号',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `paid_at` DATETIME COMMENT '支付时间',
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='充值订单表';







