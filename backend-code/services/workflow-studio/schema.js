const NODE_TYPES = new Set(['start', 'prompt', 'llm', 'plugin', 'transform', 'loop', 'condition', 'subworkflow', 'output']);
const RESERVED_NODE_IDS = new Set(['input', 'values', 'trace', 'output', '__passthrough', '__start__', '__end__']);
const MAX_NODES = 200;
const MAX_EDGES = 400;
const MAX_OUTPUT_PATH = 512;
const MAX_OUTPUT_TEMPLATE = 20000;
const INPUT_MAPPING_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const RESERVED_INPUT_MAPPING_KEYS = new Set(['input', 'inputs', 'output', 'values', 'node', 'loop', 'source']);
const VARIABLE_MODES = new Set(['legacy-v1', 'explicit-v2']);
const START_VARIABLE_TYPES = new Set(['string', 'number', 'boolean']);
const TEXT_CLEANUP_PRESETS = new Set(['none', 'academicChinese']);

function workflowVariableMode(workflow) {
  return VARIABLE_MODES.has(String(workflow && workflow.variableMode || '').trim())
    ? String(workflow.variableMode).trim()
    : 'legacy-v1';
}

function normalizeOutputData(data) {
  const normalized = { ...data };
  for (const key of ['sourcePath', 'customSourcePath', 'outputPath']) {
    if (normalized[key] !== undefined && normalized[key] !== null) {
      normalized[key] = String(normalized[key]).trim().slice(0, MAX_OUTPUT_PATH);
    }
  }
  if (normalized.template !== undefined && normalized.template !== null) {
    normalized.template = String(normalized.template).slice(0, MAX_OUTPUT_TEMPLATE);
  }
  return normalized;
}

function normalizeWorkflow(input) {
  const now = new Date().toISOString();
  return {
    id: String(input.id || '').trim(),
    name: String(input.name || '').trim(),
    description: String(input.description || '').trim().slice(0, 500),
    archived: input.archived === true,
    status: input.status === 'published' ? 'published' : 'draft',
    // Older records omit this field and must remain compatible with the
    // published v5 runtime. Newer studio-created records opt into the strict
    // declaration contract explicitly.
    variableMode: input.variableMode === 'explicit-v2' ? 'explicit-v2' : 'legacy-v1',
    version: Math.max(1, Number.parseInt(input.version, 10) || 1),
    updatedAt: input.updatedAt || now,
    nodes: Array.isArray(input.nodes) ? input.nodes.map((node) => ({
      id: String(node.id || '').trim(),
      type: String(node.type || '').trim(),
      position: {
        x: Number(node.position && node.position.x) || 0,
        y: Number(node.position && node.position.y) || 0
      },
      data: node.data && typeof node.data === 'object'
        ? (String(node.type || '').trim() === 'output' ? normalizeOutputData(node.data) : { ...node.data })
        : {}
    })) : [],
    edges: Array.isArray(input.edges) ? input.edges.map((edge) => ({
      id: String(edge.id || '').trim(),
      source: String(edge.source || '').trim(),
      target: String(edge.target || '').trim(),
      sourceHandle: edge.sourceHandle || undefined,
      targetHandle: edge.targetHandle || undefined,
      label: edge.label || undefined
    })) : []
  };
}

function validateWorkflowShape(workflow, { allowIncomplete = false } = {}) {
  const errors = [];
  const variableMode = workflowVariableMode(workflow);
  if (workflow && workflow.variableMode !== undefined && !VARIABLE_MODES.has(String(workflow.variableMode).trim())) {
    errors.push('变量模式只能是 legacy-v1 或 explicit-v2');
  }
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(workflow.id)) errors.push('工作流 ID 需为 3-64 位小写字母、数字或连字符');
  if (!workflow.name) errors.push('工作流名称不能为空');
  if (!allowIncomplete && !workflow.nodes.length) errors.push('工作流至少需要一个节点');
  if (workflow.nodes.length > MAX_NODES) errors.push(`单个工作流最多允许 ${MAX_NODES} 个节点`);
  if (workflow.edges.length > MAX_EDGES) errors.push(`单个工作流最多允许 ${MAX_EDGES} 条连线`);

  const nodeIds = new Set();
  for (const node of workflow.nodes) {
    if (!node.id) errors.push('存在缺少 ID 的节点');
    if (nodeIds.has(node.id)) errors.push(`节点 ID 重复：${node.id}`);
    if (RESERVED_NODE_IDS.has(node.id)) errors.push(`节点 ID ${node.id} 为系统保留名称`);
    nodeIds.add(node.id);
    if (!NODE_TYPES.has(node.type)) errors.push(`不支持的节点类型：${node.type}`);
    if (node.type === 'start' && node.data.variables !== undefined) {
      if (!Array.isArray(node.data.variables)) errors.push(`开始节点 ${node.id} 的变量声明必须是数组`);
      else {
        const variableNames = new Set();
        for (const variable of node.data.variables) {
          if (!variable || typeof variable !== 'object' || Array.isArray(variable)) {
            errors.push(`开始节点 ${node.id} 存在无效的变量声明`);
            continue;
          }
          const name = String(variable.name || '').trim();
          const normalizedName = name.toLowerCase();
          const type = String(variable.type || 'string').trim();
          if (!allowIncomplete && !name) errors.push(`开始节点 ${node.id} 存在未命名的变量`);
          if (name && !INPUT_MAPPING_KEY_PATTERN.test(name)) errors.push(`开始节点 ${node.id} 的变量名 ${name} 不合法`);
          if (name && variableNames.has(normalizedName)) errors.push(`开始节点 ${node.id} 的变量名 ${name} 重复`);
          if (name) variableNames.add(normalizedName);
          if (!START_VARIABLE_TYPES.has(type)) errors.push(`开始节点 ${node.id} 的变量 ${name || '(未命名)'} 类型不受支持`);
        }
      }
    }
    if (!allowIncomplete && ['subworkflow', 'loop'].includes(node.type) && !String(node.data.workflowId || '').trim()) errors.push(`${node.type === 'loop' ? '循环' : '子工作流'}节点 ${node.id} 未选择目标工作流`);
    if (!allowIncomplete && node.type === 'loop' && !String(node.data.collectionPath || '').trim()) errors.push(`循环节点 ${node.id} 未配置集合路径`);
    if (node.type === 'loop' && String(node.data.itemVariable || '').trim() && !/^[A-Za-z_$][\w$]*$/.test(String(node.data.itemVariable))) errors.push(`循环节点 ${node.id} 的当前项变量名不合法`);
    if (node.type === 'loop') {
      const maxIterations = Number.parseInt(node.data.maxIterations, 10) || 20;
      if (!allowIncomplete && (maxIterations < 1 || maxIterations > 100)) errors.push(`循环节点 ${node.id} 的最大迭代次数需为 1-100`);
    }
    if (node.type === 'output') {
      for (const key of ['sourcePath', 'customSourcePath', 'outputPath']) {
        const value = node.data[key];
        if (value !== undefined && typeof value !== 'string') errors.push(`输出节点 ${node.id} 的 ${key} 必须是文本路径`);
        if (typeof value === 'string' && value.length > MAX_OUTPUT_PATH) errors.push(`输出节点 ${node.id} 的 ${key} 不能超过 ${MAX_OUTPUT_PATH} 个字符`);
        if (typeof value === 'string' && /(^|\.)(?:__proto__|prototype|constructor)(?:\.|$)/.test(value)) errors.push(`输出节点 ${node.id} 的路径包含不允许的字段`);
      }
      const template = node.data.template;
      if (template !== undefined && typeof template !== 'string') errors.push(`输出节点 ${node.id} 的模板必须是文本`);
      if (typeof template === 'string' && template.length > MAX_OUTPUT_TEMPLATE) errors.push(`输出节点 ${node.id} 的模板不能超过 ${MAX_OUTPUT_TEMPLATE} 个字符`);
    }
    if (node.data.inputMappings !== undefined) {
      if (!Array.isArray(node.data.inputMappings)) errors.push(`节点 ${node.id} 的输入映射必须是数组`);
      else {
        const mappingKeys = new Set();
        for (const mapping of node.data.inputMappings) {
        if (!allowIncomplete && (!mapping || !String(mapping.target || '').trim() || !String(mapping.source || '').trim())) {
          errors.push(`节点 ${node.id} 存在不完整的输入映射`);
        }
          const target = String(mapping && mapping.target || '').trim();
          if (!target) continue;
          const normalizedTarget = target.toLowerCase();
          // Keep legacy non-English keys loadable so existing published
          // workflows do not stop executing. The editor migrates them to
          // machine-safe names when they are edited/saved.
          const reservedInMode = RESERVED_INPUT_MAPPING_KEYS.has(normalizedTarget)
            && !(variableMode === 'explicit-v2' && (normalizedTarget === 'input'
              || (node.type === 'output' && normalizedTarget === 'output')));
          if (INPUT_MAPPING_KEY_PATTERN.test(target) && reservedInMode) errors.push(`节点 ${node.id} 的输入变量 ${target} 使用了系统保留名称`);
          if (mappingKeys.has(normalizedTarget)) errors.push(`节点 ${node.id} 的输入变量 ${target} 重复`);
          mappingKeys.add(normalizedTarget);
        }
      }
    }
    if (node.type === 'transform' && node.data.operation === 'composeText') {
      const mappings = Array.isArray(node.data.inputMappings) ? node.data.inputMappings : [];
      const mappedKeys = mappings.map((mapping) => String(mapping && mapping.target || '').trim()).filter(Boolean);
      const fixedInputs = node.data.fixedInputs;
      if (fixedInputs !== undefined && (!fixedInputs || typeof fixedInputs !== 'object' || Array.isArray(fixedInputs))) {
        errors.push(`文本拼接节点 ${node.id} 的固定内容必须是对象`);
      }
      const fixedKeys = fixedInputs && typeof fixedInputs === 'object' && !Array.isArray(fixedInputs)
        ? Object.keys(fixedInputs)
        : [];
      const duplicateInputs = fixedKeys.filter((key) => mappedKeys.includes(key));
      if (duplicateInputs.length) {
        errors.push(`文本拼接节点 ${node.id} 的固定内容与映射输入不能同名：${duplicateInputs.join('、')}`);
      }
      const availableKeys = new Set(mappedKeys.concat(fixedKeys));
      const validateKeyList = (property, label) => {
        const value = node.data[property];
        if (value !== undefined && !Array.isArray(value)) {
          errors.push(`文本拼接节点 ${node.id} 的${label}必须是数组`);
          return [];
        }
        const keys = Array.isArray(value) ? value.map((key) => String(key || '').trim()).filter(Boolean) : [];
        if (new Set(keys).size !== keys.length) errors.push(`文本拼接节点 ${node.id} 的${label}存在重复项`);
        if (!allowIncomplete) {
          const unknown = keys.filter((key) => !availableKeys.has(key));
          if (unknown.length) errors.push(`文本拼接节点 ${node.id} 的${label}引用了未配置输入：${unknown.join('、')}`);
        }
        return keys;
      };
      const sectionOrder = validateKeyList('sectionOrder', '拼接顺序');
      validateKeyList('requiredInputs', '必填输入');
      if (!allowIncomplete && !sectionOrder.length && !mappedKeys.length && !fixedKeys.length) {
        errors.push(`文本拼接节点 ${node.id} 至少需要一个映射输入或固定内容`);
      }
      if (!allowIncomplete && sectionOrder.length) {
        const omitted = Array.from(availableKeys).filter((key) => !sectionOrder.includes(key));
        if (omitted.length) errors.push(`文本拼接节点 ${node.id} 的拼接顺序遗漏了输入：${omitted.join('、')}`);
      }
      if (node.data.separator !== undefined && (typeof node.data.separator !== 'string' || node.data.separator.length > 20)) {
        errors.push(`文本拼接节点 ${node.id} 的分隔符必须是 20 个字符以内的文本`);
      }
      const outputKey = String(node.data.outputKey == null ? 'content' : node.data.outputKey).trim();
      if (outputKey && !INPUT_MAPPING_KEY_PATTERN.test(outputKey)) errors.push(`文本拼接节点 ${node.id} 的输出字段名不合法`);
      if (!TEXT_CLEANUP_PRESETS.has(String(node.data.cleanupPreset || 'none'))) {
        errors.push(`文本拼接节点 ${node.id} 选择了不支持的文本清理预设`);
      }
      for (const property of ['requireAllMappedInputs', 'omitEmpty', 'fullOutput']) {
        if (node.data[property] !== undefined && typeof node.data[property] !== 'boolean') {
          errors.push(`文本拼接节点 ${node.id} 的 ${property} 必须是布尔值`);
        }
      }
    }
    if (node.type === 'llm') {
      const temperature = Number(node.data.temperature ?? 0.55);
      const maxTokens = Number.parseInt(node.data.maxTokens ?? 4096, 10);
      if (!allowIncomplete && (!Number.isFinite(temperature) || temperature < 0 || temperature > 1.5)) errors.push(`DeepSeek 节点 ${node.id} 的 Temperature 需为 0-1.5`);
      if (!allowIncomplete && (!Number.isFinite(maxTokens) || maxTokens < 128 || maxTokens > 32768)) errors.push(`DeepSeek 节点 ${node.id} 的最大 Tokens 需为 128-32768`);
      if (!allowIncomplete && !['planDocument', 'draftSection', 'chat'].includes(String(node.data.action || ''))) errors.push(`DeepSeek 节点 ${node.id} 未选择有效动作`);
    }
    if (node.type === 'plugin') {
      if (!allowIncomplete && String(node.data.plugin || 'academicSearch') !== 'academicSearch') errors.push(`插件节点 ${node.id} 仅支持学术检索插件`);
      if (!allowIncomplete && !['openalex', 'semanticScholar', 'arxiv', 'crossref'].includes(String(node.data.provider || 'openalex'))) errors.push(`插件节点 ${node.id} 未选择有效的学术 API`);
      if (node.data.key !== undefined && typeof node.data.key !== 'string') errors.push(`插件节点 ${node.id} 的 Key 必须是文本`);
      if (typeof node.data.key === 'string' && node.data.key.length > 512) errors.push(`插件节点 ${node.id} 的 Key 不能超过 512 个字符`);
      if (node.data.input !== undefined && !['string', 'object'].includes(typeof node.data.input)) errors.push(`插件节点 ${node.id} 的输入必须是关键词或 JSON 对象`);
      if (typeof node.data.input === 'string' && node.data.input.length > 20000) errors.push(`插件节点 ${node.id} 的输入不能超过 20000 个字符`);
      const count = Number.parseInt(node.data.count ?? 10, 10);
      if (!allowIncomplete && (!Number.isFinite(count) || count < 1 || count > 50)) errors.push(`插件节点 ${node.id} 的返回数量需为 1-50`);
    }
    if (node.type === 'condition') {
      const routes = Array.isArray(node.data.routes) && node.data.routes.length
        ? node.data.routes
        : [{ key: node.data.truthyRoute || 'true' }, { key: node.data.falsyRoute || 'false' }];
      const keys = routes.map((route) => String(route && route.key || '').trim());
      if (!allowIncomplete && (keys.length < 2 || keys.some((key) => !key))) errors.push(`条件节点 ${node.id} 至少需要两个有效分支`);
      if (!allowIncomplete && new Set(keys).size !== keys.length) errors.push(`条件节点 ${node.id} 的分支键不能重复`);
    }
    if (node.type === 'output') {
      const sourcePath = String(node.data.sourcePath || '').trim();
      const template = String(node.data.template || '');
      const outputPath = String(node.data.outputPath || '').trim();
      if (sourcePath.length > 512) errors.push(`输出节点 ${node.id} 的来源路径过长`);
      if (outputPath.length > 512) errors.push(`输出节点 ${node.id} 的字段路径过长`);
      if (template.length > 20000) errors.push(`输出节点 ${node.id} 的模板过长`);
    }
  }

  const edgeIds = new Set();
  const connections = new Set();
  for (const edge of workflow.edges) {
    if (!edge.id) errors.push('存在缺少 ID 的连线');
    if (edgeIds.has(edge.id)) errors.push(`连线 ID 重复：${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source)) errors.push(`连线 ${edge.id} 的起点不存在`);
    if (!nodeIds.has(edge.target)) errors.push(`连线 ${edge.id} 的终点不存在`);
    if (edge.source === edge.target) errors.push(`节点 ${edge.source} 不能直接连接自身`);
    const connectionKey = `${edge.source}:${edge.sourceHandle || ''}->${edge.target}:${edge.targetHandle || ''}`;
    if (connections.has(connectionKey)) errors.push(`存在重复连线：${edge.source} → ${edge.target}`);
    connections.add(connectionKey);
  }

  const startCount = workflow.nodes.filter((node) => node.type === 'start').length;
  const outputCount = workflow.nodes.filter((node) => node.type === 'output').length;
  if (!allowIncomplete && startCount !== 1) errors.push('每个工作流必须且只能有一个开始节点');
  if (!allowIncomplete && outputCount < 1) errors.push('每个工作流至少需要一个输出节点');
  return errors;
}

module.exports = { NODE_TYPES, VARIABLE_MODES, normalizeWorkflow, validateWorkflowShape, workflowVariableMode };
