const {
  ACADEMIC_V1_REWRITE_PROMPT_A,
  ACADEMIC_V1_REWRITE_PROMPT_B,
  ACADEMIC_V1_REWRITE_PROMPT_C,
  BEST_REWRITE_PROMPT,
  NOVEL_V2_REWRITE_PROMPT,
  REWRITE_INPUT_TEMPLATE,
  REWRITE_PROMPT,
  academicPromptVariantForIndex,
  buildRewriteMessages,
  buildRewritePrompt,
  getRewritePrompt
} = require('./rewrite-prompts');

describe('rewrite prompt messages', () => {
  test('all legacy versions and variants resolve to the single best prompt', () => {
    expect(BEST_REWRITE_PROMPT).toBe(REWRITE_PROMPT);
    expect(ACADEMIC_V1_REWRITE_PROMPT_A).toBe(REWRITE_PROMPT);
    expect(getRewritePrompt('v1', { promptVariant: 'A' })).toBe(REWRITE_PROMPT);
    expect(getRewritePrompt('v1', { promptVariant: 'B' })).toBe(REWRITE_PROMPT);
    expect(getRewritePrompt('v1', { promptVariant: 'C' })).toBe(REWRITE_PROMPT);
    expect(getRewritePrompt('v2')).toBe(REWRITE_PROMPT);
    expect(getRewritePrompt('v3')).toBe(REWRITE_PROMPT);
  });

  test('the shared prompt is the required low-AIGC prompt', () => {
    expect(REWRITE_PROMPT).toContain('角色：低AI特征逐句改写。单位是句，不跨句合并');
    expect(REWRITE_PROMPT).toContain('专业术语密度不得低于原文。');
    expect(REWRITE_PROMPT).toContain('【改写规则 1-9（逐句应用，不必全用）】');
    expect(REWRITE_PROMPT).toContain('1. 句式转换');
    expect(REWRITE_PROMPT).toContain('8. 复合连接词换基础连词');
    expect(REWRITE_PROMPT).toContain('9. 【原「宾语泛化」改向】宾语走侧移或下移，不走泛化');
    expect(REWRITE_PROMPT).toContain('【新增算子 A-D】');
    expect(REWRITE_PROMPT).toContain('· 每句至少选 2-3 个算子，不得全用。');
    expect(REWRITE_PROMPT).toContain('· 相邻两句主算子必须不同。');
    expect(REWRITE_PROMPT).toContain('有没有丢信息？任一命中则重改该句。');
    expect(ACADEMIC_V1_REWRITE_PROMPT_A).toBe(REWRITE_PROMPT);
    expect(ACADEMIC_V1_REWRITE_PROMPT_B).toBe(REWRITE_PROMPT);
    expect(ACADEMIC_V1_REWRITE_PROMPT_C).toBe(REWRITE_PROMPT);
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

  test('batch requests enforce distinct adjacent expressions and include rewritten context', () => {
    const messages = buildRewriteMessages('', {
      batchTexts: ['第一句。', '第二句。'],
      previousRewrittenSentences: ['前句一。', '前句二。']
    });
    expect(messages[0]).toEqual({ role: 'system', content: REWRITE_PROMPT });
    expect(messages[1].content).toContain('上两句：【前句一。】\n上一句：【前句二。】');
    expect(messages[1].content).toContain('严格输出2行');
    expect(messages[1].content).toContain('相邻句要有不同的句式和开头');
  });

  test('combined adapter uses the same layout', () => {
    expect(REWRITE_INPUT_TEMPLATE).toBe('处理括号中的文本，仅返回降AI结果：【{{input}}】');
    expect(buildRewritePrompt('当前句。')).toBe('处理括号中的文本，仅返回降AI结果：【当前句。】');
  });

  test('cycles effective sentence slots through A, B and C', () => {
    expect([0, 1, 2, 3, 4, 5].map(academicPromptVariantForIndex))
      .toEqual(['A', 'B', 'C', 'A', 'B', 'C']);
  });

  test('unspecified prompt variant remains compatible with prompt A', () => {
    expect(getRewritePrompt('v1')).toBe(REWRITE_PROMPT);
    expect(getRewritePrompt('v1', {})).toBe(REWRITE_PROMPT);
  });

  test('B slot also places its prompt in user content', () => {
    const messages = buildRewriteMessages('当前句。', { promptVariant: 'B' });
    expect(messages[0].content).toBe(ACADEMIC_V1_REWRITE_PROMPT_B);
    expect(messages[1].content).toBe('处理括号中的文本，仅返回降AI结果：【当前句。】');
  });

  test('C slot places prompt C in system content', () => {
    const messages = buildRewriteMessages('当前句。', { promptVariant: 'C' });
    expect(messages[0].content).toBe(ACADEMIC_V1_REWRITE_PROMPT_C);
    expect(messages[1].content).toBe('处理括号中的文本，仅返回降AI结果：【当前句。】');
  });
});
