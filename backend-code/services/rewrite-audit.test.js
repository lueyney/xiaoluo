const {
  getRewriteAuditConfig,
  normalizeRewriteUsage,
  estimateDeepSeekCostCny
} = require('./rewrite-audit');

describe('rewrite audit configuration', () => {
  test('content logging requires an explicit non-production opt-in', () => {
    expect(getRewriteAuditConfig({
      NODE_ENV: 'development',
      REWRITE_AUDIT_LOG: 'true',
      REWRITE_AUDIT_LOG_CONTENT: 'true'
    })).toMatchObject({ enabled: true, includeContent: true });
    expect(getRewriteAuditConfig({
      NODE_ENV: 'production',
      REWRITE_AUDIT_LOG: 'true',
      REWRITE_AUDIT_LOG_CONTENT: 'true'
    })).toMatchObject({ enabled: true, includeContent: false });
  });

  test('audit logging is disabled by default', () => {
    expect(getRewriteAuditConfig({})).toMatchObject({ enabled: false, includeContent: false });
  });
});

describe('rewrite usage audit', () => {
  const usage = {
    prompt_tokens: 500,
    prompt_cache_hit_tokens: 400,
    prompt_cache_miss_tokens: 100,
    completion_tokens: 80,
    total_tokens: 580,
    completion_tokens_details: { reasoning_tokens: 30 }
  };

  test('normalizes cache and reasoning token fields', () => {
    expect(normalizeRewriteUsage(usage)).toEqual({
      promptTokens: 500,
      promptCacheHitTokens: 400,
      promptCacheMissTokens: 100,
      completionTokens: 80,
      reasoningTokens: 30,
      totalTokens: 580,
      cacheMetricsAvailable: true,
      cacheHitRate: 0.8
    });
  });

  test('estimates pro pricing using Beijing peak and off-peak periods', () => {
    expect(estimateDeepSeekCostCny('deepseek-v4-pro', usage, new Date('2026-08-21T03:00:00Z')))
      .toMatchObject({ pricingPeriod: 'peak', estimatedCostCny: 0.00318 });
    expect(estimateDeepSeekCostCny('deepseek-v4-pro', usage, new Date('2026-08-21T05:00:00Z')))
      .toMatchObject({ pricingPeriod: 'offPeak', estimatedCostCny: 0.00159 });
  });

  test('does not invent cache metrics or pricing when provider omits them', () => {
    expect(normalizeRewriteUsage({ prompt_tokens: 10, completion_tokens: 5 }))
      .toMatchObject({ cacheMetricsAvailable: false, cacheHitRate: null });
    expect(estimateDeepSeekCostCny('deepseek-v4-pro', { prompt_tokens: 10, completion_tokens: 5 }))
      .toBeNull();
  });
});
