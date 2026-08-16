const express = require('express');
const paymentController = require('../controllers/paymentController');
const validate = require('../middleware/validate');
const requireAdmin = require('../middleware/auth');
const { paymentListRules, outTradeNoParamRule } = require('../validators/paymentValidator');

const router = express.Router();

router.get('/', requireAdmin(), validate(paymentListRules), paymentController.list);
router.get('/:outTradeNo', requireAdmin(), validate(outTradeNoParamRule), paymentController.detail);

module.exports = router;

