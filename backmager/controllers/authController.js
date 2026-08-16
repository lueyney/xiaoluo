const authService = require('../services/authService');
const response = require('../utils/response');

async function login (req, res, next) {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    response.success(res, result);
  } catch (error) {
    next(error);
  }
}

function profile (req, res) {
  response.success(res, { admin: req.admin });
}

async function listAdmins (req, res, next) {
  try {
    const admins = await authService.listAdmins();
    response.success(res, admins);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  profile,
  listAdmins
};

