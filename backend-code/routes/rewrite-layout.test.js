jest.mock('../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn()
}));

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next()
}));

const rewriteRouter = require('./rewrite');
const {
  splitSentences,
  assembleParagraphs,
  ensureEndPunct
} = rewriteRouter.documentRewritePipeline;

describe('rewrite paragraph layout', () => {
  test('uses the original program heading strategy', () => {
    const sentences = splitSentences([
      '中国传统纹样在视觉传达设计中的应用研究',
      '第5章 陕煤集团财务绩效优化策略',
      '5.1 强化成本管控与提升盈利稳定性',
      '普通正文没有句号但是长度足够长所以应当进入降重处理流程'
    ].join('\n'));
    expect(sentences.map((item) => item.isTitle)).toEqual([true, true, true, false]);
  });

  test('preserves source paragraph ownership after grouped out-of-order completion', () => {
    const sentences = splitSentences('第一段第一句。第一段第二句。\n第二段第一句。第二段第二句。');
    const results = ['改写一。', '改写二。', '改写三。', '改写四。'];
    expect(assembleParagraphs(sentences, results)).toBe('改写一。改写二。\n改写三。改写四。');
  });

  test('preserves blank lines between source paragraphs', () => {
    const sentences = splitSentences('第一段第一句。\n\n第二段第一句。');
    expect(assembleParagraphs(sentences, ['改写第一段。', '改写第二段。']))
      .toBe('改写第一段。\n\n改写第二段。');
  });

  test('one sentence result cannot introduce a new paragraph', () => {
    expect(ensureEndPunct('原句。', '改写前半句\n改写后半句。')).toBe('改写前半句改写后半句。');
  });

  test('keeps closing quotes with the preceding sentence', () => {
    const sentences = splitSentences('“别看。”身后的声音仍很平静：“不要下去。”');
    expect(sentences.map((item) => item.text)).toEqual([
      '“别看。”',
      '身后的声音仍很平静：“不要下去。”'
    ]);
  });

  test('does not append punctuation after a closing quote', () => {
    expect(ensureEndPunct('原句。', '“改写结果。”')).toBe('“改写结果。”');
    expect(ensureEndPunct('原句！', '“改写结果！”')).toBe('“改写结果！”');
    expect(ensureEndPunct('原句？', '“改写结果？”')).toBe('“改写结果？”');
  });

  test('normalizes an obvious duplicated terminal after a closing quote', () => {
    expect(ensureEndPunct('原句。', '“改写结果。”。')).toBe('“改写结果。”');
    expect(ensureEndPunct('原句！', '“改写结果！”!')).toBe('“改写结果！”');
    expect(splitSentences('“别看。”。下一句。').map((item) => item.text))
      .toEqual(['“别看。”', '下一句。']);
  });

  test('preserves intentional mixed terminal punctuation around a quote', () => {
    expect(ensureEndPunct('原句！', '“真的吗？”！')).toBe('“真的吗？”！');
  });
});
