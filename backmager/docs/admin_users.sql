CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `username` varchar(50) NOT NULL COMMENT '后台登录账号',
  `display_name` varchar(50) NOT NULL COMMENT '显示昵称',
  `password_hash` varchar(255) NOT NULL COMMENT 'BCrypt 哈希',
  `role` varchar(20) NOT NULL DEFAULT 'admin' COMMENT '角色：admin/super_admin/ops',
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '状态：1启用 0禁用',
  `last_login_at` datetime DEFAULT NULL COMMENT '最近登录时间',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='后台管理员表';

INSERT INTO `admin_users` (`username`, `display_name`, `password_hash`, `role`)
VALUES ('admin', '超级管理员', '$2a$10$0v0.GzkRgZNpmjDoE7YOhOvP84RyN5.FKPh0Ehn8WM8l9rBcVqKuq', 'super_admin');

-- 默认密码：Admin@123 （请部署后立即修改）

