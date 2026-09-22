/**
 * Shared rewrite prompt and request-message builder.
 *
 * The AI rewrite and document rewrite entry points resolve to one shared prompt.
 */
const BEST_REWRITE_PROMPT = `角色：擅长输出低AI特征的降重大师。
目的：降低AIGC率。
方法：用新的表达，根据原文实际情况重构谓语和分句结构，替换高频AI词汇，并减少抽象表达，减少同构比喻和模糊副词。
改写规则：

1. 改变句式和表达方式：“主语使用A完成B”改成“以A对B作处理”“将B按A处理”“把A用于B”等介词、处置或话题结构；如“XXX具有重要意义、奠定基础”等抽象描述，改成“其价值在于XXX”等具体句式。
2. 将抽象内容具体，减少抽象名词，删可推断的重复主语、承前宾语、指代词，并替换抽象名词表达：将抽象的理论名词、政策概念或运行机制等客观主语，转换为具体的同义词主语，使宏观层面的客观论述变为微观层面的动作执行陈述。
3. 将AI高频的谓语换成具体动作的表达：通过句式修改来改变谓语位置，如介词引导。
4. 句内结构放大长短交错，即长句更长，短句更散，如此错落。严禁对仗工整，严禁相邻句式一致。并列内容必须调整主次重新组织，必须禁止相邻句的句式和表达一致。
5. 上下句禁止语义复述，句式逻辑禁止模板化，排列禁止整齐，重复则删除处理，避免多个长度相近、结构对称的分句连续排列；并列成分不要相同句法形式。
6. 动宾关系调整为介词引导的结构：由介词前置引导宾语，再衔接谓语动词的表达形式。
7. 调整复合连接词及其位置，采用较高困惑度的衔接表达，弱化惯常的承接、转折与递进形式，提高突发性。
8. 把复合连接词，替换为朴素的常见的基础连词，弱化句群内部原本严密的承接、转折与递进逻辑。
9. 宾语概念的泛化或偏离：在替换动作承受者时，打破原有的专业术语组合，将核心宾语替换为语义范围更宽泛的名词。所有规则尽量避开意群自然边界。必要自检：
a.和原文语气是否一致，是否口语化？
b.和原文比是否AI特征降低？是否更符合人写的细腻文笔？
c.相邻句是否类似？
是则修改。`;

const ACADEMIC_V1_REWRITE_PROMPT_A = BEST_REWRITE_PROMPT;
const ACADEMIC_V1_REWRITE_PROMPT_B = BEST_REWRITE_PROMPT;
const ACADEMIC_V1_REWRITE_PROMPT_C = BEST_REWRITE_PROMPT;
const NOVEL_V2_REWRITE_PROMPT = BEST_REWRITE_PROMPT;
const REWRITE_PROMPT = BEST_REWRITE_PROMPT;
const REWRITE_INPUT_TEMPLATE = '处理括号中的文本，仅返回降AI结果：【{{input}}】';

function normalizeRewriteVersion(value) {
  return value === 'v2' || value === 'v3' ? value : 'v1';
}

function academicPromptVariantForIndex(index) {
  const ordinal = Number.isFinite(Number(index)) ? Math.max(0, Math.trunc(Number(index))) : 0;
  return ['A', 'B', 'C'][ordinal % 3];
}

function normalizeAcademicPromptVariant(value, index) {
  const variant = String(value || '').trim().toUpperCase();
  return variant === 'A' || variant === 'B' || variant === 'C'
    ? variant
    : (index == null ? 'A' : academicPromptVariantForIndex(index));
}

function getRewritePrompt() {
  return BEST_REWRITE_PROMPT;
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
