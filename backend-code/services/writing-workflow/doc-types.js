const DOCUMENT_TYPES = {
  '学术范文': {
    credits: 120,
    targetWords: 5000,
    description: '结构完整、论证克制的学术研究范文'
  },
  '开题报告': {
    credits: 40,
    targetWords: 3000,
    description: '包含研究背景、问题、方法、计划与预期成果的开题报告'
  },
  '任务书': {
    credits: 25,
    targetWords: 1800,
    description: '目标清楚、任务可执行、进度可检查的任务书'
  },
  '文献综述': {
    credits: 20,
    targetWords: 3000,
    description: '按议题组织、呈现争议与研究缺口的文献综述'
  },
  '答辩稿': {
    credits: 10,
    targetWords: 1500,
    description: '适合口头陈述、层次清楚且控制时长的答辩稿'
  },
  '中期检查表': {
    credits: 10,
    targetWords: 1200,
    description: '如实说明进展、问题、调整和下一步计划的中期检查材料'
  },
  '答辩PPT': {
    credits: 25,
    targetWords: 1200,
    description: '以逐页标题和要点呈现的答辩演示文稿提纲'
  }
};

const DOCUMENT_TYPE_ALIASES = {
  '学术论文': '学术范文'
};

function normalizeDocType(docType) {
  const normalized = DOCUMENT_TYPE_ALIASES[docType] || docType;
  if (!DOCUMENT_TYPES[normalized]) {
    throw new Error(`不支持的文档类型: ${docType}`);
  }
  return normalized;
}

function getDocTypeConfig(docType) {
  const normalized = normalizeDocType(docType);
  return { value: normalized, ...DOCUMENT_TYPES[normalized] };
}

function getSupportedDocTypes({ includeAliases = false } = {}) {
  const types = Object.keys(DOCUMENT_TYPES);
  return includeAliases ? types.concat(Object.keys(DOCUMENT_TYPE_ALIASES)) : types;
}

const DOCUMENT_CREDITS = Object.fromEntries(
  Object.entries(DOCUMENT_TYPES).map(([name, config]) => [name, config.credits])
);

module.exports = {
  DOCUMENT_TYPES,
  DOCUMENT_CREDITS,
  getDocTypeConfig,
  getSupportedDocTypes,
  normalizeDocType
};
