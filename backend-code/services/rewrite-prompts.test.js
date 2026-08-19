const {
  academicPromptVariantForIndex,
  buildRewritePrompt,
  normalizeAcademicPromptVariant
} = require('./rewrite-prompts');

describe('academic V1 prompt selection', () => {
  test('alternates deterministically from A and remains stable by index', () => {
    expect([0, 1, 2, 3, 4].map(academicPromptVariantForIndex)).toEqual(['A', 'B', 'A', 'B', 'A']);
    expect(academicPromptVariantForIndex(1)).toBe('B');
    expect(academicPromptVariantForIndex(1)).toBe('B');
  });

  test('legacy B slots use the same Prompt A and remain stable across retries', () => {
    expect(normalizeAcademicPromptVariant('B', 0)).toBe('B');
    const context = { promptVariant: 'B', previousSentence: '上句。', nextSentence: '下句。' };
    const first = buildRewritePrompt('当前句。', 'v1', context);
    const retry = buildRewritePrompt('当前句。', 'v1', context);
    expect(first).toBe(retry);
    expect(first).toContain('并列内容必须调整主次');
    expect(first).not.toContain('严格按照下面方法进行降重');
    expect(first).toContain('当前待处理文本（只改写这一句）：\n当前句。');
  });

  test('A and B render exactly the same academic prompt', () => {
    const promptA = buildRewritePrompt('当前句。', 'v1', { promptVariant: 'A' });
    const promptB = buildRewritePrompt('当前句。', 'v1', { promptVariant: 'B' });
    expect(promptB).toBe(promptA);
    expect(promptA).toContain('并列内容必须调整主次');
    expect(promptA).not.toContain('不得改变事实关系、数字、专有名词、引用、核心专业术语、专业含义和论证方向');
    expect(promptA).not.toContain('只改写当前一句，只输出改写结果');
    expect(promptA).toContain('上文（仅作结构参照）：\n（无上文）');
    expect(promptA).toContain('下文（仅作结构参照）：\n（无下文）');
  });
});
