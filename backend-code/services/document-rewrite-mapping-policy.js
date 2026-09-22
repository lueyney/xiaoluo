/**
 * Decide whether an imperfect PDF -> DOCX mapping is safe to continue.
 *
 * A report can contain a small amount of layout noise (headers, footers,
 * labels or line-break variants). Those fragments must not prevent reliably
 * mapped body sentences from reaching the canonical AI rewrite pipeline.
 */

const DEFAULT_MAX_UNMATCHED_SEGMENTS = 5;
const DEFAULT_MAX_UNMATCHED_RATIO = 0.02;

function finiteNonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function evaluateMappingPolicy({
  eligibleSegments = 0,
  matchedSentences = 0,
  unmatchedSegments = 0,
  maxUnmatchedSegments = process.env.DOCUMENT_REWRITE_MAX_UNMATCHED_SEGMENTS,
  maxUnmatchedRatio = process.env.DOCUMENT_REWRITE_MAX_UNMATCHED_RATIO
} = {}) {
  const eligible = Math.max(0, Math.trunc(finiteNonNegative(eligibleSegments, 0)));
  const matched = Math.max(0, Math.trunc(finiteNonNegative(matchedSentences, 0)));
  const unmatched = Math.max(0, Math.trunc(finiteNonNegative(unmatchedSegments, 0)));
  const segmentLimit = Math.trunc(finiteNonNegative(maxUnmatchedSegments, DEFAULT_MAX_UNMATCHED_SEGMENTS));
  const ratioLimit = Math.min(1, finiteNonNegative(maxUnmatchedRatio, DEFAULT_MAX_UNMATCHED_RATIO));
  const ratio = eligible > 0 ? unmatched / eligible : (unmatched > 0 ? 1 : 0);
  const noMarkedBody = eligible === 0;
  const noMatchedSentence = matched === 0;
  const excessiveUnmatched = unmatched > segmentLimit && ratio > ratioLimit;

  return {
    eligibleSegments: eligible,
    matchedSentences: matched,
    unmatchedSegments: unmatched,
    unmatchedRatio: ratio,
    maxUnmatchedSegments: segmentLimit,
    maxUnmatchedRatio: ratioLimit,
    shouldContinue: !noMarkedBody && !noMatchedSentence && !excessiveUnmatched,
    reason: noMarkedBody
      ? 'no-marked-body'
      : (noMatchedSentence
        ? 'no-matched-sentence'
        : (excessiveUnmatched ? 'excessive-unmatched' : (unmatched ? 'partial-unmatched' : null)))
  };
}

module.exports = {
  DEFAULT_MAX_UNMATCHED_SEGMENTS,
  DEFAULT_MAX_UNMATCHED_RATIO,
  evaluateMappingPolicy
};
