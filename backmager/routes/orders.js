const express = require('express');
const orderController = require('../controllers/orderController');
const validate = require('../middleware/validate');
const requireAdmin = require('../middleware/auth');
const { orderListRules, orderIdParamRule } = require('../validators/orderValidator');

const router = express.Router();

router.get('/', requireAdmin(), validate(orderListRules), orderController.list);
router.get('/:id', requireAdmin(), validate(orderIdParamRule), orderController.detail);

module.exports = router;

