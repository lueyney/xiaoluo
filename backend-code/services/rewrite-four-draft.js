const FOUR_DRAFT_HEADS = Object.freeze({
  A: `━━ A · 留白（头）━━
# 任务
对【待改写】这一句做低AI特征改写。本句模式：A · 留白。

# 本档含义
只做词汇层（见下方 L1–L6），结构一律不动：主干语序、分句顺序、
句式框架、标点位置全部保留。改动不超过三处。
不拆句、不并句、不调顺序、不增删连接词。
改完接近原样，这是预期结果，不是没做好。

通用约束中「开头、收尾方式不与上一句相同」一条，本档不适用。`,
  B: `━━ B · 压缩（头）━━
# 任务
对【待改写】这一句做低AI特征改写。本句模式：B · 压缩。

# 本档含义
句子变短、变散。改写后字数少于原句；可删的冗余不多时，
以切碎为主。
先做词汇层（命中才做），再从下面选 1–3 个压缩算子。
只选触发条件在本句成立的，不许硬套。

# 压缩算子
P1 成分省略
   触发：主语、宾语在句内重复，或指代可承前推断
   做法：删去。
   例：医生应当向患者说明风险，医生还应当记录患者意见
     → 医生应当向患者说明风险，并记录其意见
P2 连接词降级
   触发：不仅…而且／由于…因此／在…基础上／与此同时／从而
   做法：换成和／但／要是／就，或删掉，靠语序承接。
   例：由于成本上升，因此企业减少了招聘 → 成本上升，企业随之缩减招聘
P3 去句内复述
   触发：同一意思在句中出现两次
   做法：留信息量大的那次。
   例：提高了效率，使工作更加高效 → 提高了效率
P4 比喻清理
   触发：套话比喻（桥梁／纽带／基石／引擎／双刃剑），或与上一句比喻同构
   做法：删掉比喻，直说。
   例：教育是社会发展的基石 → 社会发展离不开教育
P5 散切
   触发：30字以上的单句，中间没有停顿
   做法：在状语与其动词之间，或「的」字结构中段切开，切成较短的小句。`,
  C: `━━ C · 展开（头）━━
# 任务
对【待改写】这一句做低AI特征改写。本句模式：C · 展开。

# 本档含义
句子变长、层次变多，但不新增信息：靠把名词化短语、定语链、
抽象主语展开成小句来实现。改写后字数多于原句。
原句已超过70字时，不再增加字数，只做 E3、E4。
先做词汇层（命中才做），再从下面选 2–3 个展开算子。
只选触发条件在本句成立的，不许硬套。

# 展开算子
E1 抽象主语落地
   触发：主语是理论名词、机制、概念、政策
   做法：换成执行该动作的具体主体，宏观论述转为微观动作陈述。
   例：评价机制引导教师改进教学 → 教师参照评价结果调整教法
E2 名词化展开
   触发：「对X的Y」「X的深入Y」一类名词化短语
   做法：还原成「谁做什么」的小句。
   例：对用户需求的深入理解 → 了解用户需要什么
E3 定语链拆解
   触发：两层以上「的」字定语
   做法：拆出一层，改为后置小句。
   例：基于大数据的个性化学习推荐系统
     → 个性化学习推荐系统，推荐依据来自大数据
E4 长短交错
   触发：分句长度相近
   做法：长的再加一层限定（只取原句已有内容），短的再切短。严禁对仗。
E5 并列项展开
   触发：三项及以上并列
   做法：挑一项展开成小句，其余保持短语，各项句法形式互异。`,
  D: `━━ D · 重组（头）━━
# 任务
对【待改写】这一句做低AI特征改写。本句模式：D · 重组。

# 本档含义
长度大致不变，改的是语序和信息重心。
先做词汇层（命中才做），再从下面选 2–3 个重组算子。
只选触发条件在本句成立的，不许硬套。
标【限用】的，只在其他算子都不适用时才用。

# 重组算子
R1 介词／处置式
   触发：「主语用A做B」结构，或动词后宾语过长
   做法：以A对B作…／把A用于B／将B按A…；或用介词把宾语提前，再接谓语。
   例：研究者利用问卷收集数据 → 研究者把问卷用于数据收集
R2 状语移位
   触发：句首是时间／条件／方式状语
   做法：移到主谓之间或句末。
   例：在政策出台后，企业迅速调整了策略 → 企业在政策出台后很快调整了策略
R3 并列重排
   触发：三项及以上并列
   做法：调换次序、重分主次，主项在前，次项改为后置补充；只动两项。
   例：提高效率、降低成本、改善体验 → 降低成本、提高效率之外，用户体验也要兼顾
R4 连接词调位
   触发：句首复合连接词（因此／然而／此外／同时／由此／可见）
   做法：挪入句中，或换成不常见的衔接，弱化惯常的承接、转折、递进。
   例：因此，学校需要调整课程安排 → 学校需要据此调整课程安排
R5 条件式反转【限用】
   触发：只有…才／…需要…／…取决于…
   做法：改为否定条件。
   例：只有数据准确，模型才具有参考价值 → 数据不准，模型便没有参考价值
R6 话题前置【限用】
   触发：宾语或状语承载本句重点
   做法：提到句首作话题，后接评述。
   例：学生对实验课的兴趣明显高于理论课 → 实验课，学生的兴趣明显高过理论课`
});

const FOUR_DRAFT_TAIL = `━━ 公共尾（四档共用，接在头后面）━━
# 词汇层（各档命中即做）
L1 空评价具体化
   触发：具有重要意义／奠定基础／起到…作用／发挥…作用／提供保障／
         不可或缺／重要组成部分
   做法：压成一个具体动词或短语，或改为「其价值在于…」。
   例：数字档案对城市治理具有重要意义 → 数字档案的价值在于让城市治理有据可查
L2 高频谓语替换
   触发：实现／推动／助力／赋能／构建／优化／提升／促进／形成／保障／彰显
   做法：换成具体动作。具体化只取原句或常识能推出的内容。
   例：实现数据统一管理 → 数据归口管理
L3 去形式动词
   触发：进行／作出／加以／予以／给予 ＋ 双音动词
   做法：删掉形式动词，直接用后面的动词。
   例：对样本进行分析 → 分析样本
L4 模糊副词减量
   触发：通常／往往／更加／较为／进一步／一定程度上／有效地／充分／显著／深入
   做法：删去，或换成有范围的说法。本句至多留一个。
L5 四字格拆散
   触发：本句四字词在三个以上
   做法：拆一个成非四字说法。
L6 宾语侧移
   触发：宾语是宽泛的非术语概念（信息／条件／内容／体验／情况）
   做法：换成同领域的相邻词，或原句上下文已出现的下位实例。
         禁止换成更宽泛的词。
         例：市场条件 → 行情；用户体验 → 使用感受

# 通用约束
语域：{{REGISTER}}，全句保持一致。
禁用语气词（啊／呗／嘛／吧／呢）、口语碎片（其实／说白了／反正／免谈／
那股劲儿）、方言动词、无信息量的泛指名词（东西／事儿／玩意／这回事）。
语域为学术书面时，具体化只用规范说法，不用口语动词。
术语：{{TERMS}} 原样保留。未列出的专业术语同样不替换。
保真：逻辑主语、动作发出者不变；信息不丢；不新增原句和常识推不出的内容。
不写被动式翻译腔（「X，被当作Y」）。
句内：分句不等长对称，不对仗；并列成分句法形式互异；同一语义不出现两次；
动补短语（立不住／接得上／压掉一截）至多一个；破折号至多一个。
邻句：开头方式、收尾方式都不与【上一句改写】相同。
【上一句算子】排第一的那个，本句不用。
例句：只示范操作，不得沿用例句的措辞和句式。
允许不完美：可以和上一句重复用同一个词；句子可以平淡收尾；不必出彩。

# 输入
【上一句改写】{{PREV_OUT}}
【上一句算子】{{PREV_OPS}}
【待改写】{{SENT}}

# 输出（只输出以下两行）
【算子】本句实际使用的算子编号，按改动显眼程度从高到低排列
【改写】改写后的句子`;

const FOUR_DRAFT_MODES = Object.freeze(['A', 'B', 'C', 'D']);

function normalizeRewritePlan(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['four-draft', 'four_draft', 'abcd', 'new'].includes(normalized)
    ? 'four-draft'
    : 'legacy';
}

function normalizeFourDraftMode(value) {
  const mode = String(value || '').trim().toUpperCase();
  return FOUR_DRAFT_MODES.includes(mode) ? mode : 'D';
}

function isParagraphStart(sentences, index) {
  return index === 0 || sentences[index - 1].pIdx !== sentences[index].pIdx;
}

function isParagraphEnd(sentences, index) {
  return index === sentences.length - 1 || sentences[index + 1].pIdx !== sentences[index].pIdx;
}

function isSummarySentence(text) {
  return /^(?:由此|可见|总之|因此|综上)(?:[，,:：]|$)/u.test(String(text || '').trim());
}

function rotateCandidate(candidates, index) {
  if (!candidates.length) return 'D';
  return candidates[Math.abs(Number(index) || 0) % candidates.length];
}

function weightedCandidate() {
  const value = Math.random();
  if (value < 0.30) return 'A';
  if (value < 0.55) return 'B';
  if (value < 0.75) return 'C';
  return 'D';
}

function chooseWithSpacing(candidates, index, state, paragraphStart, weighted = false) {
  const previous = state.modes[state.modes.length - 1];
  const previousPrevious = state.modes[state.modes.length - 2];
  const noAForFour = state.modes.slice(-4).every((mode) => mode && mode !== 'A');
  let preferred = weighted ? weightedCandidate() : rotateCandidate(candidates, index + state.modes.length);
  if (weighted && !candidates.includes(preferred)) preferred = rotateCandidate(candidates, index + state.modes.length);
  if (noAForFour && !paragraphStart) preferred = 'A';
  if (preferred === previous && !(preferred === 'A' && previousPrevious !== 'A')) {
    const alternate = candidates.find((candidate) => candidate !== previous)
      || FOUR_DRAFT_MODES.find((candidate) => candidate !== previous && candidate !== 'A')
      || 'D';
    preferred = alternate;
  }
  if (preferred === 'A' && previous === 'A' && previousPrevious === 'A') {
    preferred = candidates.find((candidate) => candidate !== 'A') || 'D';
  }
  return preferred;
}

function selectFourDraftMode(sentences, index, state = { modes: [] }) {
  const sentence = sentences[index] || {};
  const text = String(sentence.text || '').trim();
  const length = ((text.match(/[\p{L}\p{N}]/gu) || []).length);
  const paragraphStart = isParagraphStart(sentences, index);
  const paragraphEnd = isParagraphEnd(sentences, index);
  let candidates;
  let weighted = false;
  if (length <= 15) candidates = ['A'];
  else if (paragraphStart) candidates = ['C', 'D'];
  else if (paragraphEnd && isSummarySentence(text)) candidates = ['D', 'B'];
  else if (length >= 70) candidates = ['B', 'D'];
  else if (length >= 40) candidates = ['C', 'D'];
  else if (length >= 16) candidates = ['B', 'D'];
  else {
    candidates = ['A', 'B', 'C', 'D'];
    weighted = true;
  }
  return chooseWithSpacing(candidates, index, state, paragraphStart, weighted);
}

function assignFourDraftModes(sentences) {
  const state = { modes: [] };
  const modes = sentences.map((sentence, index) => {
    if (sentence && sentence.isTitle) {
      state.modes.push(null);
      return null;
    }
    const mode = selectFourDraftMode(sentences, index, state);
    state.modes.push(mode);
    return mode;
  });
  return modes;
}

function fillTemplate(template, values) {
  return template
    .replaceAll('{{REGISTER}}', values.register)
    .replaceAll('{{TERMS}}', values.terms)
    .replaceAll('{{PREV_OUT}}', values.previousOut)
    .replaceAll('{{PREV_OPS}}', values.previousOps)
    .replaceAll('{{SENT}}', values.sentence);
}

function buildFourDraftPrompt({ mode, register = '学术书面', terms = '无', previousOut = '无', previousOps = '无', sentence = '' } = {}) {
  const normalizedMode = normalizeFourDraftMode(mode);
  const values = {
    register: String(register || '学术书面'),
    terms: String(terms || '无'),
    previousOut: String(previousOut || '无'),
    previousOps: String(previousOps || '无'),
    sentence: String(sentence || '')
  };
  return fillTemplate(`${FOUR_DRAFT_HEADS[normalizedMode]}\n\n${FOUR_DRAFT_TAIL}`, values);
}

function parseFourDraftOutput(output) {
  const normalized = String(output || '').replace(/```(?:text|markdown)?/giu, '').trim();
  const operatorMatch = normalized.match(/【算子】\s*([^\n]*)/u);
  const rewriteMatch = normalized.match(/【改写】\s*([\s\S]*)/u);
  const text = (rewriteMatch ? rewriteMatch[1] : normalized.replace(/^【算子】[^\n]*(?:\n|$)/u, ''))
    .replace(/^【改写】\s*/u, '')
    .replace(/\r?\n+/g, '')
    .trim();
  return {
    text,
    operators: operatorMatch ? operatorMatch[1].trim() : ''
  };
}

function buildFourDraftMessages(sentence, context = {}) {
  const prompt = buildFourDraftPrompt({
    mode: context.fourDraftMode,
    register: context.register,
    terms: context.terms,
    previousOut: context.previousOut,
    previousOps: context.previousOps,
    sentence
  });
  return [
    { role: 'system', content: prompt },
    { role: 'user', content: '严格按系统提示输出，不要添加解释。' }
  ];
}

module.exports = {
  FOUR_DRAFT_HEADS,
  FOUR_DRAFT_TAIL,
  FOUR_DRAFT_MODES,
  normalizeRewritePlan,
  normalizeFourDraftMode,
  selectFourDraftMode,
  assignFourDraftModes,
  buildFourDraftPrompt,
  buildFourDraftMessages,
  parseFourDraftOutput
};
