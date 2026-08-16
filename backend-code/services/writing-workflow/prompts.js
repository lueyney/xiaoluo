const WRITING_PRINCIPLES = `
写作原则：
1. 严格服从用户给出的题目、学科、文档类型、篇幅和补充要求。
2. 结构完整，章节之间自然衔接，避免内容重复和模板化套话。
3. 语言自然、具体、克制，避免“赋能、深度剖析、综上所述可知”等机械表达。
4. 不要输出写作过程、模型说明、提示词或对用户的解释，只输出目标文档内容。
5. 用户没有提供研究数据、案例或来源时，不要把建议性的研究设计写成已经完成的事实。`;

function buildPlanningMessages(input) {
  return [
    {
      role: 'system',
      content: `你是学术长文工作流的结构规划器。只负责制定可执行的全文结构。${WRITING_PRINCIPLES}`
    },
    {
      role: 'user',
      content: `为下面的写作任务制定计划，仅输出 JSON：

题目：${input.topic}
学科：${input.field}
文档类型：${input.docType}
文档目标：${input.description}
目标字数：约 ${input.targetWords} 字
补充要求：${input.requirements || '无'}
最多章节数：${input.maxSections}

格式：
{
  "title": "文档标题",
  "thesis": "全文核心思路",
  "audience": "主要读者",
  "sections": [
    {
      "heading": "章节标题",
      "purpose": "本节任务",
      "keyPoints": ["要点1", "要点2"],
      "targetWords": 600
    }
  ]
}

各节字数合计应接近 ${input.targetWords}，不要输出 Markdown 代码块。`
    }
  ];
}

function buildSectionMessages(input) {
  const previousHeadings = input.sections.map((section) => section.heading).join('、') || '无';
  return [
    {
      role: 'system',
      content: `你是学术长文工作流的章节撰写器，只完成当前章节。${WRITING_PRINCIPLES}`
    },
    {
      role: 'user',
      content: `撰写当前章节：

全文标题：${input.plan.title}
原始题目：${input.topic}
学科：${input.field}
文档类型：${input.docType}
全文核心：${input.plan.thesis}
补充要求：${input.requirements || '无'}
已完成章节：${previousHeadings}

当前章节：${input.currentSection.heading}
本节任务：${input.currentSection.purpose}
覆盖要点：${input.currentSection.keyPoints.join('；') || '按本节任务展开'}
目标长度：约 ${input.currentSection.targetWords} 字

第一行使用“## ${input.currentSection.heading}”，随后直接输出本节正文。不要重复全文标题，不要输出说明。`
    }
  ];
}

function buildTitleMessages({ field, excludeTitles }) {
  return [
    {
      role: 'system',
      content: '你是中文学术选题助手。生成一个范围适中、研究对象明确、可操作且表达自然的论文题目。只输出题目，不加序号、引号、解释或标点结尾。'
    },
    {
      role: 'user',
      content: `学科领域：${field}\n${excludeTitles.length ? `不要与这些题目重复或高度相似：${excludeTitles.join('；')}` : ''}`
    }
  ];
}

module.exports = {
  WRITING_PRINCIPLES,
  buildPlanningMessages,
  buildSectionMessages,
  buildTitleMessages
};
