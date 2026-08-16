const express = require('express');
const { body, query: queryValidator, validationResult } = require('express-validator');
const { query, transaction } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// 所有路由都需要认证
router.use(authenticateToken);

// 获取文档列表
router.get('/', [
  queryValidator('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
  queryValidator('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  queryValidator('type').optional().isIn(['学术论文', '开题报告', '任务书', '文献综述', '答辩稿', '中期检查表', '答辩PPT', 'AI降重']).withMessage('文档类型不正确'),
  queryValidator('keyword').optional().isLength({ max: 100 }).withMessage('搜索关键词不能超过100个字符')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: '参数验证失败',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { page = 1, limit = 20, type, keyword } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE user_id = ? AND is_deleted = 0';
    let queryParams = [userId];

    if (type) {
      whereClause += ' AND type = ?';
      queryParams.push(type);
    }

    if (keyword) {
      whereClause += ' AND (title LIKE ? OR content LIKE ?)';
      const keywordPattern = `%${keyword}%`;
      queryParams.push(keywordPattern, keywordPattern);
    }

    // 获取总数
    const [countResult] = await query(
      `SELECT COUNT(*) as total FROM documents ${whereClause}`,
      queryParams
    );

    // 获取文档列表（包含content字段用于预览）
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);
    
    const documents = await query(
      `SELECT id, title, content, type, field, word_count, credits_cost, rewrite_docx_path, created_at, updated_at
       FROM documents ${whereClause}
       ORDER BY created_at DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      queryParams
    );

    // 计算总字数
    const [totalWordsResult] = await query(
      `SELECT SUM(word_count) as total_words FROM documents ${whereClause}`,
      queryParams
    );

    res.json({
      code: 'SUCCESS',
      data: {
        documents,
        totalWords: totalWordsResult.total_words || 0,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult.total,
          pages: Math.ceil(countResult.total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('获取文档列表失败:', error.message);
    res.status(500).json({
      error: '获取文档列表失败',
      code: 'GET_DOCUMENTS_ERROR'
    });
  }
});

// 获取文档详情
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const documentId = req.params.id;

    const documents = await query(
      `SELECT id, title, content, type, field, word_count, credits_cost, rewrite_docx_path, created_at, updated_at
       FROM documents 
       WHERE id = ? AND user_id = ? AND is_deleted = 0`,
      [documentId, userId]
    );

    if (documents.length === 0) {
      return res.status(404).json({
        error: '文档不存在',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    res.json({
      code: 'SUCCESS',
      data: documents[0]
    });
  } catch (error) {
    logger.error('获取文档详情失败:', error.message);
    res.status(500).json({
      error: '获取文档详情失败',
      code: 'GET_DOCUMENT_ERROR'
    });
  }
});

// 创建文档
router.post('/', [
  body('title').notEmpty().isLength({ max: 255 }).withMessage('文档标题不能为空且不能超过255个字符'),
  body('content').notEmpty().withMessage('文档内容不能为空'),
  body('type').isIn(['学术论文', '开题报告', '任务书', '文献综述', '答辩稿', '中期检查表', '答辩PPT', 'AI降重']).withMessage('文档类型不正确'),
  body('field').optional().isLength({ max: 50 }).withMessage('学科领域不能超过50个字符'),
  body('creditsCost').optional().isInt({ min: 0 }).withMessage('消耗积分必须是非负整数')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: '参数验证失败',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { title, content, type, field, creditsCost = 0 } = req.body;

    const wordCount = content.length;

    await query(
      `INSERT INTO documents (user_id, title, content, type, field, word_count, credits_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, title, content, type, field, wordCount, creditsCost]
    );

    res.json({
      message: '文档创建成功',
      code: 'SUCCESS'
    });
  } catch (error) {
    logger.error('创建文档失败:', error.message);
    res.status(500).json({
      error: '创建文档失败',
      code: 'CREATE_DOCUMENT_ERROR'
    });
  }
});

// 更新文档
router.put('/:id', [
  body('title').optional().isLength({ max: 255 }).withMessage('文档标题不能超过255个字符'),
  body('content').optional().isLength({ min: 1 }).withMessage('文档内容不能为空'),
  body('type').optional().isIn(['学术论文', '开题报告', '任务书', '文献综述', '答辩稿', '中期检查表', '答辩PPT', 'AI降重']).withMessage('文档类型不正确'),
  body('field').optional().isLength({ max: 50 }).withMessage('学科领域不能超过50个字符')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: '参数验证失败',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const documentId = req.params.id;
    const { title, content, type, field } = req.body;

    // 检查文档是否存在
    const existingDocs = await query(
      'SELECT id FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0',
      [documentId, userId]
    );

    if (existingDocs.length === 0) {
      return res.status(404).json({
        error: '文档不存在',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    const updateFields = [];
    const updateValues = [];

    if (title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(title);
    }

    if (content !== undefined) {
      updateFields.push('content = ?');
      updateValues.push(content);
      updateFields.push('word_count = ?');
      updateValues.push(content.length);
    }

    if (type !== undefined) {
      updateFields.push('type = ?');
      updateValues.push(type);
    }

    if (field !== undefined) {
      updateFields.push('field = ?');
      updateValues.push(field);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: '没有需要更新的字段',
        code: 'NO_UPDATE_FIELDS'
      });
    }

    updateValues.push(documentId);

    await query(
      `UPDATE documents SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      updateValues
    );

    res.json({
      message: '文档更新成功',
      code: 'SUCCESS'
    });
  } catch (error) {
    logger.error('更新文档失败:', error.message);
    res.status(500).json({
      error: '更新文档失败',
      code: 'UPDATE_DOCUMENT_ERROR'
    });
  }
});

// 删除文档（软删除）
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const documentId = req.params.id;

    // 检查文档是否存在
    const existingDocs = await query(
      'SELECT id FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0',
      [documentId, userId]
    );

    if (existingDocs.length === 0) {
      return res.status(404).json({
        error: '文档不存在',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    await query(
      'UPDATE documents SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [documentId]
    );

    res.json({
      message: '文档删除成功',
      code: 'SUCCESS'
    });
  } catch (error) {
    logger.error('删除文档失败:', error.message);
    res.status(500).json({
      error: '删除文档失败',
      code: 'DELETE_DOCUMENT_ERROR'
    });
  }
});

// 获取文档统计
router.get('/stats/overview', async (req, res) => {
  try {
    const userId = req.user.id;

    // 按类型统计文档数量
    const typeStats = await query(
      `SELECT type, COUNT(*) as count, SUM(word_count) as total_words
       FROM documents 
       WHERE user_id = ? AND is_deleted = 0 
       GROUP BY type`,
      [userId]
    );

    // 总体统计
    const [overallStats] = await query(
      `SELECT 
         COUNT(*) as total_docs,
         SUM(word_count) as total_words,
         AVG(word_count) as avg_words,
         MAX(created_at) as last_created
       FROM documents 
       WHERE user_id = ? AND is_deleted = 0`,
      [userId]
    );

    // 最近创建的文档
    const recentDocs = await query(
      `SELECT id, title, type, created_at
       FROM documents 
       WHERE user_id = ? AND is_deleted = 0 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [userId]
    );

    res.json({
      code: 'SUCCESS',
      data: {
        typeStats,
        overallStats,
        recentDocs
      }
    });
  } catch (error) {
    logger.error('获取文档统计失败:', error.message);
    res.status(500).json({
      error: '获取文档统计失败',
      code: 'GET_DOCUMENT_STATS_ERROR'
    });
  }
});

module.exports = router;
