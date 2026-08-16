const { param, query } = require('express-validator');

const documentListRules = [
  query('type').optional().isString().isLength({ max: 50 }).withMessage('type 无效'),
  query('page').optional().isInt({ min: 1 }).withMessage('page 必须大于 0')
];

const documentIdParamRule = [
  param('id').isInt({ min: 1 }).withMessage('文档ID必须是正整数')
];

module.exports = {
  documentListRules,
  documentIdParamRule
};

