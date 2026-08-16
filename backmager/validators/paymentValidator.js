const { param, query } = require('express-validator');

const paymentListRules = [
  query('status').optional().isString().isLength({ max: 20 }).withMessage('status 无效'),
  query('userId').optional().isInt({ min: 1 }).withMessage('userId 必须是正整数'),
  query('page').optional().isInt({ min: 1 }).withMessage('page 必须大于 0')
];

const outTradeNoParamRule = [
  param('outTradeNo').isString().isLength({ min: 10, max: 64 }).withMessage('outTradeNo 无效')
];

module.exports = {
  paymentListRules,
  outTradeNoParamRule
};

