const {
  FOUR_DRAFT_HEADS,
  FOUR_DRAFT_TAIL,
  assignFourDraftModes,
  buildFourDraftMessages,
  buildFourDraftPrompt,
  normalizeRewritePlan,
  parseFourDraftOutput,
  selectFourDraftMode
} = require('./rewrite-four-draft');

describe('four-draft rewrite plan', () => {
  test('normalizes the independent plan without changing legacy', () => {
    expect(normalizeRewritePlan('four-draft')).toBe('four-draft');
    expect(normalizeRewritePlan('new')).toBe('four-draft');
    expect(normalizeRewritePlan('legacy')).toBe('legacy');
    expect(normalizeRewritePlan()).toBe('legacy');
  });

  test('builds each prompt from its head and the shared tail', () => {
    const prompt = buildFourDraftPrompt({ mode: 'B', register: '学术书面', terms: '库存', sentence: '库存管理需要精确。' });
    expect(prompt).toContain(FOUR_DRAFT_HEADS.B);
    expect(prompt).toContain(FOUR_DRAFT_TAIL.split('\n')[0]);
    expect(prompt).toContain('语域：学术书面');
    expect(prompt).toContain('术语：库存 原样保留。');
    expect(prompt).toContain('【待改写】库存管理需要精确。');
    expect(prompt).not.toContain('{{SENT}}');
  });

  test('uses sentence-length and paragraph-position assignment rules', () => {
    const sentences = [
      { text: '段首需要展开说明当前研究背景并交代样本范围。', pIdx: 0 },
      { text: '短句。', pIdx: 0 },
      { text: '因此，结论需要回到前述证据。', pIdx: 0 },
      { text: '下一段的开头需要展开说明研究方法和样本范围。', pIdx: 1 }
    ];
    const modes = assignFourDraftModes(sentences);
    expect(['C', 'D']).toContain(modes[0]);
    expect(modes[1]).toBe('A');
    expect(modes[2]).toBe('A');
    expect(['C', 'D']).toContain(modes[3]);
    expect(selectFourDraftMode([{ text: '短句。', pIdx: 0 }], 0, { modes: [] })).toBe('A');
  });

  test('does not place three A modes in a row', () => {
    const sentences = Array.from({ length: 12 }, (_, index) => ({ text: `${index}句短文。`, pIdx: 0 }));
    const modes = assignFourDraftModes(sentences);
    for (let index = 2; index < modes.length; index += 1) {
      expect(modes.slice(index - 2, index + 1)).not.toEqual(['A', 'A', 'A']);
    }
  });

  test('parses the two-line model output', () => {
    expect(parseFourDraftOutput('【算子】L2,E4\n【改写】数据归口管理。')).toEqual({
      operators: 'L2,E4',
      text: '数据归口管理。'
    });
    expect(parseFourDraftOutput('【算子】L2\n改写正文。')).toEqual({ operators: 'L2', text: '改写正文。' });
  });

  test('sends the new plan as a sentence-specific system prompt', () => {
    const messages = buildFourDraftMessages('待处理句。', { fourDraftMode: 'A', previousOut: '无', previousOps: '无' });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('本句模式：A · 留白。');
    expect(messages[0].content).toContain('【待改写】待处理句。');
    expect(messages[1]).toEqual({ role: 'user', content: '严格按系统提示输出，不要添加解释。' });
  });
});
