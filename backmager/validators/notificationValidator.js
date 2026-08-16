const { body, query } = require('express-validator');

const notificationListRules = [
  query('userId').optional().isInt({ min: 1 }).withMessage('userId 必须是正整数'),
  query('page').optional().isInt({ min: 1 }).withMessage('page 必须大于 0')
];

const notificationCreateRules = [
  body('userId').isInt({ min: 1 }).withMessage('userId 必须是正整数'),
  body('category').isString().isLength({ min: 1, max: 50 }).withMessage('category 无效'),
  body('title').isString().isLength({ min: 1, max: 255 }).withMessage('title 无效'),
  body('content').isString().isLength({ min: 1 }).withMessage('content 不能为空')
];

module.exports = {
  notificationListRules,
  notificationCreateRules
};

