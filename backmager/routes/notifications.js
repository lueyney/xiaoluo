const express = require('express');
const notificationController = require('../controllers/notificationController');
const validate = require('../middleware/validate');
const requireAdmin = require('../middleware/auth');
const { notificationListRules, notificationCreateRules } = require('../validators/notificationValidator');

const router = express.Router();

router.get('/', requireAdmin(), validate(notificationListRules), notificationController.list);
router.post('/', requireAdmin(), validate(notificationCreateRules), notificationController.create);

module.exports = router;

