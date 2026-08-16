# 数据库迁移指南 - 抖音小程序支持

## 📋 概述

为了支持抖音小程序，需要在 `users` 表中添加两个字段：
- `openid` - 微信用户ID（如果之前没有）
- `douyin_openid` - 抖音用户ID（新增）

## 🔍 检查当前数据库状态

### 方法1：使用 SQL 查询检查

```sql
USE `lunjun_app`;

-- 检查字段是否存在
SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  IS_NULLABLE,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'lunjun_app'
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME IN ('openid', 'douyin_openid');

-- 检查索引是否存在
SELECT 
  INDEX_NAME,
  COLUMN_NAME
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = 'lunjun_app'
  AND TABLE_NAME = 'users'
  AND INDEX_NAME IN ('idx_openid', 'idx_douyin_openid');
```

### 方法2：使用迁移脚本（推荐）

执行 `database/check_and_migrate_douyin.sql`，脚本会自动检查并添加缺失的字段和索引。

## 🚀 迁移步骤

### 情况1：全新数据库（未部署过）

**直接执行 `database_init.sql`**，它已经包含了所有必需字段。

```bash
mysql -u root -p < database_init.sql
```

### 情况2：已有数据库（已部署过）

**执行迁移脚本 `check_and_migrate_douyin.sql`**：

```bash
mysql -u root -p < database/check_and_migrate_douyin.sql
```

或者手动执行：

```sql
-- 1. 添加 openid 字段（如果不存在）
ALTER TABLE `users` 
ADD COLUMN `openid` VARCHAR(64) NULL COMMENT '微信用户ID' 
AFTER `avatar`;

-- 2. 添加 douyin_openid 字段（如果不存在）
ALTER TABLE `users` 
ADD COLUMN `douyin_openid` VARCHAR(64) NULL COMMENT '抖音用户ID' 
AFTER `openid`;

-- 3. 添加索引（如果不存在）
ALTER TABLE `users` ADD INDEX `idx_openid` (`openid`);
ALTER TABLE `users` ADD INDEX `idx_douyin_openid` (`douyin_openid`);
```

## ✅ 验证迁移结果

执行以下 SQL 验证字段和索引是否正确添加：

```sql
USE `lunjun_app`;

-- 查看 users 表结构
DESCRIBE `users`;

-- 或者查看完整表结构
SHOW CREATE TABLE `users`;

-- 验证索引
SHOW INDEX FROM `users` WHERE Key_name IN ('idx_openid', 'idx_douyin_openid');
```

**预期结果：**
- ✅ `openid` 字段存在，类型为 `VARCHAR(64)`，允许 NULL
- ✅ `douyin_openid` 字段存在，类型为 `VARCHAR(64)`，允许 NULL
- ✅ `idx_openid` 索引存在
- ✅ `idx_douyin_openid` 索引存在

## ⚠️ 注意事项

1. **备份数据库**：在执行任何迁移操作前，请先备份数据库！
   ```bash
   mysqldump -u root -p lunjun_app > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **字段位置**：`openid` 和 `douyin_openid` 字段位于 `avatar` 字段之后，`password_hash` 字段之前。

3. **NULL 值**：
   - 两个字段都允许 NULL（因为用户可能只使用微信或只使用抖音）
   - MySQL 的唯一索引允许多个 NULL 值，所以 `phone` 字段的唯一索引不会冲突

4. **索引性能**：
   - 添加索引后，查询 `openid` 和 `douyin_openid` 的性能会提升
   - 如果表中已有大量数据，添加索引可能需要一些时间

## 🔧 回滚方案（如果需要）

如果迁移出现问题，可以回滚：

```sql
USE `lunjun_app`;

-- 删除索引
ALTER TABLE `users` DROP INDEX `idx_douyin_openid`;
ALTER TABLE `users` DROP INDEX `idx_openid`;

-- 删除字段（注意：会丢失数据！）
ALTER TABLE `users` DROP COLUMN `douyin_openid`;
ALTER TABLE `users` DROP COLUMN `openid`;
```

## 📝 迁移检查清单

- [ ] 已备份数据库
- [ ] 已检查当前数据库状态
- [ ] 已执行迁移脚本或手动 SQL
- [ ] 已验证字段和索引是否正确添加
- [ ] 已测试后端接口（登录、支付）是否正常工作

## 🎯 快速部署命令

```bash
# 1. 备份数据库
mysqldump -u root -p lunjun_app > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. 执行迁移脚本（自动检查并添加缺失字段）
mysql -u root -p lunjun_app < database/check_and_migrate_douyin.sql

# 3. 验证结果
mysql -u root -p -e "USE lunjun_app; DESCRIBE users;" | grep -E "openid|douyin"
```

---

**迁移完成后，数据库即可支持抖音小程序功能！** ✅

