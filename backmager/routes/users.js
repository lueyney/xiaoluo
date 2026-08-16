const express = require('express');
const userController = require('../controllers/userController');
const validate = require('../middleware/validate');
const requireAdmin = require('../middleware/auth');
const {
  userListRules,
  userIdParamRule,
  createUserRules,
  updateUserRules,
  updateStatusRules,
  adjustCreditsRules,
  creditTransactionsRules
} = require('../validators/userValidator');

const router = express.Router();

router.get('/', requireAdmin(), validate(userListRules), userController.list);
router.post('/', requireAdmin(['super_admin', 'admin']), validate(createUserRules), userController.create);
router.get('/:id/credits/transactions', requireAdmin(), validate(creditTransactionsRules), userController.creditTransactions);
router.post('/:id/credits/adjust', requireAdmin(['super_admin', 'admin']), validate(adjustCreditsRules), userController.adjustCredits);
router.get('/:id', requireAdmin(), validate(userIdParamRule), userController.detail);
router.put('/:id', requireAdmin(['super_admin', 'admin']), validate(updateUserRules), userController.update);
router.patch('/:id/status', requireAdmin(), validate(updateStatusRules), userController.updateStatus);
router.delete('/:id', requireAdmin(['super_admin']), validate(userIdParamRule), userController.remove);

module.exports = router;
