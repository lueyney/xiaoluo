const userService = require('../services/userService');
const response = require('../utils/response');

async function list (req, res, next) {
  try {
    const result = await userService.getUserList(req.query);
    response.success(res, result.list, result.pagination);
  } catch (error) {
    next(error);
  }
}

async function detail (req, res, next) {
  try {
    const data = await userService.getUserDetail(Number(req.params.id));
    response.success(res, data);
  } catch (error) {
    next(error);
  }
}

async function create (req, res, next) {
  try {
    const data = await userService.createUser(req.body);
    response.success(res, data);
  } catch (error) {
    next(error);
  }
}

async function update (req, res, next) {
  try {
    const data = await userService.updateUser(Number(req.params.id), req.body);
    response.success(res, data);
  } catch (error) {
    next(error);
  }
}

async function remove (req, res, next) {
  try {
    await userService.deleteUser(Number(req.params.id));
    response.success(res, true);
  } catch (error) {
    next(error);
  }
}

async function updateStatus (req, res, next) {
  try {
    await userService.changeUserStatus(Number(req.params.id), Number(req.body.status));
    response.success(res, true);
  } catch (error) {
    next(error);
  }
}

async function adjustCredits (req, res, next) {
  try {
    const result = await userService.adjustUserCredits(Number(req.params.id), {
      amount: req.body.amount,
      reason: req.body.reason,
      operator: req.admin
    });
    response.success(res, result);
  } catch (error) {
    next(error);
  }
}

async function creditTransactions (req, res, next) {
  try {
    const result = await userService.getCreditTransactionsPaginated(Number(req.params.id), req.query);
    response.success(res, result.list, result.pagination);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  detail,
  create,
  update,
  remove,
  updateStatus,
  adjustCredits,
  creditTransactions
};
