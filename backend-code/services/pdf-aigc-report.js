const { execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const logger = require('../utils/logger');
const { buildRedTextStore, redTextStoreSummary } = require('./red-text-store');
const { extractPdfColorTextWithPdfJs } = require('./pdf-text-layer');

const execFileAsync = promisify(execFile);
const PYTHON_SCRIPT = path.join(__dirname, '..', 'scripts', 'extract_pdf_color_text.py');

function normalizeReportText(value) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f\u00ad]/gu, '')
    .replace(/\s+/gu, '')
    .replace(/-\s*1\s*-/gu, '')
    .trim();
}

function splitReportFragments(value) {
  const safePieces = String(value == null ? '' : value).match(/[^\u3002\uff01\uff1f!?\uff1b;]+[\u3002\uff01\uff1f!?\uff1b;]?/gu) || [];
  if (safePieces.length) {
    return safePieces.map((item) => normalizeReportText(item)).filter((item) => item.length >= 12);
  }
  return String(value == null ? '' : value)
    .split(/(?<=[閵嗗偊绱掗敍??閿?])/u)
    .map((item) => normalizeReportText(item))
    .filter((item) => item.length >= 12);
}

function pythonCandidates() {
  const candidates = [];
  if (process.env.PDF_PYTHON_PATH) candidates.push(process.env.PDF_PYTHON_PATH);
  if (process.env.PYTHON_PATH) candidates.push(process.env.PYTHON_PATH);
  const localAppData = process.env.LOCALAPPDATA || '';
  const userProfile = process.env.USERPROFILE || '';
  candidates.push(
    path.join(userProfile, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
    path.join(localAppData, '..', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
    'python'
  );
  return [...new Set(candidates.filter(Boolean))];
}

function isSpawnPermissionError(error) {
  const code = String(error && error.code || '').toUpperCase();
  const message = String(error && error.message || '');
  return ['EPERM', 'EACCES'].includes(code) || /spawn[^\r\n]*(?:EPERM|EACCES)/iu.test(message);
}

function validateExtractedReport(report) {
  if (!report || !Array.isArray(report.redSegments) || !Array.isArray(report.yellowSegments)
    || !Array.isArray(report.textLines)) {
    const error = new Error('PDF 解析结果结构不完整');
    error.code = 'PDF_TEXT_LAYER_INVALID';
    throw error;
  }
  if (!report.textLines.length) {
    const error = new Error('PDF 没有可提取的文字层；本功能不使用 OCR');
    error.code = 'PDF_TEXT_LAYER_NOT_FOUND';
    throw error;
  }
  return report;
}

async function extractPdfColorText(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('检测报告为空');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const executePython = options.executePython || execFileAsync;
  const parseInProcess = options.parseInProcess || extractPdfColorTextWithPdfJs;
  logger.info('PDF 检测报告解析开始', { sizeBytes: buffer.length, sha256 });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lunjun-aigc-report-'));
  const inputPath = path.join(tempDir, `${crypto.randomUUID()}.pdf`);
  await fs.writeFile(inputPath, buffer);
  let lastError;
  let contentError = null;
  let spawnPermissionError = null;
  try {
    for (const python of pythonCandidates()) {
      try {
        const result = await executePython(python, [PYTHON_SCRIPT, inputPath], {
          windowsHide: true,
          // An 80MB PDF may yield a large extracted-text JSON payload.
          maxBuffer: 100 * 1024 * 1024,
          timeout: 120000,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });
        const parsed = JSON.parse(String(result.stdout || '').trim());
        const report = validateExtractedReport({ ...parsed, parser: 'python-pdfplumber' });
        logger.info('PDF 检测报告解析完成', {
          parser: report.parser,
          sha256,
          textLines: report.textLines.length,
          redSegments: report.redSegments.length,
          redChars: Number(report.redChars) || 0
        });
        return report;
      } catch (error) {
        lastError = error;
        if (isSpawnPermissionError(error)) spawnPermissionError = error;
        else if (!['ENOENT', 'ENOTDIR'].includes(String(error && error.code || '').toUpperCase())) contentError = error;
        logger.warn('PDF Python 解析候选失败', {
          python,
          code: error && error.code || null,
          message: error && error.message || String(error),
          sha256
        });
      }
    }
    if (spawnPermissionError) {
      logger.warn('PDF Python 子进程被系统拒绝，启用进程内文字层解析', {
        code: spawnPermissionError.code || null,
        sha256
      });
      let report;
      try {
        report = validateExtractedReport(await parseInProcess(buffer));
      } catch (fallbackError) {
        const error = new Error('无法解析 PDF 检测报告: ' + (fallbackError && fallbackError.message || '进程内文字层解析失败'));
        error.code = fallbackError && fallbackError.code || 'AIGC_REPORT_PARSE_ERROR';
        throw error;
      }
      logger.info('PDF 检测报告解析完成', {
        parser: report.parser || 'pdfjs-text-layer',
        sha256,
        textLines: report.textLines.length,
        redSegments: report.redSegments.length,
        redChars: Number(report.redChars) || 0
      });
      return report;
    }
    const finalError = contentError || lastError;
    const error = new Error('无法解析 PDF 检测报告: ' + (finalError && finalError.message ? finalError.message : 'Python/pdfplumber 不可用'));
    error.code = 'AIGC_REPORT_PARSE_ERROR';
    throw error;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Parse a report and persist a lossless red-text intermediate representation.
 * The store deliberately does not attempt DOCX matching; it is the audit
 * boundary between PDF extraction and rewriting.
 */
async function extractPdfRedTextStore(buffer, source = {}) {
  const report = await extractPdfColorText(buffer);
  return buildRedTextStore(report, source);
}

function isNonBodyReportSegment(value) {
  const text = normalizeReportText(value);
  return !text || /^\d+(?:\.\d+)?%$/u.test(text) || /^-1-$/u.test(text);
}

function matchRedSentencesFromTextLayer(sourceSentences, report) {
  const sentences = Array.isArray(sourceSentences) ? sourceSentences : [];
  const segments = Array.isArray(report && report.redSegments) ? report.redSegments : [];
  const textLines = Array.isArray(report && report.textLines) ? report.textLines : [];
  const segmentByLine = new Map();
  segments.forEach((segment, segmentIndex) => {
    const key = `${Number(segment && segment.page) || 0}:${Number(segment && segment.top) || 0}`;
    if (!segmentByLine.has(key)) segmentByLine.set(key, segmentIndex);
  });
  let stream = '';
  const redRanges = [];
  for (const line of textLines) {
    const key = `${Number(line && line.page) || 0}:${Number(line && line.top) || 0}`;
    const segmentIndex = segmentByLine.get(key);
    const runs = Array.isArray(line && line.runs) && line.runs.length ? line.runs : [{ kind: null, text: line && line.text || '' }];
    for (const run of runs) {
      const normalized = normalizeReportText(run && run.text || '');
      if (!normalized) continue;
      const start = stream.length;
      stream += normalized;
      if (run && run.kind === 'red' && Number.isInteger(segmentIndex)) redRanges.push({ start, end: stream.length, segmentIndex });
    }
  }
  const matched = [];
  const mappedSegments = new Map();
  let documentCursor = 0;
  let redCursor = 0;
  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index] || {};
    const text = String(sentence.text == null ? '' : sentence.text).trim();
    const normalized = normalizeReportText(text);
    if (!normalized) continue;
    let position = stream.indexOf(normalized, documentCursor);
    let end = position >= 0 ? position + normalized.length : -1;
    let matchType = position >= 0 ? 'exact' : null;
    let matchedText = normalized;
    if (position < 0 && normalized.length >= 12) {
      // PDF extraction can lose a glyph or split a logical sentence across
      // visual lines. Fall back to the longest coloured fragment contained in
      // the DOCX sentence, while still advancing the shared red cursor.
      let best = null;
      for (const segment of segments) {
        const segmentText = normalizeReportText(segment && segment.text || '');
        if (!segmentText || !normalized.includes(segmentText)) continue;
        const segmentPosition = stream.indexOf(segmentText, redCursor);
        if (segmentPosition < 0) continue;
        if (!best || segmentText.length > best.text.length
          || (segmentText.length === best.text.length && segmentPosition < best.position)) {
          best = { text: segmentText, position: segmentPosition };
        }
      }
      if (best) {
        position = best.position;
        end = best.position + best.text.length;
        matchType = 'partial-sentence';
        matchedText = best.text;
        redCursor = end;
        documentCursor = Math.max(documentCursor, end);
      }
    }
    if (position < 0) continue;
    if (matchType === 'exact') {
      documentCursor = end;
      redCursor = Math.max(redCursor, end);
    }
    const overlaps = redRanges.filter((range) => range.end > position && range.start < end);
    if (!overlaps.length) continue;
    const coveredChars = overlaps
      .map((range) => Math.max(0, Math.min(end, range.end) - Math.max(position, range.start)))
      .reduce((total, value) => total + value, 0);
    const effectiveMatchType = matchType === 'exact' && coveredChars < normalized.length
      ? 'partial-sentence'
      : matchType;
    const segmentIndexes = [...new Set(overlaps.map((range) => range.segmentIndex).filter(Number.isInteger))];
    matched.push({ index, text, matchType: effectiveMatchType, segmentIndexes, matchedText });
    for (const segmentIndex of segmentIndexes) {
      if (!mappedSegments.has(segmentIndex)) mappedSegments.set(segmentIndex, []);
      mappedSegments.get(segmentIndex).push({ index, matchType: effectiveMatchType, matchedText });
    }
  }

  const eligibleSegmentIndexes = segments
    .map((segment, segmentIndex) => ({ segment, segmentIndex }))
    .filter(({ segment }) => !isNonBodyReportSegment(segment && segment.text || ''))
    .map(({ segmentIndex }) => segmentIndex);
  const unmatchedSegmentIndexes = eligibleSegmentIndexes
    .filter((segmentIndex) => !mappedSegments.has(segmentIndex));
  return {
    indexes: [...new Set(matched.map((item) => item.index))],
    matched,
    segmentMatches: [...mappedSegments.entries()].map(([segmentIndex, matches]) => ({
      segmentIndex,
      matches,
      status: 'mapped'
    })),
    unmatchedFragments: unmatchedSegmentIndexes
      .flatMap((segmentIndex) => splitReportFragments(segments[segmentIndex] && segments[segmentIndex].text || '')),
    unmatchedSegmentIndexes,
    redChars: Number(report && report.redChars) || 0,
    redSegmentCount: segments.length,
    usedFullTextLayer: true
  };
}

/**
 * Locate DOCX sentences in the report's reading order.
 *
 * The report contains visual PDF lines, while the DOCX splitter contains
 * complete sentences.  Therefore the PDF is represented as one ordered
 * character stream and every successful match advances the same cursor.  A
 * partial match advances by the matched fragment as well; otherwise the next
 * duplicate sentence would search the same report text and be marked red by
 * mistake (the old `partial-sentence` path had exactly this bug).
 */
function matchRedSentences(sourceSentences, report) {
  if (Array.isArray(report && report.textLines) && report.textLines.length) {
    return matchRedSentencesFromTextLayer(sourceSentences, report);
  }
  const sentences = Array.isArray(sourceSentences) ? sourceSentences : [];
  const segments = Array.isArray(report && report.redSegments) ? report.redSegments : [];
  const entries = [];
  let stream = '';
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const rawText = String(segments[segmentIndex] && segments[segmentIndex].text || '');
    const normalized = normalizeReportText(rawText.replace(/-\s*1\s*-/gu, ''));
    if (isNonBodyReportSegment(rawText) || !normalized) continue;
    const start = stream.length;
    stream += normalized;
    entries.push({ segmentIndex, rawText, normalized, start, end: stream.length });
  }

  const matched = [];
  const mappedSegments = new Map();
  const unmatchedFragments = [];
  let redCursor = 0;

  const mapEntries = (start, end, sentenceIndex, matchType, matchedText) => {
    const hits = entries.filter((entry) => entry.end > start && entry.start < end);
    for (const entry of hits) {
      if (!mappedSegments.has(entry.segmentIndex)) mappedSegments.set(entry.segmentIndex, []);
      const current = mappedSegments.get(entry.segmentIndex);
      if (!current.some((item) => item.index === sentenceIndex)) {
        current.push({ index: sentenceIndex, matchType, matchedText });
      }
    }
    return hits.map((entry) => entry.segmentIndex);
  };

  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index] || {};
    const text = String(sentence.text == null ? '' : sentence.text).trim();
    const normalized = normalizeReportText(text);
    if (!normalized) continue;

    // Match only at or after the current report cursor. This preserves the
    // occurrence of repeated sentences that is actually marked in the PDF.
    let position = stream.indexOf(normalized, redCursor);
    let matchType = position >= 0 ? 'exact' : null;
    let matchedText = normalized;

    if (position < 0 && normalized.length >= 12) {
      // A PDF line may contain only a portion of a DOCX sentence. Use the
      // longest report fragment that occurs after the cursor, then advance by
      // that fragment's end rather than leaving the cursor unchanged.
      let best = null;
      for (const entry of entries) {
        if (entry.end <= redCursor) continue;
        const fragments = splitReportFragments(entry.rawText)
          .filter((fragment) => fragment.length >= 12 && normalized.includes(fragment));
        for (const fragment of fragments) {
          const streamPosition = stream.indexOf(fragment, redCursor);
          if (streamPosition < 0) continue;
          if (!best || fragment.length > best.fragment.length
            || (fragment.length === best.fragment.length && streamPosition < best.position)) {
            best = { fragment, position: streamPosition, end: streamPosition + fragment.length };
          }
        }
      }
      if (best) {
        position = best.position;
        matchType = 'partial-sentence';
        matchedText = best.fragment;
        redCursor = best.end;
      }
    }

    if (position >= 0) {
      const end = matchType === 'exact' ? position + normalized.length : redCursor;
      const segmentIndexes = mapEntries(position, end, index, matchType, matchedText);
      matched.push({ index, text, matchType, segmentIndexes, matchedText });
      if (matchType === 'exact') redCursor = end;
    }
  }

  for (const entry of entries) {
    if (mappedSegments.has(entry.segmentIndex)) continue;
    const fragments = splitReportFragments(entry.rawText).filter((fragment) => fragment.length >= 12);
    if (fragments.length) unmatchedFragments.push(...fragments);
    else if (entry.normalized.length >= 12) unmatchedFragments.push(entry.normalized);
  }

  return {
    indexes: [...new Set(matched.map((item) => item.index))],
    matched,
    segmentMatches: [...mappedSegments.entries()].map(([segmentIndex, matches]) => ({
      segmentIndex,
      matches,
      status: 'mapped'
    })),
    unmatchedFragments: [...new Set(unmatchedFragments)],
    unmatchedSegmentIndexes: entries
      .map((entry) => entry.segmentIndex)
      .filter((segmentIndex) => !mappedSegments.has(segmentIndex)),
    redChars: Number(report && report.redChars) || 0,
    redSegmentCount: segments.length,
    usedFullTextLayer: false
  };
}

module.exports = {
  normalizeReportText,
  splitReportFragments,
  extractPdfColorText,
  extractPdfRedTextStore,
  buildRedTextStore,
  redTextStoreSummary,
  matchRedSentences,
  isSpawnPermissionError,
  validateExtractedReport
};
