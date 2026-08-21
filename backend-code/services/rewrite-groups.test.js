const { groupRewriteTasks, buildChainedRewriteContext } = require('./rewrite-groups');

describe('five-sentence rewrite groups', () => {
  test('groups effective rewrite tasks five at a time', () => {
    const tasks = Array.from({ length: 10 }, (_, idx) => ({ idx }));
    expect(groupRewriteTasks(tasks, 5).map((group) => group.map((task) => task.idx)))
      .toEqual([[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]);
  });

  test('same-group adjacent sentence receives rewritten predecessor', () => {
    const sentences = [{ text: '原句一。', pIdx: 0 }, { text: '原句二。', pIdx: 0 }];
    const results = ['改写一。', '原句二。'];
    expect(buildChainedRewriteContext(sentences, results, { idx: 1, promptVariant: 'B' }, [{ idx: 0 }]))
      .toEqual({ previousRewrittenSentences: ['改写一。'], promptVariant: 'B' });
  });

  test('group boundary or failed predecessor receives no previous context', () => {
    const sentences = [{ text: '原句一。', pIdx: 0 }, { text: '原句二。', pIdx: 0 }];
    const results = ['原句一。', '原句二。'];
    expect(buildChainedRewriteContext(sentences, results, { idx: 1, promptVariant: 'B' }, null))
      .toEqual({ previousRewrittenSentences: [], promptVariant: 'B' });
  });

  test('paragraph boundary resets rewritten predecessor context', () => {
    const sentences = [{ text: '第一段。', pIdx: 0 }, { text: '第二段。', pIdx: 1 }];
    const results = ['第一段改写。', '第二段。'];
    expect(buildChainedRewriteContext(sentences, results, { idx: 1, promptVariant: 'B' }, [{ idx: 0 }]))
      .toEqual({ previousRewrittenSentences: [], promptVariant: 'B' });
  });

  test('injects the two immediately preceding rewritten results', () => {
    const sentences = [
      { text: '原句一。', pIdx: 0 },
      { text: '原句二。', pIdx: 0 },
      { text: '原句三。', pIdx: 0 }
    ];
    const results = ['改写一。', '改写二。', '原句三。'];
    expect(buildChainedRewriteContext(sentences, results, { idx: 2, promptVariant: 'A' }, [{ idx: 0 }, { idx: 1 }]))
      .toEqual({ previousRewrittenSentences: ['改写一。', '改写二。'], promptVariant: 'A' });
  });
});
