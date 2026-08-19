const WRITING_PRINCIPLES = `
写作原则：
1. 严格服从用户给出的题目、学科、文档类型、篇幅和补充要求。
2. 结构完整，章节之间自然衔接，避免内容重复和模板化套话。
3. 语言自然、具体、克制，避免“赋能、深度剖析、综上所述可知”等机械表达。
4. 不要输出写作过程、模型说明、提示词或对用户的解释，只输出目标文档内容。
5. 用户没有提供研究数据、案例或来源时，不要把建议性的研究设计写成已经完成的事实。`;

const DEFENSE_SPEECH_EXAMPLE = `学生答辩自述稿（参考）
尊敬的各位老师：
上（下）午好！
我的论文题目是《中国传统纹样在视觉传达设计中的应用研究》。这篇论文是在我的指导老师**老师的悉心指点下完成的！下面我将这篇论文的写作研究意义、结构及主要内容、存在的不足向各位老师作简要的陈述，恳请各位老师批评指导。
首先，我想谈谈为什么选这个题目及这篇文章研究的目的、意义。
中国传统纹样是中华文明的瑰宝，蕴含着深厚的文化底蕴和独特的东方美学。在全球化背景下，如何将这些宝贵的文化遗产融入现代视觉传达设计，不仅是对传统的传承，更是推动设计创新的重要途径。因此，本研究旨在探讨传统纹样在当代设计中的应用方式与价值，希望能为提升设计作品的文化内涵和艺术表现力提供参考，促进文化传承与设计创新的结合。
其次，我想谈谈这篇文章的结构和主要内容。
我的论文主要分为以下三个部分：
第一部分是理论基础的构建。这部分首先界定了研究的背景、意义与国内外研究现状。接着，系统地梳理了中国传统纹样的历史渊源、主要分类方法、显著特征及其承载的文化内涵。同时，也对视觉传达设计的定义、核心要素、基本原则以及当前的发展趋势进行了阐述，为后续分析奠定了理论根基。
第二部分是应用实践的分析。这是论文的核心章节，重点探讨了中国传统纹样如何在现代视觉传达设计的具体实践中得以应用。我分别考察了其在平面设计、品牌设计、包装设计和环境设计这四个主要领域中的表现形式、设计方法和创新策略，并通过具体案例来佐证纹样应用的有效性与多样性。
第三部分是融合价值的提炼。在理论梳理和实践分析的基础上，这一部分着重探讨了传统纹样与现代设计融合的深层价值与实现路径。分析了这种融合如何提升设计的文化属性、审美价值和创新潜力，并对如何更好地实现传统元素的现代转化提出了思考，为引出最终结论做铺垫。
我的论文结论是：中国传统纹样与现代视觉传达设计的有机融合，能够显著增强设计的艺术表现力和文化深度，赋予作品独特的东方审美意蕴，并为设计创新提供丰富的灵感来源。通过对传统纹样的深刻理解与创造性转化应用，视觉传达设计在传承中华优秀传统文化、塑造独特视觉形象和满足现代社会审美需求方面展现出巨大的潜能与价值。
最后，我想谈谈这篇文章存在的不足。
在研究和写作过程中，我也认识到本研究尚存一些局限性。比如，所选取的案例分析虽然力求典型，但在数量和覆盖面上可能还不够充分，未能完全展现传统纹样应用的广度与所有可能性。其次，在探讨纹样文化内涵向现代设计语言转化的具体机制和效果评估方面，分析的深度和系统性还有待加强。研究视角可能更多集中在设计本身，对于不同受众群体的接受度、市场反应等外部因素的考量相对有限。这些不足之处，期待在未来的学习中能够进一步完善。
以上是我的论文答辩自述，敬请各位评委老师提出宝贵的意见。谢谢！`;

function buildDirectDefenseMessages({ topic, field, requirements = '' }) {
  return [
    {
      role: 'system',
      content: '你是中文论文答辩稿写作者。只输出可直接使用的答辩自述稿正文，不要解释写作过程，不要使用 Markdown 加粗、代码围栏或星号。'
    },
    {
      role: 'user',
      content: `题目：${topic}
学科：${field || '未指定'}
补充要求：${requirements || '无'}

据此，根据我的题目写一个答辩稿。
需要结合题目合理完成论文的研究意义、结构及主要内容、核心结论和存在不足，内容充实且不跑题。
语言需要多元、完整，强调凝练、符合论文风格、直接陈述观点，避免空泛陈述，省略一般性描述。
严格参照下面示范的行文顺序、称谓和层次，但所有实质内容必须围绕当前题目生成，不得照抄示例中的传统纹样、视觉传达设计等内容，也不要虚构具体导师姓名。

${DEFENSE_SPEECH_EXAMPLE}`
    }
  ];
}

function buildDirectMidtermMessages({ topic, field, requirements = '' }) {
  return [
    {
      role: 'system',
      content: '你是中文论文中期检查材料写作者。只输出中期检查表正文，不要解释写作过程，不要使用 Markdown 加粗、代码围栏或星号。'
    },
    {
      role: 'user',
      content: `题目：${topic}
学科：${field || '未指定'}
补充要求：${requirements || '无'}

据此，根据我的题目写一个中期检查表。
需要结合题目合理完成论文已经开展和后续需要完成的内容，内容充实且不跑题。
语言需要多元、完整，强调凝练、符合论文风格、直接陈述观点，避免空泛陈述，省略一般性描述。
不要虚构已经获得的调查数据、实验结果或具体统计结论；未提供实际进度时，采用合理、审慎的阶段性表述。
严格按照下面的栏目、顺序和编号输出，不增加其他栏目：

已完成的工作：
1.XXXX
2.XXXX
3.XXXX
未完成的工作：
1.XXXX
2.XXXX
指导教师评议：
该课题较为新颖，工作量较为充足，XXXX，予以通过。`
    }
  ];
}

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

function buildLegacyTitleMessages({ field, excludeTitles = [] }) {
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

function buildTitleMessages({ field, excludeTitles = [] }) {
  return [
    { role: 'system', content: '你是专业论文题目生成器，只输出一个论文题目，不加解释。' },
    { role: 'user', content: `专业：${field}
根据所在专业，生成论文题目。
仅输出题目即可，示范：
XXXX对策研究
XXXXX现状分析
XXXXX调查研究
XXXXX设计
XXXX背景下XXXX研究
XXXX视域下XXXX研究
基于XXXX的XXXX设计
基于XXXX的XXXX分析
基于XXXX的XXXX研究

下面针对具体专业的题目范式：
（1）经济管理类：
基于杜邦分析法的XXX（公司）偿债/盈利/运营能力分析
XXX（公司）盈利/运营/偿债能力分析
中小企业/某某行业 盈利/运营/偿债能力分析-以XXX（公司名）为例

（2）教育类
中班/小班/大班幼儿XXX行为调查研究/分析
XXX幼儿XXX行为及干预策略研究
XXXX现状及策略研究
XX（地区）小学/中学XXX研究
XX（地区）小学/中学XXX调查研究
XXX地区小/中学低/高年级XXX（现象，如课外阅读）的问题及对策研究-以那XX小学为例

（3）电气
基于matlab的XXX系统设计
基于Matlab的XXXX（研究内容）XXX研究
基于单片机的XXXX系统的设计与实现
基于单片机的XXXXX系统设计
基于PLC的XXXXX系统设计
基于PLC的XXXXX的设计与实现
${excludeTitles.length ? `不要重复这些题目：${excludeTitles.join('；')}` : ''}` }
  ];
}

module.exports = {
  WRITING_PRINCIPLES,
  buildDirectDefenseMessages,
  buildDirectMidtermMessages,
  buildPlanningMessages,
  buildSectionMessages,
  buildTitleMessages
};
