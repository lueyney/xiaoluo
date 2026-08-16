const express = require('express');

const authRoutes = require('./auth');
const dashboardRoutes = require('./dashboard');
const userRoutes = require('./users');
const orderRoutes = require('./orders');
const paymentRoutes = require('./payments');
const documentRoutes = require('./documents');
const notificationRoutes = require('./notifications');
const systemRoutes = require('./system');
const workflowRoutes = require('./workflows');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/documents', documentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/system', systemRoutes);
router.use('/workflows', workflowRoutes);

module.exports = router;

