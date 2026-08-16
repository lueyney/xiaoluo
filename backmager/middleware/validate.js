const { validationResult } = require('express-validator');
const createError = require('http-errors');

module.exports = function validate (rules = []) {
  return async (req, res, next) => {
    await Promise.all(rules.map(rule => rule.run(req)));
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    const details = errors.array().map((item) => ({
      field: item.param,
      message: item.msg
    }));
    next(createError(422, '参数验证失败', { code: 'VALIDATION_ERROR', details }));
  };
};

