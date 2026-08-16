const notificationService = require('../services/notificationService');
const response = require('../utils/response');

async function list (req, res, next) {
  try {
    const result = await notificationService.getNotifications(req.query);
    response.success(res, result.list, result.pagination);
  } catch (error) {
    next(error);
  }
}

async function create (req, res, next) {
  try {
    await notificationService.sendNotification(req.body);
    response.success(res, true);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  create
};

