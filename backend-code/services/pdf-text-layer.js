const path = require('path');

let pdfjsPromise;

function loadPdfJs() {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

function colorKind(rgb) {
  if (!Array.isArray(rgb) || rgb.length < 3) return null;
  const scale = Math.max(...rgb.slice(0, 3).map(Number)) > 1 ? 255 : 1;
  const [red, green, blue] = rgb.slice(0, 3).map((value) => Number(value) / scale);
  if (red >= 0.80 && green <= 0.12 && blue <= 0.28) return 'red';
  if (red >= 0.80 && green >= 0.45 && green <= 0.90 && blue <= 0.65) return 'yellow';
  return null;
}

function rgbFromOperator(values) {
  const channels = Array.from(values || []).slice(0, 3).map(Number);
  if (channels.length < 3 || channels.some((value) => !Number.isFinite(value))) return [0, 0, 0];
  return channels;
}

function cmykToRgb(values) {
  const channels = Array.from(values || []).slice(0, 4).map(Number);
  if (channels.length < 4 || channels.some((value) => !Number.isFinite(value))) return [0, 0, 0];
  const scale = Math.max(...channels) > 1 ? 255 : 1;
  const [cyan, magenta, yellow, black] = channels.map((value) => value / scale);
  return [
    255 * (1 - Math.min(1, cyan + black)),
    255 * (1 - Math.min(1, magenta + black)),
    255 * (1 - Math.min(1, yellow + black))
  ];
}

function collectGlyphs(value, output) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectGlyphs(item, output));
    return;
  }
  if (value && typeof value === 'object' && typeof value.unicode === 'string') {
    output.push(value);
  }
}

function paintedCharacters(pdfjs, operatorList) {
  const characters = [];
  const stack = [];
  let fill = [0, 0, 0];
  let redChars = 0;
  let yellowChars = 0;

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const operation = operatorList.fnArray[index];
    const args = operatorList.argsArray[index];
    if (operation === pdfjs.OPS.save) {
      stack.push(fill.slice());
    } else if (operation === pdfjs.OPS.restore) {
      fill = stack.pop() || fill;
    } else if (operation === pdfjs.OPS.setFillRGBColor) {
      fill = rgbFromOperator(args);
    } else if (operation === pdfjs.OPS.setFillGray) {
      const gray = Number(Array.from(args || [0])[0]) || 0;
      fill = [gray, gray, gray];
    } else if (operation === pdfjs.OPS.setFillCMYKColor) {
      fill = cmykToRgb(args);
    } else if (operation === pdfjs.OPS.showText || operation === pdfjs.OPS.showSpacedText) {
      const glyphs = [];
      collectGlyphs(args, glyphs);
      const kind = colorKind(fill);
      for (const glyph of glyphs) {
        if (kind === 'red') redChars += 1;
        if (kind === 'yellow') yellowChars += 1;
        const unicode = String(glyph.unicode || '');
        let first = true;
        for (const character of unicode) {
          characters.push({
            character,
            kind,
            glyphCount: first ? 1 : 0,
            glyphWidth: first ? Number(glyph.width) || 0 : 0
          });
          first = false;
        }
      }
    }
  }
  return { characters, redChars, yellowChars };
}

function alignTextCharacters(textContent, painted) {
  const records = [];
  for (const item of textContent.items || []) {
    if (!item || typeof item.str !== 'string' || !item.str) continue;
    const characters = Array.from(item.str);
    characters.forEach((character, offset) => records.push({ item, character, offset, kind: null, glyphCount: 0, glyphWidth: 0 }));
  }

  const visibleRecords = records.filter((record) => !/\s/u.test(record.character));
  let textIndex = 0;
  let paintIndex = 0;
  let matched = 0;

  while (textIndex < records.length && paintIndex < painted.characters.length) {
    const textRecord = records[textIndex];
    const paintRecord = painted.characters[paintIndex];
    const textWhitespace = /\s/u.test(textRecord.character);
    const paintWhitespace = /\s/u.test(paintRecord.character);
    if (textRecord.character === paintRecord.character || (textWhitespace && paintWhitespace)) {
      textRecord.kind = paintRecord.kind;
      textRecord.glyphCount = paintRecord.glyphCount;
      textRecord.glyphWidth = paintRecord.glyphWidth;
      if (!textWhitespace) matched += 1;
      textIndex += 1;
      paintIndex += 1;
      continue;
    }
    if (textWhitespace) {
      textIndex += 1;
      continue;
    }
    if (paintWhitespace) {
      paintIndex += 1;
      continue;
    }

    const lookAhead = 64;
    const nextPaint = painted.characters.slice(paintIndex + 1, paintIndex + lookAhead + 1)
      .findIndex((record) => !/\s/u.test(record.character) && record.character === textRecord.character);
    const nextText = records.slice(textIndex + 1, textIndex + lookAhead + 1)
      .findIndex((record) => !/\s/u.test(record.character) && record.character === paintRecord.character);
    if (nextPaint >= 0 && (nextText < 0 || nextPaint <= nextText)) {
      paintIndex += nextPaint + 1;
    } else if (nextText >= 0) {
      textIndex += nextText + 1;
    } else {
      textIndex += 1;
      paintIndex += 1;
    }
  }

  const ratio = visibleRecords.length ? matched / visibleRecords.length : 0;
  const mappedRedChars = records
    .filter((record) => record.kind === 'red')
    .reduce((total, record) => total + record.glyphCount, 0);
  const mappedYellowChars = records
    .filter((record) => record.kind === 'yellow')
    .reduce((total, record) => total + record.glyphCount, 0);
  return { records, visibleTextChars: visibleRecords.length, matchedTextChars: matched, ratio, mappedRedChars, mappedYellowChars };
}

function appendRun(runs, kind, text) {
  if (!text) return;
  if (runs.length && runs[runs.length - 1].kind === kind) runs[runs.length - 1].text += text;
  else runs.push({ kind, text });
}

function buildPageResult(pageNumber, pageHeight, alignment, styles) {
  const lines = new Map();
  const itemMetrics = new Map();
  for (const record of alignment.records) {
    if (!itemMetrics.has(record.item)) itemMetrics.set(record.item, { totalWidth: 0, offsets: new Map() });
    const metrics = itemMetrics.get(record.item);
    metrics.offsets.set(record, metrics.totalWidth);
    metrics.totalWidth += record.glyphWidth;
  }
  for (const record of alignment.records) {
    const transform = Array.isArray(record.item.transform) ? record.item.transform : [];
    const rotatedWatermark = Math.abs(Number(transform[1]) || 0) > 1e-6
      && Math.abs(Number(transform[2]) || 0) > 1e-6
      && (Number(record.item.height) || 0) >= 20;
    if (rotatedWatermark && !record.kind) continue;
    const axisX = Number(transform[0]) || 0;
    const axisY = Number(transform[1]) || 0;
    const axisLength = Math.hypot(axisX, axisY) || 1;
    const style = styles && styles[record.item.fontName] || {};
    const ascent = Number.isFinite(style.ascent) ? style.ascent : 0.8;
    const startX = Number(transform[4]) || 0;
    const startY = Number(transform[5]) || 0;
    const width = Number(record.item.width) || 0;
    const itemLength = Math.max(1, Array.from(record.item.str || '').length);
    const metrics = itemMetrics.get(record.item);
    const advance = metrics && metrics.totalWidth > 0
      ? width * metrics.offsets.get(record) / metrics.totalWidth
      : width * record.offset / itemLength;
    const x = startX + axisX / axisLength * advance;
    const baseline = startY + axisY / axisLength * advance;
    const glyphTop = pageHeight - baseline - (Number(transform[3]) || 0) * ascent;
    const top = Math.round(glyphTop / 2) * 2;
    if (!lines.has(top)) lines.set(top, []);
    lines.get(top).push({ ...record, x });
  }

  const redSegments = [];
  const yellowSegments = [];
  const textLines = [];
  for (const [top, characters] of [...lines.entries()].sort((left, right) => left[0] - right[0])) {
    characters.sort((left, right) => left.x - right.x);
    const runs = [];
    for (const record of characters) appendRun(runs, record.kind, record.character);
    const text = runs.map((run) => run.text).join('');
    if (text.trim()) textLines.push({ page: pageNumber, top, text, runs });
    for (const kind of ['red', 'yellow']) {
      const selected = characters.filter((record) => record.kind === kind);
      const selectedText = selected.map((record) => record.character).join('');
      if (!selectedText.trim()) continue;
      const segment = {
        page: pageNumber,
        top,
        text: selectedText,
        charCount: selected.reduce((total, record) => total + record.glyphCount, 0)
      };
      if (kind === 'red') redSegments.push(segment);
      else yellowSegments.push(segment);
    }
  }
  return { redSegments, yellowSegments, textLines };
}

function pdfError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function extractPdfColorTextWithPdfJs(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw pdfError('检测报告为空', 'EMPTY_AIGC_REPORT');
  const pdfjs = await loadPdfJs();
  const packageRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    cMapUrl: `${path.join(packageRoot, 'cmaps').replace(/\\/gu, '/')}/`,
    cMapPacked: true,
    standardFontDataUrl: `${path.join(packageRoot, 'standard_fonts').replace(/\\/gu, '/')}/`,
    useSystemFonts: true
  });

  let document;
  try {
    document = await loadingTask.promise;
    const result = { redSegments: [], yellowSegments: [], textLines: [], redChars: 0, yellowChars: 0 };
    let visibleTextChars = 0;
    let matchedTextChars = 0;
    let mappedRedChars = 0;
    let mappedYellowChars = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const [operatorList, textContent] = await Promise.all([page.getOperatorList(), page.getTextContent()]);
      const painted = paintedCharacters(pdfjs, operatorList);
      const alignment = alignTextCharacters(textContent, painted);
      const pageResult = buildPageResult(
        pageNumber,
        Number(page.view && page.view[3]) || 0,
        alignment,
        textContent.styles
      );
      result.redSegments.push(...pageResult.redSegments);
      result.yellowSegments.push(...pageResult.yellowSegments);
      result.textLines.push(...pageResult.textLines);
      result.redChars += painted.redChars;
      result.yellowChars += painted.yellowChars;
      visibleTextChars += alignment.visibleTextChars;
      matchedTextChars += alignment.matchedTextChars;
      mappedRedChars += alignment.mappedRedChars;
      mappedYellowChars += alignment.mappedYellowChars;
      page.cleanup();
    }

    if (!visibleTextChars || !result.textLines.length) {
      throw pdfError('PDF 没有可提取的文字层；本功能不使用 OCR', 'PDF_TEXT_LAYER_NOT_FOUND');
    }
    if (matchedTextChars / visibleTextChars < 0.98) {
      throw pdfError('PDF 文字层顺序无法可靠解析，未启动降重', 'PDF_TEXT_LAYER_ALIGNMENT_ERROR');
    }
    if (mappedRedChars !== result.redChars || mappedYellowChars !== result.yellowChars) {
      throw pdfError('PDF 标色文字无法完整对齐到文字层，未启动降重', 'PDF_COLOR_ALIGNMENT_ERROR');
    }
    return { ...result, parser: 'pdfjs-text-layer' };
  } finally {
    if (document) await document.destroy();
    else if (loadingTask && typeof loadingTask.destroy === 'function') await loadingTask.destroy();
  }
}

module.exports = {
  colorKind,
  paintedCharacters,
  alignTextCharacters,
  extractPdfColorTextWithPdfJs
};
