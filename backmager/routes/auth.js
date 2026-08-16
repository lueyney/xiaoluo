const express = require('express');
const authController = require('../controllers/authController');
const validate = require('../middleware/validate');
const requireAdmin = require('../middleware/auth');
const { loginRules } = require('../validators/authValidator');

const router = express.Router();

router.post('/login', validate(loginRules), authController.login);
router.get('/profile', requireAdmin(), authController.profile);
router.get('/admins', requireAdmin(['super_admin']), authController.listAdmins);

module.exports = router;

