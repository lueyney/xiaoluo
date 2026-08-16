const createError = require('http-errors');
const orderRepository = require('../repositories/orderRepository');
const { parsePagination, buildMeta } = require('../utils/pagination');

async function getOrders (query) {
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
    orderRepository.countOrders(filters),
    orderRepository.listOrders(filters)
  ]);

  return {
    list,
    pagination: buildMeta({ page, pageSize }, total)
  };
}

async function getOrderDetail (id) {
  const order = await orderRepository.getOrderById(id);
  if (!order) {
    throw createError(404, '订单不存在', { code: 'ORDER_NOT_FOUND' });
  }
  const timeline = await orderRepository.getOrderTimeline(id);
  return { order, timeline };
}

module.exports = {
  getOrders,
  getOrderDetail
};

