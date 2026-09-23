/**
 * Shared rewrite prompt and request-message builder.
 *
 * The AI rewrite and document rewrite entry points share this A/B/C prompt builder.
 */
const ACADEMIC_V1_REWRITE_PROMPT_A = `角色：擅长输出低AI特征的降重大师。
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
9. 宾语概念的泛化或偏离：在替换动作承受者时，打破原有的专业术语组合，将核心宾语替换为语义范围更宽泛的名词。所有规则尽量避开意群自然边界。
   必要自检：
   a.和原文语气是否一致，是否口语化？
   b.和原文比是否AI特征降低？是否更符合人写的细腻文笔？
   c.相邻句是否类似？
   若是则修改。`;

const ACADEMIC_V1_REWRITE_PROMPT_B = `提取文本核心信息，将文本改写，改写的文字凝练度、风格都符合下面文本：
汪淼起身要走，一阵从教堂传出的圣乐留住了他。今天不是礼拜日，这可能是唱诗班为复活节进行的排练，唱的是这个节日弥撒中常唱的《圣灵光照》。在圣乐的庄严深远中，汪淼再次感到宇宙变小了，变成了一座空旷的教堂，穹顶隐没于背景辐射闪烁的红光中，而他则是这宏伟教堂地板砖缝中的一只小蚂蚁。他感觉到自己那颗颤抖的心灵被一只无形的巨手抚摸着，一时间又回到了脆弱无助的孩童时代，意识深处硬撑着的某种东西像蜡一样变软了，崩溃了。他双手捂着脸哭了起来。`;

const ACADEMIC_V1_REWRITE_PROMPT_C = `按照下面文本的风格重塑原文：
走进大殿，他发现这里甚至比门洞中还昏暗，只有一张长长的大理石桌上的两支银烛台上的蜡烛在昏昏欲睡地亮着，桌旁坐着几个人，昏暗的光线使汪淼仅能看清他们面庞的轮廓，他们的双眼都隐藏在深眼窝的阴影中，但汪淼能感觉到聚集到他身上的目光。这些人似乎穿着中世纪的长袍，仔细看，还有一两个人的长袍更简洁一些，是古希腊式的。长桌的一头坐着一个瘦高的男子，他头上戴着的金冠是大殿中除蜡烛外唯一闪亮的东西，汪淼在蜡烛的光亮中很费力地看出，他身上的长袍与其他人不同，是红色的。`;

const BEST_REWRITE_PROMPT = ACADEMIC_V1_REWRITE_PROMPT_A;
const NOVEL_V2_REWRITE_PROMPT = ACADEMIC_V1_REWRITE_PROMPT_A;
const REWRITE_PROMPT = BEST_REWRITE_PROMPT;
const REWRITE_INPUT_TEMPLATE = '处理括号中的文本，仅返回降AI结果：【{{input}}】';

// Prompt overrides are read from the environment at request time. This keeps
// the shipped prompt as a safe fallback while allowing a deployment to change
// A/B/C without modifying source code. The prefixed aliases are retained for
// compatibility with existing deployment conventions.
const PROMPT_ENV_ALIASES = Object.freeze({
  A: ['REWRITE_PROMPT_A', 'DEEPSEEK_REWRITE_PROMPT_A', 'AI_REWRITE_PROMPT_A'],
  B: ['REWRITE_PROMPT_B', 'DEEPSEEK_REWRITE_PROMPT_B', 'AI_REWRITE_PROMPT_B'],
  C: ['REWRITE_PROMPT_C', 'DEEPSEEK_REWRITE_PROMPT_C', 'AI_REWRITE_PROMPT_C']
});

const DEFAULT_PROMPTS = Object.freeze({
  A: ACADEMIC_V1_REWRITE_PROMPT_A,
  // The supplied nine-rule prompt is the safe fallback for every slot. B/C
  // become distinct only when their environment variables are explicitly set.
  B: ACADEMIC_V1_REWRITE_PROMPT_A,
  C: ACADEMIC_V1_REWRITE_PROMPT_A
});

function readPromptOverride(variant, env = process.env) {
  const aliases = PROMPT_ENV_ALIASES[variant] || [];
  for (const key of aliases) {
    const raw = env && env[key];
    if (raw == null || String(raw).trim() === '') continue;
    // Allow simple .env values containing literal escaped newlines while
    // preserving normal prompt content and spacing.
    return String(raw).replace(/\\n/g, '\n').trim();
  }
  return DEFAULT_PROMPTS[variant];
}

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
  const variant = normalizeAcademicPromptVariant(context.promptVariant);
  return readPromptOverride(variant, context.env || process.env) || BEST_REWRITE_PROMPT;
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
