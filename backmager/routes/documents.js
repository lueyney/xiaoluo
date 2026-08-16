const express = require('express');
const documentController = require('../controllers/documentController');
const validate = require('../middleware/validate');
const requireAdmin = require('../middleware/auth');
const { documentListRules, documentIdParamRule } = require('../validators/documentValidator');

const router = express.Router();

router.get('/', requireAdmin(), validate(documentListRules), documentController.list);
router.get('/:id', requireAdmin(), validate(documentIdParamRule), documentController.detail);

module.exports = router;

