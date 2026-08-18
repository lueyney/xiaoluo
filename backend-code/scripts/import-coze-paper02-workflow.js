const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const store = require('../services/workflow-studio/store');
const { validateWorkflowCollection } = require('../services/workflow-studio/validator');

const WORKFLOW_ID = 'coze-paper02-survey-research';
const CHILD_WORKFLOW_ID = 'coze-paper-literature-search';

function defaultSourcePath() {
  return path.join(os.homedir(), 'Desktop', 'coze', 'Workflow-paper02-draft-1293', 'workflow', 'paper02-draft.yaml');
}

function readYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf8'));
}

function parameterValue(node, name) {
  const item = (node.parameters && node.parameters.llmParam || []).find((entry) => entry.name === name);
  return item && item.input ? item.input.value : undefined;
}

function outputFields(node) {
  return Object.keys(node.parameters && node.parameters.node_outputs || {});
}

// Coze prompt placeholders are node-local input names.  The explicit-v2
// canvas runtime exposes those names under {{inputs.*}} so a prompt cannot
// accidentally read an undeclared value from a sibling node.
function replaceVariables(template) {
  return String(template == null ? '' : template)
    .replace(/{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g, '{{inputs.$1}}');
}

function sourcePathFor(refNode, field, sourceNodes) {
  const id = String(refNode);
  if (id === '100001') return `input.${field}`;
  const source = sourceNodes.get(id);
  if (source && source.type === 'subflow') return `values.${id}.${field}`;
  if (source && source.type === 'plugin') {
    const aliases = { tableData: 'items', tableCol: 'items' };
    return `values.${id}.${aliases[field] || field}`;
  }
  return field === 'output' ? `values.${id}` : `values.${id}.${field}`;
}

function nodeInputs(node, sourceNodes) {
  const mappings = [];
  const fixedInputs = {};
  for (const item of node.parameters && node.parameters.node_inputs || []) {
    const value = item.input && item.input.value;
    if (value && typeof value === 'object' && value.ref_node) {
      // `output` is a valid Coze local parameter name, but explicit-v2
      // reserves it for the runtime cursor.  Keep the prompt's original
      // token while using a safe mapping key and rewriting that one token.
      const originalTarget = String(item.name);
      const target = originalTarget === 'output' ? 'cozeOutput' : originalTarget;
      mappings.push({
        target,
        source: sourcePathFor(String(value.ref_node), String(value.path || 'output'), sourceNodes)
      });
    } else if (value !== undefined && value !== null) {
      fixedInputs[String(item.name)] = value;
    }
  }
  return { mappings, fixedInputs };
}

function convertStart(node) {
  const definitions = node.parameters && node.parameters.node_outputs || {};
  return {
    id: String(node.id),
    type: 'start',
    position: node.position,
    data: {
      label: node.title || '开始',
      description: node.description || '',
      variables: Object.entries(definitions).map(([name, definition]) => ({
        name,
        type: ['integer', 'float'].includes(definition.type) ? 'number' : definition.type || 'string',
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
    id: String(node.id),
    type: 'llm',
    position: node.position,
    data: {
      label: node.title || 'DeepSeek',
      description: node.description || '',
      action: 'chat',
      promptMode: 'inline',
      systemPrompt: replaceVariables(parameterValue(node, 'systemPrompt')),
      // Keep the Coze prompt text intact; only its local variable namespace is
      // made explicit for the canvas runtime.
      userPrompt: replaceVariables(parameterValue(node, 'prompt')).replace(/{{inputs\.output}}/g, '{{inputs.cozeOutput}}'),
      responseMode: customOutputs.length ? 'json' : 'text',
      model: 'deepseek-chat',
      temperature: Number(parameterValue(node, 'temperature') ?? 0.5),
      maxTokens: Math.min(32768, Math.max(128, Number.parseInt(parameterValue(node, 'maxTokens'), 10) || 4096)),
      inputMappings: mappings,
      cozeOutputFields: customOutputs
    }
  };
}

function convertText(node, sourceNodes) {
  const { mappings } = nodeInputs(node, sourceNodes);
  const concat = (node.parameters && node.parameters.concatParams || [])
    .find((item) => item.name === 'concatResult');
  return {
    id: String(node.id),
    type: 'transform',
    position: node.position,
    data: {
      label: node.title || '文本处理',
      description: node.description || '',
      operation: 'template',
      template: replaceVariables(concat && concat.input && concat.input.value || '{{output}}'),
      inputMappings: mappings
    }
  };
}

function convertCondition(node, sourceNodes) {
  const condition = node.parameters && node.parameters.branches
    && node.parameters.branches[0] && node.parameters.branches[0].condition
    && node.parameters.branches[0].condition.conditions
    && node.parameters.branches[0].condition.conditions[0];
  const left = condition && condition.left && condition.left.input && condition.left.input.value;
  const right = condition && condition.right && condition.right.input && condition.right.input.value;
  return {
    id: String(node.id),
    type: 'condition',
    position: node.position,
    data: {
      label: node.title || '条件分支',
      description: node.description || '',
      conditionSource: left && typeof left === 'object'
        ? sourcePathFor(String(left.ref_node), String(left.path || 'output'), sourceNodes)
        : 'output',
      operator: 'equals',
      compareValue: right == null ? '' : String(right),
      routes: [{ key: 'true', label: '满足条件' }, { key: 'false', label: '继续生成论文' }]
    }
  };
}

function convertSubflow(node, sourceNodes) {
  const { mappings } = nodeInputs(node, sourceNodes);
  return {
    id: String(node.id),
    type: 'subworkflow',
    position: node.position,
    data: {
      label: node.title || '文献子工作流',
      description: node.description || '调用可复用的学术文献检索与综述子工作流',
      workflowId: CHILD_WORKFLOW_ID,
      workflowName: 'Coze 文献检索与综述',
      inputMappings: mappings
    }
  };
}

function convertComposeCode(node, sourceNodes) {
  const { mappings } = nodeInputs(node, sourceNodes);
  const mappedKeys = mappings.map((mapping) => mapping.target);
  // The original Coze code repeats the same separator and includes two
  // literal headings between sections.  Give repeated literals distinct keys
  // so the generic composeText schema can retain the exact order.
  const fixedInputs = {
    af1: 'fjf',
    af2: 'fjf',
    af3: 'fjf',
    a14: '理论基础',
    referencesHeading: '参考文献',
    acknowledgementsHeading: '致谢',
    a101: '一、绪论\n（一）研究背景\n',
    a102: '（二）研究背景\n',
    a103: '二、概念界定\n',
    a1041: '（三）国内外研究现状\n1. 国内相关研究\n',
    a1042: '2. 国外相关研究\n',
    a106: '（四）研究设计\n',
    a1043: '3. 文献评述\n'
  };
  const mapped = new Map(mappings.map((mapping) => [mapping.target, mapping]));
  // All mapped outputs are included, including a20 (问卷设计), which the
  // source code declared but accidentally omitted from its array expression.
  // The canvas contract is to aggregate every upstream output into the final
  // paper, so no generated section silently disappears.
  const sectionOrder = [
    'zhaiyao', 'abstract', 'a101', 'a11', 'a102', 'a12', 'a1041', 'a15',
    'a1042', 'a16', 'a1043', 'a17', 'a106', 'a20', 'amiaoshu', 'af1',
    'a103', 'a13', 'a14', 'a201', 'a21', 'a22', 'a23',
    'a24', 'a25', 'af2', 'a31', 'a32', 'a33', 'a34', 'a35', 'af3', 'a41',
    'a42', 'a43', 'a44', 'a45', 'a5', 'referencesHeading', 'a6',
    'acknowledgementsHeading', 'a7', 'a8'
  ];
  const available = new Set([...mappedKeys, ...Object.keys(fixedInputs)]);
  const missing = sectionOrder.filter((key) => !available.has(key));
  if (missing.length) throw new Error(`composeText section order missing inputs: ${missing.join(', ')}`);
  return {
    id: String(node.id),
    type: 'transform',
    position: node.position,
    data: {
      label: '论文全文汇总',
      description: '按 Coze 原始章节顺序安全拼接所有生成结果，不执行任意代码。',
      operation: 'composeText',
      inputMappings: mappings,
      fixedInputs,
      sectionOrder,
      requiredInputs: mappedKeys,
      requireAllMappedInputs: true,
      sectionLabels: Object.fromEntries(mappedKeys.map((key) => [key, key])),
      separator: '\n',
      outputKey: 'key0',
      cleanupPreset: 'academicChinese',
      omitEmpty: true,
      fullOutput: true
    }
  };
}

function convertOutput(node, sourceNodes) {
  const mappings = [];
  for (const item of node.parameters && node.parameters.node_inputs || []) {
    const value = item.input && item.input.value;
    if (value && typeof value === 'object' && value.ref_node) {
      // Output nodes intentionally expose the reserved `output` target in
      // explicit-v2; it is the public result contract, not a prompt input.
      mappings.push({
        target: String(item.name),
        source: sourcePathFor(String(value.ref_node), String(value.path || 'output'), sourceNodes)
      });
    }
  }
  return {
    id: String(node.id),
    type: 'output',
    position: node.position,
    data: {
      label: node.title || '结束',
      description: node.description || '',
      sourcePath: 'inputs',
      inputMappings: mappings,
      template: '{{inputs.output}}'
    }
  };
}

function convertNode(node, sourceNodes) {
  switch (node.type) {
    case 'start': return convertStart(node);
    case 'end': return convertOutput(node, sourceNodes);
    case 'llm': return convertLlm(node, sourceNodes);
    case 'text': return convertText(node, sourceNodes);
    case 'condition': return convertCondition(node, sourceNodes);
    case 'subflow': return convertSubflow(node, sourceNodes);
    case 'code': return convertComposeCode(node, sourceNodes);
    default: throw new Error(`不支持的 Coze 节点类型: ${node.type} (${node.id})`);
  }
}

function convertWorkflow(source) {
  const sourceNodes = new Map(source.nodes.map((node) => [String(node.id), node]));
  const nodes = source.nodes.map((node) => convertNode(node, sourceNodes));
  const edges = source.edges.map((edge, index) => ({
    id: `coze-paper02-edge-${index + 1}`,
    source: String(edge.source_node),
    target: String(edge.target_node),
    ...(edge.source_port ? { sourceHandle: String(edge.source_port), label: String(edge.source_port) } : {})
  }));
  return {
    id: WORKFLOW_ID,
    name: 'Coze paper02 调查研究论文写作',
    description: source.description || '还原 Coze paper02：面向问卷、访谈等调查研究，一键生成完整论文。',
    status: 'draft',
    variableMode: 'explicit-v2',
    version: 1,
    updatedAt: new Date().toISOString(),
    nodes,
    edges
  };
}

async function main() {
  const sourcePath = path.resolve(process.argv[2] || defaultSourcePath());
  const source = readYaml(sourcePath);
  const workflow = convertWorkflow(source);
  const child = await store.getWorkflow(CHILD_WORKFLOW_ID);
  if (!child) throw new Error(`文献子工作流不存在: ${CHILD_WORKFLOW_ID}`);
  const validation = validateWorkflowCollection([child, workflow]);
  if (!validation.valid) throw new Error(`paper02 导入结果校验失败:\n${validation.errors.join('\n')}`);
  const saved = await store.saveWorkflow(workflow);
  const all = await store.listAllWorkflows();
  const stored = all.find((item) => item.id === WORKFLOW_ID);
  process.stdout.write(`${JSON.stringify({
    imported: { id: saved.id, name: saved.name, status: saved.status, nodes: saved.nodes.length, edges: saved.edges.length },
    source: { id: source.id, name: source.name, nodes: source.nodes.length, edges: source.edges.length },
    conditionFanout: stored.edges.filter((edge) => edge.source === '144035' && edge.sourceHandle === 'false').length,
    composeText: stored.nodes.find((node) => node.id === '186734')?.data,
    finalOutput: stored.nodes.find((node) => node.type === 'output')?.data,
    activeWorkflowUnchanged: await store.getActiveWorkflowId()
  }, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { WORKFLOW_ID, CHILD_WORKFLOW_ID, convertWorkflow, convertComposeCode, replaceVariables };
