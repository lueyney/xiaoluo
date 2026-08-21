jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 12 };
    next();
  }
}));

const mockProviderChat = jest.fn();
jest.mock('../services/writing-workflow/providers/deepseek', () => jest.fn().mockImplementation(() => ({
  chat: mockProviderChat
})));

jest.mock('../services/writing-workflow', () => ({
  getWritingConfig: () => ({ deepseek: {} })
}));

const express = require('express');
const request = require('supertest');
const router = require('./social');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/social', router);
  return app;
}

describe('social generation route', () => {
  beforeEach(() => {
    mockProviderChat.mockReset();
  });

  test('routes valid input through the dedicated social task', async () => {
    mockProviderChat.mockResolvedValue({
      content: '标题\n\n正文',
      model: 'deepseek-v4-pro',
      durationMs: 18,
      usage: { prompt_tokens: 120, completion_tokens: 30 }
    });

    const response = await request(createApp())
      .post('/api/social/generate')
      .send({
        platform: 'xiaohongshu',
        goal: '经验分享',
        material: '周末去看了一场摄影展，展厅动线很清楚。',
        requirements: '语气克制'
      });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({
      content: '标题\n\n正文',
      platform: 'xiaohongshu',
      model: 'deepseek-v4-pro'
    });
    expect(mockProviderChat).toHaveBeenCalledWith(expect.objectContaining({
      task: 'social',
      temperature: 0.7,
      step: 'social:xiaohongshu'
    }));
  });

  test('rejects an unsupported platform before calling DeepSeek', async () => {
    const response = await request(createApp())
      .post('/api/social/generate')
      .send({ platform: 'unknown', goal: '经验分享', material: '这是一段足够长度的测试素材。' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(mockProviderChat).not.toHaveBeenCalled();
  });
});
