/**
 * 文档导出路由
 * 将生成的文档转换为Word格式供用户下载和分享
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { generateAndSaveWord } = require('../utils/word-generator');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

// 生成接口需要认证，下载接口不需要（文件名随机，无法猜测）
router.use('/generate-word', authenticateToken);
router.use('/generate-word', (req, res, next) => next()); // passthrough

/**
 * 生成Word文档（使用 docx 库生成真正的 .docx 文件）
 * 支持 iOS/Android/PC 全平台，完美支持样式、页眉页脚
 */
router.post('/generate-word', [
  body('documentId').isInt().withMessage('文档ID必须是整数')
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
    const { documentId } = req.body;

    // 查询文档
    const documents = await query(
      'SELECT * FROM documents WHERE id = ? AND user_id = ?',
      [documentId, userId]
    );

    if (documents.length === 0) {
      return res.status(404).json({
        error: '文档不存在',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    const document = documents[0];
    
    // 生成并保存Word文档
    const relativeFilePath = await generateAndSaveWord(document);
    const absoluteFilePath = path.join(__dirname, '..', relativeFilePath);
    const fileName = path.basename(relativeFilePath);
    const downloadUrl = `/api/document-export/download/${fileName}`;

    let fileSize = 0;
    try {
      const stats = await fs.stat(absoluteFilePath);
      fileSize = stats.size;
    } catch (statError) {
      logger.warn(`无法读取文件大小: ${fileName}`, statError.message);
    }
    
    logger.info(`文档导出成功: ${document.title}, 文件: ${fileName}`);
    
    res.json({
      code: 'SUCCESS',
      message: '文档导出成功',
      data: {
        fileName,
        downloadUrl,
        fileSize
      }
    });

  } catch (error) {
    logger.error('生成Word文档失败:', error);
    res.status(500).json({
      error: '生成文档失败',
      code: 'GENERATE_WORD_ERROR',
      message: error.message
    });
  }
});

/**
 * 下载文档库中的 AI 降重稿。
 * 该文件是上传 DOCX 原位替换文字后的副本，不能走通用的纯文本 Word 重建逻辑。
 */
router.get('/rewrite-docx/:documentId', authenticateToken, async (req, res) => {
  try {
    const documentId = Number(req.params.documentId);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return res.status(400).json({ error: '文档ID必须是整数', code: 'VALIDATION_ERROR' });
    }
    const rows = await query(
      'SELECT id, title, type, rewrite_docx_path FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0',
      [documentId, req.user.id]
    );
    const document = rows[0];
    if (!document) return res.status(404).json({ error: '文档不存在', code: 'DOCUMENT_NOT_FOUND' });
    if (document.type !== 'AI降重' || !document.rewrite_docx_path) {
      return res.status(409).json({ error: '该文档没有可下载的原格式降重文件', code: 'REWRITE_FILE_NOT_FOUND' });
    }

    const backendRoot = path.resolve(__dirname, '..');
    const filePath = path.resolve(backendRoot, document.rewrite_docx_path);
    const libraryRoot = path.resolve(backendRoot, 'data', 'document-library');
    if (!filePath.toLowerCase().startsWith(`${libraryRoot.toLowerCase()}${path.sep}`)) {
      return res.status(400).json({ error: '非法文件路径', code: 'INVALID_FILENAME' });
    }
    const buffer = await fs.readFile(filePath);
    const stem = String(document.title || '文档').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120) || '文档';
    const fileName = `${/_降重$/u.test(stem) ? stem : `${stem}_降重`}.docx`;
    const ascii = fileName.replace(/[^\x20-\x7e]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: '降重文件不存在', code: 'REWRITE_FILE_NOT_FOUND' });
    logger.error('下载原格式降重文档失败:', error);
    res.status(500).json({ error: '下载失败', code: 'DOWNLOAD_ERROR' });
  }
});

/**
 * 下载导出的文档
 */
router.get('/download/:fileName', (req, res, next) => {
  // 明确设置 CORS 头，允许前端 fetch 带 Authorization 跨域下载
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type');
  next();
}, async (req, res) => {
  try {
    const { fileName } = req.params;
    
    // 安全检查：防止路径穿越
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return res.status(400).json({
        error: '非法文件名',
        code: 'INVALID_FILENAME'
      });
    }
    
    const filePath = path.join(__dirname, '../exports', fileName);
    
    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        error: '文件不存在',
        code: 'FILE_NOT_FOUND'
      });
    }
    
    // 获取文件信息
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    
    // 验证文件大小（docx 文件至少应该有几千字节）
    if (fileSize < 1000) {
      logger.error(`文件大小异常: ${fileName}, 大小: ${fileSize} bytes`);
      return res.status(500).json({
        error: '生成的文件格式异常',
        code: 'INVALID_FILE_SIZE'
      });
    }
    
    // 验证文件头是否为有效的 ZIP 格式（docx 本质上是 ZIP 文件）
    const fullBuffer = await fs.readFile(filePath);
    const zipSignature = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // ZIP 文件头: PK..
    if (fullBuffer.length < 4 || !fullBuffer.slice(0, 4).equals(zipSignature)) {
      logger.error(`文件格式异常: ${fileName}, 文件头: ${fullBuffer.slice(0, 4).toString('hex')}`);
      return res.status(500).json({
        error: '生成的文件格式异常，不是有效的 docx 文件',
        code: 'INVALID_FILE_FORMAT'
      });
    }
    
    // ASCII-only 降级文件名（filename= 不允许非 ASCII 字符）
    const safeFileName = fileName
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .substring(0, 200);
    
    const asciiFileName = safeFileName
      .replace(/[^\x20-\x7E]/g, '_')
      .substring(0, 100);
    
    // 使用 RFC 5987 标准格式编码完整文件名（支持中文）
    const encodedFileName = encodeURIComponent(safeFileName);
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Length', fullBuffer.length);
    res.setHeader('Content-Disposition',
      `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`
    );
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    logger.info(`发送文件: ${fileName}, 大小: ${fullBuffer.length} bytes, 格式验证通过`);
    
    // 直接发送已读入的 buffer，避免 sendFile 路径问题
    res.send(fullBuffer);
    
    // 发送完成后异步删除临时文件
    setTimeout(async () => {
      try {
        await fs.unlink(filePath);
        logger.info(`临时文件已删除: ${fileName}`);
      } catch (delErr) {
        logger.warn(`删除临时文件失败: ${fileName}`, delErr.message);
      }
    }, 5000);

  } catch (error) {
    logger.error('下载文档失败:', error);
    res.status(500).json({
      error: '下载失败',
      code: 'DOWNLOAD_ERROR'
    });
  }
});

module.exports = router;
