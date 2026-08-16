const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const requireAdmin = require('../middleware/auth');

const router = express.Router();

router.get('/overview', requireAdmin(), dashboardController.overview);
router.get('/daily', requireAdmin(), dashboardController.daily);
router.get('/charts', requireAdmin(), dashboardController.charts);

module.exports = router;
