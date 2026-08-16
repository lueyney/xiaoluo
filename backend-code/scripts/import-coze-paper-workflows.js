const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const store = require('../services/workflow-studio/store');
const { validateWorkflowCollection } = require('../services/workflow-studio/validator');

const PARENT_WORKFLOW_ID = 'coze-paper01-with-literature';
const CHILD_WORKFLOW_ID = 'coze-paper-literature-search';

function defaultSourcePath(folder, file) {
  return path.join(os.homedir(), 'Desktop', 'coze', folder, 'workflow', file);
}

function readYaml(filePath) {
  return yaml.safeLoad(fs.readFileSync(filePath, 'utf8'));
}

function parameterValue(node, name) {
  const item = (node.parameters && node.parameters.llmParam || []).find((entry) => entry.name === name);
  return item && item.input ? item.input.value : undefined;
}

function outputFields(node) {
  return Object.keys(node.parameters && node.parameters.node_outputs || {});
}

function replaceVariables(template) {
  return String(template || '').replace(/{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g, '{{inputs.$1}}');
}

function sourcePathFor(refNode, field, sourceNodes) {
  if (refNode === '100001') return `input.${field}`;
  const source = sourceNodes.get(refNode);
  if (source && source.type === 'subflow') return `values.${refNode}.${field}`;
  if (source && source.type === 'plugin') {
    const aliases = { tableData: 'items', tableCol: 'items' };
    return `values.${refNode}.${aliases[field] || field}`;
  }
  return field === 'output' ? `values.${refNode}` : `values.${refNode}.${field}`;
}

function nodeInputs(node, sourceNodes) {
  const mappings = [];
  const fixedInputs = {};
  for (const item of node.parameters && node.parameters.node_inputs || []) {
    const value = item.input && item.input.value;
    if (value && typeof value === 'object' && value.ref_node) {
      mappings.push({
        target: item.name,
        source: sourcePathFor(String(value.ref_node), String(value.path || 'output'), sourceNodes)
      });
    } else if (value !== undefined && value !== null) {
      fixedInputs[item.name] = value;
    }
  }
  return { mappings, fixedInputs };
}

function convertStart(node) {
  const definitions = node.parameters && node.parameters.node_outputs || {};
  return {
    id: node.id,
    type: 'start',
    position: node.position,
    data: {
      label: node.title || '开始',
      description: node.description || '',
      variables: Object.entries(definitions).map(([name, definition]) => ({
        name,
        type: definition.type === 'integer' || definition.type === 'float' ? 'number' : definition.type || 'string',
        required: definition.required === true,
        defaultValue: definition.value == null ? '' : String(definition.value),
        description: definition.description || ''
      }))
    }
  };
}

function convertLlm(node, sourceNodes) {
  const { mappings } = nodeInputs(node, sourceNodes);
  const customOutputs = outputFields(node).filter((name) => !['output', 'reasoning_content'].includes(name));
  let userPrompt = replaceVariables(parameterValue(node, 'prompt'));
  if (customOutputs.length) {
    const contract = customOutputs.map((name) => `"${name}": "字符串"`).join(', ');
    userPrompt += `\n\n只返回一个合法 JSON 对象，不要使用 Markdown 代码块。字段必须为：{ ${contract} }`;
  }
  return {
    id: node.id,
    type: 'llm',
    position: node.position,
    data: {
      label: node.title || 'DeepSeek',
      description: node.description || '',
      action: 'chat',
      promptMode: 'inline',
      systemPrompt: replaceVariables(parameterValue(node, 'systemPrompt')),
      userPrompt,
      responseMode: customOutputs.length ? 'json' : 'text',
      model: 'deepseek-chat',
      temperature: Number(parameterValue(node, 'temperature') ?? 0.5),
      maxTokens: Math.min(32768, Math.max(128, Number.parseInt(parameterValue(node, 'maxTokens'), 10) || 4096)),
      inputMappings: mappings,
      cozeOutputFields: customOutputs
    }
  };
}

function convertText(node, sourceNodes, workflowKind) {
  const { mappings } = nodeInputs(node, sourceNodes);
  const concat = (node.parameters && node.parameters.concatParams || [])
    .find((item) => item.name === 'concatResult');
  let template = replaceVariables(concat && concat.input && concat.input.value || '{{output}}');
  let inputMappings = mappings;
  if (workflowKind === 'parent' && node.id === '124716') {
    template = '{{inputs.title}}';
    inputMappings = [{ target: 'title', source: 'input.title' }];
  }
  return {
    id: node.id,
    type: 'transform',
    position: node.position,
    data: {
      label: node.title || '文本处理',
      description: node.description || '',
      operation: 'template',
      template,
      inputMappings
    }
  };
}

function convertPlugin(node, sourceNodes) {
  const rawInputs = node.parameters && node.parameters.node_inputs || [];
  const queryInput = rawInputs.find((item) => ['search_query', 'zt', 'query', 'input'].includes(item.name));
  const countInput = rawInputs.find((item) => item.name === 'count');
  const queryValue = queryInput && queryInput.input && queryInput.input.value;
  const inputMappings = queryValue && typeof queryValue === 'object'
    ? [{ target: 'query', source: sourcePathFor(String(queryValue.ref_node), String(queryValue.path || 'output'), sourceNodes) }]
    : [];
  const provider = node.id === '1513155' ? 'arxiv' : node.id === '1012577' ? 'crossref' : 'openalex';
  return {
    id: node.id,
    type: 'plugin',
    position: node.position,
    data: {
      label: node.id === '1513155' ? 'arXiv 学术检索' : node.id === '1012577' ? 'Crossref 学术检索' : 'OpenAlex 学术检索',
      description: node.description || '调用学术 API 返回结构化文献',
      plugin: 'academicSearch',
      provider,
      key: '',
      input: queryValue && typeof queryValue !== 'object' ? String(queryValue) : '{{inputs.query}}',
      count: Math.min(50, Math.max(1, Number.parseInt(countInput && countInput.input && countInput.input.value, 10) || 10)),
      inputMappings
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
    id: node.id,
    type: 'condition',
    position: node.position,
    data: {
      label: node.title || '条件',
      description: node.description || '',
      conditionSource: left && typeof left === 'object'
        ? sourcePathFor(String(left.ref_node), String(left.path || 'output'), sourceNodes)
        : 'output',
      operator: 'equals',
      compareValue: right == null ? '' : String(right),
      routes: [{ key: 'true', label: '等于 9' }, { key: 'false', label: '生成论文' }]
    }
  };
}

function convertOutput(node, sourceNodes, workflowKind) {
  const { mappings } = nodeInputs(node, sourceNodes);
  const outputMappings = workflowKind === 'parent'
    ? mappings.filter((item) => item.target === 'output')
    : mappings;
  return {
    id: node.id,
    type: 'output',
    position: node.position,
    data: {
      label: node.title || '结束',
      description: node.description || '',
      sourcePath: 'inputs',
      inputMappings: outputMappings,
      ...(workflowKind === 'parent' ? { template: '{{inputs.output}}' } : {})
    }
  };
}

function convertSubflow(node, sourceNodes) {
  const { mappings } = nodeInputs(node, sourceNodes);
  return {
    id: node.id,
    type: 'subworkflow',
    position: node.position,
    data: {
      label: node.title || '文献子工作流',
      description: node.description || '',
      workflowId: CHILD_WORKFLOW_ID,
      workflowName: 'Coze 文献检索与综述',
      inputMappings: mappings
    }
  };
}

function convertCode(node, sourceNodes) {
  const { mappings, fixedInputs } = nodeInputs(node, sourceNodes);
  const requiredInputs = mappings.map((mapping) => mapping.target);
  return {
    id: node.id,
    type: 'transform',
    position: node.position,
    data: {
      label: '论文全文汇总',
      description: '按原 Coze 顺序拼接章节并执行固定文本清理，不运行任意代码',
      operation: 'composeText',
      inputMappings: mappings,
      fixedInputs: {
        ...fixedInputs,
        researchStatusHeading: '1.3 研究现状',
        acknowledgementsHeading: '致谢'
      },
      requiredInputs,
      requireAllMappedInputs: true,
      sectionLabels: Object.fromEntries(mappings.map((mapping) => [mapping.target, mapping.target])),
      sectionOrder: [
        'zhaiyao', 'a11', 'a12', 'researchStatusHeading', 'xianzhuang', 'pingshu', 'a14', 'a15',
        'a31', 'a32', 'a33', 'a34', 'a41', 'a42', 'a43', 'a44',
        'a61', 'a62', 'a63', 'a64', 'a7', 'a09', 'wenxian', 'acknowledgementsHeading', 'zhixie'
      ],
      separator: '\n',
      outputKey: 'key0',
      cleanupPreset: 'academicChinese',
      omitEmpty: true,
      fullOutput: true
    }
  };
}

function convertNode(node, sourceNodes, workflowKind) {
  if (node.type === 'start') return convertStart(node);
  if (node.type === 'end') return convertOutput(node, sourceNodes, workflowKind);
  if (node.type === 'llm') return convertLlm(node, sourceNodes);
  if (node.type === 'plugin') return convertPlugin(node, sourceNodes);
  if (node.type === 'text') return convertText(node, sourceNodes, workflowKind);
  if (node.type === 'condition') return convertCondition(node, sourceNodes);
  if (node.type === 'subflow') return convertSubflow(node, sourceNodes);
  if (node.type === 'code') return convertCode(node, sourceNodes);
  throw new Error(`不支持的 Coze 节点类型：${node.type} (${node.id})`);
}

function convertEdges(source, workflowKind) {
  const edges = source.edges.map((edge, index) => ({
    id: `coze-edge-${index + 1}`,
    source: String(edge.source_node),
    target: String(edge.target_node),
    ...(edge.source_port ? { sourceHandle: String(edge.source_port), label: String(edge.source_port) } : {})
  }));

  if (workflowKind !== 'parent') return edges;
  const falseTargets = edges.filter((edge) => edge.source === '162709' && edge.sourceHandle === 'false');
  const removedNodes = new Set(['162709', '140649']);
  const remaining = edges.filter((edge) => !removedNodes.has(edge.source) && !removedNodes.has(edge.target));
  falseTargets.forEach((edge, index) => remaining.push({
    id: `coze-edge-input-fanout-${index + 1}`,
    source: '124716',
    target: edge.target
  }));
  return remaining;
}

function convertWorkflow(source, { id, name, workflowKind }) {
  const sourceNodes = new Map(source.nodes.map((node) => [String(node.id), node]));
  const nodes = source.nodes
    .filter((node) => workflowKind !== 'parent' || !['162709', '140649'].includes(String(node.id)))
    .map((node) => convertNode(node, sourceNodes, workflowKind));
  if (workflowKind === 'parent') {
    const start = nodes.find((node) => node.type === 'start');
    if (start) {
      start.data.variables = [{
        name: 'title',
        type: 'string',
        required: true,
        defaultValue: '',
        description: '本次论文的完整题目'
      }];
    }
    const strategy42 = nodes.find((node) => node.id === '145298');
    const mapping = strategy42 && strategy42.data.inputMappings.find((item) => item.target === 'wenti2');
    if (mapping) mapping.source = 'values.101641';
  } else {
    const keywords = nodes.find((node) => node.id === '1618320');
    if (keywords) {
      keywords.data.userPrompt = `信息：{{inputs.timu}}
请生成两个用于中文学术检索的语义完整关键词组。
要求：
1. 两个关键词组都必须紧扣论文题目，并保留核心研究主题；
2. c1 表示核心主题，c2 表示“研究对象 + 核心主题”的组合；
3. 每个关键词组为 4-12 个汉字，不得只输出国家、地区、行业或“研究”“现状”等泛词；
4. 例如题目“我国就业政策”应输出类似 { "c1": "就业政策", "c2": "中国就业政策" }，不得输出“我国”或“中国”。

只返回一个合法 JSON 对象，不要使用 Markdown 代码块。字段必须为：{ "c1": "字符串", "c2": "字符串" }`;
    }
  }
  return {
    id,
    name,
    description: workflowKind === 'parent'
      ? '由 Coze paper01 迁移：并行生成毕业论文各章节，并调用独立文献检索子工作流。'
      : '由 Coze workwenxian 迁移：使用 arXiv、OpenAlex 与 Crossref 检索文献并生成研究综述。',
    status: 'draft',
    variableMode: 'explicit-v2',
    version: 1,
    updatedAt: new Date().toISOString(),
    nodes,
    edges: convertEdges(source, workflowKind)
  };
}

async function main() {
  const parentPath = path.resolve(process.argv[2] || defaultSourcePath('Workflow-paper01-draft-8854', 'paper01-draft.yaml'));
  const childPath = path.resolve(process.argv[3] || defaultSourcePath('Workflow-workwenxian-draft-1292', 'workwenxian-draft.yaml'));
  const child = convertWorkflow(readYaml(childPath), {
    id: CHILD_WORKFLOW_ID,
    name: 'Coze 文献检索与综述',
    workflowKind: 'child'
  });
  const parent = convertWorkflow(readYaml(parentPath), {
    id: PARENT_WORKFLOW_ID,
    name: 'Coze paper01 论文写作',
    workflowKind: 'parent'
  });
  const validation = validateWorkflowCollection([child, parent]);
  if (!validation.valid) throw new Error(`迁移结果校验失败：\n${validation.errors.join('\n')}`);

  const savedChild = await store.saveWorkflow(child);
  const savedParent = await store.saveWorkflow(parent);
  process.stdout.write(`${JSON.stringify({
    imported: [
      { id: savedParent.id, name: savedParent.name, nodes: savedParent.nodes.length, edges: savedParent.edges.length },
      { id: savedChild.id, name: savedChild.name, nodes: savedChild.nodes.length, edges: savedChild.edges.length }
    ],
    status: 'draft',
    activeWorkflowUnchanged: await store.getActiveWorkflowId(),
    academicProviders: ['arxiv', 'openalex', 'crossref']
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { CHILD_WORKFLOW_ID, PARENT_WORKFLOW_ID, convertWorkflow };
