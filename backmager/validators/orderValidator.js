const { param, query } = require('express-validator');

const orderListRules = [
  query('status').optional().isString().isLength({ max: 50 }).withMessage('status 无效'),
  query('userId').optional().isInt({ min: 1 }).withMessage('userId 必须是正整数'),
  query('page').optional().isInt({ min: 1 }).withMessage('page 必须大于 0')
];

const orderIdParamRule = [
  param('id').isInt({ min: 1 }).withMessage('订单ID必须是正整数')
];

module.exports = {
  orderListRules,
  orderIdParamRule
};

