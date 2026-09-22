const {
  buildDocumentRewriteInput,
  rewriteDocumentSelection
} = require('./document-rewrite-pipeline');

describe('document rewrite uses the canonical AI rewrite pipeline', () => {
  test('only PDF-mapped Word sentences remain eligible for AI rewrite', () => {
    const sentences = [
      { text: '第一句正文足够长。', pIdx: 0, isTitle: false },
      { text: '第二句不在标红范围。', pIdx: 0, isTitle: false },
      { text: '第三句正文足够长。', pIdx: 1, isTitle: false }
    ];

    const input = buildDocumentRewriteInput(sentences, new Set([0, 2]));

    expect(input.sourceIndexes).toEqual([0, 2]);
    expect(input.sentences).toEqual([
      { ...sentences[0], sourceIndex: 0 },
      { ...sentences[2], sourceIndex: 2 }
    ]);
    expect(input.sentences).not.toContain(sentences[1]);
  });

  test('passes no document-specific prompt, rule, scheme or runtime settings', async () => {
    const onResult = jest.fn();
    const pipeline = {
      rewriteSentences: jest.fn(async (sentences, options) => {
        options.onResult('改写结果。', 0, sentences[0], false, { concurrency: 4 });
        return { results: ['改写结果。'], failedCount: 0 };
      })
    };
    const sentences = [
      { text: '不需要降重的句子。', pIdx: 0, isTitle: false },
      { text: '需要降重的正文句子。', pIdx: 0, isTitle: false }
    ];

    const outcome = await rewriteDocumentSelection(pipeline, sentences, new Set([1]), onResult);

    expect(pipeline.rewriteSentences).toHaveBeenCalledTimes(1);
    expect(pipeline.rewriteSentences.mock.calls[0][0]).toEqual([
      { ...sentences[1], sourceIndex: 1 }
    ]);
    const options = pipeline.rewriteSentences.mock.calls[0][1];
    expect(Object.keys(options)).toEqual(['onResult']);
    expect(options).not.toHaveProperty('rewriteVersion');
    expect(options).not.toHaveProperty('rewriteScheme');
    expect(options).not.toHaveProperty('concurrency');
    expect(options).not.toHaveProperty('initialConcurrency');
    expect(options).not.toHaveProperty('minConcurrency');
    expect(options).not.toHaveProperty('adaptiveConcurrency');
    expect(onResult).toHaveBeenCalledWith(
      '改写结果。',
      1,
      { ...sentences[1], sourceIndex: 1 },
      false,
      { concurrency: 4 }
    );
    expect(outcome.results).toEqual(['不需要降重的句子。', '改写结果。']);
  });

  test('fails closed when the shared AI rewrite entry point is unavailable', async () => {
    await expect(rewriteDocumentSelection({}, [], new Set(), jest.fn()))
      .rejects.toThrow('现有 AI 降重处理管线未配置');
  });
});
