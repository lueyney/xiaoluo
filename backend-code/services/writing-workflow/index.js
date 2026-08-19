const logger = require('../../utils/logger');
const { getWritingConfig } = require('./config');
const { getDocTypeConfig, normalizeDocType } = require('./doc-types');
const DeepSeekProvider = require('./providers/deepseek');
const { buildDirectDefenseMessages, buildDirectMidtermMessages } = require('./prompts');
const { runPublishedWritingWorkflow } = require('./visual-runtime');
const { cleanDirectDocumentContent, countWords, createTraceId } = require('./utils');

const DIRECT_DOCUMENT_BUILDERS = {
  '答辩稿': buildDirectDefenseMessages,
  '中期检查表': buildDirectMidtermMessages
};

async function generateDirectDocument({ input, provider, config, startedAt }) {
  const buildMessages = DIRECT_DOCUMENT_BUILDERS[input.docType];
  const response = await provider.chat({
    messages: buildMessages(input),
    model: config.deepseek.draftingModel,
    temperature: input.docType === '答辩稿' ? 0.55 : 0.45,
    maxTokens: Math.min(config.deepseek.maxOutputTokens, input.docType === '答辩稿' ? 4096 : 3072),
    traceId: input.traceId,
    step: input.docType === '答辩稿' ? 'direct-defense' : 'direct-midterm'
  });
  const content = cleanDirectDocumentContent(response.content);
  if (!content) throw new Error(`${input.docType}生成结果为空`);

  return {
    content,
    wordCount: countWords(content),
    engine: 'deepseek',
    model: response.model || config.deepseek.draftingModel,
    traceId: input.traceId,
    durationMs: Date.now() - startedAt,
    steps: [{
      name: `direct-deepseek:${input.docType}`,
      status: 'completed',
      durationMs: response.durationMs || Date.now() - startedAt,
      type: 'llm'
    }]
  };
}

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
  if (DIRECT_DOCUMENT_BUILDERS[normalizedDocType]) {
    return generateDirectDocument({ input, provider, config, startedAt });
  }
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
