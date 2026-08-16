const orderService = require('../services/orderService');
const response = require('../utils/response');

async function list (req, res, next) {
  try {
    const result = await orderService.getOrders(req.query);
    response.success(res, result.list, result.pagination);
  } catch (error) {
    next(error);
  }
}

async function detail (req, res, next) {
  try {
    const data = await orderService.getOrderDetail(Number(req.params.id));
    response.success(res, data);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  detail
};

