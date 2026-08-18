const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const store = require('../services/workflow-studio/store');
const { validateWorkflowCollection } = require('../services/workflow-studio/validator');

const CHILD_WORKFLOW_ID = 'coze-paper-literature-search';
const DEFINITIONS = {
  paper03: {
    source: path.join(os.homedir(), 'Desktop', 'coze', 'Workflow-paper03-draft-6813', 'workflow', 'paper03-draft.yaml'),
    id: 'coze-paper03-empirical-research',
    name: 'Coze paper03 实证研究论文写作',
    description: '还原 Coze paper03：面向需要实证研究和 SPSS 论证的论文工作流。'
  },
  paper04: {
    source: path.join(os.homedir(), 'Desktop', 'coze', 'Workflow-paper04-draft-6858', 'workflow', 'paper04-draft.yaml'),
    id: 'coze-paper04-financial-esg-research',
    name: 'Coze paper04 财务与 ESG 论文写作',
    description: '还原 Coze paper04：面向财务报表、企业 ESG 和辅助资料的论文工作流。'
  }
};

function readYaml(filePath) { return yaml.load(fs.readFileSync(filePath, 'utf8')); }

function parameterValue(node, name) {
  const item = (node.parameters && node.parameters.llmParam || []).find((entry) => entry.name === name);
  return item && item.input ? item.input.value : undefined;
}

function outputFields(node) { return Object.keys(node.parameters && node.parameters.node_outputs || {}); }

function replaceVariables(template) {
  return String(template == null ? '' : template).replace(/{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g, '{{inputs.$1}}');
}

function sourcePathFor(refNode, field, sourceNodes) {
  const id = String(refNode);
  if (id === '100001') return `input.${field}`;
  const source = sourceNodes.get(id);
  if (source && source.type === 'subflow') return `values.${id}.${field}`;
  if (source && source.type === 'plugin') return `values.${id}.${field === 'tableData' ? 'items' : field}`;
  return field === 'output' ? `values.${id}` : `values.${id}.${field}`;
}

function nodeInputs(node, sourceNodes) {
  const mappings = [];
  const fixedInputs = {};
  for (const item of node.parameters && node.parameters.node_inputs || []) {
    const value = item.input && item.input.value;
    if (value && typeof value === 'object' && value.ref_node) {
      mappings.push({ target: String(item.name), source: sourcePathFor(String(value.ref_node), String(value.path || 'output'), sourceNodes) });
    } else if (value !== undefined && value !== null) fixedInputs[String(item.name)] = value;
  }
  return { mappings, fixedInputs };
}

function convertStart(node) {
  const definitions = node.parameters && node.parameters.node_outputs || {};
  return {
    id: String(node.id), type: 'start', position: node.position,
    data: {
      label: node.title || '开始', description: node.description || '',
      variables: Object.entries(definitions).map(([name, definition]) => ({
        name, type: ['integer', 'float'].includes(definition.type) ? 'number' : definition.type || 'string',
        required: definition.required === true,
        defaultValue: definition.default_value == null ? '' : String(definition.default_value),
        description: definition.description || ''
      }))
    }
  };
}

function convertLlm(node, sourceNodes) {
  const { mappings } = nodeInputs(node, sourceNodes);
  const customOutputs = outputFields(node).filter((name) => !['output', 'reasoning_content'].includes(name));
  return {
    id: String(node.id), type: 'llm', position: node.position,
    data: {
      label: node.title || 'DeepSeek', description: node.description || '', action: 'chat', promptMode: 'inline',
      systemPrompt: replaceVariables(parameterValue(node, 'systemPrompt')),
      userPrompt: replaceVariables(parameterValue(node, 'prompt')),
      responseMode: customOutputs.length ? 'json' : 'text', model: 'deepseek-chat',
      temperature: Number(parameterValue(node, 'temperature') ?? 0.5),
      maxTokens: Math.min(32768, Math.max(128, Number.parseInt(parameterValue(node, 'maxTokens'), 10) || 4096)),
      inputMappings: mappings, cozeOutputFields: customOutputs
    }
  };
}

function convertText(node, sourceNodes) {
  const { mappings } = nodeInputs(node, sourceNodes);
  const concat = (node.parameters && node.parameters.concatParams || []).find((item) => item.name === 'concatResult');
  return {
    id: String(node.id), type: 'transform', position: node.position,
    data: { label: node.title || '文本处理', description: node.description || '', operation: 'template',
      template: replaceVariables(concat && concat.input && concat.input.value || '{{output}}'), inputMappings: mappings }
  };
}

function convertCondition(node, sourceNodes) {
  const condition = node.parameters && node.parameters.branches && node.parameters.branches[0]
    && node.parameters.branches[0].condition && node.parameters.branches[0].condition.conditions
    && node.parameters.branches[0].condition.conditions[0];
  const left = condition && condition.left && condition.left.input && condition.left.input.value;
  const right = condition && condition.right && condition.right.input && condition.right.input.value;
  return {
    id: String(node.id), type: 'condition', position: node.position,
    data: { label: node.title || '条件分支', description: node.description || '',
      conditionSource: left && typeof left === 'object' ? sourcePathFor(String(left.ref_node), String(left.path || 'output'), sourceNodes) : 'output',
      operator: 'equals', compareValue: right == null ? '' : String(right),
      routes: [{ key: 'true', label: '满足条件' }, { key: 'false', label: '继续生成论文' }] }
  };
}

function convertSubflow(node, sourceNodes) {
  const { mappings } = nodeInputs(node, sourceNodes);
  return {
    id: String(node.id), type: 'subworkflow', position: node.position,
    data: { label: node.title || '文献子工作流', description: node.description || '调用可复用的文献检索与综述流程',
      workflowId: CHILD_WORKFLOW_ID, workflowName: 'Coze 文献检索与综述', inputMappings: mappings }
  };
}

function convertCompanyPlugin(node, sourceNodes) {
  const { mappings } = nodeInputs(node, sourceNodes);
  return {
    id: String(node.id), type: 'plugin', position: node.position,
    data: { label: '企业财务资料检索', description: '保留 Coze SearchStockData 的公司/股票资料输入契约，使用可替换的数据源。',
      plugin: 'companyFinancial', provider: 'companyFinancial', input: '{{inputs.keyword}}', key: '', inputMappings: mappings }
  };
}

function convertPlugin(node, sourceNodes) {
  const name = String(node.title || node.id);
  if (/SearchStockData|股票|新浪财经/i.test(name)) return convertCompanyPlugin(node, sourceNodes);
  return convertCompanyPlugin(node, sourceNodes);
}

function convertComposeCode(node, sourceNodes, kind) {
  const { mappings, fixedInputs } = nodeInputs(node, sourceNodes);
  if (kind === 'paper03') {
    const renamed = [];
    const rewrittenMappings = mappings.filter((mapping) => mapping.target !== 'af');
    const fixed = { ...fixedInputs, af1: fixedInputs.af || 'fjf', af2: fixedInputs.af || 'fjf', af3: fixedInputs.af || 'fjf', af4: fixedInputs.af || 'fjf', heading112: '1.1.2 研究意义\n', a122a: '' };
    delete fixed.af;
    const order = ['zhaiyao', 'abstract', 'a111', 'heading112', 'a112', 'a121a', 'a121', 'a122a', 'a122', 'a123', 'a1231', 'a131', 'a132', 'af1', 'a211', 'a212', 'a22', 'a231', 'a232', 'a233', 'af2', 'a31', 'a32', 'a33', 'af3', 'a41', 'a42', 'a431', 'a432', 'a433', 'a44', 'a45', 'af4', 'a51', 'a521', 'a522', 'a523', 'a53', 'a7', 'a8'];
    const available = new Set([...rewrittenMappings.map((m) => m.target), ...Object.keys(fixed)]);
    const sectionOrder = order.filter((key) => available.has(key));
    return { id: String(node.id), type: 'transform', position: node.position, data: {
      label: '论文全文汇总', description: '按 Coze 原始章节顺序安全拼接实证研究论文内容。', operation: 'composeText',
      inputMappings: rewrittenMappings, fixedInputs: fixed, sectionOrder, requiredInputs: rewrittenMappings.map((m) => m.target),
      requireAllMappedInputs: true, sectionLabels: Object.fromEntries(rewrittenMappings.map((m) => [m.target, m.target])), separator: '\n', outputKey: 'key0', cleanupPreset: 'academicChinese', omitEmpty: true, fullOutput: true
    } };
  }
  const order = mappings.map((mapping) => mapping.target).concat(Object.keys(fixedInputs).filter((key) => !mappings.some((m) => m.target === key)));
  return { id: String(node.id), type: 'transform', position: node.position, data: {
    label: '论文全文汇总', description: '按 Coze 原始章节顺序安全拼接财务与 ESG 论文内容。', operation: 'composeText',
    inputMappings: mappings, fixedInputs, sectionOrder: order, requiredInputs: mappings.map((m) => m.target), requireAllMappedInputs: true,
    sectionLabels: Object.fromEntries(mappings.map((m) => [m.target, m.target])), separator: '\n', outputKey: 'key0', cleanupPreset: 'academicChinese', omitEmpty: true, fullOutput: true
  } };
}

function convertOutput(node, sourceNodes, kind) {
  let { mappings } = nodeInputs(node, sourceNodes);
  // paper04's true selector route is a small diagnostic early-exit.  The
  // original end node declared A1 as a second input, but its visible output
  // template still references only `output`.  Keep the final paper output
  // deterministic and expose the diagnostic route through its own upstream
  // value/trace instead of making `output` unavailable on that route.
  if (kind === 'paper04') mappings = mappings.filter((mapping) => mapping.target === 'output');
  return { id: String(node.id), type: 'output', position: node.position, data: {
    label: node.title || '结束', description: node.description || '', sourcePath: 'inputs', inputMappings: mappings, template: '{{inputs.output}}'
  } };
}

function convertWorkflow(source, kind, definition) {
  const sourceNodes = new Map(source.nodes.map((node) => [String(node.id), node]));
  const nodes = source.nodes.map((node) => {
    if (node.type === 'start') return convertStart(node);
    if (node.type === 'end') return convertOutput(node, sourceNodes, kind);
    if (node.type === 'llm') return convertLlm(node, sourceNodes);
    if (node.type === 'text') return convertText(node, sourceNodes);
    if (node.type === 'condition') return convertCondition(node, sourceNodes);
    if (node.type === 'subflow') return convertSubflow(node, sourceNodes);
    if (node.type === 'plugin') return convertPlugin(node, sourceNodes);
    if (node.type === 'code') return convertComposeCode(node, sourceNodes, kind);
    throw new Error(`不支持的 Coze 节点类型: ${node.type} (${node.id})`);
  });
  const edges = source.edges.map((edge, index) => ({ id: `${kind}-coze-edge-${index + 1}`, source: String(edge.source_node), target: String(edge.target_node), ...(edge.source_port ? { sourceHandle: String(edge.source_port), label: String(edge.source_port) } : {}) }));
  return { id: definition.id, name: definition.name, description: source.description || definition.description, status: 'draft', variableMode: 'explicit-v2', version: 1, updatedAt: new Date().toISOString(), nodes, edges };
}

async function main() {
  const child = await store.getWorkflow(CHILD_WORKFLOW_ID);
  if (!child) throw new Error(`文献子工作流不存在: ${CHILD_WORKFLOW_ID}`);
  const imported = [];
  for (const [kind, definition] of Object.entries(DEFINITIONS)) {
    const source = readYaml(path.resolve(process.argv[kind === 'paper03' ? 2 : 3] || definition.source));
    const workflow = convertWorkflow(source, kind, definition);
    const validation = validateWorkflowCollection([child, workflow]);
    if (!validation.valid) throw new Error(`${kind} 导入结果校验失败:\n${validation.errors.join('\n')}`);
    const saved = await store.saveWorkflow(workflow);
    imported.push({ id: saved.id, name: saved.name, status: saved.status, nodes: saved.nodes.length, edges: saved.edges.length });
  }
  process.stdout.write(`${JSON.stringify({ imported, activeWorkflowUnchanged: await store.getActiveWorkflowId() }, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
module.exports = { DEFINITIONS, convertWorkflow, convertComposeCode };
