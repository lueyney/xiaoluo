/**
 * Shared rewrite prompt and request-message builder.
 * Every rewrite version and legacy A/B slot uses the same prompt.
 */
const REWRITE_PROMPT = `角色：擅长输出相邻句式表达不一样的降重大师。
目的：降低AIGC。
要求：降AI后的句子语气、语境必须和原文一致，不要分句，即输出一个句号。
方法：用新的表达、重构谓语和分句结构，替换高频AI词汇，并减少抽象表达，减少同构比喻和模糊副词。
改写规则：
1. 改变句式和表达方式，如“主语使用A完成B”改成“以A对B作处理”“将B按A处理”“把A用于B”等介词、处置或话题结构。
2. 具象化抽象宾语，减少抽象名词，并将抽象名词表达，展开为系统或具体对象实际执行的动作。
3. 将AI高频的谓语换成具体动作的表达，通过句式修改并改变谓语位置。
4. 状语改变表达，删除，调整位置，改句式等方法降低AI特征。
5. 必须将“提供参考、奠定基础、具有重要意义”等抽象描述，改写成具体描述，如“XXX具有重要意义”改成“其价值在于XXX”。
6. 句内结构必须长短交错，严禁对仗工整，严禁相邻句式一致。并列内容必须调整主次重新组织，严格禁止相邻句的句式表达一致。
7. 上下句禁止语义复述，句式逻辑禁止模板化，排列禁止整齐，重复则可做删除处理，避免多个长度相近、结构对称的分句连续排列；并列成分不要相同句法形式。`;

const ACADEMIC_V1_REWRITE_PROMPT_A = REWRITE_PROMPT;
const ACADEMIC_V1_REWRITE_PROMPT_B = REWRITE_PROMPT;
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

function getRewritePrompt() {
  return REWRITE_PROMPT;
}

function buildRewriteMessages(text, context = {}) {
  const input = text == null ? '' : String(text);
  const previousRewrittenSentence = context.previousRewrittenSentence == null
    ? ''
    : String(context.previousRewrittenSentence).trim();
  let userContent = REWRITE_INPUT_TEMPLATE.replace('{{input}}', input);
  if (previousRewrittenSentence) {
    userContent = `上一句：【${previousRewrittenSentence}】\n降重后禁止与上一句的句式和表达方式一致。\n${userContent}`;
  }
  return [
    { role: 'system', content: REWRITE_PROMPT },
    { role: 'user', content: userContent }
  ];
}

// Compatibility adapter for integrations that still consume one string.
function buildRewritePrompt(text, rewriteVersion, context = {}) {
  const input = text == null ? '' : String(text);
  const previousRewrittenSentence = context.previousRewrittenSentence == null
    ? ''
    : String(context.previousRewrittenSentence).trim();
  let userContent = REWRITE_INPUT_TEMPLATE.replace('{{input}}', input);
  if (previousRewrittenSentence) {
    userContent = `上一句：【${previousRewrittenSentence}】\n降重后禁止与上一句的句式和表达方式一致。\n${userContent}`;
  }
  return `${REWRITE_PROMPT}\n${userContent}`;
}

module.exports = {
  REWRITE_PROMPT,
  ACADEMIC_V1_REWRITE_PROMPT_A,
  ACADEMIC_V1_REWRITE_PROMPT_B,
  REWRITE_INPUT_TEMPLATE,
  academicPromptVariantForIndex,
  normalizeAcademicPromptVariant,
  normalizeRewriteVersion,
  getRewritePrompt,
  buildRewriteMessages,
  buildRewritePrompt
};
