const { compileWorkflow, getByPath } = require('../workflow-studio/compiler');
const workflowStore = require('../workflow-studio/store');
const { normalizePlan } = require('./graph');
const { buildPlanningMessages, buildSectionMessages } = require('./prompts');
const { searchAcademic } = require('./plugins/academic-search');
const { countWords, createTraceId, parseTargetWords } = require('./utils');

function findPlanValue(values) {
  return Object.values(values || {}).find((value) => value && Array.isArray(value.sections) && value.title);
}

function stringifyTemplateValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

// Input mappings are exposed under `inputs`, but users commonly type the
// mapping key directly in a prompt (for example `{{input1}}`). In the
// explicit-v2 contract this namespace is the *only* variable declaration
// source. A bare `{{input}}` is therefore just an ordinary/unbound token
// unless the current node explicitly maps a target named `input`.
function resolveTemplateValue(context, normalizedPath) {
  const variableMode = context && context.variableMode || 'legacy-v1';
  if (variableMode === 'explicit-v2') {
    const match = String(normalizedPath || '').match(/^([A-Za-z][A-Za-z0-9_]*)(?:\.(.+))?$/);
    if (!match) return undefined;
    const [, key, fieldPath] = match;
    const inputs = context && context.inputs;
    if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) return undefined;
    if (key === 'inputs') return getByPath(inputs, fieldPath || '');
    if (!Object.prototype.hasOwnProperty.call(inputs, key)) return undefined;
    return fieldPath ? getByPath(inputs, `${key}.${fieldPath}`) : inputs[key];
  }

  const direct = getByPath(context, normalizedPath);
  if (direct !== undefined) return direct;
  const match = String(normalizedPath || '').match(/^([A-Za-z][A-Za-z0-9_]*)(?:\.(.+))?$/);
  if (!match) return undefined;
  const [, key, fieldPath] = match;
  const inputs = context && context.inputs;
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(inputs, key)) return undefined;
  return fieldPath ? getByPath(inputs, `${key}.${fieldPath}`) : inputs[key];
}

function renderTemplate(template, context, meta = null) {
  return String(template || '').replace(/{{\s*([^{}]*?)\s*}}/g, (full, path) => {
    const normalizedPath = String(path).trim();
    // An empty token is an editor placeholder, never a value reference.
    // Remove it before sending the prompt and expose it in the trace so the
    // canvas can explain why no value was injected.
    if (!normalizedPath) {
      if (meta && Array.isArray(meta.unresolved)) meta.unresolved.push('{{}}');
      return '';
    }
    const value = resolveTemplateValue(context, normalizedPath);
    if (value === undefined && meta && Array.isArray(meta.unresolved)) meta.unresolved.push(normalizedPath);
    // Keep unbound explicit-v2 tokens visible. This is important in the
    // editor preview: users can distinguish a literal placeholder from an
    // injected value, and a typo cannot silently erase prompt text.
    if (value === undefined && context && context.variableMode === 'explicit-v2') return full;
    return stringifyTemplateValue(value);
  });
}

function recordPromptTrace(state, messages, meta = {}) {
  state.traceMeta = {
    ...(state.traceMeta || {}),
    ...meta,
    messages,
    unresolved: Array.from(new Set(meta.unresolved || []))
  };
}

function parseLiteral(value) {
  const source = String(value == null ? '' : value).trim();
  if (!source) return '';
  if (source === 'true') return true;
  if (source === 'false') return false;
  if (source === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(source)) return Number(source);
  try { return JSON.parse(source); } catch (_) { return value; }
}

function compareCondition(value, operator, compareValue) {
  const expected = parseLiteral(compareValue);
  switch (operator) {
    case 'equals': return value === expected || String(value) === String(expected);
    case 'notEquals': return !(value === expected || String(value) === String(expected));
    case 'contains': return Array.isArray(value) ? value.includes(expected) : String(value ?? '').includes(String(expected));
    case 'gt': return Number(value) > Number(expected);
    case 'gte': return Number(value) >= Number(expected);
    case 'lt': return Number(value) < Number(expected);
    case 'lte': return Number(value) <= Number(expected);
    case 'exists': return value !== undefined && value !== null;
    case 'truthy':
    default: return Boolean(value);
  }
}

function isEmptyCompositionValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function applyTextCleanupPreset(text, preset) {
  if (preset !== 'academicChinese') return text;
  // Presets are built in and selectable; workflow data never executes code or regex.
  return text
    .replace(/了/g, '')
    .replace(/通过/g, '')
    .replace(/旨在/g, '目的是')
    .replace(/首先,|首先，/g, '')
    .replace(/此外，/g, '')
    .replace(/最后,|最后，/g, '')
    .replace(/最后/g, '而后')
    .replace(/例如，|例如,/g, '')
    .replace(/包括/g, '涵盖')
    .replace(/不仅仅/g, '')
    .replace(/不仅/g, '')
    .replace(/[\*#']/g, '')
    .replace(/深入/g, '')
    .replace(/[{}\/]/g, '')
    .replace(/。,/g, '\n')
    .replace(/\\n/g, '\n');
}

function composeMappedText(node, nodeInput, workflow) {
  const data = node.data || {};
  const input = nodeInput && typeof nodeInput === 'object' && !Array.isArray(nodeInput)
    ? { ...nodeInput, ...(data.fixedInputs || {}) }
    : { ...(data.fixedInputs || {}) };
  const mappedInputs = (Array.isArray(data.inputMappings) ? data.inputMappings : [])
    .map((mapping) => String(mapping && mapping.target || '').trim())
    .filter(Boolean);
  const configuredRequired = Array.isArray(data.requiredInputs) ? data.requiredInputs : [];
  const requiredInputs = Array.from(new Set([
    ...configuredRequired,
    ...(data.requireAllMappedInputs ? mappedInputs : [])
  ]));
  const missingInputs = requiredInputs.filter((key) => {
    return isEmptyCompositionValue(getByPath(input, key));
  });
  if (missingInputs.length) {
    const labels = data.sectionLabels || {};
    const missing = missingInputs.map((key) => labels[key] || key).join('、');
    throw new Error(`[${workflow && workflow.name || '工作流'}] 节点 ${data.label || node.id} 缺少必填输入：${missing}`);
  }
  const fixedKeys = Object.keys(data.fixedInputs || {});
  const sectionOrder = Array.isArray(data.sectionOrder) && data.sectionOrder.length
    ? data.sectionOrder
    : Array.from(new Set([...mappedInputs, ...fixedKeys]));
  const values = sectionOrder.map((key) => getByPath(input, key));
  const parts = data.omitEmpty === false ? values : values.filter((value) => !isEmptyCompositionValue(value));
  const separator = typeof data.separator === 'string' ? data.separator : '\n';
  const text = parts.map(stringifyTemplateValue).join(separator);
  const cleaned = applyTextCleanupPreset(text, data.cleanupPreset || 'none');
  const outputKey = String(data.outputKey == null ? 'content' : data.outputKey).trim();
  return outputKey ? { [outputKey]: cleaned } : cleaned;
}

function createWorkflowHandlers({ provider, config }) {
  return {
    plugin: async ({ node, state, workflow }) => {
      const pluginName = String(node.data.plugin || 'academicSearch');
      if (pluginName === 'companyFinancial') {
        const mapped = state.nodeInput && typeof state.nodeInput === 'object' && !Array.isArray(state.nodeInput)
          ? state.nodeInput : {};
        const keyword = String(mapped.keyword || node.data.input || '').trim();
        if (!keyword) throw new Error(`[${workflow.name}] 企业资料检索需要公司名称或股票代码`);
        // Keep this connector provider-neutral. Deployments can attach a
        // companyFinancial handler/provider later without changing the graph
        // contract; the trace still shows the exact requested keyword.
        state.traceMeta = { plugin: 'companyFinancial', provider: 'companyFinancial', query: keyword, count: 0 };
        return { provider: 'companyFinancial', query: keyword, total: 0, items: [], message: '企业财务资料插件尚未配置数据源' };
      }
      if (pluginName !== 'academicSearch') throw new Error(`[${workflow.name}] 不支持的插件：${pluginName}`);
      const context = { ...state.context, nodeInput: state.nodeInput };
      const mapped = state.nodeInput && typeof state.nodeInput === 'object' && !Array.isArray(state.nodeInput)
        ? state.nodeInput
        : {};
      const templateMeta = { unresolved: [] };
      let pluginInput = node.data.input;
      if (typeof pluginInput === 'string' && pluginInput.trim()) {
        pluginInput = renderTemplate(pluginInput, context, templateMeta);
      } else if (!pluginInput || typeof pluginInput !== 'object') {
        pluginInput = Object.prototype.hasOwnProperty.call(mapped, 'input')
          ? mapped.input
          : Object.prototype.hasOwnProperty.call(mapped, 'query')
            ? mapped
            : state.nodeInput;
      }

      const configuredKey = String(node.data.key || '');
      const key = configuredKey.trim()
        ? renderTemplate(configuredKey, context, templateMeta)
        : mapped.key || mapped.apiKey || config?.academicSearch?.apiKey || '';
      const configuredCount = Number.parseInt(mapped.count ?? node.data.count ?? 10, 10) || 10;
      const count = Math.min(config?.academicSearch?.maxResults || 50, configuredCount);
      const result = await searchAcademic({
        provider: node.data.provider || 'openalex',
        key,
        input: pluginInput,
        count,
        timeoutMs: config?.academicSearch?.timeoutMs
      });
      state.traceMeta = {
        plugin: 'academicSearch',
        provider: result.provider,
        query: result.query,
        count: result.items.length,
        total: result.total,
        unresolved: Array.from(new Set(templateMeta.unresolved))
      };
      return result;
    },

    transform: async ({ node, state, workflow }) => {
      const context = { ...state.context, nodeInput: state.nodeInput };
      if (node.data.operation === 'prepareWritingInput') {
        return {
          ...state.input,
          targetWords: parseTargetWords(
            state.input.requirements,
            state.input.defaultTargetWords,
            config.minTargetWords,
            config.maxTargetWords
          )
        };
      }

      if (node.data.operation === 'assembleDocument') {
        const planNode = workflow.nodes.find((item) => item.data && item.data.action === 'planDocument');
        const loopNode = workflow.nodes.find((item) => item.type === 'loop');
        const plan = (planNode && state.values[planNode.id]) || findPlanValue(state.values);
        const sections = (loopNode && state.values[loopNode.id]) || [];
        const content = [`# ${plan.title}`, '', ...sections.flatMap((section) => [String(section || '').trim(), ''])].join('\n').trim();
        return { content, wordCount: countWords(content), plan, sections };
      }

      if (node.data.operation === 'pick') return getByPath(context, node.data.sourcePath || 'output');
      if (node.data.operation === 'set') {
        const base = state.nodeInput && typeof state.nodeInput === 'object' && !Array.isArray(state.nodeInput) ? { ...state.nodeInput } : {};
        base[node.data.targetKey || 'value'] = node.data.valueFrom
          ? getByPath(context, node.data.valueFrom)
          : parseLiteral(node.data.value);
        return base;
      }
      if (node.data.operation === 'merge') {
        const paths = String(node.data.sourcePaths || 'input,output').split(',').map((item) => item.trim()).filter(Boolean);
        return Object.assign({}, ...paths.map((path) => getByPath(context, path)).filter((value) => value && typeof value === 'object' && !Array.isArray(value)));
      }
      if (node.data.operation === 'template') return renderTemplate(node.data.template || '{{output}}', context);
      if (node.data.operation === 'jsonParse') {
        const source = getByPath(context, node.data.sourcePath || 'output');
        if (source && typeof source === 'object') return source;
        try { return JSON.parse(String(source || '')); } catch (_) { throw new Error(`[${workflow.name}] 节点 ${node.data.label || node.id} 无法解析 JSON`); }
      }
      if (node.data.operation === 'toArray') {
        const source = getByPath(context, node.data.sourcePath || 'output');
        return Array.isArray(source) ? source : source == null ? [] : [source];
      }
      if (node.data.operation === 'composeText') return composeMappedText(node, state.nodeInput, workflow);
      if (node.data.operation === 'assembleCozePaper') {
        return composeMappedText({
          ...node,
          data: { ...node.data, cleanupPreset: 'academicChinese', outputKey: 'key0' }
        }, state.nodeInput, workflow);
      }
      return state.nodeInput !== undefined ? state.nodeInput : state.output;
    },

    prompt: async ({ node, state }) => {
      if (node.data.templateKey === 'academicSection') {
        // Built-in templates still honor the node's explicit input mapping.
        // Without this, a mapped prompt node silently fell back to the
        // child-workflow input and made the canvas wiring misleading.
        const promptInput = state.nodeInput && typeof state.nodeInput === 'object'
          ? state.nodeInput
          : state.input;
        const plan = findPlanValue(state.values);
        const previousOutputs = promptInput.previousOutputs || [];
        const messages = buildSectionMessages({
          ...promptInput,
          plan,
          sections: previousOutputs.map((content, index) => ({
            heading: plan.sections[index] ? plan.sections[index].heading : `第${index + 1}节`,
            content
          })),
          currentSection: promptInput.currentSection
        });
        recordPromptTrace(state, messages, { templateKey: node.data.templateKey });
        return messages;
      }
      const context = { ...state.context, nodeInput: state.nodeInput };
      const messages = [];
      const templateMeta = { unresolved: [] };
      if (String(node.data.systemPrompt || '').trim()) messages.push({ role: 'system', content: renderTemplate(node.data.systemPrompt, context, templateMeta) });
      // An empty user prompt is intentional: do not silently reinsert the
      // legacy `{{output}}` default after the editor cleared the field.
      messages.push({ role: 'user', content: renderTemplate(node.data.userPrompt ?? '', context, templateMeta) });
      recordPromptTrace(state, messages, templateMeta);
      return messages;
    },

    llm: async ({ node, state, workflow }) => {
      const settings = {
        model: node.data.model || 'deepseek-chat',
        temperature: Number.isFinite(Number(node.data.temperature)) ? Number(node.data.temperature) : undefined,
        maxTokens: Number.parseInt(node.data.maxTokens, 10) || undefined
      };
      if (node.data.action === 'planDocument') {
        const targetWords = state.input.targetWords || state.output && state.output.targetWords || state.input.defaultTargetWords;
        const messages = buildPlanningMessages({ ...state.input, targetWords, maxSections: config.maxSections });
        recordPromptTrace(state, messages, { templateKey: 'planning' });
        const response = await provider.plan({
          messages,
          traceId: state.input.traceId,
          ...settings
        });
        return normalizePlan(response.data, { ...state.input, targetWords, maxSections: config.maxSections });
      }

      if (node.data.action === 'draftSection') {
        const mappedMessages = Array.isArray(state.nodeInput)
          ? state.nodeInput
          : getByPath(state.nodeInput, 'messages');
        const messages = Array.isArray(mappedMessages) ? mappedMessages : state.output;
        if (!Array.isArray(messages)) throw new Error(`[${workflow.name}] DeepSeek 节点 ${node.data.label || node.id} 的章节提示词不是消息数组`);
        recordPromptTrace(state, messages, { templateKey: 'draftSection' });
        const response = await provider.draftSection({
          messages,
          traceId: state.input.traceId,
          sectionIndex: state.input.loopIndex || 0,
          ...settings
        });
        return response.content.trim();
      }

      if (node.data.action === 'chat') {
        const context = { ...state.context, nodeInput: state.nodeInput };
        let messages;
        const templateMeta = { unresolved: [] };
        if (node.data.promptMode === 'inline' || String(node.data.systemPrompt || node.data.userPrompt || '').trim()) {
          messages = [];
          if (String(node.data.systemPrompt || '').trim()) messages.push({ role: 'system', content: renderTemplate(node.data.systemPrompt, context, templateMeta) });
          messages.push({ role: 'user', content: renderTemplate(node.data.userPrompt ?? '', context, templateMeta) });
        } else {
          messages = getByPath(context, node.data.messagesPath || 'output');
          if (!Array.isArray(messages)) throw new Error(`[${workflow.name}] DeepSeek 节点 ${node.data.label || node.id} 的消息输入不是数组`);
        }
        recordPromptTrace(state, messages, { promptMode: node.data.promptMode || (node.data.systemPrompt || node.data.userPrompt ? 'inline' : 'messagesPath'), messagesPath: node.data.messagesPath || undefined, unresolved: templateMeta.unresolved });
        const json = node.data.responseMode === 'json';
        const response = await provider.chat({
          messages,
          json,
          traceId: state.input && state.input.traceId,
          step: node.id,
          ...settings
        });
        if (json) return response.data;
        const content = response.content.trim();
        const outputFields = Array.isArray(node.data.cozeOutputFields) ? node.data.cozeOutputFields.filter(Boolean) : [];
        if (!outputFields.length) return content;
        if (outputFields.length === 1) return { [outputFields[0]]: content };
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch (_) { /* preserve the original Coze field contract below */ }
        return Object.fromEntries(outputFields.map((field, index) => [field, index === 0 ? content : '']));
      }
      throw new Error(`[${workflow.name}] 未实现的 DeepSeek 动作：${node.data.action || node.id}`);
    },

    condition: async ({ node, state }) => {
      const sourcePath = node.data.conditionSource || (node.data.valueFrom ? `values.${node.data.valueFrom}` : 'output');
      const value = getByPath(state.context, sourcePath);
      const routes = Array.isArray(node.data.routes) && node.data.routes.length
        ? node.data.routes
        : [{ key: node.data.truthyRoute || 'true' }, { key: node.data.falsyRoute || 'false' }];
      if (node.data.mode === 'routeValue') {
        const raw = String(value == null ? '' : value).trim();
        const normalized = raw.match(/[1-9][0-9]?/)?.[0] || raw;
        const matchedRoute = routes.find((item) => (item.matchValues || []).some((candidate) => {
          const expected = String(candidate == null ? '' : candidate).trim();
          return expected && (normalized === expected || raw === expected || raw.includes(expected));
        }));
        const fallback = routes[routes.length - 1];
        const route = (matchedRoute || fallback).key;
        return { route, value, matched: Boolean(matchedRoute) };
      }
      const matched = compareCondition(value, node.data.operator || 'truthy', node.data.compareValue);
      const route = matched ? routes[0].key : routes[1].key;
      return { route, value, matched };
    }
  };
}

async function runPublishedWritingWorkflow(input, { provider, config }) {
  const workflows = await workflowStore.listPublishedWorkflows();
  const activeWorkflowId = await workflowStore.getActiveWorkflowId();
  const workflowId = workflows.some((workflow) => workflow.id === activeWorkflowId)
    ? activeWorkflowId
    : workflows[0]?.id;
  if (!workflowId) throw new Error('没有可用的已启用工作流');
  const graph = compileWorkflow(workflowId, workflows, createWorkflowHandlers({ provider, config }));
  const result = await graph.invoke({ input });
  const output = result.output && typeof result.output === 'object'
    ? result.output
    : { content: String(result.output || '') };
  return {
    ...output,
    wordCount: output.wordCount || countWords(output.content || ''),
    steps: (result.trace || []).map((item) => ({
      name: `${item.workflowId}:${item.nodeId}`,
      status: 'completed',
      durationMs: item.durationMs,
      type: item.type
    }))
  };
}

/**
 * Execute one workflow for the admin canvas preview.
 *
 * This deliberately bypasses the product writing route: no credits, orders,
 * documents, or notifications are touched. The caller supplies the exact
 * workflow collection to compile, which lets the canvas preview an unsaved
 * root snapshot while retaining stored child workflows.
 */
async function runWorkflowPreview({
  workflowId,
  workflows,
  input = {},
  provider,
  config,
  maxSteps = 100,
  maxLoopIterations = 20,
  timeoutMs = 180000,
  onTrace,
  shouldCancel
}) {
  const runId = String(input.traceId || '').trim() || createTraceId();
  const startedAt = Date.now();
  const graph = compileWorkflow(
    workflowId,
    workflows,
    createWorkflowHandlers({ provider, config }),
    { maxSteps, maxLoopIterations, onTrace, shouldCancel }
  );
  const invokePromise = graph.invoke({ input: { ...input, traceId: runId } });
  // Promise.race cannot abort a provider request. Attach a handler so a late
  // rejection after a timeout never becomes an unhandled rejection.
  invokePromise.catch(() => {});
  let timer;
  let result;
  try {
    result = await Promise.race([
      invokePromise,
      new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`工作流运行超过 ${Math.round(timeoutMs / 1000)} 秒，已停止等待`);
        error.code = 'WORKFLOW_RUN_TIMEOUT';
        reject(error);
      }, timeoutMs);
      })
    ]);
  } catch (error) {
    error.runId = runId;
    error.workflowId = workflowId;
    error.durationMs = Date.now() - startedAt;
    throw error;
  } finally {
    clearTimeout(timer);
  }

  return {
    runId,
    workflowId,
    status: 'completed',
    output: result.output,
    values: result.values || {},
    trace: result.trace || [],
    durationMs: Date.now() - startedAt
  };
}

module.exports = { compareCondition, createWorkflowHandlers, renderTemplate, runPublishedWritingWorkflow, runWorkflowPreview };
