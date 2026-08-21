jest.mock('../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn()
}));

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 1 };
    next();
  }
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../utils/wechat-pay-v3', () => ({
  ensurePaymentConfigured: jest.fn(),
  createNativeOrder: jest.fn(),
  createJsapiOrder: jest.fn(),
  generateMiniProgramPayParams: jest.fn(),
  queryOrder: jest.fn(),
  handlePaymentNotify: jest.fn()
}));

jest.mock('../utils/wechat', () => ({
  code2Session: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const { query, transaction } = require('../config/database');
const wechatPayV3 = require('../utils/wechat-pay-v3');
const router = require('./wechat-pay');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/wechat-pay', router);
  return app;
}

describe('wechat web payment order creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockResolvedValue([{ has_used_first_recharge: 0 }]);
  });

  test('returns 503 before inserting an order when payment configuration is invalid', async () => {
    wechatPayV3.ensurePaymentConfigured.mockReturnValue({
      ready: false,
      code: 'WECHAT_PAY_NOT_CONFIGURED'
    });

    const response = await request(createApp())
      .post('/api/wechat-pay/create-web-order')
      .send({ packageId: 2, amount: 10, credits: 100, isFirstTime: false });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('WECHAT_PAY_NOT_CONFIGURED');
    expect(transaction).not.toHaveBeenCalled();
    expect(wechatPayV3.createNativeOrder).not.toHaveBeenCalled();
  });

  test('reuses a recent pending order that already has a QR code', async () => {
    wechatPayV3.ensurePaymentConfigured.mockReturnValue({ ready: true });
    const conn = {
      execute: jest.fn()
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([[
          {
            id: 7,
            out_trade_no: 'WEBORD1234567890000007',
            code_url: 'weixin://wxpay/example',
            age_seconds: 5
          }
        ]])
    };
    transaction.mockImplementation(async (callback) => callback(conn));

    const response = await request(createApp())
      .post('/api/wechat-pay/create-web-order')
      .send({ packageId: 2, amount: 10, credits: 100, isFirstTime: false });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(expect.objectContaining({
      orderId: 7,
      codeUrl: 'weixin://wxpay/example',
      reused: true
    }));
    expect(wechatPayV3.createNativeOrder).not.toHaveBeenCalled();
  });
});
