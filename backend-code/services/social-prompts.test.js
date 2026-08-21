const {
  SOCIAL_SYSTEM_PROMPT,
  buildSocialMessages,
  cleanSocialContent,
  getPlatformProfile
} = require('./social-prompts');

describe('social prompts', () => {
  test('keeps the system message concise and injects platform guidance', () => {
    const messages = buildSocialMessages({
      platform: 'xiaohongshu',
      goal: '产品测评',
      material: '产品型号为 A7，售价 199 元。',
      requirements: '面向新手'
    });
    expect(messages[0]).toEqual({ role: 'system', content: SOCIAL_SYSTEM_PROMPT });
    expect(messages[1].content).toContain('发布平台：小红书');
    expect(messages[1].content).toContain('内容目标：产品测评');
    expect(messages[1].content).toContain('12至20字的高点击标题');
    expect(messages[1].content).toContain('反差、痛点、结果');
    expect(messages[1].content).toContain('<素材>');
    expect(messages[1].content).toContain('产品型号为 A7，售价 199 元。');
  });

  test.each([
    ['douyin', '前三秒留人', '纯口播正文'],
    ['wechat', '2至5个自然层次', '信息型小标题'],
    ['zhihu', '开头三行内', '适用条件、例外或争议点']
  ])('uses targeted guidance for %s', (platform, firstMarker, secondMarker) => {
    const messages = buildSocialMessages({
      platform,
      goal: '知识科普',
      material: '一段用于测试的社交内容素材。'
    });
    expect(messages[1].content).toContain(firstMarker);
    expect(messages[1].content).toContain(secondMarker);
  });

  test('uses different output budgets per platform', () => {
    expect(getPlatformProfile('wechat').maxTokens).toBeGreaterThan(getPlatformProfile('douyin').maxTokens);
  });

  test('removes an outer markdown fence while preserving content', () => {
    expect(cleanSocialContent('```markdown\n标题\n\n正文\n```')).toBe('标题\n\n正文');
  });

  test('preserves markdown decoration for frontend rendering', () => {
    expect(cleanSocialContent(
      '## **标题**\n\n> 这是_正文_。\n\n* 第一项\n* 第二项\n\n#周末看展 #经验分享'
    )).toBe('## **标题**\n\n> 这是_正文_。\n\n* 第一项\n* 第二项\n\n#周末看展 #经验分享');
  });
});
