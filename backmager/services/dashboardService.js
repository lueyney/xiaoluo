const statsRepository = require('../repositories/statsRepository');

async function getOverview () {
  return statsRepository.getOverview();
}

async function getDailySummary (days) {
  return statsRepository.getDailySummary(days ? Number(days) : 7);
}

async function getCharts (days) {
  return statsRepository.getCharts(days ? Number(days) : 7);
}

module.exports = {
  getOverview,
  getDailySummary,
  getCharts
};
