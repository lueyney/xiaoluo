const SITE_URL = 'https://yaoguangxiaoluo.cn';

const commonLinks = [
  ['/ai-writing/', 'AI论文写作'],
  ['/paper-rewrite/', 'AI论文降重'],
  ['/document-rewrite/', 'Word文档降重'],
  ['/opening-report/', '开题报告'],
  ['/literature-review/', '文献综述'],
  ['/task-book/', '论文任务书'],
  ['/defense-script/', '毕业答辩稿'],
  ['/pricing/', '积分与价格']
];

const pages = {
  '/ai-writing/': {
    title: 'AI论文写作助手 - 论文、开题报告与文献综述生成 | 小珞AI',
    heading: 'AI论文写作助手',
    kicker: 'AI ACADEMIC WRITING',
    description: '小珞AI根据论文题目、专业和写作要求，辅助生成结构清晰的论文、开题报告、文献综述、任务书和答辩稿。',
    action: '/#writing',
    actionText: '开始AI写作',
    sections: [
      ['按文档类型组织内容', '选择论文、开题报告、文献综述、任务书或答辩稿，系统会按相应结构组织内容，减少从空白页面开始的时间。'],
      ['围绕你的课题生成', '填写论文题目、所属专业和补充要求，让生成结果围绕具体研究主题展开，并可继续编辑和完善。'],
      ['结果统一保存', '生成后的内容可进入文档库继续查看、编辑和导出，方便管理不同课题与历史版本。']
    ],
    faq: [['AI论文写作可以生成哪些材料？', '目前支持学术论文范文、开题报告、任务书、文献综述、答辩稿和中期检查材料等类型。'], ['生成后还能修改吗？', '可以。生成结果会进入工作台，可继续编辑、保存和导出。']]
  },
  '/paper-rewrite/': {
    title: 'AI论文降重助手 - 在线改写与表达优化 | 小珞AI',
    heading: 'AI论文降重与智能改写',
    kicker: 'AI PAPER REWRITE',
    description: '粘贴需要优化的论文段落，小珞AI在尽量保留原意的前提下调整句式、措辞和表达方式，辅助降低重复表述。',
    action: '/#rewrite', actionText: '开始AI降重',
    sections: [['保留核心原意', '围绕原文信息进行表达重组，避免简单替换近义词导致语义偏差。'], ['优化句式与措辞', '调整语序、句型和段落表达，使内容更自然、更符合书面写作习惯。'], ['适合分段处理', '可按章节或段落逐步处理，并结合学校规范与个人判断进行最终修改。']],
    faq: [['AI降重等于查重吗？', '不等于。AI降重用于改写表达，最终重复率应以学校认可的查重系统报告为准。'], ['会改变论文原意吗？', '系统会尽量保留核心意思，但专业术语、数据和引用仍建议人工复核。']]
  },
  '/document-rewrite/': {
    title: 'Word文档降重 - 保留格式的DOCX论文降重 | 小珞AI',
    heading: 'Word文档智能降重',
    kicker: 'DOCX DOCUMENT REWRITE',
    description: '上传DOCX论文文档，按原文段落处理重复表达并生成可下载的Word结果，减少复制粘贴和重新排版。',
    action: '/#document-rewrite', actionText: '上传Word文档',
    sections: [['直接上传DOCX', '面向已有完整论文文档的用户，无需逐段复制到文本框。'], ['尽量保留文档结构', '在原文档基础上替换处理后的文本，减少重新整理内容与格式的工作量。'], ['任务进度可查看', '文档处理完成后可下载结果，并在文档库中保留对应记录。']],
    faq: [['支持哪些文件格式？', '当前主要面向DOCX格式的Word文档。'], ['处理后需要人工检查吗？', '需要。请重点复核公式、表格、引用、专业术语和特殊格式。']]
  },
  '/opening-report/': {
    title: '开题报告AI生成助手 - 研究背景、方法与计划 | 小珞AI',
    heading: '开题报告AI写作助手',
    kicker: 'OPENING REPORT',
    description: '根据毕业论文题目和专业方向，辅助整理研究背景、研究意义、研究内容、研究方法、进度安排与预期成果。',
    action: '/#writing', actionText: '生成开题报告',
    sections: [['梳理研究背景与意义', '从课题所处领域、现实问题和研究价值出发，建立开题报告的论述起点。'], ['明确研究内容与方法', '围绕研究问题组织主要内容，并给出与课题匹配的方法和实施思路。'], ['形成进度与成果计划', '辅助安排资料收集、研究实施、论文撰写和修改答辩等阶段。']],
    faq: [['生成内容能直接提交吗？', '建议根据学校模板、导师意见和真实研究计划进行修改后再提交。'], ['不同专业都能使用吗？', '可以填写专业和具体要求，系统会据此调整内容方向。']]
  },
  '/literature-review/': {
    title: '文献综述AI写作助手 - 研究现状与文献梳理 | 小珞AI',
    heading: '文献综述AI写作助手',
    kicker: 'LITERATURE REVIEW',
    description: '围绕论文主题辅助梳理研究脉络、主要观点、争议与研究不足，形成结构化的文献综述初稿。',
    action: '/#writing', actionText: '生成文献综述',
    sections: [['按主题组织研究脉络', '将相关研究按议题、方法或发展阶段归类，避免简单罗列文献。'], ['归纳观点与争议', '提炼不同研究之间的共识、差异和争论，使综述更有分析性。'], ['识别研究不足', '在已有成果基础上总结可继续研究的问题，为论文选题和研究设计提供衔接。']],
    faq: [['会自动提供真实文献吗？', '生成内容中的文献信息必须通过权威数据库核验，不应把未经核实的条目直接作为引用。'], ['文献综述和论文正文有什么区别？', '文献综述重点评价已有研究，论文正文还需要呈现自己的研究问题、方法、分析与结论。']]
  },
  '/task-book/': {
    title: '毕业论文任务书AI生成 - 目标、内容与进度安排 | 小珞AI',
    heading: '毕业论文任务书生成助手', kicker: 'THESIS TASK BOOK',
    description: '根据论文题目辅助整理毕业论文的主要任务、目标要求、研究内容、工作步骤和进度安排。',
    action: '/#writing', actionText: '生成论文任务书',
    sections: [['明确课题目标', '把选题转化为清楚、可检查的论文目标和成果要求。'], ['拆分研究任务', '将资料收集、理论分析、调研或数据处理、论文撰写等工作拆成具体任务。'], ['安排完成节点', '辅助形成从开题到定稿、答辩的阶段计划，并可按院校要求调整。']],
    faq: [['是否适配学校模板？', '生成的是内容初稿，需复制或调整到学校指定模板，并遵循院系格式要求。'], ['任务书和开题报告一样吗？', '不一样。任务书更强调任务、要求和进度，开题报告更强调研究依据、问题、方法与方案。']]
  },
  '/defense-script/': {
    title: '毕业论文答辩稿AI生成 - 答辩陈述提纲 | 小珞AI',
    heading: '毕业论文答辩稿生成助手', kicker: 'THESIS DEFENSE',
    description: '根据论文题目、研究内容与结论辅助整理毕业答辩陈述稿，覆盖选题背景、研究方法、主要发现与总结。',
    action: '/#writing', actionText: '生成毕业答辩稿',
    sections: [['提炼论文核心内容', '从完整论文中提取答辩最需要说明的研究问题、方法、结果和结论。'], ['适合口头表达', '将书面论文内容改造成层次清楚、便于现场陈述的表达。'], ['辅助控制陈述结构', '按开场、研究介绍、成果说明和总结致谢组织内容，便于结合规定时长修改。']],
    faq: [['能控制答辩时长吗？', '可在补充要求中说明预计时长，并在生成后结合个人语速试讲调整。'], ['还需要准备答辩问题吗？', '需要。建议针对研究方法、数据来源、创新点和不足准备可能的追问。']]
  },
  '/pricing/': {
    title: '小珞AI积分与价格 - AI写作和论文降重费用',
    heading: '小珞AI积分与价格', kicker: 'PRICING & CREDITS',
    description: '查看小珞AI的积分使用方式。不同写作类型和降重任务按页面实际显示的积分计费，提交前可看到所需积分。',
    action: '/#orders', actionText: '查看积分套餐',
    sections: [['先查看再提交', '每项任务所需积分会在对应功能页展示，确认后再开始生成或处理。'], ['按任务类型计费', '论文写作、不同学术材料和降重服务会根据处理内容使用相应积分。'], ['记录清晰可查', '登录后可在积分与订单页面查看余额、充值记录和使用记录。']],
    faq: [['新用户可以体验吗？', '注册后的可用活动与赠送积分以页面当时展示为准。'], ['充值后在哪里查看？', '登录后进入积分与订单页面，可查看当前余额和相关记录。']]
  }
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderPage(pathname, page) {
  const canonical = `${SITE_URL}${pathname}`;
  const cards = page.sections.map((section, index) => `<article class="seo-card"><span>0${index + 1}</span><h2>${escapeHtml(section[0])}</h2><p>${escapeHtml(section[1])}</p></article>`).join('');
  const faqs = page.faq.map((item) => `<details><summary>${escapeHtml(item[0])}</summary><p>${escapeHtml(item[1])}</p></details>`).join('');
  const navLinks = commonLinks.map(([href, label]) => `<a href="${href}">${label}</a>`).join('');
  const schema = JSON.stringify({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', name: page.heading, url: canonical, description: page.description, inLanguage: 'zh-CN', isPartOf: { '@id': `${SITE_URL}/#website` } },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: '小珞AI首页', item: `${SITE_URL}/` }, { '@type': 'ListItem', position: 2, name: page.heading, item: canonical }] },
    { '@type': 'FAQPage', mainEntity: page.faq.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) }
  ]}).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(page.title)}</title><meta name="description" content="${escapeHtml(page.description)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1"><link rel="canonical" href="${canonical}"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="shortcut icon" href="/favicon.ico"><link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="stylesheet" href="/seo.css"><meta property="og:type" content="website"><meta property="og:site_name" content="小珞AI"><meta property="og:title" content="${escapeHtml(page.title)}"><meta property="og:description" content="${escapeHtml(page.description)}"><meta property="og:url" content="${canonical}"><script type="application/ld+json">${schema}</script></head><body><header class="seo-nav"><nav class="seo-nav-inner" aria-label="主导航"><a class="seo-brand" href="/"><img src="/favicon-192.png" alt="小珞AI"><span>小珞AI</span></a><div class="seo-links"><a href="/ai-writing/">AI写作</a><a href="/paper-rewrite/">AI降重</a><a href="/opening-report/">开题报告</a><a href="/literature-review/">文献综述</a></div><a class="seo-enter" href="${page.action}">进入工作台</a></nav></header><main class="seo-shell"><section class="seo-hero"><span class="seo-kicker">${escapeHtml(page.kicker)}</span><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.description)}</p><div class="seo-actions"><a class="seo-cta" href="${page.action}">${escapeHtml(page.actionText)}</a><a class="seo-secondary" href="/">了解小珞AI</a></div></section><section class="seo-grid" aria-label="功能特点">${cards}</section><section class="seo-content"><div><h2>用小珞AI完成这项任务</h2><p>从题目和要求出发生成初稿，再结合真实资料、学校规范和导师意见进行核验与修改。AI适合辅助整理思路和提升效率，重要内容仍应由使用者负责检查。</p><h3>建议使用流程</h3><ol><li>选择与任务匹配的文档或降重类型。</li><li>填写准确的题目、专业和补充要求。</li><li>检查事实、数据、引用、术语和格式。</li><li>根据个人研究和学校要求继续修改。</li></ol></div><aside class="seo-aside"><strong>小珞AI常用功能</strong>${navLinks}</aside></section><section class="seo-faq"><h2>常见问题</h2>${faqs}</section></main><footer class="seo-footer"><p>© 小珞AI · AI论文写作与降重助手</p><p><a href="/ai-writing/">AI论文写作</a><a href="/paper-rewrite/">论文降重</a><a href="/document-rewrite/">文档降重</a><a href="/pricing/">积分价格</a></p></footer></body></html>`;
}

function registerSeoPages(app) {
  Object.entries(pages).forEach(([pathname, page]) => {
    app.get([pathname, pathname.slice(0, -1)], (req, res) => {
      if (!req.path.endsWith('/')) return res.redirect(301, pathname);
      res.set('Cache-Control', 'public, max-age=300');
      return res.type('html').send(renderPage(pathname, page));
    });
  });
}

module.exports = { registerSeoPages, pages };
