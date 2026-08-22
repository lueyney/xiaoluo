const {
  ACADEMIC_V1_REWRITE_PROMPT_A,
  ACADEMIC_V1_REWRITE_PROMPT_B,
  NOVEL_V2_REWRITE_PROMPT,
  REWRITE_INPUT_TEMPLATE,
  REWRITE_PROMPT,
  academicPromptVariantForIndex,
  buildRewriteMessages,
  buildRewritePrompt,
  getRewritePrompt
} = require('./rewrite-prompts');

describe('rewrite prompt messages', () => {
  test('academic v1 uses prompt A for both legacy slots', () => {
    expect(ACADEMIC_V1_REWRITE_PROMPT_A).toBe(REWRITE_PROMPT);
    expect(ACADEMIC_V1_REWRITE_PROMPT_B).toBe(REWRITE_PROMPT);
    expect(getRewritePrompt('v1', { promptVariant: 'A' })).toBe(REWRITE_PROMPT);
    expect(getRewritePrompt('v1', { promptVariant: 'B' })).toBe(ACADEMIC_V1_REWRITE_PROMPT_B);
    expect(getRewritePrompt('v2')).toBe(NOVEL_V2_REWRITE_PROMPT);
    expect(getRewritePrompt('v3')).toBe(REWRITE_PROMPT);
  });

  test('all rewrite versions use the minimal experimental prompt', () => {
    expect(REWRITE_PROMPT).toBe('降低本句的AI特征。');
    expect(ACADEMIC_V1_REWRITE_PROMPT_A).toBe(REWRITE_PROMPT);
    expect(ACADEMIC_V1_REWRITE_PROMPT_B).toBe(REWRITE_PROMPT);
    expect(NOVEL_V2_REWRITE_PROMPT).toBe(REWRITE_PROMPT);
    expect(buildRewriteMessages('当前句。', { rewriteVersion: 'v2' })[0]).toEqual({
      role: 'system',
      content: NOVEL_V2_REWRITE_PROMPT
    });
  });

  test('prompt is sent in system content and user content contains only input', () => {
    expect(buildRewriteMessages('当前句。')).toEqual([
      { role: 'system', content: REWRITE_PROMPT },
      { role: 'user', content: '处理括号中的文本，仅返回降AI结果：【当前句。】' }
    ]);
  });

  test('original previous sentence is never injected', () => {
    const messages = buildRewriteMessages('当前句。', {
      previousSentence: '上一句。',
      nextSentence: '下一句。'
    });
    expect(messages[0].content).toBe(REWRITE_PROMPT);
    expect(messages[1].content).toBe('处理括号中的文本，仅返回降AI结果：【当前句。】');
    expect(messages[1].content).not.toContain('上一句。');
  });

  test('rewritten previous context is appended after prompt', () => {
    const messages = buildRewriteMessages('当前句。', {
      previousRewrittenSentence: '上一句降AI结果。'
    });
    expect(messages[0].content).toBe(REWRITE_PROMPT);
    expect(messages[1].content).toBe(
      '上一句：【上一句降AI结果。】\n降重后禁止与上两句的句式和表达方式一致。\n处理括号中的文本，仅返回降AI结果：【当前句。】'
    );
  });

  test('two rewritten predecessor sentences are injected, never originals', () => {
    const messages = buildRewriteMessages('当前句。', {
      previousRewrittenSentences: ['上上句降AI结果。', '上一句降AI结果。']
    });
    expect(messages[1].content).toBe(
      '上两句：【上上句降AI结果。】\n上一句：【上一句降AI结果。】\n降重后禁止与上两句的句式和表达方式一致。\n处理括号中的文本，仅返回降AI结果：【当前句。】'
    );
    expect(messages[1].content).not.toContain('上上句原文。');
  });

  test('combined adapter uses the same layout', () => {
    expect(REWRITE_INPUT_TEMPLATE).toBe('处理括号中的文本，仅返回降AI结果：【{{input}}】');
    expect(buildRewritePrompt('当前句。')).toBe('处理括号中的文本，仅返回降AI结果：【当前句。】');
  });

  test('keeps stable legacy sentence-slot indexing', () => {
    expect([0, 1, 2, 3].map(academicPromptVariantForIndex)).toEqual(['A', 'B', 'A', 'B']);
  });

  test('B slot also places its prompt in user content', () => {
    const messages = buildRewriteMessages('当前句。', { promptVariant: 'B' });
    expect(messages[0].content).toBe(ACADEMIC_V1_REWRITE_PROMPT_B);
    expect(messages[1].content).toBe('处理括号中的文本，仅返回降AI结果：【当前句。】');
  });
});
