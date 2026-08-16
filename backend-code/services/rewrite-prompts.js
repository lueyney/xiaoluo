/**
 * Prompts shared by interactive rewrite and document rewrite.
 * Academic V1 alternates A/B by the stable ordinal of each rewritten sentence.
 */
const ACADEMIC_V1_REWRITE_PROMPT_A = `
负责改写AI味道，回归和原文语气一致的凝练学术真人写作。
保留原句的事实关系、数字、专有名词、引用和不可替代的专业术语，只输出改写结果。
用新的表达入口、主语、谓语和分句结构重构。
改写时根据原句选择几种合适的变化：
1. 将“主语使用A完成B”改成“以A对B作处理”“将B按A处理”“把A用于B”等介词、处置或话题结构。
2. 将“机制、功能、作用、建设、提升”等抽象名词表达，展开为系统或具体对象实际执行的动作。
3. 将紧凑、精准的书面谓语换成普通、稍宽泛的表达，通过句式修改并改变谓语位置。
4. 在含义不变时转换正反表达，如“保持稳定”写成“无明显波动”。
5. 必须将“提供参考、奠定基础、具有重要意义”等抽象结论，改写成具体对象、适用范围和实施条件。
6. 可以拆分过长句，也可以合并过短句，句内结构必须长短交错，严禁对仗工整，严禁相邻句式一致。
7. 改变动宾句式，不输出连续动宾短语。
8. 并列内容必须调整主次、前后顺序，或按共同属性重新组织，改变必须分散到长短不同的句子中。
9. 必须参考上文和下文中已经使用的主语类型、谓语结构、连接方式、并列节奏和句子长短；当前句必须选择不同的信息组织方式，避免与相邻句连续复用相同的句法骨架或节奏。`;

const ACADEMIC_V1_REWRITE_PROMPT_B = `
严格按照下面方法进行降重：
核心句型的介词化转换：将原本的动宾关系调整为介词引导的结构。即把动词支配宾语的直接动作，转化为由介词前置引导宾语，再衔接谓语动词的表达形式。
谓语降级：将精准的书面动词替换为语义稍宽泛的动词，修改方式如：
- AI惯用：“无法抓住角色内心”
- 改为：“而不是真正进入角色内心”
长句拆分与主语增补：打断原有长句的连贯语脉（仅针对20字以上的长句），将包含多重并列成分或复杂修饰的单句分割为多个短句（是一个句子内部短句，不用句号隔开）；如“成为（动词）A与B的C”需要拆分并倒装，因果关系需要先写结果。
修饰成分的词性位移与扩充：改变定语和状语的原始词性与长度。将紧凑的书面修饰语替换为朴素的程度副词，或者增加辅助性词汇拉长修饰语的音节，使句子结构适度松散。
陈述主体的具象化：将抽象的理论名词、概念或运行机制等客观主语（主语为“本文”等则不变），酌情转换为具体的同义词主语，使宏观层面的客观论述变为微观层面的动作执行陈述，避免用“他们”“大家”等词语指代。专有名词全称、引用以及核心专业术语必须逐字保留。
逻辑连接词的书面替换：把体现严密学术逻辑关系的复合连接词替换为基础书面连词，弱化句群内部过于工整的承接、转折与递进形式。
宾语概念的适度泛化：在不改变事实关系、专业含义和论证方向的前提下，打破非必要的专业词语组合，将非核心宾语换成语义范围稍宽的基础名词；不得偏离原句语义指向。
用结构转换、长句拆分等通用规律进行降重，摒弃修辞手法与附加解释，同时使改写后的句子无病句，语气凝练接近原文，字数接近原文。`;

const ACADEMIC_CONTEXT_AND_OUTPUT_CONTRACT = `
不得改变事实关系、数字、专有名词、引用、核心专业术语、专业含义和论证方向。
上文和下文仅用于判断当前句的表达结构，不得改写、复述或输出。
只改写当前一句，只输出改写结果，不得输出解释、标签或其他内容。

上文（仅作结构参照）：
{{previousSentence}}

当前待处理文本（只改写这一句）：
{{input}}

下文（仅作结构参照）：
{{nextSentence}}`;

const V3_BASE_REWRITE_PROMPT = `
保留原句的事实关系、数字、专有名词、引用和不可替代的专业术语，只输出改写结果。
用新的表达入口、主语、谓语和分句结构重构。
改写时根据原句选择几种合适的变化：
1. 将“主语使用A完成B”改成“以A对B作处理”“将B按A处理”“把A用于B”等介词、处置或话题结构。
2. 将“机制、功能、作用、建设、提升”等抽象名词表达，展开为系统或具体对象实际执行的动作。
3. 将紧凑、精准的书面谓语换成普通、稍宽泛的表达，通过句式修改并改变谓语位置。
4. 在含义不变时转换正反表达，如把“保持稳定”写成“无明显波动”。
5. 必须将“提供参考、奠定基础、具有重要意义”等抽象结论，改写成“对什么对象是否适用”“如要增加什么功能，目前有什么可以依托”的具体陈述。
6. 一个句子中包含多项措施时，不要反复使用相同谓语，可以使用“以、按、将、把、经、由、又借、利用”等结构。
7. 改变动宾句式，不输出动宾短语。
改写示范：
原文：
系统使用 Spring 事务保证订单生成、座位锁定和支付状态更新的一致性；使用基于角色的访问控制机制限制不同用户的操作范围；使用 JWT 完成用户身份认证，密码采用 BCrypt 加密保存，并通过参数校验、异常处理和日志记录提升系统安全性与可追溯性。
改写：
有关关键业务部分的处理，系统已用 Spring 事务来确保订单、座位及支付状态的一致性；按角色设定各类用户可以执行的操作范围；以 JWT 对用户作身份认证，将密码按 BCrypt 方法加密后保存，又借参数检查、异常应对和日志记录改善安全状况，使后续查询更方便。

待处理文本：
{{input}}`;

const NOVEL_REWRITE_PROMPT = `负责改写AI味道，回归和原文语气一致的凝练小说真人写作。保留叙事节奏、人物语气、对白口吻和必要的文学画面，不得把小说改成学术说明。${V3_BASE_REWRITE_PROMPT}`;

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
  if (normalizeRewriteVersion(rewriteVersion) !== 'v1') return NOVEL_REWRITE_PROMPT;
  const variant = normalizeAcademicPromptVariant(context.promptVariant, context.rewriteIndex);
  const prompt = variant === 'B' ? ACADEMIC_V1_REWRITE_PROMPT_B : ACADEMIC_V1_REWRITE_PROMPT_A;
  return `${prompt}\n${ACADEMIC_CONTEXT_AND_OUTPUT_CONTRACT}`;
}

function buildRewritePrompt(text, rewriteVersion = 'v1', context = {}) {
  const values = {
    previousSentence: context.previousSentence ? String(context.previousSentence) : '（无上文）',
    input: text == null ? '' : String(text),
    nextSentence: context.nextSentence ? String(context.nextSentence) : '（无下文）'
  };
  return getRewritePrompt(rewriteVersion, context)
    .replace(/\{\{(previousSentence|input|nextSentence)\}\}/g, (_, key) => values[key]);
}

module.exports = {
  ACADEMIC_V1_REWRITE_PROMPT_A,
  ACADEMIC_V1_REWRITE_PROMPT_B,
  academicPromptVariantForIndex,
  normalizeAcademicPromptVariant,
  normalizeRewriteVersion,
  getRewritePrompt,
  buildRewritePrompt
};
