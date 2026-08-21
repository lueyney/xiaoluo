const { getRewriteConfig, buildRewritePayload } = require('./rewrite-config');

describe('unified rewrite configuration', () => {
  test('text and document entry points resolve the same rewrite settings', () => {
    const env = {
      DEEPSEEK_API_BASE: 'https://api.deepseek.com/',
      DEEPSEEK_MODEL: 'global-model',
      DEEPSEEK_REWRITE_MODEL: 'rewrite-model',
      DEEPSEEK_REWRITE_TEMPERATURE: '0.5',
      DEEPSEEK_REWRITE_TOP_P: '0.3',
      DEEPSEEK_MAX_TOKENS: '4096',
      DEEPSEEK_REWRITE_THINKING: 'enabled',
      DEEPSEEK_REWRITE_REASONING_EFFORT: 'low'
    };
    const config = getRewriteConfig(env);
    expect(config).toMatchObject({
      model: 'rewrite-model',
      temperature: 0.5,
      topP: 0.3,
      maxTokens: 4096,
      apiBase: 'https://api.deepseek.com'
    });
    expect(config.selection).toMatchObject({ thinking: 'enabled', reasoningEffort: 'low' });
    expect(buildRewritePayload({ messages: [], env })).toMatchObject({
      model: 'rewrite-model',
      temperature: 0.5,
      top_p: 0.3,
      max_tokens: 4096,
      thinking: { type: 'enabled' },
      reasoning_effort: 'low'
    });
    expect(buildRewritePayload({ messages: [], stream: true, env })).toMatchObject({
      stream: true,
      stream_options: { include_usage: true }
    });
    expect(buildRewritePayload({ messages: [], stream: false, env })).not.toHaveProperty('stream_options');
  });

  test('blank task temperature falls back instead of becoming zero', () => {
    expect(getRewriteConfig({
      DEEPSEEK_REWRITE_TEMPERATURE: '',
      DEEPSEEK_TEMPERATURE: '0.55'
    }).temperature).toBe(0.55);
  });

  test('top_p defaults to one and is clamped to the supported range', () => {
    expect(getRewriteConfig({}).topP).toBe(1);
    expect(getRewriteConfig({ DEEPSEEK_REWRITE_TOP_P: '2' }).topP).toBe(1);
    expect(getRewriteConfig({ DEEPSEEK_REWRITE_TOP_P: '-1' }).topP).toBe(0);
  });

  test('project rewrite defaults match the shipped Pro low-thinking configuration', () => {
    const config = getRewriteConfig({});
    expect(config).toMatchObject({
      model: 'deepseek-v4-pro',
      temperature: 1,
      topP: 1
    });
    expect(config.selection).toMatchObject({
      thinking: 'enabled',
      reasoningEffort: 'low'
    });
  });
});
