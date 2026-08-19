jest.mock('../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn()
}));

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next()
}));

const rewriteRouter = require('./rewrite');

const { splitSentences } = rewriteRouter.documentRewritePipeline;

describe('rewrite heading detection', () => {
  test('keeps short structural headings but rewrites pasted article statements', () => {
    const sentences = splitSentences([
      '资讯：蚂蚁集团 CEO 韩歆毅预判：智能体商业 6-12 个月内迎来爆发',
      '事件概况',
      '爆发的三大成熟条件同时到来：',
      '1. AI能力提升：智能体推理、长任务执行、跨工具调用能力跨过临界点；',
      '智能体商业将在未来 6-12 个月迎来爆发',
      '底层商业逻辑变革'
    ].join('\n'));

    expect(sentences.map(({ text, isTitle }) => ({ text, isTitle }))).toEqual([
      { text: '资讯：蚂蚁集团 CEO 韩歆毅预判：智能体商业 6-12 个月内迎来爆发', isTitle: false },
      { text: '事件概况', isTitle: true },
      { text: '爆发的三大成熟条件同时到来：', isTitle: false },
      { text: '1. AI能力提升：智能体推理、长任务执行、跨工具调用能力跨过临界点；', isTitle: false },
      { text: '智能体商业将在未来 6-12 个月迎来爆发', isTitle: false },
      { text: '底层商业逻辑变革', isTitle: true }
    ]);
  });

  test('preserves conventional academic headings', () => {
    const sentences = splitSentences([
      '中国传统纹样在视觉传达设计中的应用研究',
      '第5章 陕煤集团财务绩效优化策略',
      '5.1 强化成本管控与提升盈利稳定性',
      '普通正文没有句号但是长度足够长所以应当进入降重处理流程'
    ].join('\n'));

    expect(sentences.map((item) => item.isTitle)).toEqual([true, true, true, false]);
  });
});
