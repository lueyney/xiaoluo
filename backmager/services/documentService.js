const createError = require('http-errors');
const documentRepository = require('../repositories/documentRepository');
const { parsePagination, buildMeta } = require('../utils/pagination');

async function getDocuments (query) {
  const { page, pageSize, offset } = parsePagination(query);
  const filters = {
    type: query.type,
    keyword: query.keyword,
    startDate: query.startDate,
    endDate: query.endDate,
    offset,
    limit: pageSize
  };

  const [total, list] = await Promise.all([
    documentRepository.countDocuments(filters),
    documentRepository.listDocuments(filters)
  ]);

  return {
    list,
    pagination: buildMeta({ page, pageSize }, total)
  };
}

async function getDocumentDetail (id) {
  const document = await documentRepository.getDocumentById(id);
  if (!document) {
    throw createError(404, '文档不存在', { code: 'DOCUMENT_NOT_FOUND' });
  }
  return document;
}

module.exports = {
  getDocuments,
  getDocumentDetail
};

