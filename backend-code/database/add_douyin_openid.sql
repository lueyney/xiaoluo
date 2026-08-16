-- 为抖音小程序支持添加 douyin_openid 字段
-- 执行时间: 2025-01-24

USE `lunjun_app`;

-- 检查并添加 openid 字段（如果不存在）
-- 注意：如果 users 表已经有 openid 字段，这个语句会失败，可以忽略
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'lunjun_app' 
  AND TABLE_NAME = 'users' 
  AND COLUMN_NAME = 'openid');

SET @sqlstmt := IF(@exist = 0, 
  'ALTER TABLE `users` ADD COLUMN `openid` VARCHAR(64) NULL COMMENT ''微信用户ID'' AFTER `avatar`',
  'SELECT ''openid column already exists'' AS message');

PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加 douyin_openid 字段
ALTER TABLE `users` 
ADD COLUMN `douyin_openid` VARCHAR(64) NULL COMMENT '抖音用户ID' 
AFTER `openid`;

-- 添加索引以便快速查询
ALTER TABLE `users` 
ADD INDEX `idx_douyin_openid` (`douyin_openid`);

-- 如果 openid 字段不存在索引，也添加一个
SET @exist_openid_idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
  WHERE TABLE_SCHEMA = 'lunjun_app' 
  AND TABLE_NAME = 'users' 
  AND INDEX_NAME = 'idx_openid');

SET @sqlstmt2 := IF(@exist_openid_idx = 0, 
  'ALTER TABLE `users` ADD INDEX `idx_openid` (`openid`)',
  'SELECT ''idx_openid already exists'' AS message');

PREPARE stmt2 FROM @sqlstmt2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;


