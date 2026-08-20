const { getRewriteConfig, buildRewritePayload } = require('./rewrite-config');

describe('unified rewrite configuration', () => {
  test('text and document entry points resolve the same rewrite settings', () => {
    const env = {
      DEEPSEEK_API_BASE: 'https://api.deepseek.com/',
      DEEPSEEK_MODEL: 'global-model',
      DEEPSEEK_REWRITE_MODEL: 'rewrite-model',
      DEEPSEEK_REWRITE_TEMPERATURE: '0.5',
      DEEPSEEK_MAX_TOKENS: '4096',
      DEEPSEEK_REWRITE_THINKING: 'enabled',
      DEEPSEEK_REWRITE_REASONING_EFFORT: 'low'
    };
    const config = getRewriteConfig(env);
    expect(config).toMatchObject({
      model: 'rewrite-model',
      temperature: 0.5,
      maxTokens: 4096,
      apiBase: 'https://api.deepseek.com'
    });
    expect(config.selection).toMatchObject({ thinking: 'enabled', reasoningEffort: 'low' });
    expect(buildRewritePayload({ messages: [], env })).toMatchObject({
      model: 'rewrite-model',
      temperature: 0.5,
      max_tokens: 4096,
      thinking: { type: 'enabled' },
      reasoning_effort: 'low'
    });
  });

  test('blank task temperature falls back instead of becoming zero', () => {
    expect(getRewriteConfig({
      DEEPSEEK_REWRITE_TEMPERATURE: '',
      DEEPSEEK_TEMPERATURE: '0.55'
    }).temperature).toBe(0.55);
  });
});
