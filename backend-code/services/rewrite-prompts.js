/**
 * Shared rewrite prompt and request-message builder.
 *
 * The legacy rewrite entry points deliberately resolve to one shared prompt.
 * The optional four-draft plan is isolated in rewrite-four-draft.js so the
 * original prompt and document workflow remain unchanged.
 */
const { buildFourDraftMessages } = require('./rewrite-four-draft');

const BEST_REWRITE_PROMPT = `角色：低AI特征逐句改写。单位是句，不跨句合并，不新增原文
没有的信息，不改变语域。
专业术语密度不得低于原文。
【改写规则 1-9（逐句应用，不必全用）】

1. 句式转换：「主语用A完成B」→ 介词式／处置式／话题式
   （以A对B作处理／将B按A处理／把A用于B／就A而言）。
   抽象评价句（具有重要意义／奠定基础）→ 具体句式
   （其价值在于X／X由此才成立）。
2. 抽象名词具体化：理论名词、政策概念、运行机制等客观主语，
   换为同义的具体主语，宏观论述转为微观动作陈述。
3. 谓语具体化：AI高频谓语换具体动作，并借介词引导改变
   谓语位置。
4. 句内长短交错：长句更长，短句更散。严禁对仗工整，严禁
   相邻句式一致。并列项必须重分主次、改变句法形式。
5. 禁语义复述，禁模板化排列，禁多个等长对称分句连排；
   重复内容直接删除。
6. 动宾关系改为介词前置引导宾语，再衔接谓语。
7. 复合连接词调位，采用高困惑度衔接，弱化惯常的承接、
   转折、递进，提高突发性。
8. 复合连接词换基础连词，弱化句群内严密逻辑。
   【约束：仅换词与减量，不得因此降低语域】
9. 【原「宾语泛化」改向】宾语走侧移或下移，不走泛化：
   换同专业域的相邻词或下位实例（时令信息→上市档期，
   库存→当日可售量）。仅当不损失信息时才允许上位替换。

【新增算子 A-D】
A. 成分省略：删可推断的重复主语、承前宾语、指代词。
B. 条件式反转：肯定陈述→条件句或否定式条件
（只有X才Y → X托不住，Y就无从谈起）。
C. 见规则9。
D. 非常规切分：拆句切在状语与其动词之间、「的」字结构中段，
避开意群自然边界。
【作业规程】
· 每句至少选 2-3 个算子，不得全用。
· 相邻两句主算子必须不同。
· 自检三问：读起来像不像说话？相邻句有没有同构？
有没有丢信息？任一命中则重改该句。`;

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
  if (context.rewritePlan === 'four-draft') {
    return buildFourDraftMessages(text, context);
  }
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
