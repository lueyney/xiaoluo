const documentService = require('../services/documentService');
const response = require('../utils/response');

async function list (req, res, next) {
  try {
    const result = await documentService.getDocuments(req.query);
    response.success(res, result.list, result.pagination);
  } catch (error) {
    next(error);
  }
}

async function detail (req, res, next) {
  try {
    const document = await documentService.getDocumentDetail(Number(req.params.id));
    response.success(res, document);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  detail
};

