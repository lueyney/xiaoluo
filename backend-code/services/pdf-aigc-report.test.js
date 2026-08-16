const { describe, test, expect } = require('@jest/globals');
const {
  normalizeReportText,
  matchRedSentences,
  buildRedTextStore,
  extractPdfColorText
} = require('./pdf-aigc-report');
const { paintedCharacters } = require('./pdf-text-layer');

describe('pdf AIGC report matching', () => {
  test('normalizes report line breaks and page markers', () => {
    expect(normalizeReportText('  第一。\n- 1 -\n第二。 ')).toBe('第一。第二。');
  });

  test('selects only sentences present in red segments', () => {
    const result = matchRedSentences([
      { text: '未标红内容。' },
      { text: '这是需要降重的句子。' },
      { text: '标题' }
    ], {
      redSegments: [{ text: '这是需要降重的句子。' }],
      redChars: 10
    });
    expect(result.indexes).toEqual([1]);
    expect(result.matched[0].matchType).toBe('exact');
    expect(result.unmatchedFragments).toEqual([]);
  });

  test('stores every PDF red segment before any DOCX matching', () => {
    const store = buildRedTextStore({
      redChars: 9,
      redSegments: [
        { page: 1, top: 10, text: '正文第一句。' },
        { page: 1, top: 20, text: '46.94%' },
        { page: 2, top: 30, text: '第二句' }
      ]}, { fileName: 'report.pdf', sha256: 'abc' });

    expect(store.schemaVersion).toBe('red-text-store.v1');
    expect(store.segments).toHaveLength(3);
    expect(store.segments.map((item) => item.sequence)).toEqual([0, 1, 2]);
    expect(store.segments[0].rawText).toBe('正文第一句。');
    expect(store.segments[0].mapping.status).toBe('unmapped');
    expect(store.segments[0].rewrite.status).toBe('pending');
    expect(store.segments[1].kind).toBe('metric');
    expect(store.segments[1].eligibleForRewrite).toBe(false);
    expect(store.stats.segmentCount).toBe(3);
    expect(store.stats.reportRedChars).toBe(9);
  });

  test('uses the full PDF text layer to select the marked repeated occurrence', () => {
    const repeated = '这是一个用于验证重复定位的完整句子。';
    const result = matchRedSentences([
      { text: repeated },
      { text: repeated }
    ], {
      redSegments: [{ page: 1, top: 10, text: repeated }],
      textLines: [{
        page: 1,
        top: 10,
        text: repeated + repeated,
        runs: [
          { kind: null, text: repeated },
          { kind: 'red', text: repeated }
        ]
      }],
      redChars: repeated.length
    });

    expect(result.indexes).toEqual([1]);
    expect(result.matched[0].matchType).toBe('exact');
    expect(result.usedFullTextLayer).toBe(true);
  });

  test('advances the cursor after a partial sentence match', () => {
    const fragment = '这一段红字足够长用于部分匹配';
    const result = matchRedSentences([
      { text: `前半句，${fragment}，后半句。` },
      { text: `另一个句子也包含${fragment}，但不应重复命中。` }
    ], {
      redSegments: [{ page: 1, top: 10, text: fragment }],
      redChars: fragment.length
    });

    expect(result.indexes).toEqual([0]);
    expect(result.matched[0].matchType).toBe('partial-sentence');
  });

  test('uses the in-process text-layer parser only when spawning Python is denied', async () => {
    const permissionError = Object.assign(new Error('spawn EPERM'), { code: 'EPERM' });
    const executePython = jest.fn().mockRejectedValue(permissionError);
    const parseInProcess = jest.fn().mockResolvedValue({
      parser: 'pdfjs-text-layer',
      redSegments: [{ page: 1, top: 10, text: 'marked', charCount: 6 }],
      yellowSegments: [],
      textLines: [{ page: 1, top: 10, text: 'marked', runs: [{ kind: 'red', text: 'marked' }] }],
      redChars: 6,
      yellowChars: 0
    });

    const result = await extractPdfColorText(Buffer.from('%PDF-1.4'), { executePython, parseInProcess });

    expect(executePython).toHaveBeenCalled();
    expect(parseInProcess).toHaveBeenCalledTimes(1);
    expect(result.parser).toBe('pdfjs-text-layer');
    expect(result.redChars).toBe(6);
  });

  test('does not hide a real Python parse error behind the fallback parser', async () => {
    const parseError = Object.assign(new Error('invalid xref table'), { code: 1 });
    const parseInProcess = jest.fn();

    await expect(extractPdfColorText(Buffer.from('%PDF-1.4'), {
      executePython: jest.fn().mockRejectedValue(parseError),
      parseInProcess
    })).rejects.toMatchObject({ code: 'AIGC_REPORT_PARSE_ERROR' });
    expect(parseInProcess).not.toHaveBeenCalled();
  });

  test('tracks marked glyph colors through the PDF graphics-state stack', () => {
    const OPS = { save: 1, restore: 2, setFillRGBColor: 3, showText: 4, showSpacedText: 5 };
    const result = paintedCharacters({ OPS }, {
      fnArray: [OPS.setFillRGBColor, OPS.showText, OPS.save, OPS.setFillRGBColor, OPS.showText, OPS.restore, OPS.showText],
      argsArray: [
        [234, 0, 46],
        [[{ unicode: '红', width: 1000 }]],
        null,
        [237, 160, 30],
        [[{ unicode: '黄', width: 1000 }]],
        null,
        [[{ unicode: '红', width: 1000 }]]
      ]
    });

    expect(result.redChars).toBe(2);
    expect(result.yellowChars).toBe(1);
    expect(result.characters.map((item) => item.kind)).toEqual(['red', 'yellow', 'red']);
  });
});
