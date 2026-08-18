function readInteger(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readNumber(name, fallback, { min = 0, max = Number.MAX_VALUE } = {}) {
  const parsed = Number.parseFloat(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getWritingConfig() {
  return {
    maxSections: readInteger('WRITING_MAX_SECTIONS', 9, { min: 3, max: 16 }),
    minTargetWords: readInteger('WRITING_MIN_TARGET_WORDS', 800, { min: 300, max: 3000 }),
    maxTargetWords: readInteger('WRITING_MAX_TARGET_WORDS', 12000, { min: 3000, max: 30000 }),
    deepseek: {
      apiBase: String(process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      planningModel: process.env.DEEPSEEK_PLANNING_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      draftingModel: process.env.DEEPSEEK_DRAFTING_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      // Title generation is a short, direct answer. Do not inherit a global
      // reasoning model here: it can spend the small output budget on hidden
      // reasoning and return an empty visible answer.
      titleModel: process.env.DEEPSEEK_TITLE_MODEL || 'deepseek-chat',
      timeoutMs: readInteger('DEEPSEEK_TIMEOUT_MS', 120000, { min: 10000, max: 600000 }),
      maxOutputTokens: readInteger(
        'DEEPSEEK_MAX_OUTPUT_TOKENS',
        readInteger('DEEPSEEK_MAX_TOKENS', 8192, { min: 512, max: 16384 }),
        { min: 512, max: 16384 }
      ),
      // Bound concurrent requests from parallel workflow branches. Deployments
      // with a larger provider quota can raise this up to 500 explicitly.
      maxConcurrentRequests: readInteger('DEEPSEEK_MAX_CONCURRENT_REQUESTS', 8, { min: 1, max: 500 }),
      temperature: readNumber('DEEPSEEK_TEMPERATURE', 0.55, { min: 0, max: 1.5 }),
      maxRetries: readInteger('DEEPSEEK_MAX_RETRIES', 2, { min: 0, max: 5 })
    },
    academicSearch: {
      apiKey: process.env.ACADEMIC_SEARCH_API_KEY || '',
      timeoutMs: readInteger('ACADEMIC_SEARCH_TIMEOUT_MS', 30000, { min: 1000, max: 120000 }),
      maxResults: readInteger('ACADEMIC_SEARCH_MAX_RESULTS', 20, { min: 1, max: 50 })
    }
  };
}

module.exports = { getWritingConfig };
