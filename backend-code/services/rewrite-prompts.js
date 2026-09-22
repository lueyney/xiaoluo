/**
 * Shared rewrite prompt and request-message builder.
 *
 * The AI rewrite and document rewrite entry points share this A/B/C prompt builder.
 */
const ACADEMIC_V1_REWRITE_PROMPT_A = `你是中文改写编辑。改写用户提供的文本，唯一目标是降低AIGC检测率。

【底线】
意思不变，不增删信息；"一定程度上、部分、可能、显著"等程度表达，改写后强弱不变。术语、数字、专有名词、引文原样保留。语体与原文一致。段落数不变，标题不改。

【通用要求】

1. 高频词：下列词句出现即删去或改写，改写中也不得新增；承载程度或实际含义的，换成等义说法。
   赋能、助力、彰显、凸显、聚焦、打造、深度融合、发挥…作用、起到…作用、提供…支撑、具有重要意义、奠定…基础、呈现…趋势、不断完善、持续优化；
   首先/其次/最后、一方面/另一方面、不仅…而且、与此同时、由此可见、综上所述、总之、值得注意的是、需要指出的是、在…背景下、随着…的发展、从…角度看、换言之、这意味着；
   有效、显著、积极、切实、全面、深入、进一步、日益、不断、至关重要、不可或缺、极大地；
   不是…而是…、既…又…、…的同时。
2. 用词：避开最常见的搭配，优先选第二、第三顺位但同样自然的说法；同一个替换词全文不超过2次。
3. 句长：长短不规则，不出现连续三句长度相近。100字以上的段落，至少有一句不超过12字、一句超过40字。
4. 句式：相邻两句的开头和句式不同，少用"该、这、其"起句；不对仗，不排比，三项并列要拆出主次。
5. 名词化："进行分析、加以改进、予以调整"一类，改为直接动词。
6. 段落：不必先总后分，段内句序可调；段末只复述前文的总结句删去，含新信息的改为直接陈述。
7. 标点：不新增破折号、冒号引出的总结、分号并列。

【本方案重点：句式重构】

1. 动宾结构改为介词前置：以A对B作…、将B按A…、把A用于B、对于B，……
2. 抽象评价改为"其价值在于"加具体作用。
3. 谓语后移，如"A提升了B"改为"B的提高得益于A"。
4. 上述结构每段不超过2处，不在相邻两句连用。
   示例：信息化手段的应用有效提升了审批效率。→ 审批效率的提高，得益于信息化手段的应用。

只输出改写后的正文。`;

const ACADEMIC_V1_REWRITE_PROMPT_B = `你是中文改写编辑。改写用户提供的文本，唯一目标是降低AIGC检测率。

【底线】
意思不变，不增删信息；"一定程度上、部分、可能、显著"等程度表达，改写后强弱不变。术语、数字、专有名词、引文原样保留。语体与原文一致。段落数不变，标题不改。

【通用要求】

1. 高频词：下列词句出现即删去或改写，改写中也不得新增；承载程度或实际含义的，换成等义说法。
   赋能、助力、彰显、凸显、聚焦、打造、深度融合、发挥…作用、起到…作用、提供…支撑、具有重要意义、奠定…基础、呈现…趋势、不断完善、持续优化；
   首先/其次/最后、一方面/另一方面、不仅…而且、与此同时、由此可见、综上所述、总之、值得注意的是、需要指出的是、在…背景下、随着…的发展、从…角度看、换言之、这意味着；
   有效、显著、积极、切实、全面、深入、进一步、日益、不断、至关重要、不可或缺、极大地；
   不是…而是…、既…又…、…的同时。
2. 用词：避开最常见的搭配，优先选第二、第三顺位但同样自然的说法；同一个替换词全文不超过2次。
3. 句长：长短不规则，不出现连续三句长度相近。100字以上的段落，至少有一句不超过12字、一句超过40字。
4. 句式：相邻两句的开头和句式不同，少用"该、这、其"起句；不对仗，不排比，三项并列要拆出主次。
5. 名词化："进行分析、加以改进、予以调整"一类，改为直接动词。
6. 段落：不必先总后分，段内句序可调；段末只复述前文的总结句删去，含新信息的改为直接陈述。
7. 标点：不新增破折号、冒号引出的总结、分号并列。

【本方案重点：节奏重组】

1. 意思相关的短句合并成长句，关键信息单独成短句；段内句序可以调整。
2. 删去上下句的重复意思，以及可推断的主语、承前宾语、指代词。
3. 并列项调整主次，各项用不同句法表达。
4. 复合连接词换成"但、而、也、则、就"，能省则省。
5. 介词前置结构每段不超过1处。
   示例：该方案不仅降低了运行成本，而且提高了处理效率，同时减少了人工误差。→ 采用该方案后，运行成本下降。处理效率提高，人工误差亦随之减少。

只输出改写后的正文。`;

const ACADEMIC_V1_REWRITE_PROMPT_C = `你是中文改写编辑。改写用户提供的文本，唯一目标是降低AIGC检测率。

【底线】
意思不变，不增删信息；"一定程度上、部分、可能、显著"等程度表达，改写后强弱不变。术语、数字、专有名词、引文原样保留。语体与原文一致。段落数不变，标题不改。

【通用要求】

1. 高频词：下列词句出现即删去或改写，改写中也不得新增；承载程度或实际含义的，换成等义说法。
   赋能、助力、彰显、凸显、聚焦、打造、深度融合、发挥…作用、起到…作用、提供…支撑、具有重要意义、奠定…基础、呈现…趋势、不断完善、持续优化；
   首先/其次/最后、一方面/另一方面、不仅…而且、与此同时、由此可见、综上所述、总之、值得注意的是、需要指出的是、在…背景下、随着…的发展、从…角度看、换言之、这意味着；
   有效、显著、积极、切实、全面、深入、进一步、日益、不断、至关重要、不可或缺、极大地；
   不是…而是…、既…又…、…的同时。
2. 用词：避开最常见的搭配，优先选第二、第三顺位但同样自然的说法；同一个替换词全文不超过2次。
3. 句长：长短不规则，不出现连续三句长度相近。100字以上的段落，至少有一句不超过12字、一句超过40字。
4. 句式：相邻两句的开头和句式不同，少用"该、这、其"起句；不对仗，不排比，三项并列要拆出主次。
5. 名词化："进行分析、加以改进、予以调整"一类，改为直接动词。
6. 段落：不必先总后分，段内句序可调；段末只复述前文的总结句删去，含新信息的改为直接陈述。
7. 标点：不新增破折号、冒号引出的总结、分号并列。

【本方案重点：具体化】

1. 抽象名词作主语的句子，改为具体执行者作主语，把宏观论述写成动作陈述；只用原文已有或可直接推出的信息。
2. "实现、推动、提升、促进、构建、加强、完善"等换成具体动作。
3. 连接词不放句首，改用句中的"却、则、亦"，或直接省去。
4. 术语以外的书面套语拆开，换成普通说法，所指不变。
5. 介词前置结构每段不超过1处；抽象名词作主语的句子每段不超过1句。
   示例：然而，由于缺乏有效的沟通机制，项目推进中出现了诸多问题。→ 项目推进中却问题频出，根源在于沟通机制不健全。

只输出改写后的正文。`;

const BEST_REWRITE_PROMPT = ACADEMIC_V1_REWRITE_PROMPT_A;
const NOVEL_V2_REWRITE_PROMPT = ACADEMIC_V1_REWRITE_PROMPT_A;
const REWRITE_PROMPT = BEST_REWRITE_PROMPT;
const REWRITE_INPUT_TEMPLATE = '处理括号中的文本，仅返回降AI结果：【{{input}}】';

function normalizeRewriteVersion(value) {
  return value === 'v2' || value === 'v3' ? value : 'v1';
}

function academicPromptVariantForIndex() {
  return ['A', 'B', 'C'][Math.floor(Math.random() * 3)];
}

function normalizeAcademicPromptVariant(value, index) {
  const variant = String(value || '').trim().toUpperCase();
  return variant === 'A' || variant === 'B' || variant === 'C'
    ? variant
    : (index == null ? 'A' : academicPromptVariantForIndex(index));
}

function getRewritePrompt(rewriteVersion, context = {}) {
  const prompts = {
    A: ACADEMIC_V1_REWRITE_PROMPT_A,
    B: ACADEMIC_V1_REWRITE_PROMPT_B,
    C: ACADEMIC_V1_REWRITE_PROMPT_C
  };
  const variant = normalizeAcademicPromptVariant(context.promptVariant);
  return prompts[variant] || BEST_REWRITE_PROMPT;
}

function buildRewriteMessages(text, context = {}) {
  const input = text == null ? '' : String(text);
  const batchTexts = Array.isArray(context.batchTexts)
    ? context.batchTexts.map((item) => String(item == null ? '' : item).trim()).filter(Boolean)
    : [];
  const previousRewrittenSentences = Array.isArray(context.previousRewrittenSentences)
    ? context.previousRewrittenSentences.map((item) => String(item == null ? '' : item).trim()).filter(Boolean).slice(-2)
    : (context.previousRewrittenSentence == null || !String(context.previousRewrittenSentence).trim()
      ? []
      : [String(context.previousRewrittenSentence).trim()]);
  let userContent = batchTexts.length
    ? `请按原顺序分别处理以下${batchTexts.length}句。每个输入句对应一个输出行，严格输出${batchTexts.length}行；不得合并、拆出额外句子、调换顺序、遗漏或添加编号和说明。相邻句要有不同的句式和开头，但事实、主体和语境必须保持不变：\n${batchTexts.map((item) => `【${item}】`).join('\n')}`
    : REWRITE_INPUT_TEMPLATE.replace('{{input}}', input);
  if (previousRewrittenSentences.length) {
    const previousLines = previousRewrittenSentences
      .map((sentence, index) => `上${index === previousRewrittenSentences.length - 1 ? '一句' : '两句'}：【${sentence}】`)
      .join('\n');
    userContent = `${previousLines}\n降重后禁止与上两句的句式和表达方式一致。\n${userContent}`;
  }
  const prompt = getRewritePrompt(context.rewriteVersion, context);
  return [
    { role: 'system', content: prompt },
    { role: 'user', content: userContent }
  ];
}

// Compatibility adapter for integrations that still consume one string.
function buildRewritePrompt(text, rewriteVersion, context = {}) {
  const input = text == null ? '' : String(text);
  const batchTexts = Array.isArray(context.batchTexts)
    ? context.batchTexts.map((item) => String(item == null ? '' : item).trim()).filter(Boolean)
    : [];
  const previousRewrittenSentences = Array.isArray(context.previousRewrittenSentences)
    ? context.previousRewrittenSentences.map((item) => String(item == null ? '' : item).trim()).filter(Boolean).slice(-2)
    : (context.previousRewrittenSentence == null || !String(context.previousRewrittenSentence).trim()
      ? []
      : [String(context.previousRewrittenSentence).trim()]);
  let userContent = batchTexts.length
    ? `请按原顺序分别处理以下${batchTexts.length}句。每个输入句对应一个输出行，严格输出${batchTexts.length}行；不得合并、拆出额外句子、调换顺序、遗漏或添加编号和说明。相邻句要有不同的句式和开头，但事实、主体和语境必须保持不变：\n${batchTexts.map((item) => `【${item}】`).join('\n')}`
    : REWRITE_INPUT_TEMPLATE.replace('{{input}}', input);
  if (previousRewrittenSentences.length) {
    const previousLines = previousRewrittenSentences
      .map((sentence, index) => `上${index === previousRewrittenSentences.length - 1 ? '一句' : '两句'}：【${sentence}】`)
      .join('\n');
    userContent = `${previousLines}\n降重后禁止与上两句的句式和表达方式一致。\n${userContent}`;
  }
  return userContent;
}

module.exports = {
  BEST_REWRITE_PROMPT,
  REWRITE_PROMPT,
  ACADEMIC_V1_REWRITE_PROMPT_A,
  ACADEMIC_V1_REWRITE_PROMPT_B,
  ACADEMIC_V1_REWRITE_PROMPT_C,
  NOVEL_V2_REWRITE_PROMPT,
  REWRITE_INPUT_TEMPLATE,
  academicPromptVariantForIndex,
  normalizeAcademicPromptVariant,
  normalizeRewriteVersion,
  getRewritePrompt,
  buildRewriteMessages,
  buildRewritePrompt
};
