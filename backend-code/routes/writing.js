/**
 * DeepSeek 学术写作路由。
 * 业务层只负责认证、订单、积分和保存；长文由 LangGraph.js 编排。
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { DOCUMENT_CREDITS, getSupportedDocTypes, normalizeDocType } = require('../services/writing-workflow/doc-types');
const { generateDocument, getWritingConfig } = require('../services/writing-workflow');
const { createTraceId, safeErrorMessage } = require('../services/writing-workflow/utils');

const router = express.Router();
const SUPPORTED_DOC_TYPES = getSupportedDocTypes({ includeAliases: true });

router.use(authenticateToken);

function calculateCredits(contentTypes) {
  return contentTypes.reduce((total, type) => {
    const normalized = normalizeDocType(type);
    return total + DOCUMENT_CREDITS[normalized];
  }, 0);
}

router.post('/generate', [
  body('topic').trim().notEmpty().withMessage('论文题目不能为空').isLength({ max: 300 }).withMessage('论文题目不能超过300个字符'),
  body('field').optional().trim().isLength({ max: 100 }).withMessage('学科不能超过100个字符'),
  body('contentTypes').optional().isArray({ min: 1, max: 6 }).withMessage('至少选择一种、最多选择六种文档类型'),
  body('contentTypes.*').optional().isIn(SUPPORTED_DOC_TYPES).withMessage('包含不支持的文档类型'),
  body('requirements').optional().trim().isLength({ max: 2000 }).withMessage('补充要求不能超过2000个字符')
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
    const topic = req.body.topic.trim();
    const field = String(req.body.field || '教育学').trim();
    const requirements = String(req.body.requirements || '').trim();
    const contentTypes = Array.from(new Set(
      (req.body.contentTypes || ['学术范文']).map(normalizeDocType)
    ));
    const creditsCost = calculateCredits(contentTypes);
    getWritingConfig();
    logger.info(`[writing] 接收生成请求 user=${userId} types=${contentTypes.join(',')} engine=deepseek`);

    const creditRows = await query('SELECT credits FROM user_credits WHERE user_id = ?', [userId]);
    const currentCredits = Number(creditRows[0] && creditRows[0].credits) || 0;
    if (currentCredits < creditsCost) {
      return res.status(400).json({
        error: '积分不足',
        code: 'INSUFFICIENT_CREDITS',
        data: { required: creditsCost, available: currentCredits }
      });
    }

    const orderNo = `ORD${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const orderResult = await query(
      `INSERT INTO orders (order_no, user_id, type, amount, credits, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orderNo, userId, `${contentTypes.join('、')}-${topic.substring(0, 15)}`, 0, creditsCost, 'processing']
    );
    const orderId = orderResult.insertId;

    res.json({
      message: '正在生成论文，请稍候...',
      code: 'PROCESSING',
      data: {
        orderId,
        topic,
        creditsCost,
        estimatedTime: 120
      }
    });

    setImmediate(async () => {
      try {
        const generatedDocuments = {};
        const failures = {};

        for (const docType of contentTypes) {
          const traceId = createTraceId();
          try {
            const result = await generateDocument({ topic, field, docType, requirements, traceId });
            generatedDocuments[docType] = result;
            logger.info(`[writing:${result.traceId}] ${docType} 生成成功 engine=${result.engine} words=${result.wordCount}`);
          } catch (error) {
            failures[docType] = safeErrorMessage(error);
            logger.error(`[writing:${traceId}] ${docType} 生成失败: ${failures[docType]}`);
          }
        }

        const successTypes = Object.keys(generatedDocuments);
        if (!successTypes.length) throw new Error('所有文档类型生成失败');

        const failedTypes = contentTypes.filter((type) => !successTypes.includes(type));
        const actualCreditsCost = calculateCredits(successTypes);
        const isPartialSuccess = failedTypes.length > 0;

        await transaction(async (connection) => {
          const [lockedCredits] = await connection.execute(
            'SELECT credits FROM user_credits WHERE user_id = ? FOR UPDATE',
            [userId]
          );
          const availableCredits = Number(lockedCredits[0] && lockedCredits[0].credits) || 0;
          if (availableCredits < actualCreditsCost) {
            throw new Error(`积分余额已变化，实际需要 ${actualCreditsCost}，当前仅剩 ${availableCredits}`);
          }

          await connection.execute(
            'UPDATE user_credits SET credits = credits - ?, total_consumed = total_consumed + ? WHERE user_id = ?',
            [actualCreditsCost, actualCreditsCost, userId]
          );
          const balanceAfter = availableCredits - actualCreditsCost;

          await connection.execute(
            'INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description) VALUES (?, ?, ?, ?, ?, ?)',
            [
              userId,
              'consume',
              actualCreditsCost,
              balanceAfter,
              'ai_writing',
              isPartialSuccess
                ? `AI创作：${topic}（成功${successTypes.length}个，失败${failedTypes.length}个）`
                : `AI创作：${topic}`
            ]
          );

          for (const docType of successTypes) {
            const result = generatedDocuments[docType];
            const title = successTypes.length > 1 ? `${topic} - ${docType}` : topic;
            await connection.execute(
              `INSERT INTO documents
               (user_id, title, content, type, field, word_count, credits_cost, order_id, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                userId,
                title,
                result.content,
                docType,
                field,
                result.wordCount,
                DOCUMENT_CREDITS[docType],
                orderId,
                'completed'
              ]
            );
          }

          const totalWords = successTypes.reduce((sum, type) => sum + generatedDocuments[type].wordCount, 0);
          await connection.execute(
            'INSERT INTO notifications (user_id, category, title, content) VALUES (?, ?, ?, ?)',
            [
              userId,
              'AI创作',
              isPartialSuccess ? '论文部分生成完成' : '论文生成完成',
              isPartialSuccess
                ? `《${topic}》已生成${successTypes.length}个文档，${failedTypes.length}个失败`
                : `《${topic}》已生成${successTypes.length}个文档，共${totalWords}字`
            ]
          );

          const failureReason = isPartialSuccess
            ? failedTypes.map((type) => `${type}: ${failures[type]}`).join('；').slice(0, 500)
            : null;
          await connection.execute(
            `UPDATE orders
             SET status = ?, success_count = ?, fail_count = ?, failure_reason = ?,
                 credits_before = ?, credits_after = ?, finished_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
              isPartialSuccess ? 'partial' : 'completed',
              successTypes.length,
              failedTypes.length,
              failureReason,
              availableCredits,
              balanceAfter,
              orderId
            ]
          );
        });

        logger.info(`[writing] 订单完成 order=${orderId} success=${successTypes.length}/${contentTypes.length}`);
      } catch (error) {
        const failureReason = safeErrorMessage(error);
        logger.error(`[writing] 订单失败 order=${orderId}: ${failureReason}`);
        try {
          await query(
            `UPDATE orders
             SET status = 'failed', failure_reason = ?, fail_count = ?, finished_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [failureReason.slice(0, 500), contentTypes.length, orderId]
          );
        } catch (updateError) {
          logger.error(`[writing] 更新失败订单异常 order=${orderId}: ${safeErrorMessage(updateError)}`);
        }
      }
    });
  } catch (error) {
    logger.error(`学术写作接口错误: ${safeErrorMessage(error)}`);
    return res.status(500).json({
      error: 'AI创作失败',
      code: 'AI_GENERATE_ERROR'
    });
  }
});

module.exports = router;
