const { Document, Packer, Paragraph, TextRun } = require('docx');
const JSZip = require('jszip');
const { xml2js, js2xml } = require('xml-js');
const {
  loadDocx,
  extractSentences,
  extractDocumentText,
  replaceDocxSentences,
  splitSentenceSpans,
  applyReplacements,
  applyReplacementsInOrder,
  saveDocx,
  rewriteSentencesOneToOne,
  validateOneToOneReplacement
} = require('./docx-rewrite');

async function paragraphRunSnapshot(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  const parsed = xml2js(xml, { compact: false, trim: false, ignoreDeclaration: false });
  const paragraphs = [];
  function text(node) {
    return (node.elements || []).filter((item) => item.type === 'text' || item.type === 'cdata').map((item) => item.text || '').join('');
  }
  function walk(node) {
    if (!node || !node.elements) return;
    for (const child of node.elements) {
      if (!child || child.type !== 'element') continue;
      if (child.name === 'w:p') {
        const runs = [];
        for (const run of (child.elements || []).filter((item) => item.type === 'element' && item.name === 'w:r')) {
          const property = (run.elements || []).find((item) => item.type === 'element' && item.name === 'w:rPr');
          const texts = (run.elements || []).filter((item) => item.type === 'element' && item.name === 'w:t');
          runs.push({
            text: texts.map(text).join(''),
            bold: !!(property && (property.elements || []).some((item) => item.name === 'w:b')),
            color: property && (property.elements || []).find((item) => item.name === 'w:color')?.attributes?.['w:val'] || null,
            size: property && (property.elements || []).find((item) => item.name === 'w:sz')?.attributes?.['w:val'] || null
            ,rPrXml: property ? js2xml(property, { compact: false, spaces: 0 }) : ''
          });
        }
        if (runs.length) paragraphs.push(runs);
      } else {
        walk(child);
      }
    }
  }
  walk(parsed);
  return paragraphs;
}

async function textNodeSnapshots(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  const parsed = xml2js(xml, { compact: false, trim: false, ignoreDeclaration: false });
  const result = [];
  function walk(node) {
    if (!node || !node.elements) return;
    for (const child of node.elements) {
      if (!child || child.type !== 'element') continue;
      if (child.name === 'w:t') {
        result.push({
          attributes: child.attributes ? { ...child.attributes } : {},
          text: (child.elements || []).filter((item) => item.type === 'text' || item.type === 'cdata').map((item) => item.text || '').join('')
        });
      }
      walk(child);
    }
  }
  walk(parsed);
  return result;
}

async function zipPartHashes(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).sort();
  const result = {};
  for (const name of names) {
    if (zip.files[name].dir) continue;
    result[name] = await zip.files[name].async('nodebuffer');
  }
  return result;
}

describe('DOCX sentence mapping and replacement', () => {
  test('splits Chinese and Latin punctuation while retaining fragments', () => {
    expect(splitSentenceSpans('第一句。第二句！尾句')).toEqual([
      expect.objectContaining({ aiText: '第一句。' }),
      expect.objectContaining({ aiText: '第二句！' }),
      expect.objectContaining({ aiText: '尾句' })
    ]);
    expect(splitSentenceSpans('A sentence. Next?')).toHaveLength(2);
    expect(splitSentenceSpans('“引号内。继续”尾句？下一句。').map((item) => item.aiText)).toEqual([
      '“引号内。继续”尾句？',
      '下一句。'
    ]);
  });

  test('replaces sentences in place without changing package parts', async () => {
    const document = new Document({
      sections: [{
        children: [new Paragraph({
          children: [
            new TextRun('第一句。'),
            new TextRun({ text: '第二句加粗！', bold: true }),
            new TextRun(' 第三句。')
          ]
        }), new Paragraph('标题')]
      }]
    });
    const source = await Packer.toBuffer(document);
    const model = await loadDocx(source);
    const sentences = extractSentences(model);
    const replacements = sentences.map((sentence) => ({
      id: sentence.id,
      text: sentence.text.replace('第一句', '改写第一句').replace('第二句加粗', '改写第二句').replace('第三句', '改写第三句').replace('标题', '新标题')
    }));
    const result = await replaceDocxSentences(source, replacements, { skipTitles: false });
    expect(result.report.changed).toHaveLength(4);
    const changed = await loadDocx(result.buffer);
    expect(extractSentences(changed).map((sentence) => sentence.text)).toEqual([
      '改写第一句。', '改写第二句！', '改写第三句。', '新标题'
    ]);
    expect(changed.zip.file('word/styles.xml')).toBeTruthy();
    expect(changed.zip.file('word/document.xml')).toBeTruthy();
  });

  test('rejects unknown and missing IDs in strict mode', async () => {
    const document = new Document({ sections: [{ children: [new Paragraph('唯一句子。')] }] });
    const source = await Packer.toBuffer(document);
    const model = await loadDocx(source);
    const [sentence] = extractSentences(model);
    expect(() => applyReplacements(model, [{ id: 'unknown', text: 'x' }])).toThrow(/未知句子 ID/);
    expect(() => applyReplacements(model, [], { requireAll: true })).toThrow(/缺少句子 ID/);
    expect(() => applyReplacements(model, [{ id: sentence.id, text: 'x' }], { hashes: { [sentence.id]: 'bad' } })).toThrow(/哈希/);
  });

  test('rejects multi-sentence or explanatory AI responses', async () => {
    expect(() => validateOneToOneReplacement('原句。', '第一句。第二句。')).toThrow(/多句/);
    expect(() => validateOneToOneReplacement('随着技术发展...', '请提供完整原文，以便进行改写。')).toThrow(/解释性/);

    const source = await Packer.toBuffer(new Document({
      sections: [{ children: [new Paragraph('这是需要改写的原句。')] }]
    }));
    const model = await loadDocx(source);
    const result = await rewriteSentencesOneToOne(model, async () => '第一句。第二句。', {
      skipTitles: false,
      minLength: 1
    });
    expect(result.failed).toHaveLength(1);
    expect(result.replacements[0].text).toBe('这是需要改写的原句。');
  });

  test('document mode accepts a non-empty response without extra heuristics', async () => {
    const source = await Packer.toBuffer(new Document({
      sections: [{ children: [new Paragraph('这是需要改写的原句。')] }]
    }));
    const model = await loadDocx(source);
    const result = await rewriteSentencesOneToOne(model, async () => '第一句。第二句。\n仍在原段。', {
      skipTitles: false,
      skipProtected: false,
      strictOneToOne: false,
      minLength: 0
    });
    expect(result.failed).toHaveLength(0);
    expect(result.replacements[0].text).toBe('第一句。第二句。 仍在原段。');
  });

  test('keeps an original in-paragraph Word line break while replacing text', async () => {
    const source = await Packer.toBuffer(new Document({
      sections: [{
        children: [new Paragraph({
          children: [new TextRun('换行前内容。'), new TextRun({ break: 1 }), new TextRun('换行后内容。')]
        })]
      }]
    }));
    const sourceXml = await (await JSZip.loadAsync(source)).file('word/document.xml').async('string');
    const model = await loadDocx(source);
    const sentences = extractSentences(model);
    const result = await replaceDocxSentences(source, sentences.map((sentence, index) => ({
      id: sentence.id,
      text: index === 0 ? '改写前内容。' : '改写后内容。'
    })), { skipTitles: false, skipProtected: false });
    const outputZip = await JSZip.loadAsync(result.buffer);
    const outputXml = await outputZip.file('word/document.xml').async('string');
    expect((sourceXml.match(/<w:br\b/g) || []).length).toBe(1);
    expect((outputXml.match(/<w:br\b/g) || []).length).toBe(1);
    expect(result.report.changed).toHaveLength(2);
  });

  test('uses a manual Word line break as a sentence boundary without moving it', async () => {
    const source = await Packer.toBuffer(new Document({
      sections: [{
        children: [new Paragraph({
          children: [new TextRun('上行标题'), new TextRun({ break: 1 }), new TextRun('下行正文。')]
        })]
      }]
    }));
    const model = await loadDocx(source);
    const sentences = extractSentences(model);
    expect(sentences.map((sentence) => sentence.text)).toEqual(['上行标题', '下行正文。']);

    const result = await replaceDocxSentences(source, sentences.map((sentence, index) => ({
      id: sentence.id,
      text: index === 0 ? '新上行标题' : '新下行正文。'
    })), { skipTitles: false, skipProtected: false });
    const outputZip = await JSZip.loadAsync(result.buffer);
    const outputXml = await outputZip.file('word/document.xml').async('string');
    expect((outputXml.match(/<w:br\b/g) || [])).toHaveLength(1);
    expect(extractSentences(await loadDocx(result.buffer)).map((sentence) => sentence.text))
      .toEqual(['新上行标题', '新下行正文。']);
  });

  test('keeps every mixed-format run populated after a sentence replacement', async () => {
    const document = new Document({
      sections: [{
        children: [new Paragraph({
          children: [
            new TextRun({ text: '普通文字', size: 22 }),
            new TextRun({ text: '加粗文字', bold: true, size: 28 }),
            new TextRun({ text: '红色文字。', color: 'FF0000', size: 24 })
          ]
        })]
      }]
    });
    const source = await Packer.toBuffer(document);
    const model = await loadDocx(source);
    const [sentence] = extractSentences(model);
    const result = await replaceDocxSentences(source, [{
      id: sentence.id,
      text: '这段内容已经被重新组织并保留样式。'
    }], { skipTitles: false });
    const before = (await paragraphRunSnapshot(source))[0];
    const after = (await paragraphRunSnapshot(result.buffer))[0];
    expect(after).toHaveLength(before.length);
    expect(after.map((run) => ({ bold: run.bold, color: run.color, size: run.size })))
      .toEqual(before.map((run) => ({ bold: run.bold, color: run.color, size: run.size })));
    expect(after.map((run) => run.rPrXml)).toEqual(before.map((run) => run.rPrXml));
    expect(after.every((run) => run.text.length > 0)).toBe(true);
    expect(after.map((run) => run.text).join('')).toBe('这段内容已经被重新组织并保留样式。');

    const beforeParts = await zipPartHashes(source);
    const afterParts = await zipPartHashes(result.buffer);
    expect(Object.keys(afterParts).sort()).toEqual(Object.keys(beforeParts).sort());
    for (const name of Object.keys(beforeParts)) {
      if (name === 'word/document.xml') continue;
      expect(afterParts[name].equals(beforeParts[name])).toBe(true);
    }
  });

  test('keeps extremely small style bands visible and does not split Unicode characters', async () => {
    const document = new Document({
      sections: [{
        children: [new Paragraph({
          children: [
            new TextRun({ text: '这是一段非常非常长的普通文字', size: 22 }),
            new TextRun({ text: '粗', bold: true, size: 28 }),
            new TextRun({ text: '红。', color: 'FF0000', size: 24 })
          ]
        })]
      }]
    });
    const source = await Packer.toBuffer(document);
    const model = await loadDocx(source);
    const [sentence] = extractSentences(model);
    const replacement = '改😀红。';
    const result = await replaceDocxSentences(source, [{ id: sentence.id, text: replacement }], { skipTitles: false });
    const before = (await paragraphRunSnapshot(source))[0];
    const after = (await paragraphRunSnapshot(result.buffer))[0];
    expect(after.map((run) => ({ bold: run.bold, color: run.color, size: run.size })))
      .toEqual(before.map((run) => ({ bold: run.bold, color: run.color, size: run.size })));
    expect(after.map((run) => run.rPrXml)).toEqual(before.map((run) => run.rPrXml));
    expect(after.every((run) => Array.from(run.text).length > 0)).toBe(true);
    expect(after.map((run) => run.text).join('')).toBe(replacement);
    expect(after.map((run) => run.text).join('')).not.toContain('\uFFFD');
  });

  test('preserves every original w:t attribute, including xml:space', async () => {
    const document = new Document({
      sections: [{
        children: [new Paragraph({
          children: [
            new TextRun('  原句前后空格  。'),
            new TextRun({ text: '第二个run。', bold: true })
          ]
        })]
      }]
    });
    const source = await Packer.toBuffer(document);
    const model = await loadDocx(source);
    const sentences = extractSentences(model);
    const replacements = sentences.map((sentence) => ({ id: sentence.id, text: `改写${sentence.text}` }));
    const result = await replaceDocxSentences(source, replacements, { skipTitles: false });
    const before = await textNodeSnapshots(source);
    const after = await textNodeSnapshots(result.buffer);
    expect(after).toHaveLength(before.length);
    expect(after.map((node) => node.attributes)).toEqual(before.map((node) => node.attributes));
  });

  test('maps two sentence replacements independently when a run crosses the boundary', async () => {
    const document = new Document({
      sections: [{
        children: [new Paragraph({
          children: [
            new TextRun({ text: '第一句普通。第二句', size: 22 }),
            new TextRun({ text: '加粗结束。', bold: true, size: 28 })
          ]
        })]
      }]
    });
    const source = await Packer.toBuffer(document);
    const model = await loadDocx(source);
    const sentences = extractSentences(model);
    expect(sentences).toHaveLength(2);
    const result = await replaceDocxSentences(source, sentences.map((sentence, index) => ({
      id: sentence.id,
      text: index === 0 ? '改写第一句。' : '改写第二句。'
    })), { skipTitles: false });
    const changed = await loadDocx(result.buffer);
    expect(extractSentences(changed).map((sentence) => sentence.text)).toEqual(['改写第一句。', '改写第二句。']);
    const runs = (await paragraphRunSnapshot(result.buffer))[0];
    expect(runs.map((run) => run.text).join('')).toBe('改写第一句。改写第二句。');
    expect(runs.map((run) => run.rPrXml)).toEqual((await paragraphRunSnapshot(source))[0].map((run) => run.rPrXml));
  });

  test('extracts full document text and applies rewrite results by array order', async () => {
    const source = await Packer.toBuffer(new Document({
      sections: [{ children: [new Paragraph('标题'), new Paragraph('第一句。第二句。')] }]
    }));
    const model = await loadDocx(source);
    expect(extractDocumentText(model)).toBe('标题\n第一句。第二句。');
    expect(extractSentences(model).map((sentence) => sentence.text)).toEqual(['标题', '第一句。', '第二句。']);

    const sourceSentences = [
      { text: '标题', pIdx: 0, isTitle: true },
      { text: '第一句。', pIdx: 1, isTitle: false },
      { text: '第二句。', pIdx: 1, isTitle: false }
    ];
    applyReplacementsInOrder(model, ['新标题', '改写一。', '改写二。'], {
      sourceSentences,
      skipTitles: false,
      skipProtected: false
    });
    const output = await saveDocx(model);
    expect(extractSentences(await loadDocx(output)).map((sentence) => sentence.text))
      .toEqual(['新标题', '改写一。', '改写二。']);
  });

  test('uses the existing AI splitter order even when DOCX internal splitting differs', async () => {
    const source = await Packer.toBuffer(new Document({
      sections: [{ children: [new Paragraph('A. B.')] }]
    }));
    const model = await loadDocx(source);
    expect(extractSentences(model).map((sentence) => sentence.text)).toEqual(['A.', 'B.']);

    applyReplacementsInOrder(model, ['After rewrite'], {
      sourceSentences: [{ text: 'A. B.', pIdx: 0, isTitle: true }],
      skipTitles: false,
      skipProtected: false
    });
    const output = await saveDocx(model);
    expect(extractDocumentText(await loadDocx(output))).toBe('After rewrite');
  });
});
