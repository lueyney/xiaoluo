const store = require('../services/workflow-studio/store');
const { validateWorkflowCollection } = require('../services/workflow-studio/validator');

const ROUTER_ID = 'creation-deepseek-router';

// The creation page already supplies docType. Non-paper documents therefore
// route directly and never spend a DeepSeek request on classification.
const DOCUMENT_ROUTES = [
  { key: 'paper', label: '论文', matchValues: ['论文', '学术论文', '学术范文', '论文初稿'] },
  { key: 'literature', label: '文献综述', matchValues: ['文献综述'] },
  { key: 'opening', label: '开题报告', matchValues: ['开题报告'] },
  { key: 'task', label: '任务书', matchValues: ['任务书'] },
  { key: 'defense', label: '答辩稿', matchValues: ['答辩稿'] },
  { key: 'midterm', label: '中期检查表', matchValues: ['中期检查表'] },
  { key: 'selected-document', label: '其他已选文档', matchValues: [] }
];

// Only a selected paper reaches this classifier. Keep the general paper route
// last so malformed model output has a safe, useful fallback.
const PAPER_ROUTES = [
  { key: 'paper02', label: '问卷调查论文', matchValues: ['2', '问卷', '调查'], workflowId: 'coze-paper02-survey-research' },
  { key: 'paper03', label: '实证研究论文', matchValues: ['3', '实证', 'SPSS', '回归'], workflowId: 'coze-paper03-empirical-research' },
  { key: 'paper04', label: '财务与 ESG 论文', matchValues: ['4', '财务', 'ESG', '杜邦', '盈利能力', '偿债能力', '运营能力'], workflowId: 'coze-paper04-financial-esg-research' },
  { key: 'paper01', label: '通用论文', matchValues: ['1', '通用'], workflowId: 'coze-paper01-with-literature' }
];

const DIRECT_ROUTES = [
  { key: 'literature', label: '文献综述', workflowId: 'coze-workwenxian-literature-search' },
  { key: 'opening', label: '开题报告', workflowId: 'coze-kaitibaogao-opening-report' },
  { key: 'task', label: '任务书', workflowId: 'coze-renwushu-task-book' },
  { key: 'defense', label: '答辩稿', workflowId: 'academic-writing-main' },
  { key: 'midterm', label: '中期检查表', workflowId: 'academic-writing-main' },
  { key: 'selected-document', label: '其他已选文档', workflowId: 'academic-writing-main' }
];

const ROUTES = PAPER_ROUTES.concat(DIRECT_ROUTES);

function inputMappingsFor(workflowId) {
  if (workflowId === 'coze-paper01-with-literature') return [{ target: 'title', source: 'input.topic' }];
  if (workflowId === 'coze-paper02-survey-research') return [
    { target: 'BOT_USER_INPUT', source: 'input.topic' }, { target: 'title', source: 'input.topic' }
  ];
  if (['coze-paper03-empirical-research', 'coze-paper04-financial-esg-research', 'coze-workwenxian-literature-search'].includes(workflowId)) {
    return [{ target: 'BOT_USER_INPUT', source: 'input.topic' }];
  }
  if (['coze-kaitibaogao-opening-report', 'coze-renwushu-task-book'].includes(workflowId)) {
    return [{ target: 'input', source: 'input.topic' }];
  }
  return [
    { target: 'topic', source: 'input.topic' },
    { target: 'field', source: 'input.field' },
    { target: 'docType', source: 'input.docType' },
    { target: 'requirements', source: 'input.requirements' },
    { target: 'description', source: 'input.description' },
    { target: 'defaultTargetWords', source: 'input.defaultTargetWords' },
    { target: 'traceId', source: 'input.traceId' }
  ];
}

function subworkflowNode(route, index) {
  return {
    id: `run-${route.key}`, type: 'subworkflow', position: { x: 1110, y: 50 + index * 145 }, data: {
      label: route.label,
      description: `用户选择或论文分类命中后运行 ${route.label}，完整结果直接进入文档`,
      workflowId: route.workflowId,
      workflowName: route.label,
      inputMappings: inputMappingsFor(route.workflowId)
    }
  };
}

function createRouter() {
  const nodes = [
    { id: 'router-start', type: 'start', position: { x: 70, y: 390 }, data: { label: '开始', description: 'input 为用户填写的论文题目；docType 为创作页已选择的文档类型', variables: [
      { name: 'topic', type: 'string', required: true, defaultValue: '', description: '用户填写的论文题目' },
      { name: 'field', type: 'string', required: false, defaultValue: '', description: '所在专业' },
      { name: 'docType', type: 'string', required: true, defaultValue: '学术范文', description: '创作页已选择的文档类型' },
      { name: 'requirements', type: 'string', required: false, defaultValue: '', description: '补充要求' }
    ] } },
    { id: 'document-type-router', type: 'condition', position: { x: 360, y: 390 }, data: {
      label: '按用户选择直达', description: '开题报告、任务书、文献综述等直接运行；只有论文进入 DeepSeek 分流',
      mode: 'routeValue', conditionSource: 'input.docType', routes: DOCUMENT_ROUTES
    } },
    { id: 'paper-classifier', type: 'llm', position: { x: 680, y: 120 }, data: {
      label: 'DeepSeek 论文判断器', description: '只根据论文题目在 paper01-paper04 中选择', action: 'chat', promptMode: 'inline', model: 'deepseek-chat', temperature: 0, maxTokens: 128, responseMode: 'text',
      systemPrompt: '你是论文工作流分类器。只输出数字1、2、3或4，不得输出解释。',
      userPrompt: `根据论文题目选择工作流，只输出数字：
1：一般性的现状、问题、对策、设计或非实证论文；
2：明确需要问卷、访谈、调查数据的调查研究论文；
3：明确需要统计检验、回归、面板数据、SPSS或其他实证模型的论文；
4：公司财务、杜邦分析、盈利/偿债/运营能力、财务报表或ESG论文。
论文题目：{{inputs.topic}}`,
      inputMappings: [{ target: 'topic', source: 'input.topic' }]
    } },
    { id: 'paper-router', type: 'condition', position: { x: 860, y: 120 }, data: {
      label: '论文工作流分流', description: '仅在用户选择论文时，根据 DeepSeek 判断运行 paper01-paper04',
      mode: 'routeValue', conditionSource: 'values.paper-classifier', routes: PAPER_ROUTES.map(({ key, label, matchValues }) => ({ key, label, matchValues }))
    } }
  ];

  const edges = [
    { id: 'router-start-document-type', source: 'router-start', target: 'document-type-router' },
    { id: 'router-paper-classifier', source: 'document-type-router', sourceHandle: 'paper', label: '论文', target: 'paper-classifier' },
    { id: 'router-classifier-paper-router', source: 'paper-classifier', target: 'paper-router' }
  ];

  PAPER_ROUTES.forEach((route, index) => {
    nodes.push(subworkflowNode(route, index));
    edges.push({ id: `paper-router-${route.key}`, source: 'paper-router', sourceHandle: route.key, label: route.key, target: `run-${route.key}` });
  });
  DIRECT_ROUTES.forEach((route, index) => {
    nodes.push(subworkflowNode(route, PAPER_ROUTES.length + index));
    edges.push({ id: `document-router-${route.key}`, source: 'document-type-router', sourceHandle: route.key, label: route.key, target: `run-${route.key}` });
  });

  nodes.push({ id: 'router-output', type: 'output', position: { x: 1480, y: 390 }, data: {
    label: '创作结果', description: '把指定工作流的完整文本交给原有文档保存逻辑', sourcePath: 'output'
  } });
  ROUTES.forEach((route) => edges.push({ id: `router-${route.key}-output`, source: `run-${route.key}`, target: 'router-output' }));

  return {
    id: ROUTER_ID,
    name: '创作：按类型直达与论文智能分流',
    description: '用户选择的非论文文档直接运行指定工作流；只有论文根据题目用 DeepSeek 分流到 paper01-paper04',
    status: 'draft', variableMode: 'explicit-v2', version: 1, updatedAt: new Date().toISOString(), nodes, edges
  };
}

async function collectDependencies(all) {
  const requestedIds = Array.from(new Set(ROUTES.map((route) => route.workflowId)));
  const dependencies = requestedIds.map((id) => all.find((workflow) => workflow.id === id)).filter(Boolean);
  const dependencyIds = new Set(dependencies.map((workflow) => workflow.id));
  for (let index = 0; index < dependencies.length; index += 1) {
    for (const node of dependencies[index].nodes || []) {
      if (!['subworkflow', 'loop'].includes(node.type)) continue;
      const childId = String(node.data && node.data.workflowId || '').trim();
      if (!childId || dependencyIds.has(childId)) continue;
      const child = all.find((workflow) => workflow.id === childId);
      if (child) { dependencies.push(child); dependencyIds.add(childId); }
    }
  }
  const missing = requestedIds.filter((id) => !dependencyIds.has(id));
  if (missing.length) throw new Error(`创作路由缺少工作流：${missing.join(', ')}`);
  return dependencies;
}

async function main() {
  const router = createRouter();
  const dependencies = await collectDependencies(await store.listAllWorkflows());
  const validation = validateWorkflowCollection(dependencies.concat(router));
  if (!validation.valid) throw new Error(`创作路由校验失败：\n${validation.errors.join('\n')}`);
  const saved = await store.saveWorkflow(router);
  process.stdout.write(`${JSON.stringify({ installed: { id: saved.id, name: saved.name, nodes: saved.nodes.length, edges: saved.edges.length }, activeWorkflowUnchanged: await store.getActiveWorkflowId() }, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
module.exports = { DIRECT_ROUTES, DOCUMENT_ROUTES, PAPER_ROUTES, ROUTER_ID, ROUTES, collectDependencies, createRouter };
