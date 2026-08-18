const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const store = require('../services/workflow-studio/store');
const { validateWorkflowCollection } = require('../services/workflow-studio/validator');

const DEFINITIONS = {
  workwenxian: {
    source: path.join(os.homedir(), 'Desktop', 'coze', 'Workflow-workwenxian-draft-1433', 'workflow', 'workwenxian-draft.yaml'),
    id: 'coze-workwenxian-literature-search', name: 'Coze workwenxian 文献综述', description: '基于学术检索与 DeepSeek 的文献搜索、筛选和综述工作流'
  },
  kaitibaogao: {
    source: path.join(os.homedir(), 'Desktop', 'coze', 'Workflow-kaitibaogao-draft-1388', 'workflow', 'kaitibaogao-draft.yaml'),
    id: 'coze-kaitibaogao-opening-report', name: 'Coze kaitibaogao 开题报告', description: '根据论文题目生成开题报告'
  },
  renwushu: {
    source: path.join(os.homedir(), 'Desktop', 'coze', 'Workflow-renwushu-draft-1465', 'workflow', 'renwushu-draft.yaml'),
    id: 'coze-renwushu-task-book', name: 'Coze renwushu 任务书', description: '根据论文题目生成任务书'
  }
};

function readYaml(file) { return yaml.load(fs.readFileSync(file, 'utf8')); }
function valueOf(node, name) {
  const entry = (node.parameters && node.parameters.llmParam || []).find((item) => item.name === name);
  return entry && entry.input ? entry.input.value : undefined;
}
function outputs(node) { return Object.keys(node.parameters && node.parameters.node_outputs || {}); }
function replaceVariables(template) {
  return String(template == null ? '' : template).replace(/{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g, '{{inputs.$1}}');
}
function structuredOutputInstruction(fields) {
  if (!fields.length) return '';
  const example = Object.fromEntries(fields.map((field, index) => [
    field,
    /^c\d+$/i.test(field) ? `关键词${index + 1}` : '生成结果'
  ]));
  return `\n\n输出格式要求：只输出一个合法 JSON 对象，不要使用 Markdown 代码块或添加解释。JSON 字段必须为：${fields.join('、')}。示例：${JSON.stringify(example)}`;
}
function sourcePathFor(refNode, field, sourceNodes) {
  const id = String(refNode);
  if (id === '100001') return `input.${field}`;
  const source = sourceNodes.get(id);
  if (source && source.type === 'subflow') return `values.${id}.${field}`;
  if (source && source.type === 'plugin') return `values.${id}.${field === 'tableData' || field === 'tableCol' ? 'items' : field}`;
  return field === 'output' ? `values.${id}` : `values.${id}.${field}`;
}
function nodeInputs(node, sourceNodes) {
  const mappings = [];
  const fixedInputs = {};
  for (const item of node.parameters && node.parameters.node_inputs || []) {
    const value = item.input && item.input.value;
    if (value && typeof value === 'object' && value.ref_node) {
      mappings.push({ target: String(item.name), source: sourcePathFor(value.ref_node, value.path || 'output', sourceNodes) });
    } else if (value !== undefined && value !== null) fixedInputs[String(item.name)] = value;
  }
  return { mappings, fixedInputs };
}
function convertStart(node) {
  const definitions = node.parameters && node.parameters.node_outputs || {};
  return { id: String(node.id), type: 'start', position: node.position, data: {
    label: node.title || '开始', description: node.description || '',
    variables: Object.entries(definitions).map(([name, def]) => ({
      name, type: ['integer', 'float'].includes(def.type) ? 'number' : def.type || 'string',
      required: def.required === true, defaultValue: def.default_value == null ? '' : String(def.default_value), description: def.description || ''
    }))
  } };
}
function convertLlm(node, sourceNodes) {
  const { mappings } = nodeInputs(node, sourceNodes);
  const incomingSources = Array.from(new Set(mappings.map((mapping) => String(mapping.source).match(/^values\.([^.]+)/)?.[1]).filter(Boolean)));
  for (const sourceId of incomingSources) {
    if (!mappings.some((mapping) => mapping.source === `values.${sourceId}` || mapping.source.startsWith(`values.${sourceId}.`))) {
      mappings.push({ target: `dependency${mappings.length + 1}`, source: `values.${sourceId}` });
    }
  }
  const custom = outputs(node).filter((name) => !['output', 'reasoning_content'].includes(name));
  const originalUserPrompt = replaceVariables(valueOf(node, 'prompt') || '');
  return { id: String(node.id), type: 'llm', position: node.position, data: {
    label: node.title || 'DeepSeek', description: node.description || '', action: 'chat', promptMode: 'inline',
    systemPrompt: replaceVariables(valueOf(node, 'systemPrompt') || ''), userPrompt: `${originalUserPrompt}${structuredOutputInstruction(custom)}`,
    responseMode: custom.length ? 'json' : 'text', model: 'deepseek-chat', temperature: Number(valueOf(node, 'temperature') || 0.5),
    maxTokens: Math.min(32768, Math.max(128, Number.parseInt(valueOf(node, 'maxTokens'), 10) || 4096)), inputMappings: mappings, cozeOutputFields: custom
  } };
}
function convertPlugin(node, sourceNodes) {
  const { mappings } = nodeInputs(node, sourceNodes);
  const title = String(node.title || node.id);
  const provider = /arxiv|search_3/i.test(title) ? 'arxiv' : 'openalex';
  const input = provider === 'arxiv' ? '{{inputs.search_query}}' : '{{inputs.zt}}';
  return { id: String(node.id), type: 'plugin', position: node.position, data: {
    label: provider === 'arxiv' ? 'arXiv 学术检索' : '学术检索（OpenAlex 兼容）', description: node.description || '无需 API key 的公开学术检索接口',
    plugin: 'academicSearch', provider, input, key: '', count: 10, inputMappings: mappings
  } };
}
function convertText(node, sourceNodes) {
  const { mappings } = nodeInputs(node, sourceNodes);
  const concat = (node.parameters && node.parameters.concatParams || []).find((item) => item.name === 'concatResult');
  return { id: String(node.id), type: 'transform', position: node.position, data: {
    label: node.title || '文本处理', description: node.description || '', operation: 'template',
    template: replaceVariables(concat && concat.input && concat.input.value || '{{output}}'), inputMappings: mappings
  } };
}
function convertSubflow(node, sourceNodes) {
  const { mappings } = nodeInputs(node, sourceNodes);
  return { id: String(node.id), type: 'subworkflow', position: node.position, data: {
    label: node.title || '文献子工作流', description: node.description || '', workflowId: 'coze-workwenxian-literature-search',
    workflowName: 'Coze workwenxian 文献综述', inputMappings: mappings
  } };
}
function convertOutput(node, sourceNodes, kind) {
  const { mappings } = nodeInputs(node, sourceNodes);
  const literal = node.parameters && node.parameters.content && node.parameters.content.value && node.parameters.content.value.content;
  const template = literal ? replaceVariables(literal) : '{{inputs.output}}';
  return { id: String(node.id), type: 'output', position: node.position, data: {
    label: node.title || '结束', description: node.description || '', sourcePath: 'inputs', inputMappings: mappings, template
  } };
}
function convertWorkflow(source, kind, definition) {
  const sourceNodes = new Map(source.nodes.map((node) => [String(node.id), node]));
  const nodes = source.nodes.map((node) => {
    if (node.type === 'start') return convertStart(node);
    if (node.type === 'end') return convertOutput(node, sourceNodes, kind);
    if (node.type === 'llm') return convertLlm(node, sourceNodes);
    if (node.type === 'plugin') return convertPlugin(node, sourceNodes);
    if (node.type === 'text') return convertText(node, sourceNodes);
    if (node.type === 'subflow') return convertSubflow(node, sourceNodes);
    throw new Error(`不支持的 Coze 节点类型: ${node.type} (${node.id})`);
  });
  const convertedById = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (['start', 'output'].includes(node.type)) continue;
    const predecessors = Array.from(new Set(source.edges.filter((edge) => String(edge.target_node) === node.id).map((edge) => String(edge.source_node))));
    if (predecessors.length < 2) continue;
    node.data.inputMappings = Array.isArray(node.data.inputMappings) ? node.data.inputMappings : [];
    for (const sourceId of predecessors) {
      const mapped = node.data.inputMappings.some((mapping) => mapping.source === `values.${sourceId}` || mapping.source.startsWith(`values.${sourceId}.`));
      if (!mapped && convertedById.has(sourceId)) node.data.inputMappings.push({ target: `dependency${node.data.inputMappings.length + 1}`, source: `values.${sourceId}` });
    }
  }
  const edges = source.edges.map((edge, index) => ({ id: `${kind}-coze-edge-${index + 1}`, source: String(edge.source_node), target: String(edge.target_node), ...(edge.source_port ? { sourceHandle: String(edge.source_port), label: String(edge.source_port) } : {}) }));
  return { id: definition.id, name: definition.name, description: source.description || definition.description, status: 'draft', variableMode: 'explicit-v2', version: 1, updatedAt: new Date().toISOString(), nodes, edges };
}
async function main() {
  const imported = [];
  for (const [kind, definition] of Object.entries(DEFINITIONS)) {
    const source = readYaml(path.resolve(process.argv[{ workwenxian: 2, kaitibaogao: 3, renwushu: 4 }[kind]] || definition.source));
    const workflow = convertWorkflow(source, kind, definition);
    const existing = await store.listAllWorkflows();
    const child = kind === 'kaitibaogao' ? (existing.find((item) => item.id === DEFINITIONS.workwenxian.id) || workflow) : null;
    const validation = validateWorkflowCollection(child ? [child, workflow] : [workflow]);
    if (!validation.valid) throw new Error(`${kind} 导入校验失败:\n${validation.errors.join('\n')}`);
    const saved = await store.saveWorkflow(workflow);
    imported.push({ id: saved.id, name: saved.name, nodes: saved.nodes.length, edges: saved.edges.length });
  }
  process.stdout.write(`${JSON.stringify({ imported, activeWorkflowUnchanged: await store.getActiveWorkflowId() }, null, 2)}\n`);
}
if (require.main === module) main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
module.exports = { DEFINITIONS, convertWorkflow };
