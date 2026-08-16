const systemService = require('../services/systemService');
const response = require('../utils/response');

function info (req, res) {
  const data = systemService.getEnvironmentInfo();
  response.success(res, data);
}

async function database (req, res, next) {
  try {
    const data = await systemService.getDatabaseControlInfo();
    response.success(res, data);
  } catch (error) {
    next(error);
  }
}

async function admins (req, res, next) {
  try {
    const data = await systemService.listAdmins();
    response.success(res, data);
  } catch (error) {
    next(error);
  }
}

async function createAdmin (req, res, next) {
  try {
    const data = await systemService.createAdmin(req.body);
    response.success(res, data);
  } catch (error) {
    next(error);
  }
}

async function updateAdminStatus (req, res, next) {
  try {
    await systemService.updateAdminStatus(Number(req.params.id), Number(req.body.status));
    response.success(res, true);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  info,
  database,
  admins,
  createAdmin,
  updateAdminStatus
};
