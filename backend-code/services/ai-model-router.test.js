const {
  applyDeepSeekReasoning,
  listDeepSeekRoutes,
  resolveDeepSeekCall
} = require('./ai-model-router');

describe('DeepSeek model router', () => {
  test('uses function override before task and global models', () => {
    const env = {
      DEEPSEEK_MODEL: 'global-model',
      DEEPSEEK_REWRITE_MODEL: 'rewrite-model'
    };
    expect(resolveDeepSeekCall('rewrite', {}, env).model).toBe('rewrite-model');
    expect(resolveDeepSeekCall('rewrite', { model: 'function-model' }, env)).toMatchObject({
      model: 'function-model',
      modelSource: 'function'
    });
  });

  test('supports independent reasoning configuration per task', () => {
    const selection = resolveDeepSeekCall('planning', {}, {
      DEEPSEEK_MODEL: 'deepseek-chat',
      DEEPSEEK_REASONING_EFFORT: 'low',
      DEEPSEEK_PLANNING_REASONING_EFFORT: 'high',
      DEEPSEEK_PLANNING_THINKING: 'enabled'
    });
    expect(selection).toMatchObject({ reasoningEffort: 'high', thinking: 'enabled' });
    expect(applyDeepSeekReasoning({ model: selection.model }, selection)).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: 'high'
    });
  });

  test('does not send optional reasoning fields by default', () => {
    const selection = resolveDeepSeekCall('title', {}, {});
    expect(selection.model).toBe('deepseek-chat');
    expect(applyDeepSeekReasoning({ model: selection.model }, selection)).toEqual({ model: 'deepseek-chat' });
  });

  test('lists every configured function route', () => {
    expect(listDeepSeekRoutes({}).map((item) => item.task)).toEqual([
      'rewrite', 'rewriteFallback', 'documentRewrite', 'planning', 'drafting', 'title', 'workflow'
    ]);
  });
});
