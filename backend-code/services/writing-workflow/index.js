const logger = require('../../utils/logger');
const { getWritingConfig } = require('./config');
const { getDocTypeConfig, normalizeDocType } = require('./doc-types');
const DeepSeekProvider = require('./providers/deepseek');
const { runPublishedWritingWorkflow } = require('./visual-runtime');
const { createTraceId } = require('./utils');

async function generateDocument({ topic, field, docType, requirements = '', traceId, provider: injectedProvider }) {
  const config = getWritingConfig();
  const normalizedDocType = normalizeDocType(docType);
  const docTypeConfig = getDocTypeConfig(normalizedDocType);
  const resolvedTraceId = traceId || createTraceId();
  const provider = injectedProvider || new DeepSeekProvider(config.deepseek, { logger });
  const startedAt = Date.now();
  const input = {
    topic: String(topic || '').trim(),
    field: String(field || '教育学').trim(),
    docType: normalizedDocType,
    requirements: String(requirements || '').trim(),
    description: docTypeConfig.description,
    defaultTargetWords: docTypeConfig.targetWords,
    traceId: resolvedTraceId
  };
  const result = await runPublishedWritingWorkflow(input, { provider, config });

  return {
    content: result.content,
    wordCount: result.wordCount,
    engine: 'deepseek',
    model: config.deepseek.draftingModel,
    traceId: resolvedTraceId,
    durationMs: Date.now() - startedAt,
    steps: result.steps
  };
}

module.exports = { generateDocument, getWritingConfig };
