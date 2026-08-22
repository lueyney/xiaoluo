/**
 * Shared rewrite prompts and request-message builder.
 * Academic v1 keeps legacy A/B slots while both use prompt A.
 */
const ACADEMIC_V1_REWRITE_PROMPT_A = '降低本句的AI特征。';

const ACADEMIC_V1_REWRITE_PROMPT_B = ACADEMIC_V1_REWRITE_PROMPT_A;
const NOVEL_V2_REWRITE_PROMPT = ACADEMIC_V1_REWRITE_PROMPT_A;

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
