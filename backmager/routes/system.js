const express = require('express');
const requireAdmin = require('../middleware/auth');
const systemController = require('../controllers/systemController');
const validate = require('../middleware/validate');
const { body, param } = require('express-validator');

const router = express.Router();

const adminIdRule = [
  param('id').isInt({ min: 1 }).withMessage('管理员ID必须是正整数')
];

const createAdminRules = [
  body('username').isString().trim().isLength({ min: 3, max: 50 }).withMessage('username 长度应为 3-50'),
  body('displayName').isString().trim().isLength({ min: 2, max: 50 }).withMessage('displayName 长度应为 2-50'),
  body('password').isString().isLength({ min: 8, max: 50 }).withMessage('password 长度应为 8-50'),
  body('role').optional().isIn(['super_admin', 'admin', 'ops']).withMessage('role 不合法')
];

const updateAdminStatusRules = [
  ...adminIdRule,
  body('status').isInt({ min: 0, max: 1 }).withMessage('status 必须是 0 或 1')
];

router.get('/info', requireAdmin(['super_admin', 'admin']), systemController.info);
router.get('/database', requireAdmin(['super_admin', 'admin']), systemController.database);
router.get('/admins', requireAdmin(['super_admin']), systemController.admins);
router.post('/admins', requireAdmin(['super_admin']), validate(createAdminRules), systemController.createAdmin);
router.patch('/admins/:id/status', requireAdmin(['super_admin']), validate(updateAdminStatusRules), systemController.updateAdminStatus);

module.exports = router;
