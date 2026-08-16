const notificationRepository = require('../repositories/notificationRepository');
const { parsePagination, buildMeta } = require('../utils/pagination');

async function getNotifications (query) {
  const { page, pageSize, offset } = parsePagination(query);
  const filters = {
    userId: query.userId ? Number(query.userId) : undefined,
    category: query.category,
    offset,
    limit: pageSize
  };

  const [total, list] = await Promise.all([
    notificationRepository.countNotifications(filters),
    notificationRepository.listNotifications(filters)
  ]);
  return {
    list,
    pagination: buildMeta({ page, pageSize }, total)
  };
}

async function sendNotification (payload) {
  await notificationRepository.createNotification(payload);
}

module.exports = {
  getNotifications,
  sendNotification
};

