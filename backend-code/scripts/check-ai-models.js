const envState = require('../config/load-env');
const { listDeepSeekRoutes } = require('../services/ai-model-router');

const labels = {
  rewrite: '文本降重（流式）',
  rewriteFallback: '文本降重（兜底）',
  documentRewrite: '文档逐句降重',
  planning: '论文结构规划',
  drafting: '论文正文撰写',
  title: 'AI 题目生成',
  social: '社交平台创作',
  workflow: '可视化工作流节点'
};

console.log(`DeepSeek 函数调用映射\n配置文件: ${envState.envPath}\n`);
console.table(listDeepSeekRoutes().map((item) => ({
  function: labels[item.task],
  task: item.task,
  model: item.model,
  source: item.modelSource,
  thinking: item.modelProvidesReasoning ? 'model' : item.thinking,
  reasoningEffort: item.reasoningEffort || 'provider-default'
})));
console.log('\n说明：deepseek-reasoner 由模型自身启用推理；reasoning_effort/thinking 仅在显式配置后传给兼容网关。');
