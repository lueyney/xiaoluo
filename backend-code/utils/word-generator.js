const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, PageBreak, SectionType, Tab, TabStopType, LeaderType } = require('docx');

/** 目录行：右对齐制表位（约 38 字符位，A4 正文区常用），圆点前导符 */
const TOC_RIGHT_TAB_TWIPS = 6800;

const DEFAULT_ACKNOWLEDGMENT_PARAS = [
  '这次毕业论文我得到了很多老师的帮助。衷心感谢我的导师，在论文的写作过程中悉心指导，提出了许多宝贵的意见，其严谨的学术态度让我受益匪浅，在此我对我的老师致以深深的谢意。',
  '在毕业论文各个环节中，老师都给予了我悉心的指导。老师不仅在学业上给我以精心指导，同时还在思想上给予无微不至的关怀，在此谨向我的老师致以诚挚的谢意和崇高的敬意！'
];

const CHINESE_NUMERALS = '一二三四五六七八九十百千万零';
const H1_PATTERNS = [
  new RegExp(`^第(?:[${CHINESE_NUMERALS}]+|\\d+)[章节篇部](?:[：:、，\\s\\.．]|$)`),
  new RegExp(`^[${CHINESE_NUMERALS}]+[、，\\.．]`),
  /^\d+(?![\.．])[、，\s:：].*/
];
const H1_KEYWORD_PATTERNS = [
  /^摘\s*要[：:：]?$/,
  /^摘要[：:：]?$/,
  /^abstract[：:：]?$/i,
  /^参考文献/,
  /^致谢/,
  /^附录/
];
const H2_PATTERNS = [
  /^\d+[\.．]\d+(?![\.．\d])(?:[、，:：\s]|$)/,
  new RegExp(`^[（(][${CHINESE_NUMERALS}]+[）)]`),
  /^[（(](?:\d+|[IVXivx]+)[）)]/
];
const H3_DEEP_PATTERN = /^\d+(?:[\.．]\d+){2,}/;
const H3_PATTERNS = [
  /^\d+[\.．、](?!\d)/,
  /^[（(]\d+[）)]/
];
const TABLE_CAPTION_PATTERN = /^表\s*\d+(?:[\.．]\d+)?[：:、\s]?/;
const PAGE_BREAK_KEYWORDS = [/^参考文献/, /^致谢/, /^附录/];

function identifyHeadings(content) {
  const lines = content.split('\n');
  const processed = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    if (TABLE_CAPTION_PATTERN.test(line)) {
      processed.push({ type: 'table-caption', content: line });
      continue;
    }

    if (/\||\t/.test(line) || line.includes('｜')) {
      processed.push({ type: 'table-row', content: line });
      continue;
    }

    if (H1_KEYWORD_PATTERNS.some(pattern => pattern.test(line))) {
      const variant = isAbstract(line) ? 'abstract' : 'keyword';
      processed.push({ type: 'h1', content: line, variant });
      continue;
    }
    
    if (H1_PATTERNS.some(pattern => pattern.test(line))) {
      processed.push({ type: 'h1', content: line });
      continue;
    }

    if (H3_DEEP_PATTERN.test(line)) {
      processed.push({ type: 'h3', content: line });
      continue;
    }

    if (H2_PATTERNS.some(pattern => pattern.test(line))) {
      processed.push({ type: 'h2', content: line });
      continue;
    }

    if (H3_PATTERNS.some(pattern => pattern.test(line))) {
      processed.push({ type: 'h3', content: line });
      continue;
    }

      processed.push({ type: 'p', content: line });
  }
  
  return processed;
}

/**
 * 清理文本
 */
function cleanText(text) {
  if (!text) return '';

  return text
    .replace(/\r\n/g, '\n')       // Windows换行 -> Linux换行
    .replace(/\r/g, '\n')         // 处理孤立的\r
    .replace(/\u00A0/g, ' ')       // 替换不间断空格
    .replace(/\n\s*\n+/g, '\n')  // 清除双换行及带空格的空行
    .replace(/ {2,}/g, ' ')         // 清除双空格
    .replace(/#/g, '')             // 删除Markdown井号
    .split('\n')
    .map(line => line.trim())
    .join('\n');
}

/**
 * 检测是否需要分页
 */
function needsPageBreak(line) {
  if (PAGE_BREAK_KEYWORDS.some(pattern => pattern.test(line))) {
    return true;
  }

  const numericMatch = line.match(/^第(\d+)[章节篇部]/);
  if (numericMatch && Number(numericMatch[1]) > 1) {
    return true;
  }

  if (/^第[一二三四五六七八九十百千万零]+[章节篇部]/.test(line) && !/^第一[章节篇部]/.test(line)) {
    return true;
  }

  const chineseMatch = line.match(/^([二三四五六七八九十百千万零]+)[、，\.．]/);
  if (chineseMatch) {
    return true;
  }

  return false;
}

/**
 * 检测是否是摘要
 */
function isAbstract(line) {
  return /^摘\s*要/.test(line) || /^摘要/.test(line) || /^abstract/.test(line.toLowerCase());
}

/**
 * 解析文本中的上标（如 [1] 或 ［1］）
 */
function parseTextWithSuperscripts(text) {
  const parts = [];
  let lastIndex = 0;
  
  // 匹配 [数字] 或 ［数字］
  const regex = /[\[［](\d+)[\]］]/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    // 添加匹配前的普通文本
    if (match.index > lastIndex) {
      parts.push(new TextRun({ 
        text: text.substring(lastIndex, match.index),
        font: '宋体',
        size: 12 * 2
      }));
}
    // 添加上标
    parts.push(new TextRun({ 
      text: `[${match[1]}]`, 
      superScript: true,
      font: '宋体',
      size: 12 * 2
    }));
    lastIndex = match.index + match[0].length;
  }
  
  // 添加剩余的文本
  if (lastIndex < text.length) {
    parts.push(new TextRun({ 
      text: text.substring(lastIndex),
      font: '宋体',
      size: 12 * 2
    }));
  }
  
  // 如果没有匹配到上标，返回整个文本
  if (parts.length === 0) {
    parts.push(new TextRun({ 
      text,
      font: '宋体',
      size: 12 * 2
    }));
  }
  
  return parts;
}

function getDocumentField(document, keys) {
  if (!document) return '';
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(document, key) && document[key] !== undefined && document[key] !== null) {
      const value = String(document[key]).trim();
      if (value) {
        return value;
      }
    }
  }
  return '';
}

function formatCoverDate(value) {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}年${month}月${day}日`;
}

/**
 * 生成封面页
 */
function generateCoverPage(document) {
  const paperTitle = document.title || '未命名文档';
  const author = getDocumentField(document, ['author', 'student_name', 'studentName', 'user_name', 'username', 'realname', 'name']);
  const studentNo = getDocumentField(document, ['student_no', 'studentNo', 'student_id', 'studentId']);
  const department = getDocumentField(document, ['department', 'faculty', 'collegeDepartment', 'school_department']);
  const major = getDocumentField(document, ['major', 'profession', 'specialty', 'field']);
  const instructor = getDocumentField(document, ['instructor', 'supervisor', 'teacher', 'tutor', 'mentor']);
  const formattedDate = formatCoverDate(document.submitted_at || document.completed_at || document.approved_at || document.created_at || new Date());

  const coverParagraphs = [
    // 空行
    new Paragraph({ text: '', spacing: { after: 400 } }),
    // "毕业论文" 标题
    new Paragraph({
      text: '毕业论文',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      run: {
        font: '黑体',
        size: 24 * 2, // 24pt = 48 half-points
        bold: true
      }
    }),
    // 论文标题
    new Paragraph({
      text: paperTitle,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 600 },
      run: {
        font: '黑体',
        size: 28 * 2, // 28pt
        bold: true
      }
    }),
    // 信息表格
    new Paragraph({ text: '', spacing: { after: 200 } }),
    // 题  目
    new Paragraph({
      children: [
        new TextRun({ text: '题  目：', font: '宋体', size: 14 * 2, bold: true }),
        new TextRun({ text: paperTitle || ' ', font: '宋体', size: 14 * 2 })
      ],
      spacing: { after: 240 }
    }),
    // 姓  名
    new Paragraph({
      children: [
        new TextRun({ text: '姓  名：', font: '宋体', size: 14 * 2, bold: true }),
        new TextRun({ text: author || ' ', font: '宋体', size: 14 * 2 })
      ],
      spacing: { after: 240 }
    }),
    // 学  号
    new Paragraph({
      children: [
        new TextRun({ text: '学  号：', font: '宋体', size: 14 * 2, bold: true }),
        new TextRun({ text: studentNo || ' ', font: '宋体', size: 14 * 2 })
      ],
      spacing: { after: 240 }
    }),
    // 院  系
    new Paragraph({
      children: [
        new TextRun({ text: '院  系：', font: '宋体', size: 14 * 2, bold: true }),
        new TextRun({ text: department || ' ', font: '宋体', size: 14 * 2 })
      ],
      spacing: { after: 240 }
    }),
    // 专  业
    new Paragraph({
      children: [
        new TextRun({ text: '专  业：', font: '宋体', size: 14 * 2, bold: true }),
        new TextRun({ text: major || ' ', font: '宋体', size: 14 * 2 })
      ],
      spacing: { after: 240 }
    }),
    // 指导教师
    new Paragraph({
      children: [
        new TextRun({ text: '指导教师：', font: '宋体', size: 14 * 2, bold: true }),
        new TextRun({ text: instructor || ' ', font: '宋体', size: 14 * 2 })
      ],
      spacing: { after: 240 }
    }),
    // 完成日期
    new Paragraph({
      children: [
        new TextRun({ text: '完成日期：', font: '宋体', size: 14 * 2, bold: true }),
        new TextRun({ text: formattedDate || ' ', font: '宋体', size: 14 * 2 })
      ],
      spacing: { after: 0 }
    })
  ];

  return coverParagraphs;
}

/**
 * 生成表格
 */
function generateTable(rows) {
  if (rows.length === 0) return null;
  
  const tableRows = rows.map((row, index) => {
    // 分割单元格（支持|和tab）
    const normalizedRow = row.content.replace(/｜/g, '|');
    const cells = normalizedRow.includes('|') 
      ? normalizedRow.split('|').filter(c => c.trim())
      : normalizedRow.split('\t').filter(c => c.trim());
    
    return new TableRow({
      children: cells.map(cell => new TableCell({
        children: [new Paragraph({
          children: parseTextWithSuperscripts(cell.trim()),
          alignment: index === 0 ? AlignmentType.CENTER : AlignmentType.LEFT
        })],
        shading: index === 0 ? { fill: 'F0F0F0' } : undefined
      }))
    });
  });
  
  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE }
  });
}

/**
 * 生成文本目录（不依赖 Word 域）
 */
function generateTextToc(elements) {
  const tocItems = elements.filter((item) => {
    if (!['h1', 'h2', 'h3'].includes(item.type)) return false;
    if (isAbstract(item.content)) return false;
    return true;
  });

  const lines = [
    new Paragraph({
      text: '目 录',
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      run: {
        font: '黑体',
        size: 16 * 2,
        bold: true
      }
    })
  ];

  if (tocItems.length === 0) {
    lines.push(new Paragraph({
      text: '（未识别到可用标题）',
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      run: { font: '宋体', size: 12 * 2 }
    }));
    return lines;
  }

  tocItems.forEach((item, index) => {
    const leftChars = item.type === 'h1' ? 0 : item.type === 'h2' ? 2 : 4;
    const pageNo = index + 1;
    const title = item.content.replace(/\s+/g, '').trim();
    const indent = '　'.repeat(leftChars);

    lines.push(new Paragraph({
      children: [
        new TextRun({
          text: `${indent}${title}`,
          font: '宋体',
          size: 12 * 2,
          bold: item.type === 'h1'
        }),
        new Tab(),
        new TextRun({
          text: String(pageNo),
          font: '宋体',
          size: 12 * 2,
          bold: item.type === 'h1'
        })
      ],
      tabStops: [
        {
          type: TabStopType.RIGHT,
          position: TOC_RIGHT_TAB_TWIPS,
          leader: LeaderType.DOT
        }
      ],
      spacing: { after: 120 },
      alignment: AlignmentType.LEFT
    }));
  });

  lines.push(new Paragraph({ text: '', spacing: { after: 320 } }));
  return lines;
}

/**
 * 生成Word文档（使用 docx 库）
 */
async function generateWordDocx(document) {
  const cleanedContent = cleanText(document.content || '');
  const elements = identifyHeadings(cleanedContent);
  
  const children = [];
  
  // 1. 封面页
  children.push(...generateCoverPage(document));
  // 封面后换页
  children.push(new Paragraph({ text: '', pageBreakBefore: true }));
  children.push(new Paragraph({
    text: document.title || '未命名文档',
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    run: {
      font: '黑体',
      size: 22 * 2,
      bold: true
    }
  }));
  
  children.push(new Paragraph({
    children: [
      new TextRun({ text: '文档类型：', font: '宋体', size: 12 * 2 }),
      new TextRun({ text: document.type || '未指定', font: '宋体', size: 12 * 2 })
    ],
    spacing: { after: 200 }
  }));
  
  children.push(new Paragraph({
    children: [
      new TextRun({ text: '学科领域：', font: '宋体', size: 12 * 2 }),
      new TextRun({ text: document.field || '未指定', font: '宋体', size: 12 * 2 })
    ],
    spacing: { after: 200 }
  }));
  
  children.push(new Paragraph({
    children: [
      new TextRun({ text: '生成时间：', font: '宋体', size: 12 * 2 }),
      new TextRun({ text: String(document.created_at || '未提供'), font: '宋体', size: 12 * 2 })
    ],
    spacing: { after: 200 }
  }));
  
  children.push(new Paragraph({
    children: [
      new TextRun({ text: '字数统计：', font: '宋体', size: 12 * 2 }),
      new TextRun({ text: `${document.word_count || 0} 字`, font: '宋体', size: 12 * 2 })
    ],
    spacing: { after: 400 }
  }));
  
  children.push(new Paragraph({ text: '', pageBreakBefore: true }));
  
  // 4. 正文内容
  let tableRows = [];
  let afterAbstract = false;
  let hasTOC = false;
  let inAbstractSection = false;
  let inReferenceSection = false;

  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    const h1NeedsPageBreak = elem.type === 'h1' && needsPageBreak(elem.content) && children.length > 0;
    
    // 处理表格
    if (elem.type === 'table-row') {
      tableRows.push(elem);
      continue;
    } else if (tableRows.length > 0) {
      // 输出累积的表格
      const table = generateTable(tableRows);
      if (table) {
        children.push(table);
        children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
      }
      tableRows = [];
    }
    
    // 检测摘要
    if (isAbstract(elem.content)) {
      afterAbstract = true;
    }

    if (elem.type === 'h1' && /^参考文献/.test(elem.content)) {
      inReferenceSection = true;
    } else if (elem.type === 'h1' && !/^参考文献/.test(elem.content)) {
      inReferenceSection = false;
    }
    
    // 在摘要后插入目录（只插入一次）
    if (afterAbstract && !hasTOC && elem.type === 'h1' && !isAbstract(elem.content)) {
      // 摘要后换页
      children.push(new Paragraph({ text: '', pageBreakBefore: true }));
      children.push(...generateTextToc(elements));
      // 目录后换页
      children.push(new Paragraph({ text: '', pageBreakBefore: true }));
      hasTOC = true;
    }
    
    // 生成对应内容（章标题分页：不再插入空段落，避免章首多出一行空白）
    switch (elem.type) {
      case 'h1': {
        const h1SpacingBefore = h1NeedsPageBreak ? 120 : 600;
        if (elem.variant === 'abstract') {
          inAbstractSection = true;
          children.push(new Paragraph({
            text: elem.content,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            pageBreakBefore: h1NeedsPageBreak,
            spacing: { before: h1SpacingBefore, after: 300 },
            run: {
              font: '黑体',
              size: 16 * 2,
              bold: true
            }
          }));
        } else {
          inAbstractSection = false;
          children.push(new Paragraph({
            text: elem.content,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            pageBreakBefore: h1NeedsPageBreak,
            spacing: { before: h1SpacingBefore, after: 300 },
            run: {
              font: '黑体',
              size: 16 * 2,
              bold: true
            }
          }));
        }
        break;
      }
      
      case 'h2':
        inAbstractSection = false;
        children.push(new Paragraph({
          text: elem.content,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 300 },
          run: {
            font: '黑体',
            size: 14 * 2
          }
        }));
        break;
      
      case 'h3':
        inAbstractSection = false;
        children.push(new Paragraph({
          text: elem.content,
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 0, after: 0 },
          run: {
            font: '黑体',
            size: 12 * 2
          }
        }));
        break;
      
      case 'table-caption':
        inAbstractSection = false;
        children.push(new Paragraph({
          text: elem.content,
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
          run: {
            font: '宋体',
            size: 12 * 2,
            bold: true
          }
        }));
        break;
      
      case 'p': {
        // 参考文献部分不使用上标，其他部分使用
        const textParts = inReferenceSection 
          ? [new TextRun({ text: elem.content, font: '宋体', size: 12 * 2 })]
          : parseTextWithSuperscripts(elem.content);
        
        children.push(new Paragraph({
          children: textParts,
          spacing: { after: 200 },
          indent: inAbstractSection ? undefined : { firstLine: 720 }, // 2字符缩进（12pt * 2 = 24pt = 480 half-points，但需要更大）
          alignment: AlignmentType.JUSTIFIED
        }));
        break;
      }
    }
  }
  
  // 处理最后可能残留的表格
  if (tableRows.length > 0) {
    const table = generateTable(tableRows);
    if (table) {
      children.push(table);
    }
  }

  const hasAckHeading = /(^|\n)\s*致谢\s*(?:[：:\n]|$)/m.test(cleanedContent);
  if (!hasAckHeading) {
    children.push(new Paragraph({ text: '', pageBreakBefore: true }));
    children.push(new Paragraph({
      text: '致谢',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 300 },
      run: {
        font: '黑体',
        size: 16 * 2,
        bold: true
      }
    }));
    DEFAULT_ACKNOWLEDGMENT_PARAS.forEach((para) => {
      children.push(new Paragraph({
        children: [new TextRun({ text: para, font: '宋体', size: 12 * 2 })],
        spacing: { after: 200 },
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: 720 }
      }));
    });
  }

  // 创建文档
  const doc = new Document({
    features: {
      updateFields: true
    },
    sections: [{
      properties: {
        page: {
          size: {
            width: 11906, // A4 width in twentieths of a point (210mm)
            height: 16838 // A4 height in twentieths of a point (297mm)
          },
          margin: {
            top: 1440,    // 2.54cm = 1440 twentieths
            right: 1800,  // 3.17cm = 1800 twentieths
            bottom: 1440,
            left: 1800
          }
        }
      },
      children: children
    }],
    styles: {
      default: {
        document: {
          run: {
            font: '宋体',
            size: 12 * 2 // 12pt
          },
          paragraph: {
            spacing: {
              line: 360, // 1.5倍行距 (12pt * 1.5 = 18pt = 360 half-points)
              lineRule: 'auto'
            }
          }
        }
      }
    }
  });
  
  return doc;
}

/**
 * 生成Word文档并保存
 * @returns {Promise<string>} 文件路径
 */
async function generateAndSaveWord(document) {
  try {
    // 生成 docx 文档对象
    const doc = await generateWordDocx(document);
    
    // 创建导出目录
    const exportsDir = path.join(__dirname, '../exports');
    await fs.mkdir(exportsDir, { recursive: true });
    
    // 生成文件名（严格清理，确保 iOS 兼容性）
    // 移除所有可能导致问题的字符，只保留安全的字符
    const safeTitle = (document.title || '未命名文档')
      .replace(/[^\x20-\x7E\u4E00-\u9FA5]/g, '_') // 只保留 ASCII 可打印字符和中文
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // 移除 Windows/iOS 非法字符
      .replace(/\s+/g, '_') // 空格替换为下划线
      .replace(/_+/g, '_') // 多个下划线合并为一个
      .replace(/^_+|_+$/g, '') // 移除首尾下划线
      .substring(0, 50) || 'document'; // 确保不为空
    
    const fileName = `${safeTitle}_${document.id}_${Date.now()}.docx`;
    const filePath = path.join(exportsDir, fileName);
    
    // 生成二进制文件
    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(filePath, buffer);
    
    logger.info(`Word文档自动生成: ${document.title}, 文件: ${fileName}`);
    
    // 返回相对路径（用于数据库存储）
    return `exports/${fileName}`;
    
  } catch (error) {
    logger.error('生成Word文档失败:', error);
    throw error;
  }
}

module.exports = {
  generateWordDocx,
  generateAndSaveWord,
  cleanText
};
