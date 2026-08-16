-- 抖音小程序数据库字段检查和迁移脚本
-- 用途：检查现有数据库是否包含 openid 和 douyin_openid 字段，如果没有则自动添加
-- 执行时间: 2025-01-24

USE `lunjun_app`;

-- ============================================
-- 1. 检查并添加 openid 字段（微信用户ID）
-- ============================================
SET @exist_openid := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'lunjun_app' 
  AND TABLE_NAME = 'users' 
  AND COLUMN_NAME = 'openid');

SET @sql_openid := IF(@exist_openid = 0, 
  'ALTER TABLE `users` ADD COLUMN `openid` VARCHAR(64) NULL COMMENT ''微信用户ID'' AFTER `avatar`',
  'SELECT ''openid column already exists, skipping'' AS message');

PREPARE stmt_openid FROM @sql_openid;
EXECUTE stmt_openid;
DEALLOCATE PREPARE stmt_openid;

-- ============================================
-- 2. 检查并添加 douyin_openid 字段（抖音用户ID）
-- ============================================
SET @exist_douyin_openid := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'lunjun_app' 
  AND TABLE_NAME = 'users' 
  AND COLUMN_NAME = 'douyin_openid');

SET @sql_douyin_openid := IF(@exist_douyin_openid = 0, 
  'ALTER TABLE `users` ADD COLUMN `douyin_openid` VARCHAR(64) NULL COMMENT ''抖音用户ID'' AFTER `openid`',
  'SELECT ''douyin_openid column already exists, skipping'' AS message');

PREPARE stmt_douyin_openid FROM @sql_douyin_openid;
EXECUTE stmt_douyin_openid;
DEALLOCATE PREPARE stmt_douyin_openid;

-- ============================================
-- 3. 检查并添加 openid 索引
-- ============================================
SET @exist_openid_idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
  WHERE TABLE_SCHEMA = 'lunjun_app' 
  AND TABLE_NAME = 'users' 
  AND INDEX_NAME = 'idx_openid');

SET @sql_openid_idx := IF(@exist_openid_idx = 0, 
  'ALTER TABLE `users` ADD INDEX `idx_openid` (`openid`)',
  'SELECT ''idx_openid already exists, skipping'' AS message');

PREPARE stmt_openid_idx FROM @sql_openid_idx;
EXECUTE stmt_openid_idx;
DEALLOCATE PREPARE stmt_openid_idx;

-- ============================================
-- 4. 检查并添加 douyin_openid 索引
-- ============================================
SET @exist_douyin_openid_idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
  WHERE TABLE_SCHEMA = 'lunjun_app' 
  AND TABLE_NAME = 'users' 
  AND INDEX_NAME = 'idx_douyin_openid');

SET @sql_douyin_openid_idx := IF(@exist_douyin_openid_idx = 0, 
  'ALTER TABLE `users` ADD INDEX `idx_douyin_openid` (`douyin_openid`)',
  'SELECT ''idx_douyin_openid already exists, skipping'' AS message');

PREPARE stmt_douyin_openid_idx FROM @sql_douyin_openid_idx;
EXECUTE stmt_douyin_openid_idx;
DEALLOCATE PREPARE stmt_douyin_openid_idx;

-- ============================================
-- 5. 验证结果
-- ============================================
SELECT 
  'Database migration completed!' AS status,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
   WHERE TABLE_SCHEMA = 'lunjun_app' 
   AND TABLE_NAME = 'users' 
   AND COLUMN_NAME = 'openid') AS has_openid,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
   WHERE TABLE_SCHEMA = 'lunjun_app' 
   AND TABLE_NAME = 'users' 
   AND COLUMN_NAME = 'douyin_openid') AS has_douyin_openid,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
   WHERE TABLE_SCHEMA = 'lunjun_app' 
   AND TABLE_NAME = 'users' 
   AND INDEX_NAME = 'idx_openid') AS has_openid_idx,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
   WHERE TABLE_SCHEMA = 'lunjun_app' 
   AND TABLE_NAME = 'users' 
   AND INDEX_NAME = 'idx_douyin_openid') AS has_douyin_openid_idx;

