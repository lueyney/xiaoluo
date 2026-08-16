const paymentService = require('../services/paymentService');
const response = require('../utils/response');

async function list (req, res, next) {
  try {
    const result = await paymentService.getPaymentOrders(req.query);
    response.success(res, result.list, result.pagination);
  } catch (error) {
    next(error);
  }
}

async function detail (req, res, next) {
  try {
    const data = await paymentService.getPaymentByOutTradeNo(req.params.outTradeNo);
    response.success(res, data);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  detail
};

