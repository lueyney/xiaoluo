const dashboardService = require('../services/dashboardService');
const response = require('../utils/response');

async function overview (req, res, next) {
  try {
    const data = await dashboardService.getOverview();
    response.success(res, data);
  } catch (error) {
    next(error);
  }
}

async function daily (req, res, next) {
  try {
    const days = req.query.days ? Number(req.query.days) : 7;
    const data = await dashboardService.getDailySummary(days);
    response.success(res, data);
  } catch (error) {
    next(error);
  }
}

async function charts (req, res, next) {
  try {
    const days = req.query.days ? Number(req.query.days) : 7;
    const data = await dashboardService.getCharts(days);
    response.success(res, data);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  overview,
  daily,
  charts
};
