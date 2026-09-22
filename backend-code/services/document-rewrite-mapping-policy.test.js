const {
  evaluateMappingPolicy,
  DEFAULT_MAX_UNMATCHED_SEGMENTS,
  DEFAULT_MAX_UNMATCHED_RATIO
} = require('./document-rewrite-mapping-policy');

describe('document rewrite mapping policy', () => {
  test('continues when only a small number of report segments are unmapped', () => {
    const result = evaluateMappingPolicy({
      eligibleSegments: 376,
      matchedSentences: 317,
      unmatchedSegments: 3
    });

    expect(result.shouldContinue).toBe(true);
    expect(result.reason).toBe('partial-unmatched');
    expect(result.unmatchedRatio).toBeCloseTo(3 / 376);
  });

  test('blocks when no marked body or no sentence is matched', () => {
    expect(evaluateMappingPolicy({ eligibleSegments: 0, matchedSentences: 0 }).shouldContinue).toBe(false);
    expect(evaluateMappingPolicy({ eligibleSegments: 10, matchedSentences: 0, unmatchedSegments: 10 }).shouldContinue).toBe(false);
  });

  test('blocks when unmatched segments exceed both safety limits', () => {
    const result = evaluateMappingPolicy({
      eligibleSegments: 100,
      matchedSentences: 70,
      unmatchedSegments: 8,
      maxUnmatchedSegments: 5,
      maxUnmatchedRatio: 0.02
    });

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('excessive-unmatched');
  });

  test('uses conservative defaults', () => {
    expect(DEFAULT_MAX_UNMATCHED_SEGMENTS).toBe(5);
    expect(DEFAULT_MAX_UNMATCHED_RATIO).toBe(0.02);
  });
});
