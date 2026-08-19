const {
  ACADEMIC_V1_REWRITE_PROMPT_A,
  ACADEMIC_V1_REWRITE_PROMPT_B,
  REWRITE_INPUT_TEMPLATE,
  REWRITE_PROMPT,
  academicPromptVariantForIndex,
  buildRewriteMessages,
  buildRewritePrompt,
  getRewritePrompt
} = require('./rewrite-prompts');

describe('unified rewrite prompt', () => {
  test('all prompt slots and versions use exactly the same prompt', () => {
    expect(ACADEMIC_V1_REWRITE_PROMPT_A).toBe(REWRITE_PROMPT);
    expect(ACADEMIC_V1_REWRITE_PROMPT_B).toBe(REWRITE_PROMPT);
    expect(getRewritePrompt('v1', { promptVariant: 'A' })).toBe(REWRITE_PROMPT);
    expect(getRewritePrompt('v1', { promptVariant: 'B' })).toBe(REWRITE_PROMPT);
    expect(getRewritePrompt('v2')).toBe(REWRITE_PROMPT);
    expect(getRewritePrompt('v3')).toBe(REWRITE_PROMPT);
  });

  test('first sentence has no previous-sentence addition', () => {
    const messages = buildRewriteMessages('当前句。');
    expect(messages).toEqual([
      { role: 'system', content: REWRITE_PROMPT },
      { role: 'user', content: '处理括号中的文本，仅返回降AI结果：【当前句。】' }
    ]);
    expect(messages[1].content).not.toContain('上一句');
  });

  test('original previous sentence is never injected', () => {
    const messages = buildRewriteMessages('当前句。', {
      previousSentence: '上一句。',
      nextSentence: '下一句。'
    });
    expect(messages[1].content).toBe('处理括号中的文本，仅返回降AI结果：【当前句。】');
    expect(messages[1].content).not.toContain('上一句。');
  });

  test('later sentences in the same group include only rewritten context', () => {
    const messages = buildRewriteMessages('当前句。', {
      previousSentence: '上一句原文。',
      previousRewrittenSentence: '上一句降AI结果。'
    });
    expect(messages[1].content).toBe(
      '上一句：【上一句降AI结果。】\n降重后禁止与上一句的句式和表达方式一致。\n处理括号中的文本，仅返回降AI结果：【当前句。】'
    );
    expect(messages[1].content).not.toContain('上一句原文。');
  });

  test('keeps one combined-prompt adapter without context additions', () => {
    expect(REWRITE_INPUT_TEMPLATE).toBe('处理括号中的文本，仅返回降AI结果：【{{input}}】');
    expect(buildRewritePrompt('当前句。')).toBe(`${REWRITE_PROMPT}\n处理括号中的文本，仅返回降AI结果：【当前句。】`);
  });

  test('keeps stable legacy sentence-slot indexing', () => {
    expect([0, 1, 2, 3].map(academicPromptVariantForIndex)).toEqual(['A', 'B', 'A', 'B']);
  });
});
