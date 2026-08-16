const {
  academicPromptVariantForIndex,
  buildRewritePrompt,
  normalizeAcademicPromptVariant
} = require('./rewrite-prompts');

describe('academic V1 A/B prompt alternation', () => {
  test('alternates deterministically from A and remains stable by index', () => {
    expect([0, 1, 2, 3, 4].map(academicPromptVariantForIndex)).toEqual(['A', 'B', 'A', 'B', 'A']);
    expect(academicPromptVariantForIndex(1)).toBe('B');
    expect(academicPromptVariantForIndex(1)).toBe('B');
  });

  test('explicit variant survives retries and fallback calls', () => {
    expect(normalizeAcademicPromptVariant('B', 0)).toBe('B');
    const context = { promptVariant: 'B', previousSentence: '上句。', nextSentence: '下句。' };
    const first = buildRewritePrompt('当前句。', 'v1', context);
    const retry = buildRewritePrompt('当前句。', 'v1', context);
    expect(first).toBe(retry);
    expect(first).toContain('严格按照下面方法进行降重');
    expect(first).toContain('当前待处理文本（只改写这一句）：\n当前句。');
  });

  test('A and B share the same fact-preserving one-sentence contract', () => {
    const promptA = buildRewritePrompt('当前句。', 'v1', { promptVariant: 'A' });
    const promptB = buildRewritePrompt('当前句。', 'v1', { promptVariant: 'B' });
    for (const prompt of [promptA, promptB]) {
      expect(prompt).toContain('不得改变事实关系、数字、专有名词、引用、核心专业术语');
      expect(prompt).toContain('只改写当前一句，只输出改写结果');
    }
    expect(promptA).toContain('并列内容必须调整主次');
    expect(promptB).toContain('长句拆分与主语增补');
  });
});
