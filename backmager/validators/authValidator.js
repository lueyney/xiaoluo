const { body } = require('express-validator');

const loginRules = [
  body('username').trim().notEmpty().withMessage('用户名不能为空'),
  body('password').notEmpty().withMessage('密码不能为空')
];

module.exports = {
  loginRules
};

