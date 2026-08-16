function parsePagination (query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize, 10) || 20, 1), 100);
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

function buildMeta ({ page, pageSize }, total) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize)
  };
}

module.exports = {
  parsePagination,
  buildMeta
};

