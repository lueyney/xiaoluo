const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getWritingConfig } = require('../services/writing-workflow');
const DeepSeekProvider = require('../services/writing-workflow/providers/deepseek');
const { createTraceId, safeErrorMessage } = require('../services/writing-workflow/utils');
const {
  GOAL_PROFILES,
  PLATFORM_PROFILES,
  buildSocialMessages,
  cleanSocialContent,
  getPlatformProfile
} = require('../services/social-prompts');

const router = express.Router();
const LOCAL_SOCIAL_TEST_MODE = process.env.NODE_ENV !== 'production'
  && process.env.LOCAL_SOCIAL_TEST_MODE === 'true';

router.use((req, res, next) => {
  if (LOCAL_SOCIAL_TEST_MODE && req.path === '/generate' && req.method === 'POST') {
    req.user = { id: 0, phone: 'local-test', nickname: '本地测试' };
    return next();
  }
  return authenticateToken(req, res, next);
});

router.post('/generate', [
  body('platform').isIn(Object.keys(PLATFORM_PROFILES)).withMessage('不支持的发布平台'),
  body('goal').isIn(Object.keys(GOAL_PROFILES)).withMessage('不支持的内容目标'),
  body('material').trim().isLength({ min: 6, max: 10000 }).withMessage('素材需为6至10000个字符'),
  body('requirements').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('补充要求不能超过1000个字符')
], async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: '参数验证失败',
      code: 'VALIDATION_ERROR',
      details: errors.array()
    });
  }

  const traceId = createTraceId();
  const { platform, goal } = req.body;
  const material = String(req.body.material || '').trim();
  const requirements = String(req.body.requirements || '').trim();

  try {
    const config = getWritingConfig();
    const provider = new DeepSeekProvider(config.deepseek, { logger });
    const profile = getPlatformProfile(platform);
    const result = await provider.chat({
      messages: buildSocialMessages({ platform, goal, material, requirements }),
      task: 'social',
      temperature: 0.7,
      maxTokens: profile.maxTokens,
      traceId,
      step: `social:${platform}`
    });
    const content = cleanSocialContent(result.content);
    if (!content) throw new Error('DeepSeek 未返回有效内容');

    logger.info('[社交创作] 生成完成', {
      traceId,
      userId: req.user && req.user.id,
      platform,
      goal,
      model: result.model,
      durationMs: result.durationMs,
      usage: result.usage || undefined,
      localTestMode: LOCAL_SOCIAL_TEST_MODE
    });

    return res.json({
      code: 'SUCCESS',
      data: {
        content,
        platform,
        platformLabel: profile.label,
        goal,
        model: result.model,
        traceId
      }
    });
  } catch (error) {
    logger.error('[社交创作] 生成失败', {
      traceId,
      platform,
      goal,
      error: safeErrorMessage(error)
    });
    return res.status(502).json({
      error: '社交内容生成失败，请稍后重试',
      code: 'SOCIAL_GENERATE_ERROR',
      traceId
    });
  }
});

module.exports = router;
