/**
 * Shared rewrite prompts and request-message builder.
 * Academic v1 keeps legacy A/B slots while both use prompt A.
 */
const ACADEMIC_V1_REWRITE_PROMPT_A = `角色：擅长输出低AI特征的降重大师。
目的：降低AIGC。
要求：降AI后的句子语气、语境和原文一致，减少意象堆叠。
方法：用新的表达，根据原文实际情况重构谓语和分句结构，替换高频AI词汇，并减少抽象表达，减少同构比喻和模糊副词。
改写规则：
1. 改变句式和表达方式，：“主语使用A完成B”改成“以A对B作处理”“将B按A处理”“把A用于B”等介词、处置或话题结构；如“XXX具有重要意义、奠定基础”等抽象描述，改成“其价值在于XXX”等具体句式。
2. 具象化部分抽象内容，减少抽象名词，并替换抽象名词表达：将抽象的理论名词、政策概念或运行机制等客观主语，转换为具体的同义词主语，使宏观层面的客观论述变为微观层面的动作执行陈述。
3. 将AI高频的谓语换成具体动作的表达：通过句式修改来改变谓语位置，改变高级自然句式，如介词引导。
4. 句内结构放大长短交错，即长句更长，短句更散，如此错落。严禁对仗工整，严禁相邻句式一致。并列内容必须调整主次重新组织，必须禁止相邻句的句式和表达一致。
5. 上下句禁止语义复述，句式逻辑禁止模板化，排列禁止整齐，重复则删除处理，避免多个长度相近、结构对称的分句连续排列；并列成分不要相同句法形式。
6. 动宾关系调整为介词引导的结构：由介词前置引导宾语，再衔接谓语动词的表达形式。
7. 调整复合连接词及其位置，采用较高困惑度的衔接表达，弱化惯常的承接、转折与递进形式，提高突发性。
8. 替换宾语及其修饰成分时，使用突发性较高的内容机械替换。`;

const ACADEMIC_V1_REWRITE_PROMPT_B = ACADEMIC_V1_REWRITE_PROMPT_A;
const NOVEL_V2_REWRITE_PROMPT = ACADEMIC_V1_REWRITE_PROMPT_A.replace(
  '\n8. 替换宾语及其修饰成分时，使用突发性较高的内容机械替换。',
  ''
);

const REWRITE_PROMPT = ACADEMIC_V1_REWRITE_PROMPT_A;
const REWRITE_INPUT_TEMPLATE = '处理括号中的文本，仅返回降AI结果：【{{input}}】';

function normalizeRewriteVersion(value) {
  return value === 'v2' || value === 'v3' ? value : 'v1';
}

function academicPromptVariantForIndex(index) {
  const ordinal = Number.isFinite(Number(index)) ? Math.max(0, Math.trunc(Number(index))) : 0;
  return ordinal % 2 === 0 ? 'A' : 'B';
}

function normalizeAcademicPromptVariant(value, index = 0) {
  const variant = String(value || '').trim().toUpperCase();
  return variant === 'A' || variant === 'B' ? variant : academicPromptVariantForIndex(index);
}

function getRewritePrompt(rewriteVersion = 'v1', context = {}) {
  const normalizedVersion = normalizeRewriteVersion(rewriteVersion);
  if (normalizedVersion === 'v2') return NOVEL_V2_REWRITE_PROMPT;
  if (normalizedVersion === 'v1'
    && normalizeAcademicPromptVariant(context.promptVariant, context.rewriteIndex) === 'B') {
    return ACADEMIC_V1_REWRITE_PROMPT_B;
  }
  return ACADEMIC_V1_REWRITE_PROMPT_A;
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
  REWRITE_PROMPT,
  ACADEMIC_V1_REWRITE_PROMPT_A,
  ACADEMIC_V1_REWRITE_PROMPT_B,
  NOVEL_V2_REWRITE_PROMPT,
  REWRITE_INPUT_TEMPLATE,
  academicPromptVariantForIndex,
  normalizeAcademicPromptVariant,
  normalizeRewriteVersion,
  getRewritePrompt,
  buildRewriteMessages,
  buildRewritePrompt
};
