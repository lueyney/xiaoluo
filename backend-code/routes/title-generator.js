const express = require('express');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { getWritingConfig } = require('../services/writing-workflow');
const DeepSeekProvider = require('../services/writing-workflow/providers/deepseek');
const { buildTitleMessages } = require('../services/writing-workflow/prompts');
const { cleanGeneratedTitle, createTraceId, safeErrorMessage } = require('../services/writing-workflow/utils');

const router = express.Router();
const TITLE_CACHE = new Map();
const TITLE_CACHE_TTL = 5 * 60 * 1000;

router.post('/generate', [
  body('field').trim().notEmpty().withMessage('学科领域不能为空').isLength({ max: 100 }).withMessage('学科领域不能超过100个字符'),
  body('excludeTitles').optional().isArray({ max: 20 }).withMessage('排除题目格式不正确')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: '参数验证失败', code: 'VALIDATION_ERROR', details: errors.array() });
    }

    const field = req.body.field.trim();
    const excludeTitles = (req.body.excludeTitles || []).map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20);
    const cacheKey = `${field}::${excludeTitles.slice().sort().join('|')}`;
    const cached = TITLE_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < TITLE_CACHE_TTL) {
      return res.json({ code: 'SUCCESS', data: cached.payload });
    }

    const config = getWritingConfig();
    const traceId = createTraceId();
    const provider = new DeepSeekProvider(config.deepseek, { logger });
    const result = await provider.generateTitle({
      messages: buildTitleMessages({ field, excludeTitles }),
      traceId
    });
    const title = cleanGeneratedTitle(result.content);
    if (title.length < 5) throw new Error('DeepSeek 未返回有效题目');

    const payload = { title, field };
    TITLE_CACHE.set(cacheKey, { payload, timestamp: Date.now() });
    return res.json({ code: 'SUCCESS', data: payload });
  } catch (error) {
    logger.error(`[AI取名器] ${safeErrorMessage(error)}`);
    return res.status(500).json({ error: '生成题目失败', code: 'TITLE_GENERATE_ERROR' });
  }
});

module.exports = router;
