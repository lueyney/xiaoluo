const crypto = require('crypto');

const RED_TEXT_STORE_SCHEMA = 'red-text-store.v1';

function textLength(value) {
  return Array.from(String(value == null ? '' : value)).length;
}

function segmentText(segment) {
  return String(segment && segment.text != null ? segment.text : '');
}

function segmentCharCount(segment) {
  const declared = Number(segment && segment.charCount);
  return Number.isFinite(declared) && declared >= 0 ? declared : textLength(segmentText(segment));
}

function classifyRedSegment(segment) {
  const text = segmentText(segment).trim();
  if (/^\d+(?:\.\d+)?%$/u.test(text)) return 'metric';
  if (/^-\s*\d+\s*-$/.test(text)) return 'page-marker';
  if (/^[A-Za-z]/u.test(text)) return 'english';
  if (/^(?:摘\s*要|Abstract|第[一二三四五六七八九十]+章|\d+(?:\.\d+)+\s*[^，。；：]{0,40})/u.test(text)) return 'heading';
  return 'body';
}

function normalizeStoreText(value) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f\u00ad]/gu, '')
    .replace(/\s+/gu, '')
    .trim();
}

/**
 * Create the lossless intermediate representation for PDF red text.
 *
 * `segments` is authoritative: one item corresponds to one extracted PDF
 * colored line. No matching, OCR, sentence splitting, or AI rewriting is
 * performed here. Later stages may add DOCX mapping and rewrite results to the
 * same item without changing the original PDF evidence.
 */
function buildRedTextStore(report, source = {}) {
  const input = report && typeof report === 'object' ? report : {};
  const sourceSegments = Array.isArray(input.redSegments) ? input.redSegments : [];
  let cursor = 0;
  const segments = sourceSegments.map((segment, index) => {
    const rawText = segmentText(segment);
    const normalizedText = normalizeStoreText(rawText);
    const charCount = segmentCharCount(segment);
    const item = {
      id: `red-${String(index + 1).padStart(4, '0')}`,
      sequence: index,
      page: Number(segment && segment.page) || null,
      top: Number.isFinite(Number(segment && segment.top)) ? Number(segment.top) : null,
      rawText,
      normalizedText,
      charCount,
      kind: classifyRedSegment(segment),
      eligibleForRewrite: classifyRedSegment(segment) === 'body',
      sourceRange: { start: cursor, end: cursor + charCount },
      mapping: {
        status: 'unmapped',
        docxSentenceIndexes: [],
        reason: null
      },
      rewrite: {
        status: 'pending',
        originalText: normalizedText,
        rewrittenText: null,
        changed: false,
        reason: null
      }
    };
    cursor += charCount;
    return item;
  });

  const storedRawChars = segments.reduce((total, item) => total + item.charCount, 0);
  const reportRedChars = Number(input.redChars) || 0;
  const redText = segments.map((item) => item.rawText).join('\n');
  const normalizedRedText = segments.map((item) => item.normalizedText).filter(Boolean).join('\n');
  const digest = crypto.createHash('sha256').update(redText, 'utf8').digest('hex');

  return {
    schemaVersion: RED_TEXT_STORE_SCHEMA,
    createdAt: new Date().toISOString(),
    source: {
      fileName: source.fileName || null,
      sha256: source.sha256 || null
    },
    stats: {
      reportRedChars,
      storedRawChars,
      storedNormalizedChars: segments.reduce(
        (total, item) => total + textLength(item.normalizedText),
        0
      ),
      segmentCount: segments.length,
      bodySegmentCount: segments.filter((item) => item.eligibleForRewrite).length,
      bodyChars: segments.filter((item) => item.eligibleForRewrite)
        .reduce((total, item) => total + item.charCount, 0),
      coverage: reportRedChars === 0 ? null : storedRawChars / reportRedChars,
      exactCharCoverage: reportRedChars === storedRawChars
    },
    digest,
    redText,
    normalizedRedText,
    segments
  };
}

function redTextStoreSummary(store) {
  if (!store) return null;
  const segments = Array.isArray(store.segments) ? store.segments : [];
  const countByStatus = (field, values) => Object.fromEntries(values.map((status) => [
    status,
    segments.filter((item) => item[field] && item[field].status === status).length
  ]));
  return {
    schemaVersion: store.schemaVersion,
    digest: store.digest,
    stats: { ...store.stats },
    segmentCount: segments.length,
    mapping: countByStatus('mapping', ['mapped', 'unmapped', 'ambiguous', 'excluded']),
    rewrite: countByStatus('rewrite', ['pending', 'rewritten', 'unchanged', 'failed', 'skipped'])
  };
}

function applyReportMatchToStore(store, reportMatch, sourceSentences = []) {
  if (!store || !Array.isArray(store.segments)) return store;
  const matches = new Map((reportMatch && reportMatch.segmentMatches || [])
    .map((item) => [Number(item.segmentIndex), item]));

  store.segments.forEach((segment, segmentIndex) => {
    if (!segment.eligibleForRewrite) {
      segment.mapping = { status: 'excluded', docxSentenceIndexes: [], reason: segment.kind };
      segment.rewrite = {
        ...segment.rewrite,
        status: 'skipped',
        changed: false,
        reason: `excluded:${segment.kind}`
      };
      return;
    }
    const match = matches.get(segmentIndex);
    const indexes = match
      ? [...new Set((match.matches || []).map((item) => Number(item.index)).filter(Number.isInteger))]
      : [];
    if (!indexes.length) {
      segment.mapping = {
        status: 'unmapped',
        docxSentenceIndexes: [],
        reason: 'PDF 鏍囩孩鐗囨鏃犳硶鎸夐槄璇婚『搴忓畾浣嶅埌 DOCX 瀹屾暣鍙ュ瓙'
      };
      return;
    }
    segment.mapping = {
      status: match.status === 'ambiguous' ? 'ambiguous' : 'mapped',
      docxSentenceIndexes: indexes,
      matchTypes: [...new Set((match.matches || []).map((item) => item.matchType).filter(Boolean))],
      docxSentences: indexes.map((index) => String(sourceSentences[index] && sourceSentences[index].text || '')),
      reason: match.status === 'ambiguous' ? '一个红字段存在多个不确定候选' : null
    };
    segment.rewrite.originalText = segment.mapping.docxSentences.join('');
  });
  return store;
}

function applyRewriteResultsToStore(store, results = []) {
  if (!store || !Array.isArray(store.segments)) return store;
  store.segments.forEach((segment) => {
    if (!segment.mapping || segment.mapping.status === 'excluded') return;
    if (segment.mapping.status !== 'mapped') {
      segment.rewrite = {
        ...segment.rewrite,
        status: 'skipped',
        changed: false,
        reason: `mapping:${segment.mapping.status || 'unmapped'}`
      };
      return;
    }
    const indexes = segment.mapping.docxSentenceIndexes || [];
    const mappedResults = indexes.map((index) => results[index]).filter(Boolean);
    const originalText = mappedResults.map((item) => String(item.original || '')).join('');
    const rewrittenText = mappedResults
      .map((item) => String(item.rewritten == null ? item.original || '' : item.rewritten))
      .join('');
    const failed = mappedResults.some((item) => item.status === 'failed');
    const changed = !failed && mappedResults.some((item) => String(item.rewritten || '') !== String(item.original || ''));
    segment.rewrite = {
      ...segment.rewrite,
      status: failed ? 'failed' : (changed ? 'rewritten' : 'unchanged'),
      originalText,
      rewrittenText,
      changed,
      reason: failed ? '至少一个映射句 AI 改写失败并保留原文' : (changed ? null : 'AI 返回原句或该句被现有规则跳过')
    };
  });
  return store;
}

module.exports = {
  RED_TEXT_STORE_SCHEMA,
  buildRedTextStore,
  redTextStoreSummary,
  applyReportMatchToStore,
  applyRewriteResultsToStore,
  normalizeStoreText,
  classifyRedSegment
};
