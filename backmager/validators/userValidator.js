const { body, param, query } = require('express-validator');

const userListRules = [
  query('status').optional().isInt({ min: 0, max: 1 }).withMessage('status 必须是 0 或 1'),
  query('page').optional().isInt({ min: 1 }).withMessage('page 必须大于 0'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('pageSize 范围 1-100')
];

const userIdParamRule = [
  param('id').isInt({ min: 1 }).withMessage('用户ID必须是正整数')
];

const createUserRules = [
  body('phone').isString().notEmpty().withMessage('phone 必填').isLength({ min: 11, max: 11 }).withMessage('phone 必须是 11 位手机号'),
  body('nickname').optional().isString().isLength({ max: 50 }).withMessage('nickname 长度不能超过 50 字符'),
  body('avatar').optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage('avatar 长度不能超过 255 字符'),
  body('email').optional({ nullable: true }).isEmail().withMessage('email 格式错误'),
  body('status').optional().isInt({ min: 0, max: 1 }).withMessage('status 必须是 0 或 1'),
  body('initialCredits').optional().isInt({ min: 0 }).withMessage('initialCredits 必须是大于等于 0 的整数')
];

const updateUserRules = [
  ...userIdParamRule,
  body('phone').optional().isString().isLength({ min: 11, max: 11 }).withMessage('phone 必须是 11 位手机号'),
  body('nickname').optional().isString().isLength({ max: 50 }).withMessage('nickname 长度不能超过 50 字符'),
  body('avatar').optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage('avatar 长度不能超过 255 字符'),
  body('email').optional({ nullable: true }).isEmail().withMessage('email 格式错误'),
  body('status').optional().isInt({ min: 0, max: 1 }).withMessage('status 必须是 0 或 1')
];

const updateStatusRules = [
  ...userIdParamRule,
  body('status').isInt({ min: 0, max: 1 }).withMessage('status 必须是 0 或 1')
];

const adjustCreditsRules = [
  ...userIdParamRule,
  body('amount').isInt().withMessage('amount 必须为整数').custom((value) => {
    if (Number(value) === 0) {
      throw new Error('amount 不能为 0');
    }
    return true;
  }),
  body('reason').optional().isString().isLength({ max: 255 }).withMessage('reason 长度不能超过 255 字符')
];

const creditTransactionsRules = [
  ...userIdParamRule,
  query('page').optional().isInt({ min: 1 }).withMessage('page 必须大于 0'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('pageSize 范围 1-100')
];

module.exports = {
  userListRules,
  userIdParamRule,
  createUserRules,
  updateUserRules,
  updateStatusRules,
  adjustCreditsRules,
  creditTransactionsRules
};
