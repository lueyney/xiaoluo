const { groupRewriteTasks, buildChainedRewriteContext } = require('./rewrite-groups');

describe('four-sentence rewrite groups', () => {
  test('groups effective rewrite tasks four at a time', () => {
    const tasks = Array.from({ length: 10 }, (_, idx) => ({ idx }));
    expect(groupRewriteTasks(tasks, 4).map((group) => group.map((task) => task.idx)))
      .toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8, 9]]);
  });

  test('same-group adjacent sentence receives only rewritten predecessor', () => {
    const sentences = [{ text: '原句一。', pIdx: 0 }, { text: '原句二。', pIdx: 0 }];
    const results = ['改写一。', '原句二。'];
    expect(buildChainedRewriteContext(
      sentences,
      results,
      { idx: 1, promptVariant: 'B' },
      { idx: 0 }
    )).toEqual({
      previousRewrittenSentence: '改写一。',
      promptVariant: 'B'
    });
  });

  test('group boundary or failed predecessor receives no previous context', () => {
    const sentences = [{ text: '原句一。', pIdx: 0 }, { text: '原句二。', pIdx: 0 }];
    const results = ['原句一。', '原句二。'];
    expect(buildChainedRewriteContext(sentences, results, { idx: 1, promptVariant: 'B' }, null))
      .toEqual({
        previousRewrittenSentence: '',
        promptVariant: 'B'
      });
  });

  test('paragraph boundary resets both original and rewritten predecessor context', () => {
    const sentences = [{ text: '第一段。', pIdx: 0 }, { text: '第二段。', pIdx: 1 }];
    const results = ['第一段改写。', '第二段。'];
    expect(buildChainedRewriteContext(sentences, results, { idx: 1, promptVariant: 'B' }, { idx: 0 }))
      .toEqual({
        previousRewrittenSentence: '',
        promptVariant: 'B'
      });
  });
});
