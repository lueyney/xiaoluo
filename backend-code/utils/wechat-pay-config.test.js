const crypto = require('crypto');
const { buildPaymentConfig } = require('./wechat-pay-config');

function validEnv(privateKey) {
  return {
    WECHAT_APP_ID: 'wx1234567890abcdef',
    WECHAT_MCH_ID: '1234567890',
    WECHAT_APIV3_KEY: '12345678901234567890123456789012',
    WECHAT_CERT_SERIAL: '5157F09EFDC096DE15EBE81A47057A72',
    WECHAT_NOTIFY_URL: 'https://example.com/api/wechat-pay/notify',
    WECHAT_PRIVATE_KEY: privateKey
  };
}

describe('wechat pay configuration', () => {
  let privateKey;

  beforeAll(() => {
    privateKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' });
  });

  test('reports the exact missing settings without exposing secret values', () => {
    const state = buildPaymentConfig({}, { fsModule: { existsSync: () => false } });

    expect(state.ready).toBe(false);
    expect(state.diagnostics.missing).toEqual(expect.arrayContaining([
      'WECHAT_APP_ID',
      'WECHAT_MCH_ID',
      'WECHAT_APIV3_KEY',
      'WECHAT_CERT_SERIAL',
      'WECHAT_NOTIFY_URL',
      expect.stringContaining('WECHAT_PRIVATE_KEY')
    ]));
  });

  test('accepts a complete configuration with an inline RSA private key', () => {
    const state = buildPaymentConfig(validEnv(privateKey));

    expect(state.ready).toBe(true);
    expect(state.diagnostics.missing).toEqual([]);
    expect(state.diagnostics.invalid).toEqual([]);
    expect(state.diagnostics.privateKeySource).toBe('WECHAT_PRIVATE_KEY');
  });

  test('accepts a Base64 encoded private key for cloud deployment', () => {
    const env = validEnv('');
    delete env.WECHAT_PRIVATE_KEY;
    env.WECHAT_PRIVATE_KEY_BASE64 = Buffer.from(privateKey, 'utf8').toString('base64');

    const state = buildPaymentConfig(env);

    expect(state.ready).toBe(true);
    expect(state.diagnostics.privateKeySource).toBe('WECHAT_PRIVATE_KEY_BASE64');
  });

  test('rejects invalid APIv3 key length and non-HTTPS callback URLs', () => {
    const env = validEnv(privateKey);
    env.WECHAT_APIV3_KEY = 'too-short';
    env.WECHAT_NOTIFY_URL = 'http://example.com/notify';

    const state = buildPaymentConfig(env);

    expect(state.ready).toBe(false);
    expect(state.diagnostics.invalid).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'WECHAT_APIV3_KEY' }),
      expect.objectContaining({ key: 'WECHAT_NOTIFY_URL' })
    ]));
  });
});
