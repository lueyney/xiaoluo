-- 论文君微信小程序数据库初始化脚本
-- 创建时间: 2025-01-24
-- 数据库版本: MySQL 8.0+

-- 创建数据库
CREATE DATABASE IF NOT EXISTS `lunjun_app` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `lunjun_app`;

-- 1. 用户表
CREATE TABLE `users` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `phone` varchar(11) NOT NULL COMMENT '手机号',
  `email` varchar(100) DEFAULT NULL COMMENT '邮箱',
  `nickname` varchar(50) NOT NULL COMMENT '昵称',
  `avatar` varchar(255) DEFAULT NULL COMMENT '头像URL',
  `openid` varchar(64) DEFAULT NULL COMMENT '微信用户ID',
  `douyin_openid` varchar(64) DEFAULT NULL COMMENT '抖音用户ID',
  `password_hash` varchar(255) DEFAULT NULL COMMENT '密码哈希（微信注册用户可为空）',
  `vip_level` varchar(20) DEFAULT '普通会员' COMMENT 'VIP等级',
  `vip_expire` date DEFAULT NULL COMMENT 'VIP到期时间',
  `invite_code` varchar(20) NOT NULL COMMENT '邀请码',
  `invited_by` bigint(20) DEFAULT NULL COMMENT '邀请人ID',
  `status` tinyint(1) DEFAULT 1 COMMENT '状态: 1-正常 0-禁用',
  `register_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  `last_login` datetime DEFAULT NULL COMMENT '最后登录时间',
  `has_used_first_recharge` tinyint(1) DEFAULT 0 COMMENT '是否已领取首充奖励',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_phone` (`phone`),
  UNIQUE KEY `uk_email` (`email`),
  KEY `idx_phone_status` (`phone`, `status`),
  UNIQUE KEY `uk_invite_code` (`invite_code`),
  KEY `idx_invited_by` (`invited_by`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_openid` (`openid`),
  KEY `idx_douyin_openid` (`douyin_openid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 2. 用户积分表
CREATE TABLE `user_credits` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '记录ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `credits` int(11) NOT NULL DEFAULT 0 COMMENT '当前积分余额',
  `total_earned` int(11) NOT NULL DEFAULT 0 COMMENT '累计获得积分',
  `total_consumed` int(11) NOT NULL DEFAULT 0 COMMENT '累计消费积分',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_id` (`user_id`),
  KEY `idx_credits` (`credits`),
  CONSTRAINT `fk_user_credits_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户积分表';

-- 3. 积分充值包表
CREATE TABLE `credit_packages` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '套餐ID',
  `name` varchar(50) NOT NULL COMMENT '套餐名称',
  `credits` int(11) NOT NULL COMMENT '积分数量',
  `price` decimal(10,2) NOT NULL COMMENT '价格',
  `description` varchar(255) DEFAULT NULL COMMENT '套餐描述',
  `is_active` tinyint(1) DEFAULT 1 COMMENT '是否启用',
  `sort_order` int(11) DEFAULT 0 COMMENT '排序',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_sort_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分充值包表';

CREATE TABLE `orders` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '订单ID',
  `order_no` varchar(32) NOT NULL COMMENT '订单号',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `type` varchar(50) NOT NULL COMMENT '订单类型展示名称，如积分充值包',
  `package_id` int(11) DEFAULT NULL COMMENT '充值包ID',
  `amount` decimal(10,2) NOT NULL COMMENT '订单金额',
  `credits` int(11) DEFAULT 0 COMMENT '获得积分',
  `credits_before` int(11) DEFAULT NULL COMMENT '下单前积分余额',
  `credits_after` int(11) DEFAULT NULL COMMENT '完成后积分余额',
  `status` varchar(20) NOT NULL DEFAULT 'processing' COMMENT '订单状态: processing-进行中 completed-已完成 failed-失败',
  `payment_method` varchar(20) DEFAULT NULL COMMENT '支付方式',
  `finished_at` timestamp NULL DEFAULT NULL COMMENT '完成时间',
  `failure_reason` varchar(255) DEFAULT NULL COMMENT '失败原因',
  `success_count` int(11) DEFAULT 0 COMMENT '成功生成文档数量',
  `fail_count` int(11) DEFAULT 0 COMMENT '失败文档数量',
  `result_content` longtext DEFAULT NULL COMMENT '降重结果内容',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_package_id` (`package_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_finished_at` (`finished_at`),
  CONSTRAINT `fk_orders_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_orders_package_id` FOREIGN KEY (`package_id`) REFERENCES `credit_packages` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表';

-- 4.1 微信支付订单表
CREATE TABLE `payment_orders` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '支付订单ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `package_id` int(11) DEFAULT NULL COMMENT '充值套餐ID',
  `amount` decimal(10,2) NOT NULL COMMENT '订单金额',
  `credits` int(11) NOT NULL COMMENT '获得积分',
  `is_first_recharge` tinyint(1) DEFAULT 0 COMMENT '是否首充订单',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '状态: pending-待支付 paid-已支付 failed-失败 cancelled-取消',
  `out_trade_no` varchar(64) DEFAULT NULL COMMENT '商户订单号',
  `trade_no` varchar(64) DEFAULT NULL COMMENT '微信支付订单号',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `paid_at` timestamp NULL DEFAULT NULL COMMENT '支付完成时间',
  PRIMARY KEY (`id`),
  KEY `idx_payment_orders_user` (`user_id`),
  KEY `idx_payment_orders_status` (`status`),
  KEY `idx_payment_orders_out_trade_no` (`out_trade_no`),
  CONSTRAINT `fk_payment_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payment_orders_package` FOREIGN KEY (`package_id`) REFERENCES `credit_packages` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='微信支付订单表';

-- 5. 积分流水表
CREATE TABLE `credit_transactions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '流水ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `type` varchar(20) NOT NULL COMMENT '类型: earn-获得 consume-消费',
  `amount` int(11) NOT NULL COMMENT '积分变动数量',
  `balance_after` int(11) NOT NULL COMMENT '变动后余额',
  `source` varchar(50) NOT NULL COMMENT '来源: order-订单 ai_writing-AI创作 ai_rewrite-AI降重 invite-邀请奖励',
  `source_id` bigint(20) DEFAULT NULL COMMENT '来源ID',
  `description` varchar(255) DEFAULT NULL COMMENT '描述',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_type` (`type`),
  KEY `idx_source` (`source`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_credit_transactions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分流水表';

-- 6. 文档表
CREATE TABLE `documents` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '文档ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `title` varchar(255) NOT NULL COMMENT '文档标题',
  `content` longtext NOT NULL COMMENT '文档内容',
  `type` varchar(50) NOT NULL COMMENT '文档类型: 学术论文,开题报告,任务书,文献综述,答辩稿,中期检查表,答辩PPT,AI降重',
  `field` varchar(50) DEFAULT NULL COMMENT '学科领域',
  `word_count` int(11) NOT NULL DEFAULT 0 COMMENT '字数',
  `credits_cost` int(11) DEFAULT 0 COMMENT '消耗积分',
  `order_id` bigint(20) DEFAULT NULL COMMENT '关联订单ID',
  `status` varchar(20) DEFAULT 'completed' COMMENT '文档状态',
  `is_deleted` tinyint(1) DEFAULT 0 COMMENT '是否删除',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_type` (`type`),
  KEY `idx_field` (`field`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_is_deleted` (`is_deleted`),
  KEY `idx_order_id` (`order_id`),
  CONSTRAINT `fk_documents_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文档表';

-- 7. 通知表
CREATE TABLE `notifications` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '通知ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `category` varchar(50) NOT NULL COMMENT '通知分类',
  `title` varchar(255) NOT NULL COMMENT '通知标题',
  `content` text NOT NULL COMMENT '通知内容',
  `is_read` tinyint(1) DEFAULT 0 COMMENT '是否已读',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_category` (`category`),
  KEY `idx_is_read` (`is_read`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_notifications_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知表';

-- 8. AI创作任务表
CREATE TABLE `ai_writing_tasks` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '任务ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `field` varchar(50) NOT NULL COMMENT '学科领域',
  `topic` varchar(255) NOT NULL COMMENT '题目',
  `content_types` json NOT NULL COMMENT '生成类型',
  `requirements` text DEFAULT NULL COMMENT '详细要求',
  `title_level1` varchar(50) DEFAULT NULL COMMENT '一级标题格式',
  `title_level2` varchar(50) DEFAULT NULL COMMENT '二级标题格式',
  `credits_cost` int(11) NOT NULL COMMENT '消耗积分',
  `status` varchar(20) DEFAULT 'pending' COMMENT '状态: pending-待处理 processing-处理中 completed-已完成 failed-失败',
  `result_content` longtext DEFAULT NULL COMMENT '生成结果',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_ai_writing_tasks_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI创作任务表';

-- 9. AI降重任务表
CREATE TABLE `ai_rewrite_tasks` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '任务ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `original_text` longtext NOT NULL COMMENT '原始文本',
  `rewritten_text` longtext DEFAULT NULL COMMENT '降重后文本',
  `rewrite_level` tinyint(1) NOT NULL COMMENT '降重等级: 1-轻度 2-中度 3-深度',
  `discipline` varchar(50) DEFAULT NULL COMMENT '学科领域',
  `language` varchar(20) DEFAULT '中文' COMMENT '语言',
  `platform` varchar(50) DEFAULT NULL COMMENT '检测平台',
  `similarity` decimal(5,2) DEFAULT NULL COMMENT '相似度',
  `credits_cost` int(11) NOT NULL COMMENT '消耗积分',
  `status` varchar(20) DEFAULT 'pending' COMMENT '状态: pending-待处理 processing-处理中 completed-已完成 failed-失败',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_ai_rewrite_tasks_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI降重任务表';

-- 插入初始数据

-- 插入积分充值包数据
INSERT INTO `credit_packages` (`name`, `credits`, `price`, `description`, `sort_order`) VALUES
('新手礼包', 100, 0.00, '新用户注册赠送', 1),
('基础包', 1000, 9.90, '适合轻度使用', 2),
('标准包', 3000, 29.90, '推荐选择', 3),
('高级包', 6000, 59.90, '适合重度使用', 4),
('专业包', 12000, 99.90, '专业用户首选', 5);

-- 创建索引优化查询性能
CREATE INDEX `idx_users_phone_status` ON `users` (`phone`, `status`);
CREATE INDEX `idx_orders_user_status` ON `orders` (`user_id`, `status`);
CREATE INDEX `idx_documents_user_type` ON `documents` (`user_id`, `type`);
CREATE INDEX `idx_notifications_user_read` ON `notifications` (`user_id`, `is_read`);

-- 创建视图：用户统计信息
CREATE VIEW `user_stats` AS
SELECT 
    u.id,
    u.phone,
    u.nickname,
    u.vip_level,
    uc.credits as balance,
    uc.total_earned,
    uc.total_consumed,
    COUNT(DISTINCT o.id) as total_orders,
    COUNT(DISTINCT d.id) as generated_docs,
    COUNT(DISTINCT n.id) as unread_notifications
FROM users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'paid'
LEFT JOIN documents d ON u.id = d.user_id AND d.is_deleted = 0
LEFT JOIN notifications n ON u.id = n.user_id AND n.is_read = 0
GROUP BY u.id, u.phone, u.nickname, u.vip_level, uc.credits, uc.total_earned, uc.total_consumed;

-- 创建存储过程：用户注册
DELIMITER //
CREATE PROCEDURE `sp_register_user`(
    IN p_phone VARCHAR(11),
    IN p_password_hash VARCHAR(255),
    IN p_nickname VARCHAR(50),
    IN p_avatar VARCHAR(255),
    IN p_invite_code VARCHAR(20),
    OUT p_user_id BIGINT
)
BEGIN
    DECLARE v_invite_code VARCHAR(20);
    DECLARE v_invited_by BIGINT DEFAULT NULL;
    DECLARE v_initial_credits INT DEFAULT 0;
    
    -- 生成唯一邀请码
    SET v_invite_code = CONCAT('LUNJUN', LPAD(FLOOR(RAND() * 1000000), 6, '0'));
    
    -- 检查邀请人
    IF p_invite_code IS NOT NULL AND p_invite_code != '' THEN
        SELECT id INTO v_invited_by FROM users WHERE invite_code = p_invite_code LIMIT 1;
    END IF;
    
    -- 插入用户
    INSERT INTO users (phone, password_hash, nickname, avatar, invite_code, invited_by)
    VALUES (p_phone, p_password_hash, p_nickname, p_avatar, v_invite_code, v_invited_by);
    
    SET p_user_id = LAST_INSERT_ID();
    
    -- 初始化积分
    INSERT INTO user_credits (user_id, credits, total_earned)
    VALUES (p_user_id, v_initial_credits, v_initial_credits);
    
    -- 记录积分流水（仅当初始积分大于0时）
    IF v_initial_credits > 0 THEN
        INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description)
        VALUES (p_user_id, 'earn', v_initial_credits, v_initial_credits, 'register', '新用户注册赠送');
    END IF;
    
    -- 添加欢迎通知
    INSERT INTO notifications (user_id, category, title, content)
    VALUES (p_user_id, '系统通知', '欢迎使用论文君', '欢迎加入论文君，完善资料即可开始创作~');
    
    -- 如果有邀请人，给邀请人奖励
    IF v_invited_by IS NOT NULL THEN
        UPDATE user_credits 
        SET credits = credits + 10, total_earned = total_earned + 10
        WHERE user_id = v_invited_by;
        
        INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description)
        VALUES (v_invited_by, 'earn', 10, (SELECT credits FROM user_credits WHERE user_id = v_invited_by), 'invite', '邀请好友奖励');

        -- 被邀请用户奖励
        UPDATE user_credits 
        SET credits = credits + 10, total_earned = total_earned + 10
        WHERE user_id = p_user_id;

        INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description)
        VALUES (p_user_id, 'earn', 10, (SELECT credits FROM user_credits WHERE user_id = p_user_id), 'invite_reward', '使用邀请码奖励');
    END IF;
END //
DELIMITER ;

-- 创建存储过程：消费积分
DELIMITER //
CREATE PROCEDURE `sp_consume_credits`(
    IN p_user_id BIGINT,
    IN p_amount INT,
    IN p_source VARCHAR(50),
    IN p_source_id BIGINT,
    IN p_description VARCHAR(255),
    OUT p_success BOOLEAN
)
BEGIN
    DECLARE v_current_credits INT;
    DECLARE v_new_balance INT;
    
    -- 检查积分余额
    SELECT credits INTO v_current_credits FROM user_credits WHERE user_id = p_user_id;
    
    IF v_current_credits >= p_amount THEN
        -- 扣除积分
        UPDATE user_credits 
        SET credits = credits - p_amount, total_consumed = total_consumed + p_amount
        WHERE user_id = p_user_id;
        
        -- 获取新余额
        SELECT credits INTO v_new_balance FROM user_credits WHERE user_id = p_user_id;
        
        -- 记录流水
        INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, source_id, description)
        VALUES (p_user_id, 'consume', p_amount, v_new_balance, p_source, p_source_id, p_description);
        
        SET p_success = TRUE;
    ELSE
        SET p_success = FALSE;
    END IF;
END //
DELIMITER ;

-- 创建触发器：用户删除时清理相关数据
DELIMITER //
CREATE TRIGGER `tr_users_delete` 
BEFORE DELETE ON `users`
FOR EACH ROW
BEGIN
    -- 删除用户相关数据（外键约束会自动处理，这里只是示例）
    DELETE FROM user_credits WHERE user_id = OLD.id;
    DELETE FROM orders WHERE user_id = OLD.id;
    DELETE FROM documents WHERE user_id = OLD.id;
    DELETE FROM notifications WHERE user_id = OLD.id;
    DELETE FROM ai_writing_tasks WHERE user_id = OLD.id;
    DELETE FROM ai_rewrite_tasks WHERE user_id = OLD.id;
    DELETE FROM credit_transactions WHERE user_id = OLD.id;
END //
DELIMITER ;

-- 创建事件：清理过期数据（可选）
-- 每天凌晨2点清理30天前的已读通知
-- CREATE EVENT `ev_cleanup_notifications`
-- ON SCHEDULE EVERY 1 DAY
-- STARTS '2025-01-25 02:00:00'
-- DO
--   DELETE FROM notifications 
--   WHERE is_read = 1 AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- 显示创建结果
SELECT 'Database initialization completed successfully!' as message;
SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'lunjun_app';

-- 初始化首个用户账号
INSERT INTO users (phone, password_hash, nickname, avatar, invite_code, status)
VALUES ('18166973213', '$2a$10$ig1jmv9ukAItIPgFxkZbwumOrw71kx0H5SMi61BcbiwVXGF7ASsXm', '用户3213', NULL, 'LUNJUN000001', 1)
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);

INSERT IGNORE INTO user_credits (user_id, credits, total_earned)
SELECT id, 0, 0 FROM users WHERE phone = '18166973213';
