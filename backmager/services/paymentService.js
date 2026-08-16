const createError = require('http-errors');
const paymentRepository = require('../repositories/paymentRepository');
const { parsePagination, buildMeta } = require('../utils/pagination');

async function getPaymentOrders (query) {
  const { page, pageSize, offset } = parsePagination(query);
  const filters = {
    status: query.status,
    startDate: query.startDate,
    endDate: query.endDate,
    userId: query.userId ? Number(query.userId) : undefined,
    offset,
    limit: pageSize
  };

  const [total, list] = await Promise.all([
    paymentRepository.countPaymentOrders(filters),
    paymentRepository.listPaymentOrders(filters)
  ]);

  return {
    list,
    pagination: buildMeta({ page, pageSize }, total)
  };
}

async function getPaymentByOutTradeNo (outTradeNo) {
  const payment = await paymentRepository.getPaymentByOutTradeNo(outTradeNo);
  if (!payment) {
    throw createError(404, '支付订单不存在', { code: 'PAYMENT_NOT_FOUND' });
  }
  return payment;
}

module.exports = {
  getPaymentOrders,
  getPaymentByOutTradeNo
};

