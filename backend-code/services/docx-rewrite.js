/**
 * DOCX document rewrite helpers.
 *
 * This module intentionally does not depend on routes/rewrite.js.  It reads
 * and patches the OOXML inside a DOCX zip so paragraph/run formatting and all
 * unrelated package parts remain untouched.
 */

const JSZip = require('jszip');
const { xml2js, js2xml } = require('xml-js');
const crypto = require('crypto');

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TEXT_PARTS = new Set([
  'word/document.xml',
  'word/footnotes.xml',
  'word/endnotes.xml',
  'word/comments.xml',
  'word/header1.xml',
  'word/header2.xml',
  'word/header3.xml',
  'word/header4.xml',
  'word/header5.xml',
  'word/header6.xml',
  'word/header7.xml',
  'word/header8.xml',
  'word/header9.xml',
  'word/footer1.xml',
  'word/footer2.xml',
  'word/footer3.xml',
  'word/footer4.xml',
  'word/footer5.xml',
  'word/footer6.xml',
  'word/footer7.xml',
  'word/footer8.xml',
  'word/footer9.xml'
]);

const XML_OPTIONS = {
  compact: false,
  nativeType: false,
  alwaysArray: false,
  trim: false,
  ignoreDeclaration: false,
  ignoreInstruction: false,
  ignoreAttributes: false,
  ignoreComment: false,
  ignoreCdata: false,
  // xml-js otherwise drops text nodes that contain only spaces. Word uses
  // these nodes (usually with xml:space="preserve") for intentional blank
  // placeholders and spacing in forms, title blocks, and table cells. Keep
  // them in the parsed tree so a no-op document round-trip cannot alter the
  // original visual spacing.
  captureSpacesBetweenElements: true
};

// A paragraph containing any of these OOXML constructs is not safe for an
// automatic sentence rewrite. We still expose its visible text (marked as
// protected) so the UI can explain why it was skipped, while its XML stays
// byte-for-byte unchanged.
const COMPLEX_NODE_NAMES = new Set([
  'w:fldSimple', 'w:fldChar', 'w:instrText',
  'w:ins', 'w:del', 'w:moveFrom', 'w:moveTo',
  'w:sdt', 'w:hyperlink', 'w:txbxContent',
  'w:drawing', 'w:pict', 'w:object', 'w:embeddedObject',
  'w:footnoteReference', 'w:endnoteReference', 'w:commentReference',
  'w:bookmarkStart', 'w:bookmarkEnd', 'w:proofErr', 'w:lastRenderedPageBreak',
  // A manual line break is a layout marker, not a protected text container.
  // The replacement code only changes w:t payloads, so w:br/w:cr remain in
  // the original run and continue to preserve the in-paragraph line break.
  'w:tab', 'w:noBreakHyphen', 'w:softHyphen',
  'm:oMath', 'm:oMathPara'
]);

const SENTENCE_END_CHARS = new Set(['。', '！', '？', '!', '?', '.', '．', '…']);
const CLOSING_QUOTE_CHARS = new Set(['”', '’', '」', '』', '》', '〉', '〕', '】', '）', ')', ']', '}', '》']);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function childElements(node, name) {
  return (node && node.elements || []).filter((item) => item && item.type === 'element' && (!name || item.name === name));
}

function allDescendants(node, predicate, out = []) {
  if (!node || !node.elements) return out;
  for (const child of node.elements) {
    if (child.type === 'element') {
      if (predicate(child)) out.push(child);
      allDescendants(child, predicate, out);
    }
  }
  return out;
}

function textFromNode(node) {
  if (!node || !node.elements) return '';
  return node.elements.filter((item) => item.type === 'text' || item.type === 'cdata').map((item) => item.text || '').join('');
}

function setTextNode(node, value) {
  // Keep every existing w:t attribute stable across a text replacement. In
  // particular, do not remove an original xml:space="preserve" merely
  // because the generated text no longer starts/ends with a literal space:
  // changing that attribute is an unnecessary OOXML diff and can alter Word's
  // whitespace handling around the run. A preserve marker is added only when
  // the replacement itself introduces leading/trailing spaces and the source
  // node did not already carry one.
  const attrs = node.attributes ? Object.assign({}, node.attributes) : {};
  const text = String(value == null ? '' : value);
  // Replace only the text child; this keeps w:t attributes and run properties.
  node.elements = [{ type: 'text', text }];
  if (text.startsWith(' ') || text.endsWith(' ')) {
    attrs['xml:space'] = 'preserve';
  }
  if (Object.keys(attrs).length) {
    node.attributes = attrs;
  } else if (node.attributes) {
    // Preserve the parser's original no-attribute shape where possible.
    delete node.attributes;
  }
}

function isTextElement(node) {
  // Deleted revision text (w:delText) is deliberately excluded: it is not
  // visible document content and changing it would corrupt change tracking.
  return node && node.type === 'element' && node.name === 'w:t';
}

function paragraphTextNodes(paragraph) {
  const nodes = [];
  function visit(node) {
    if (!node || !node.elements) return;
    for (const child of node.elements) {
      if (!child || child.type !== 'element') continue;
      // Text boxes can contain nested w:p elements. They are collected as
      // their own paragraphs, so do not count them twice in the outer one.
      if (child.name === 'w:p') continue;
      if (isTextElement(child)) nodes.push(child);
      else visit(child);
    }
  }
  visit(paragraph);
  return nodes;
}

function findComplexNodes(paragraph) {
  return allDescendants(paragraph, (node) => COMPLEX_NODE_NAMES.has(node.name));
}

function hasComplexNodes(paragraph) {
  return findComplexNodes(paragraph).length > 0;
}

function paragraphTextInfo(paragraph) {
  const lines = [];
  let current = { text: '', spans: [] };
  const finishLine = () => {
    lines.push(current);
    current = { text: '', spans: [] };
  };
  // A manual Word break separates logical lines.  We retain the original
  // w:br/w:cr node in place and build an independent text map for each line,
  // so the AI receives the same line boundaries the user sees.
  function visit(node) {
    if (!node || !node.elements) return;
    for (const child of node.elements) {
      if (!child || child.type !== 'element') continue;
      if (child.name === 'w:p' && child !== paragraph) continue;
      if (isTextElement(child)) {
        const value = textFromNode(child);
        const start = current.text.length;
        current.text += value;
        current.spans.push({ node: child, start, end: start + value.length });
      } else if (child.name === 'w:br' || child.name === 'w:cr') {
        finishLine();
      } else {
        visit(child);
      }
    }
  }
  visit(paragraph);
  finishLine();
  return { lines };
}

/**
 * Split a replacement across the original text spans without changing the
 * surrounding w:r / w:rPr structure. There is no semantically perfect way to
 * know which newly generated word should be bold/coloured when the wording is
 * completely different, so we retain the original formatting boundaries by
 * projecting them proportionally onto the replacement text.
 *
 * When the replacement is long enough, every original non-empty formatting
 * span receives at least one character. This prevents the old failure mode in
 * which the complete sentence inherited the first run's formatting while all
 * later formatted runs were emptied.
 */
function allocateReplacementByOriginalSpans(value, weights) {
  const characters = Array.from(String(value == null ? '' : value));
  const allocations = weights.map(() => 0);
  const positiveIndexes = weights
    .map((weight, index) => ({ index, weight: Math.max(0, Number(weight) || 0) }))
    .filter((item) => item.weight > 0);
  if (!characters.length || !positiveIndexes.length) {
    return { characters, allocations };
  }

  // Keep every original visible formatting span represented whenever the new
  // sentence has enough characters to do so.
  const minimumPerSpan = characters.length >= positiveIndexes.length ? 1 : 0;
  if (minimumPerSpan) {
    for (const item of positiveIndexes) allocations[item.index] = 1;
  }

  let remaining = characters.length - (minimumPerSpan * positiveIndexes.length);
  if (remaining <= 0) return { characters, allocations };

  const totalWeight = positiveIndexes.reduce((sum, item) => sum + item.weight, 0);
  const remainders = [];
  let assigned = 0;
  for (const item of positiveIndexes) {
    const exact = (remaining * item.weight) / totalWeight;
    const whole = Math.floor(exact);
    allocations[item.index] += whole;
    assigned += whole;
    remainders.push({ index: item.index, remainder: exact - whole });
  }

  // Largest-remainder apportionment makes the result deterministic and keeps
  // the total allocation exactly equal to the replacement length.
  remainders.sort((a, b) => (b.remainder - a.remainder) || (a.index - b.index));
  for (let index = 0; index < remaining - assigned; index++) {
    allocations[remainders[index % remainders.length].index]++;
  }
  return { characters, allocations };
}

/**
 * Sentence splitting deliberately mirrors the existing UI semantics (Chinese
 * full stops/question/exclamation marks) while retaining every character in
 * the returned spans.  A final fragment without punctuation is also included.
 */
function splitSentenceSpans(text) {
  const result = [];
  let start = 0;
  let quoteDepth = 0;
  const pushSpan = (end) => {
    const raw = text.slice(start, end);
    if (!raw.trim()) {
      start = end;
      return;
    }
    // Keep source whitespace attached to the span while sending only visible
    // content to the AI callback.
    const leading = raw.match(/^\s*/u)?.[0] || '';
    const trailing = raw.match(/\s*$/u)?.[0] || '';
    const contentStart = start + leading.length;
    const contentEnd = start + raw.length - trailing.length;
    const content = text.slice(contentStart, contentEnd);
    if (content) result.push({ start, end, text: raw, aiText: content, leading, trailing, contentStart, contentEnd });
    start = end;
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if ('“「『（《〈【'.includes(char)) quoteDepth++;
    else if (CLOSING_QUOTE_CHARS.has(char)) quoteDepth = Math.max(0, quoteDepth - 1);
    if (!SENTENCE_END_CHARS.has(char)) continue;
    // Do not split decimal numbers such as 3.14. An end mark inside a quote
    // is accepted when it is immediately followed by the matching closing
    // quote/bracket (e.g. “你好。”下一句).
    if ((char === '.' || char === '．') && /\d/u.test(text[index - 1] || '') && /\d/u.test(text[index + 1] || '')) continue;
    if (quoteDepth > 0) {
      let close = index + 1;
      while (close < text.length && CLOSING_QUOTE_CHARS.has(text[close])) close++;
      if (close === index + 1) continue;
    }
    // Consume repeated punctuation (e.g. “？！”) and closing quotes/brackets
    // so they stay attached to the same sentence.
    let end = index + 1;
    while (end < text.length && SENTENCE_END_CHARS.has(text[end])) end++;
    while (end < text.length && CLOSING_QUOTE_CHARS.has(text[end])) end++;
    pushSpan(end);
    start = end;
    index = end - 1;
  }
  if (start < text.length) {
    pushSpan(text.length);
  }
  return result;
}

function shouldRewriteSentence(sentence, options = {}) {
  if (typeof options.shouldRewrite === 'function') return !!options.shouldRewrite(sentence);
  const minimum = Number.isFinite(options.minLength) ? options.minLength : 6;
  const value = sentence.aiText || sentence.text || '';
  // Headings and short labels generally have no sentence punctuation and are
  // safer to leave untouched in document mode.
  if (value.length < minimum) return false;
  if (!/[\u3002\uff01\uff1f!?\.．]/u.test(value) && value.length < minimum * 2) return false;
  return true;
}

/**
 * Document mode has a stricter contract than the normal text page: one input
 * sentence must stay one output sentence. Reject model explanations, lists,
 * paragraphs, or a second sentence so they cannot shift later DOCX mappings.
 */
function validateOneToOneReplacement(original, replacement) {
  const source = String(original == null ? '' : original).trim();
  const text = String(replacement == null ? '' : replacement).trim();
  if (!text) {
    const error = new Error('AI 返回空句子');
    error.code = 'DOCX_EMPTY_REWRITE';
    throw error;
  }
  if (/\r|\n/u.test(text)) {
    const error = new Error('AI 返回了多段内容，已保留原句');
    error.code = 'DOCX_MULTIPARAGRAPH_REWRITE';
    throw error;
  }
  if (splitSentenceSpans(text).length !== 1) {
    const error = new Error('AI 返回了多句内容，已保留原句');
    error.code = 'DOCX_MULTISENTENCE_REWRITE';
    throw error;
  }
  const explanationPatterns = [
    /请提供.{0,20}(?:原文|文本|内容)/u,
    /(?:无法|不能|不足以).{0,20}(?:改写|降重|处理|判断|确定)/u,
    /(?:待处理|输入).{0,12}(?:不完整|为空|缺失)/u,
    /^(?:改写|降重|结果|说明)[:：]/u
  ];
  if (explanationPatterns.some((pattern) => pattern.test(text))) {
    const error = new Error('AI 返回了解释性内容，已保留原句');
    error.code = 'DOCX_EXPLANATION_REWRITE';
    throw error;
  }
  const maxLength = Math.max(source.length * 3, source.length + 80);
  if (text.length > maxLength) {
    const error = new Error('AI 返回内容异常扩写，已保留原句');
    error.code = 'DOCX_OVERLONG_REWRITE';
    throw error;
  }
  return text;
}

// Document mode already has a stable sentence ID for every request and uses
// the returned value only for that same ID.  Keep that path deliberately
// lightweight: an empty response falls back to the original sentence, while
// punctuation/count/explanation/length heuristics are left to the existing AI
// prompt instead of silently rejecting otherwise valid rewrites.  The strict
// validator above remains available to callers that explicitly need the old
// contract (and keeps the text-mode helper API backwards compatible).
function validateDocumentReplacement(replacement) {
  // A model must not create new paragraph/line breaks in a text node.  The
  // original DOCX break elements/paragraph boundaries stay in the package;
  // normalize accidental response newlines to a regular space and leave the
  // existing break nodes untouched.
  const text = String(replacement == null ? '' : replacement)
    .replace(/\r\n?/gu, '\n')
    .replace(/\n+/gu, ' ')
    .trim();
  if (!text) {
    const error = new Error('AI 返回空句子');
    error.code = 'DOCX_EMPTY_REWRITE';
    throw error;
  }
  return text;
}

function makeId(part, paragraphIndex, sentenceIndex) {
  const safePart = part.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safePart.replace(/^word_/, '')}-P${paragraphIndex + 1}-S${sentenceIndex + 1}`;
}

function parseXmlPart(xml, part) {
  try {
    return xml2js(xml, XML_OPTIONS);
  } catch (error) {
    const wrapped = new Error(`无法解析 DOCX XML: ${part}`);
    wrapped.code = 'DOCX_XML_PARSE_ERROR';
    wrapped.cause = error;
    throw wrapped;
  }
}

function findBody(root) {
  const bodies = allDescendants(root, (node) => node.name === 'w:body');
  return bodies[0] || null;
}

// Return paragraphs in the same document order as allDescendants(), while
// carrying a protected-ancestor flag.  A text box, field, revision, drawing,
// hyperlink, or other complex container can contain its own nested w:p; the
// nested paragraph must inherit the protection so it is never rewritten by
// the separate inner-paragraph pass.
function paragraphContexts(root) {
  const result = [];
  let paragraphIndex = 0;
  function visit(node, insideComplex) {
    if (!node || !node.elements) return;
    for (const child of node.elements) {
      if (!child || child.type !== 'element') continue;
      if (child.name === 'w:p') {
        result.push({ paragraph: child, paragraphIndex, protectedByAncestor: insideComplex });
        paragraphIndex++;
        // Do not mark the paragraph itself as complex just because it is a
        // paragraph; descendants such as w:txbxContent still propagate their
        // own complex-container flag to nested paragraphs.
        visit(child, insideComplex);
        continue;
      }
      visit(child, insideComplex || COMPLEX_NODE_NAMES.has(child.name));
    }
  }
  visit(root, false);
  return result;
}

function collectParagraphRecords(root, part) {
  const records = [];
  const paragraphs = [];
  for (const context of paragraphContexts(root)) {
    const { paragraph, paragraphIndex, protectedByAncestor } = context;
    const info = paragraphTextInfo(paragraph);
    paragraphs.push({ part, paragraphIndex, paragraph, lines: info.lines });
    const protectedParagraph = protectedByAncestor || hasComplexNodes(paragraph);
    let sentenceIndex = 0;
    info.lines.forEach((line) => {
      if (!line.text) return;
      splitSentenceSpans(line.text).forEach((span) => {
        const text = span.aiText;
        records.push({
          id: makeId(part, paragraphIndex, sentenceIndex),
          part,
          paragraphIndex,
          sentenceIndex,
          text,
          originalText: span.text,
          aiText: text,
          hash: sha256(text),
          paragraph,
          line,
          textSpans: line.spans,
          sentenceSpan: span,
          start: span.start,
          end: span.end,
          isTitle: !/[\u3002\uff01\uff1f!?\.．]/u.test(text),
          protected: protectedParagraph
        });
        sentenceIndex++;
      });
    });
  }
  records.paragraphs = paragraphs;
  return records;
}

function mapOffsetToTextNode(spans, offset, preferEnd = false) {
  for (const span of spans) {
    if (offset >= span.start && (offset < span.end || (preferEnd && offset === span.end))) return span;
  }
  return spans[spans.length - 1] || null;
}

function replaceParagraphSentence(record, replacement) {
  const paragraphText = record.line.text;
  const current = paragraphText.slice(record.start, record.end);
  // The record is a snapshot. Refuse to patch if another operation already
  // changed the paragraph; this prevents applying a stale AI response.
  if (current !== record.originalText) {
    const error = new Error(`句子内容已变化，拒绝覆盖: ${record.id}`);
    error.code = 'DOCX_STALE_SENTENCE';
    throw error;
  }

  const normalized = String(replacement == null ? '' : replacement).trim();
  if (!normalized) return { changed: false, text: record.aiText };
  const replacementText = `${record.sentenceSpan.leading}${normalized}${record.sentenceSpan.trailing}`;
  const start = record.start;
  const end = record.end;
  const spans = record.textSpans;
  if (!spans.some((span) => span.end > start && span.start < end)) {
    return { changed: false, text: record.aiText };
  }

  // Rebuild only the text payloads while retaining every original w:r and
  // w:rPr.  The replacement is apportioned across the exact run bands that
  // the sentence occupied; this helper is kept in sync with the batch path in
  // applyParagraphOperations so callers cannot accidentally fall back to the
  // old first-run-only behavior.
  const values = spans.map(() => '');
  appendOriginalRange(values, spans, paragraphText, 0, start);
  appendReplacementRange(values, spans, start, end, replacementText);
  appendOriginalRange(values, spans, paragraphText, end, paragraphText.length);
  spans.forEach((span, index) => {
    if (textFromNode(span.node) !== values[index]) setTextNode(span.node, values[index]);
  });
  return { changed: true, text: normalized };
}

function appendOriginalRange(nodeValues, spans, sourceText, start, end) {
  if (end <= start) return;
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index];
    const from = Math.max(start, span.start);
    const to = Math.min(end, span.end);
    if (to > from) nodeValues[index] += sourceText.slice(from, to);
  }
}

// Put replacement text back into the same text-node/run style bands that the
// original sentence occupied.  The previous implementation put the entire
// replacement into the first affected w:t and emptied the remaining nodes;
// that made a sentence which crossed bold/colour/font runs appear to lose its
// formatting.  We keep every existing node (and therefore every w:rPr) and
// split the new text across those nodes in proportion to their original span.
function splitTextByWeights(value, weights) {
  if (!weights.length) return [];
  const allocation = allocateReplacementByOriginalSpans(value, weights);
  const pieces = [];
  let cursor = 0;
  for (const count of allocation.allocations) {
    pieces.push(allocation.characters.slice(cursor, cursor + count).join(''));
    cursor += count;
  }
  return pieces;
}

function appendReplacementRange(nodeValues, spans, start, end, replacementText) {
  if (end <= start || !spans.length) return;
  const affected = [];
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index];
    const overlap = Math.min(end, span.end) - Math.max(start, span.start);
    if (overlap > 0) affected.push({ index, weight: overlap });
  }
  if (!affected.length) return;
  const pieces = splitTextByWeights(replacementText, affected.map((item) => item.weight));
  affected.forEach((item, index) => {
    nodeValues[item.index] += pieces[index] || '';
  });
}

function applyParagraphOperations(records, replacementMap, options = {}) {
  const sourceText = records[0].line.text;
  const snapshotText = records[0].textSpans.map((span) => textFromNode(span.node)).join('');
  if (sourceText !== snapshotText) {
    const error = new Error(`段落内容已变化，拒绝覆盖: ${records[0].part}-P${records[0].paragraphIndex + 1}`);
    error.code = 'DOCX_STALE_SENTENCE';
    throw error;
  }
  const spans = records[0].textSpans;
  const nodeValues = spans.map(() => '');
  const operations = [];
  for (const record of records) {
    if (!replacementMap.has(record.id)) continue;
    const replacement = replacementMap.get(record.id);
    if ((record.protected && options.skipProtected !== false)
      || (record.isTitle && options.skipTitles !== false)) continue;
    const normalized = String(replacement == null ? '' : replacement).trim();
    if (!normalized || normalized === record.aiText) continue;
    const replacementText = `${record.sentenceSpan.leading}${normalized}${record.sentenceSpan.trailing}`;
    operations.push({ record, replacementText, normalized });
  }
  operations.sort((a, b) => a.record.start - b.record.start);
  let cursor = 0;
  const changed = [];
  for (const operation of operations) {
    const { record, replacementText, normalized } = operation;
    if (record.start < cursor) {
      const error = new Error(`句子范围重叠，拒绝覆盖: ${record.id}`);
      error.code = 'DOCX_OVERLAPPING_SENTENCE';
      throw error;
    }
    appendOriginalRange(nodeValues, spans, sourceText, cursor, record.start);
    appendReplacementRange(nodeValues, spans, record.start, record.end, replacementText);
    cursor = record.end;
    if (normalized !== record.aiText) changed.push({ id: record.id, originalText: record.aiText, text: normalized });
  }
  appendOriginalRange(nodeValues, spans, sourceText, cursor, sourceText.length);
  spans.forEach((span, index) => {
    if (textFromNode(span.node) !== nodeValues[index]) setTextNode(span.node, nodeValues[index]);
  });
  return changed;
}

function buildDocumentModel(parts) {
  const records = [];
  const paragraphs = [];
  for (const [part, parsed] of parts.entries()) {
    const partRecords = collectParagraphRecords(parsed, part);
    records.push(...partRecords);
    paragraphs.push(...(partRecords.paragraphs || []));
  }
  return { records, paragraphs };
}

async function loadDocx(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (error) {
    const wrapped = new Error('上传文件不是有效的 DOCX 压缩包');
    wrapped.code = 'INVALID_DOCX';
    wrapped.cause = error;
    throw wrapped;
  }
  const partEntries = new Map();
  const originalXml = new Map();
  const availableParts = Object.keys(zip.files).filter((part) => (
    TEXT_PARTS.has(part) || /^word\/(?:header|footer)\d+\.xml$/i.test(part)
  ));
  for (const part of availableParts) {
    const entry = zip.file(part);
    if (!entry) continue;
    const xml = await entry.async('string');
    originalXml.set(part, xml);
    partEntries.set(part, parseXmlPart(xml, part));
  }
  if (!partEntries.has('word/document.xml')) {
    const error = new Error('DOCX 缺少 word/document.xml');
    error.code = 'INVALID_DOCX';
    throw error;
  }
  const model = buildDocumentModel(partEntries);
  return {
    zip,
    parts: partEntries,
    originalXml,
    dirtyParts: new Set(),
    sentences: model.records,
    paragraphs: model.paragraphs,
    sourceBuffer: buffer
  };
}

function extractSentences(document) {
  if (!document || !Array.isArray(document.sentences)) throw new TypeError('无效的 DOCX 文档模型');
  return document.sentences.map((record) => ({
    id: record.id,
    part: record.part,
    paragraphIndex: record.paragraphIndex,
    sentenceIndex: record.sentenceIndex,
    text: record.aiText,
    originalText: record.aiText,
    hash: record.hash,
    isTitle: record.isTitle,
    protected: !!record.protected
  }));
}

// Return the document's visible text in original reading order. Paragraph and
// manual line boundaries are represented as newline characters so the existing
// text-mode splitter receives the same layout boundaries as the source DOCX.
function extractDocumentText(document) {
  if (!document || !Array.isArray(document.sentences)) throw new TypeError('无效的 DOCX 文档模型');
  if (Array.isArray(document.paragraphs)) {
    return document.paragraphs
      .map((paragraph) => paragraph.lines.map((line) => line.text).join('\n'))
      .join('\n')
      .replace(/\n+$/u, '');
  }
  const paragraphs = [];
  const paragraphMap = new Map();
  for (const record of document.sentences) {
    let paragraph = paragraphMap.get(record.paragraph);
    if (!paragraph) {
      paragraph = { lines: [], lineMap: new Map() };
      paragraphMap.set(record.paragraph, paragraph);
      paragraphs.push(paragraph);
    }
    let line = paragraph.lineMap.get(record.line);
    if (!line) {
      line = [];
      paragraph.lineMap.set(record.line, line);
      paragraph.lines.push(line);
    }
    line.push(record.originalText);
  }
  return paragraphs.map((paragraph) => paragraph.lines.map((line) => line.join('')).join('\n')).join('\n');
}

function applyReplacementsInOrder(document, replacements, options = {}) {
  if (!Array.isArray(replacements)) throw new TypeError('替换结果必须是数组');
  // Document mode normally passes the exact sentence list produced by the
  // existing text AI splitter.  That list is the source of truth: result[i]
  // replaces sentence[i].  Do not convert it to an ID map, because the DOCX
  // parser may split a line differently from the text-mode splitter (for
  // example around ASCII full stops).
  if (!Array.isArray(options.sourceSentences)) {
    throw new TypeError('按顺序替换必须传入原 AI 分句数组');
  }
  return applyPipelineReplacements(document, options.sourceSentences, replacements, options);
}

function orderedLineEntries(document) {
  if (Array.isArray(document.paragraphs)) {
    const entries = [];
    for (const paragraph of document.paragraphs) {
      for (const line of paragraph.lines) {
        entries.push({
          part: paragraph.part,
          paragraphIndex: paragraph.paragraphIndex,
          paragraph: paragraph.paragraph,
          line,
          textSpans: line.spans
        });
      }
    }
    return entries;
  }
  const entries = [];
  const seen = new Set();
  for (const record of (document.sentences || [])) {
    if (!record.line || seen.has(record.line)) continue;
    seen.add(record.line);
    entries.push(record);
  }
  return entries;
}

function documentTextLayout(document) {
  const lines = orderedLineEntries(document);
  let cursor = 0;
  lines.forEach((line, index) => {
    line.globalStart = cursor;
    line.globalEnd = cursor + line.line.text.length;
    cursor = line.globalEnd;
    if (index < lines.length - 1) cursor += 1;
  });
  return { lines, text: lines.map((line) => line.line.text).join('\n') };
}

/**
 * Apply the original text-mode AI results directly by array order.
 * `sourceSentences` and `replacements` are parallel arrays from
 * splitSentences()/rewriteSentences().  The DOCX is only used to locate each
 * source string and patch that range; no sentence IDs or maps participate.
 */
function applyPipelineReplacements(document, sourceSentences, replacements, options = {}) {
  const layout = documentTextLayout(document);
  const lines = layout.lines;
  let globalCursor = 0;
  const grouped = new Map();

  for (let index = 0; index < sourceSentences.length; index++) {
    const sentence = sourceSentences[index] || {};
    const text = String(sentence.text == null ? '' : sentence.text).trim();
    if (!text) continue;
    const start = layout.text.indexOf(text, globalCursor);
    if (start < 0) {
      const error = new Error(`无法按顺序定位第 ${index + 1} 句原文`);
      error.code = 'DOCX_SENTENCE_ORDER_MISMATCH';
      throw error;
    }
    const end = start + text.length;
    const entry = lines.find((candidate) => start >= candidate.globalStart && end <= candidate.globalEnd);
    if (!entry || !entry.line || !Array.isArray(entry.textSpans)) {
      const error = new Error(`无法按顺序定位第 ${index + 1} 句原文`);
      error.code = 'DOCX_SENTENCE_ORDER_MISMATCH';
      throw error;
    }
    const line = entry.line;
    const record = {
      part: entry.part,
      paragraphIndex: entry.paragraphIndex,
      line,
      textSpans: entry.textSpans,
      sentenceSpan: { leading: '', trailing: '' },
      start: start - entry.globalStart,
      end: end - entry.globalStart,
      aiText: text,
      originalText: text,
      isTitle: !!sentence.isTitle,
      protected: false,
      replacement: replacements[index] == null ? text : String(replacements[index])
    };
    record.index = index;
    if (!grouped.has(line)) grouped.set(line, []);
    grouped.get(line).push(record);
    globalCursor = end;
  }

  const changed = [];
  for (const records of grouped.values()) {
    const paragraphChanges = applyOrderedParagraphOperations(records, options);
    changed.push(...paragraphChanges);
    if (paragraphChanges.length) document.dirtyParts.add(records[0].part);
  }
  return { changed, skipped: [], total: sourceSentences.length };
}

function applyOrderedParagraphOperations(records, options = {}) {
  const sourceText = records[0].line.text;
  const snapshotText = records[0].textSpans.map((span) => textFromNode(span.node)).join('');
  if (sourceText !== snapshotText) {
    const error = new Error(`段落内容已变化，拒绝覆盖: ${records[0].part}-P${records[0].paragraphIndex + 1}`);
    error.code = 'DOCX_STALE_SENTENCE';
    throw error;
  }
  const spans = records[0].textSpans;
  const nodeValues = spans.map(() => '');
  const sorted = records.slice().sort((a, b) => a.start - b.start);
  let cursor = 0;
  const changed = [];
  for (const record of sorted) {
    const normalized = String(record.replacement == null ? '' : record.replacement).trim();
    appendOriginalRange(nodeValues, spans, sourceText, cursor, record.start);
    if (normalized && normalized !== record.aiText) {
      appendReplacementRange(nodeValues, spans, record.start, record.end, normalized);
      changed.push({ index: record.index, originalText: record.aiText, text: normalized });
    } else {
      appendOriginalRange(nodeValues, spans, sourceText, record.start, record.end);
    }
    cursor = record.end;
  }
  appendOriginalRange(nodeValues, spans, sourceText, cursor, sourceText.length);
  spans.forEach((span, index) => {
    if (textFromNode(span.node) !== nodeValues[index]) setTextNode(span.node, nodeValues[index]);
  });
  return changed;
}

function normalizeReplacements(replacements) {
  if (Array.isArray(replacements)) {
    const map = new Map();
    for (const item of replacements) {
      if (!item || typeof item.id !== 'string') continue;
      map.set(item.id, item.text == null ? '' : String(item.text));
    }
    return map;
  }
  if (replacements && typeof replacements === 'object') {
    return new Map(Object.entries(replacements).map(([id, value]) => [id, value == null ? '' : String(value)]));
  }
  throw new TypeError('替换结果必须是数组或对象');
}

/**
 * Apply a strict one-to-one replacement map. Unknown IDs and hash mismatches
 * are rejected by default; callers may opt into allowing missing IDs for
 * skipped/failed sentences. Every replacement is applied to its original
 * paragraph snapshot, preserving the original run/paragraph XML structure.
 */
function applyReplacements(document, replacements, options = {}) {
  const map = normalizeReplacements(replacements);
  const byId = new Map(document.sentences.map((record) => [record.id, record]));
  const unknown = [...map.keys()].filter((id) => !byId.has(id));
  if (unknown.length) {
    const error = new Error(`替换结果包含未知句子 ID: ${unknown.slice(0, 5).join(', ')}`);
    error.code = 'DOCX_UNKNOWN_SENTENCE_ID';
    throw error;
  }
  const missing = document.sentences.filter((record) => !map.has(record.id)).map((record) => record.id);
  if (missing.length && options.requireAll !== false) {
    const error = new Error(`替换结果缺少句子 ID（共 ${missing.length} 个）`);
    error.code = 'DOCX_MISSING_SENTENCE_ID';
    error.missing = missing;
    throw error;
  }

  const changed = [];
  const skipped = [];
  const groups = new Map();
  for (const record of document.sentences) {
    if (!map.has(record.id)) {
      skipped.push({ id: record.id, reason: 'missing' });
      continue;
    }
    const replacement = map.get(record.id);
    const expectedHash = options.hashes && options.hashes[record.id];
    if (expectedHash && expectedHash !== record.hash) {
      const error = new Error(`原文哈希不匹配: ${record.id}`);
      error.code = 'DOCX_SENTENCE_HASH_MISMATCH';
      throw error;
    }
    if (options.shouldReplace && !options.shouldReplace(record, replacement)) {
      skipped.push({ id: record.id, reason: 'filtered' });
      continue;
    }
    // A paragraph can contain several manual-break-separated lines.  Each
    // line has its own local offsets/text-node map and must be patched as an
    // independent group while the enclosing paragraph and w:br stay intact.
    const key = record.line;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  for (const records of groups.values()) {
    const paragraphChanges = applyParagraphOperations(records, map, options);
    changed.push(...paragraphChanges);
    if (paragraphChanges.length) document.dirtyParts.add(records[0].part);
    for (const record of records) {
      const replacement = String(map.get(record.id) == null ? '' : map.get(record.id)).trim();
      if (!replacement
        || (record.protected && options.skipProtected !== false)
        || (record.isTitle && options.skipTitles !== false)) {
        skipped.push({
          id: record.id,
          reason: record.protected && options.skipProtected !== false
            ? 'complex-node'
            : (replacement ? 'title' : 'empty')
        });
      }
    }
  }
  return { changed, skipped, total: document.sentences.length };
}

async function saveDocx(document) {
  // `dirtyParts` is initialized by loadDocx, so an empty set means no XML
  // part changed; all untouched XML/package parts remain semantically intact
  // while JSZip repackages the final archive.
  const dirtyParts = document.dirtyParts || new Set(document.parts.keys());
  for (const part of dirtyParts) {
    const parsed = document.parts.get(part);
    if (!parsed) continue;
    document.zip.file(part, js2xml(parsed, { compact: false, spaces: 0 }));
  }
  return document.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function replaceDocxSentences(input, replacements, options = {}) {
  const document = await loadDocx(input);
  const report = applyReplacements(document, replacements, options);
  const buffer = await saveDocx(document);
  return { buffer, report, sentences: extractSentences(document), document };
}

/**
 * Rewrite each document sentence independently. The callback receives one
 * sentence at a time and must return only that sentence's replacement text.
 * Returning an empty value or throwing keeps the original sentence and records
 * a failure instead of shifting the sentence-ID alignment.  Document mode can
 * opt out of additional response-shape heuristics with strictOneToOne:false.
 */
async function rewriteSentencesOneToOne(document, rewriteSentence, options = {}) {
  if (!document || !Array.isArray(document.sentences)) throw new TypeError('无效的 DOCX 文档模型');
  if (typeof rewriteSentence !== 'function') throw new TypeError('rewriteSentence 必须是函数');
  const source = extractSentences(document);
  const replacements = [];
  const failed = [];
  const skipTitles = options.skipTitles !== false;
  const shouldRewrite = options.shouldRewrite || ((sentence) => {
    if ((sentence.protected && options.skipProtected !== false)
      || (skipTitles && sentence.isTitle)) return false;
    return shouldRewriteSentence(sentence, options);
  });

  for (let index = 0; index < source.length; index++) {
    const sentence = source[index];
    if (!shouldRewrite(sentence, index)) {
      replacements.push({ id: sentence.id, text: sentence.text });
      if (typeof options.onResult === 'function') {
        await options.onResult({ sentence, index, total: source.length, replacement: sentence.text, failed: false, skipped: true });
      }
      continue;
    }
    try {
      const value = await rewriteSentence(sentence.text, sentence, index);
      const text = options.strictOneToOne === false
        ? validateDocumentReplacement(value)
        : validateOneToOneReplacement(sentence.text, value);
      replacements.push({ id: sentence.id, text });
    } catch (error) {
      failed.push({ id: sentence.id, index, message: error.message || 'AI 改写失败' });
      // Keep the original sentence in the one-to-one map. This allows the
      // document to complete while making failures visible to the caller.
      replacements.push({ id: sentence.id, text: sentence.text });
    }
    if (typeof options.onResult === 'function') {
      await options.onResult({ sentence, index, total: source.length, replacement: replacements[replacements.length - 1].text, failed: failed.some((item) => item.id === sentence.id) });
    }
  }
  return { replacements, failed, sentences: source };
}

module.exports = {
  WORD_NS,
  TEXT_PARTS,
  sha256,
  splitSentenceSpans,
  validateOneToOneReplacement,
  loadDocx,
  extractSentences,
  extractDocumentText,
  applyReplacements,
  applyReplacementsInOrder,
  saveDocx,
  replaceDocxSentences,
  rewriteSentencesOneToOne
};
