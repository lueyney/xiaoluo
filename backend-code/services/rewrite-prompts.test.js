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
  test('A/B/C variants resolve to their own prompts and legacy defaults remain compatible', () => {
    expect(BEST_REWRITE_PROMPT).toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
    expect(ACADEMIC_V1_REWRITE_PROMPT_A).not.toBe(ACADEMIC_V1_REWRITE_PROMPT_B);
    expect(ACADEMIC_V1_REWRITE_PROMPT_B).not.toBe(ACADEMIC_V1_REWRITE_PROMPT_C);
    expect(ACADEMIC_V1_REWRITE_PROMPT_A).not.toBe(ACADEMIC_V1_REWRITE_PROMPT_C);
    expect(getRewritePrompt('v1', { promptVariant: 'A' })).toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
    expect(getRewritePrompt('v1', { promptVariant: 'B' })).toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
    expect(getRewritePrompt('v1', { promptVariant: 'C' })).toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
    expect(getRewritePrompt('v2')).toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
    expect(getRewritePrompt('v3')).toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
  });

  test('the A/B/C prompts match the configured rewrite strategies', () => {
    expect(ACADEMIC_V1_REWRITE_PROMPT_A).toContain('角色：擅长输出低AI特征的降重大师。');
    expect(ACADEMIC_V1_REWRITE_PROMPT_A).toContain('必要自检：');
    expect(ACADEMIC_V1_REWRITE_PROMPT_A).toContain('所有规则尽量避开意群自然边界');
    expect(ACADEMIC_V1_REWRITE_PROMPT_B).toContain('提取文本核心信息，将文本改写');
    expect(ACADEMIC_V1_REWRITE_PROMPT_B).toContain('汪淼起身要走');
    expect(ACADEMIC_V1_REWRITE_PROMPT_C).toContain('按照下面文本的风格重塑原文');
    expect(ACADEMIC_V1_REWRITE_PROMPT_C).toContain('走进大殿，他发现这里甚至比门洞中还昏暗');
    expect(ACADEMIC_V1_REWRITE_PROMPT_A).not.toContain('你是中文改写编辑。');
    expect(ACADEMIC_V1_REWRITE_PROMPT_B).not.toContain('你是中文改写编辑。');
    expect(ACADEMIC_V1_REWRITE_PROMPT_C).not.toContain('你是中文改写编辑。');
    expect(NOVEL_V2_REWRITE_PROMPT).toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
    expect(buildRewriteMessages('当前句。', { rewriteVersion: 'v2' })[0]).toEqual({
      role: 'system',
      content: NOVEL_V2_REWRITE_PROMPT
    });
  });

  test('prompt is sent in system content and user content contains only input', () => {
    expect(buildRewriteMessages('当前句。')).toEqual([
      { role: 'system', content: ACADEMIC_V1_REWRITE_PROMPT_A },
      { role: 'user', content: '处理括号中的文本，仅返回降AI结果：【当前句。】' }
    ]);
  });

  test('original previous sentence is never injected', () => {
    const messages = buildRewriteMessages('当前句。', {
      previousSentence: '上一句。',
      nextSentence: '下一句。'
    });
    expect(messages[0].content).toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
    expect(messages[1].content).toBe('处理括号中的文本，仅返回降AI结果：【当前句。】');
    expect(messages[1].content).not.toContain('上一句。');
  });

  test('rewritten previous context is appended after prompt', () => {
    const messages = buildRewriteMessages('当前句。', {
      previousRewrittenSentence: '上一句降AI结果。'
    });
    expect(messages[0].content).toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
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
    expect(messages[0]).toEqual({ role: 'system', content: ACADEMIC_V1_REWRITE_PROMPT_A });
    expect(messages[1].content).toContain('上两句：【前句一。】\n上一句：【前句二。】');
    expect(messages[1].content).toContain('严格输出2行');
    expect(messages[1].content).toContain('相邻句要有不同的句式和开头');
  });

  test('combined adapter uses the same layout', () => {
    expect(REWRITE_INPUT_TEMPLATE).toBe('处理括号中的文本，仅返回降AI结果：【{{input}}】');
    expect(buildRewritePrompt('当前句。')).toBe('处理括号中的文本，仅返回降AI结果：【当前句。】');
  });

  test('chooses A/B/C randomly', () => {
    const originalRandom = Math.random;
    try {
      Math.random = () => 0;
      expect(academicPromptVariantForIndex()).toBe('A');
      Math.random = () => 0.34;
      expect(academicPromptVariantForIndex()).toBe('B');
      Math.random = () => 0.99;
      expect(academicPromptVariantForIndex()).toBe('C');
    } finally {
      Math.random = originalRandom;
    }
  });

  test('unspecified prompt variant remains compatible with prompt A', () => {
    expect(getRewritePrompt('v1')).toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
    expect(getRewritePrompt('v1', {})).toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
  });

  test('B slot also places its prompt in user content', () => {
    const messages = buildRewriteMessages('当前句。', { promptVariant: 'B' });
    expect(messages[0].content).toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
    expect(messages[1].content).toBe('处理括号中的文本，仅返回降AI结果：【当前句。】');
  });

  test('C slot places prompt C in system content', () => {
    const messages = buildRewriteMessages('当前句。', { promptVariant: 'C' });
    expect(messages[0].content).toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
    expect(messages[1].content).toBe('处理括号中的文本，仅返回降AI结果：【当前句。】');
  });

  test('prompt variants can be overridden by environment variables and fall back when blank', () => {
    expect(getRewritePrompt('v1', { promptVariant: 'A', env: { REWRITE_PROMPT_A: 'A\ncustom' } }))
      .toBe('A\ncustom');
    expect(getRewritePrompt('v1', { promptVariant: 'B', env: { DEEPSEEK_REWRITE_PROMPT_B: 'B\\ncustom' } }))
      .toBe('B\ncustom');
    expect(getRewritePrompt('v1', { promptVariant: 'C', env: { REWRITE_PROMPT_C: '   ' } }))
      .toBe(ACADEMIC_V1_REWRITE_PROMPT_A);
    expect(REWRITE_INPUT_TEMPLATE).toBe('处理括号中的文本，仅返回降AI结果：【{{input}}】');
  });
});
