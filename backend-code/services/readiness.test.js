const { getReadiness, hasDeepSeekConfig, isDocumentExportReady } = require('./readiness');

describe('deployment readiness', () => {
  test('reports ready only when database, AI, payment and export are ready', async () => {
    const result = await getReadiness({
      query: jest.fn().mockResolvedValue([{ ready: 1 }]),
      env: { DEEPSEEK_API_KEY: 'configured' },
      payStatus: {
        nativeReady: true,
        notifyReady: true,
        privateKeyLoaded: true,
        nativeMissing: [],
        notifyMissing: []
      }
    });

    expect(result).toMatchObject({
      ready: true,
      database: true,
      deepseekConfigured: true,
      documentExportReady: true,
      wechatPay: {
        nativeReady: true,
        notifyReady: true,
        privateKeyLoaded: true,
        missing: []
      }
    });
  });

  test('does not expose values and reports missing payment configuration', async () => {
    const result = await getReadiness({
      query: jest.fn().mockRejectedValue(new Error('offline')),
      env: {},
      payStatus: {
        nativeReady: false,
        notifyReady: false,
        privateKeyLoaded: false,
        nativeMissing: ['WECHAT_PRIVATE_KEY'],
        notifyMissing: ['WECHAT_PRIVATE_KEY', 'WECHAT_APIV3_KEY']
      }
    });

    expect(result.ready).toBe(false);
    expect(result.database).toBe(false);
    expect(result.deepseekConfigured).toBe(false);
    expect(result.wechatPay.missing).toEqual(['WECHAT_PRIVATE_KEY', 'WECHAT_APIV3_KEY']);
    expect(JSON.stringify(result)).not.toContain('offline');
  });

  test('local capability checks are boolean and require a non-empty AI key', () => {
    expect(hasDeepSeekConfig({ DEEPSEEK_API_KEY: '  ' })).toBe(false);
    expect(hasDeepSeekConfig({ DEEPSEEK_API_KEY: 'key' })).toBe(true);
    expect(isDocumentExportReady()).toBe(true);
  });
});
