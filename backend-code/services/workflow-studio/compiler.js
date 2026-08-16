const { Annotation, END, START, StateGraph } = require('@langchain/langgraph');
const { analyzeGraphActivation, buildDependencyGraph, validateWorkflowCollection } = require('./validator');
const { workflowVariableMode } = require('./schema');

const RuntimeState = Annotation.Root({
  input: Annotation(),
  values: Annotation({ reducer: (left, right) => ({ ...(left || {}), ...(right || {}) }), default: () => ({}) }),
  trace: Annotation({ reducer: (left, right) => left.concat(right || []), default: () => [] }),
  // Parallel nodes can finish in the same LangGraph super-step.  `output`
  // must therefore have a reducer; otherwise concurrent writes throw before
  // the deterministic values.<nodeId> namespace can be used at the join.
  output: Annotation({ reducer: (_left, right) => right, default: () => undefined })
});

function topologicalOrder(workflow) {
  const nodes = new Map(workflow.nodes.map((node) => [node.id, node]));
  const indegree = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(workflow.nodes.map((node) => [node.id, []]));
  for (const edge of workflow.edges) {
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
    outgoing.get(edge.source).push(edge.target);
  }
  const queue = workflow.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    ordered.push(nodes.get(id));
    for (const target of outgoing.get(id) || []) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  if (ordered.length !== workflow.nodes.length) throw new Error(`[${workflow.name}] 节点连线存在循环；请使用循环节点调用子工作流`);
  return ordered;
}

function getByPath(source, path) {
  const normalized = String(path == null ? '' : path).trim();
  if (!normalized || normalized === '$') return source;
  const keys = normalized.replace(/^\$\.?/, '').split('.').filter(Boolean);
  if (keys.some((key) => key === '__proto__' || key === 'prototype' || key === 'constructor')) return undefined;
  return keys.reduce((value, key) => value == null ? undefined : value[key], source);
}

function setByPath(target, path, value) {
  const keys = String(path || '').trim().replace(/^\$\.?/, '').split('.').filter(Boolean);
  if (keys.some((key) => key === '__proto__' || key === 'prototype' || key === 'constructor')) return target;
  if (!keys.length) return value;
  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
  return target;
}

function runtimeContext(state, loop) {
  return {
    input: state.input,
    output: state.output,
    values: state.values || {},
    node: state.values || {},
    // `inputs` is the explicit mapping namespace.  Do not alias it to the
    // default node input: doing so made an undeclared `{{inputs.foo}}` resolve
    // accidentally when a node happened to receive an object by default.
    // The default input remains available through `input`/`output` and is
    // still passed to handlers as `nodeInput`.
    inputs: state.explicitInputs || {},
    loop: loop || (state.input && state.input.__loop) || {},
    variableMode: state.variableMode || 'legacy-v1'
  };
}

function applyMappings(mappings, context) {
  const result = {};
  for (const mapping of Array.isArray(mappings) ? mappings : []) {
    const target = String(mapping && mapping.target || '').trim();
    const source = String(mapping && mapping.source || '').trim();
    if (!target || !source) continue;
    setByPath(result, target, getByPath(context, source));
  }
  return result;
}

function resolveNodeInput(node, state, loop, predecessorIds = []) {
  const mappings = node.data && node.data.inputMappings;
  if (Array.isArray(mappings) && mappings.length) return applyMappings(mappings, runtimeContext(state, loop));
  if (node.data && node.data.inputMode === 'workflow') return state.input;
  // In a parallel graph, the shared `output` channel represents only a
  // compatibility cursor and is intentionally not deterministic when sibling
  // nodes finish together.  A node with one active direct predecessor must
  // consume that predecessor's named value instead, so separate branch chains
  // can never receive each other's results.  Exclusive condition convergence
  // also works here because only the selected predecessor has a value.
  const availablePredecessors = predecessorIds.filter((id) => state.values
    && Object.prototype.hasOwnProperty.call(state.values, id));
  if (availablePredecessors.length === 1) {
    const previous = state.values[availablePredecessors[0]];
    if (previous && typeof previous === 'object' && !Array.isArray(previous)) return { ...(state.input || {}), ...previous };
    return { ...(state.input || {}), value: previous };
  }
  // A connected node receives the latest upstream result by default. This is
  // the canvas contract: explicit mappings are optional, and are only needed
  // when the node should pick a particular upstream value or field. Preserve
  // the original workflow input alongside object results for backwards
  // compatibility; primitive/array results are exposed as `value`.
  if (state.output === undefined) return state.input;
  if (state.output && typeof state.output === 'object' && !Array.isArray(state.output)) return { ...(state.input || {}), ...state.output };
  return { ...(state.input || {}), value: state.output };
}

function projectOutput(node, result, previousOutput) {
  let projected = result;
  const outputPath = String(node.data && node.data.outputPath || '').trim();
  if (outputPath) projected = getByPath(result, outputPath);
  if (node.data && node.data.mergeOutput && previousOutput && typeof previousOutput === 'object' && !Array.isArray(previousOutput)
      && projected && typeof projected === 'object' && !Array.isArray(projected)) {
    return { ...previousOutput, ...projected };
  }
  return projected;
}

// Output nodes are deliberately data-only composition steps.  They never call
// a provider; they select a value already present in the runtime context and
// can optionally project a field or render a small, safe text template.
function stringifyTemplateValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch (_) { return String(value); }
}

function resolveTemplatePath(context, path, variableMode = 'legacy-v1') {
  const normalized = String(path || '').trim();
  if (!normalized) return undefined;
  if (variableMode !== 'explicit-v2') return getByPath(context, normalized);
  // Output composition is a data step, not an LLM prompt declaration. Keep
  // the runtime roots available there so an explicit workflow can still
  // select `values.someNode`, `output`, or `source` for its final result.
  if (/^(?:output|values|node|loop|source)(?:\.|$)/.test(normalized)) {
    return getByPath(context, normalized);
  }
  const match = normalized.match(/^([A-Za-z][A-Za-z0-9_]*)(?:\.(.+))?$/);
  if (!match) return undefined;
  const [, key, fieldPath] = match;
  const explicit = context && context.inputs;
  if (!explicit || typeof explicit !== 'object' || Array.isArray(explicit)) return undefined;
  if (key === 'inputs') return getByPath(explicit, fieldPath || '');
  if (!Object.prototype.hasOwnProperty.call(explicit, key)) return undefined;
  return fieldPath ? getByPath(explicit, `${key}.${fieldPath}`) : explicit[key];
}

function renderOutputTemplate(template, context, meta = {}) {
  const unresolved = Array.isArray(meta.unresolved) ? meta.unresolved : [];
  const variableMode = context && context.variableMode || 'legacy-v1';
  return String(template).replace(/{{\s*([^{}]*?)\s*}}/g, (full, path) => {
    const normalizedPath = String(path).trim();
    if (!normalizedPath) {
      if (!unresolved.includes('{{}}')) unresolved.push('{{}}');
      return '';
    }
    const value = resolveTemplatePath(context, normalizedPath, variableMode);
    if (value === undefined && !unresolved.includes(normalizedPath)) unresolved.push(normalizedPath);
    return value === undefined && variableMode === 'explicit-v2' ? full : stringifyTemplateValue(value);
  });
}

function resolveOutputSourcePath(node) {
  const configuredSourcePath = String(node.data && node.data.sourcePath || '').trim();
  if (configuredSourcePath === '__custom__') {
    return String(node.data && node.data.customSourcePath || '').trim() || 'output';
  }
  return configuredSourcePath || 'output';
}

function composeOutput(node, state) {
  const configuredSourcePath = String(node.data && node.data.sourcePath || '').trim();
  const sourcePath = resolveOutputSourcePath(node);
  const context = runtimeContext(state);
  let sourceValue = getByPath(context, sourcePath);

  // Before output nodes became executable, a direct start -> output graph was
  // effectively a passthrough.  Keep that behaviour for old saved graphs.
  if (sourcePath === 'output' && sourceValue === undefined) sourceValue = state.input;

  const outputPath = String(node.data && node.data.outputPath || '').trim();
  const projectedValue = outputPath ? getByPath(sourceValue, outputPath) : sourceValue;
  const template = node.data && typeof node.data.template === 'string' ? node.data.template : '';
  const unresolved = [];
  let value = projectedValue;
  if (template.length > 0) {
    const templateContext = { ...context, source: sourceValue };
    // For a direct start -> output passthrough, {{output}} should remain useful
    // even though there is no preceding executable node to populate state.output.
    if (templateContext.output === undefined) templateContext.output = sourceValue;
    value = renderOutputTemplate(template, templateContext, { unresolved });
  }

  return {
    value,
    composition: {
      configuredSourcePath: configuredSourcePath || undefined,
      sourcePath,
      outputPath: outputPath || undefined,
      template: template.length > 0 ? traceValue(template) : undefined,
      templateApplied: template.length > 0,
      sourceAvailable: sourceValue !== undefined,
      unresolved: Array.from(new Set(unresolved))
    }
  };
}

function resolveCollection(node, state) {
  const context = runtimeContext(state);
  let collection = getByPath(context, node.data.collectionPath);
  if (collection === undefined) collection = getByPath(state.values, node.data.collectionPath);
  if (collection === undefined) {
    const suffix = String(node.data.collectionPath || '').split('.').filter(Boolean).pop();
    const matches = Object.values(state.values || {}).filter((value) => value && typeof value === 'object' && value[suffix] !== undefined);
    if (matches.length === 1) collection = matches[0][suffix];
  }
  return collection;
}

// Trace data is returned to the workflow studio for preview/debugging. Keep
// values JSON-safe and avoid accidentally exposing an Authorization header if
// a provider error bubbles up through the graph.
function traceErrorMessage(error) {
  return String(error && error.message ? error.message : error || '未知错误')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .slice(0, 500);
}

function traceValue(value, depth = 0) {
  if (value === undefined || value === null) return value;
  if (depth > 8) return '[最大嵌套深度]';
  if (typeof value === 'string') return value.length > 100000 ? `${value.slice(0, 100000)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => traceValue(item, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 200)) {
      if (/^(?:key)$/i.test(key) || /authorization|api[-_]?key|token|secret|password|cookie/i.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = traceValue(item, depth + 1);
      }
    }
    return result;
  }
  return String(value);
}

function compileWorkflow(workflowId, workflows, handlers = {}, options = {}) {
  const maxDepth = options.maxDepth || 8;
  const maxSteps = options.maxSteps || 500;
  const maxLoopIterations = options.maxLoopIterations || 50;
  const reportTrace = (entry) => {
    if (typeof options.onTrace !== 'function') return;
    try { options.onTrace(entry); } catch (_) { /* progress reporting must not fail execution */ }
  };
  const validation = validateWorkflowCollection(workflows, { maxDepth });
  if (!validation.valid) throw new Error(validation.errors.join('；'));
  const { workflowMap } = buildDependencyGraph(workflows);

  function compile(id, path = [], execution = { steps: 0, trace: [] }) {
    if (path.includes(id)) throw new Error(`子工作流循环引用：${path.concat(id).join(' → ')}`);
    const workflow = workflowMap.get(id);
    if (!workflow) throw new Error(`工作流不存在：${id}`);
    if (path.length >= maxDepth) throw new Error(`子工作流嵌套超过 ${maxDepth} 层`);

    topologicalOrder(workflow);
    const graph = new StateGraph(RuntimeState);
    const executableNodes = workflow.nodes.filter((node) => node.type !== 'start');
    const executableIds = new Set(executableNodes.map((node) => node.id));
    const startIds = new Set(workflow.nodes.filter((node) => node.type === 'start').map((node) => node.id));
    const outputIds = new Set(workflow.nodes.filter((node) => node.type === 'output').map((node) => node.id));
    const activation = analyzeGraphActivation(workflow);
    const directPredecessors = new Map(workflow.nodes.map((node) => [node.id, workflow.edges
      .filter((edge) => edge.target === node.id && executableIds.has(edge.source))
      .map((edge) => edge.source)]));

    for (const node of executableNodes) {
      graph.addNode(node.id, async (state) => {
        if (typeof options.shouldCancel === 'function' && options.shouldCancel()) {
          const error = new Error('Workflow run cancelled');
          error.code = 'WORKFLOW_RUN_CANCELLED';
          throw error;
        }
        execution.steps += 1;
        if (execution.steps > maxSteps) throw new Error(`工作流执行步数超过上限 ${maxSteps}，请检查嵌套与循环配置`);
        const startedAt = Date.now();
        const startedAtIso = new Date(startedAt).toISOString();
        const nodeInput = resolveNodeInput(node, state, undefined, directPredecessors.get(node.id) || []);
        const hasExplicitMappings = Array.isArray(node.data && node.data.inputMappings)
          && node.data.inputMappings.length > 0;
        const handlerState = {
          ...state,
          nodeInput,
          variableMode: workflowVariableMode(workflow),
          explicitInputs: hasExplicitMappings && nodeInput && typeof nodeInput === 'object' && !Array.isArray(nodeInput)
            ? nodeInput
            : {}
        };
        handlerState.context = runtimeContext(handlerState);
        let result;
        let childTrace = [];
        try {
          if (node.type === 'output') {
            // Compose against this node's handler state rather than the
            // incoming graph state.  `explicitInputs` is intentionally scoped
            // per node; using the incoming state here could expose the
            // previous node's mapping through an output template such as
            // `{{inputs.foo}}` even though the output node declared no mapping.
            const composed = composeOutput(node, handlerState);
            result = composed.value;
            handlerState.outputComposition = composed.composition;
          } else if (node.type === 'subworkflow') {
            const childGraph = compile(node.data.workflowId, path.concat(id), execution);
            // `nodeInput` already applies explicit mappings or the default
            // previous-output contract. Do not fall back to the root input for
            // primitive/array upstream values, otherwise nesting silently
            // drops the value the parent node just produced.
            const childInput = nodeInput;
            const childResult = await childGraph.invoke({ input: childInput, values: state.values });
            childTrace = childResult.trace || [];
            result = childResult.output !== undefined ? childResult.output : childResult.values;
          } else if (node.type === 'loop') {
            const childGraph = compile(node.data.workflowId, path.concat(id), execution);
            const collection = resolveCollection(node, state);
            if (!Array.isArray(collection)) throw new Error(`[${workflow.name}] 循环节点 ${node.data.label || node.id} 的集合路径 ${node.data.collectionPath} 不是数组`);
            const nodeLimit = Number.parseInt(node.data.maxIterations, 10) || 20;
            const iterationLimit = Math.min(maxLoopIterations, nodeLimit);
            if (collection.length > iterationLimit) throw new Error(`[${workflow.name}] 循环节点 ${node.data.label || node.id} 收到 ${collection.length} 项，超过上限 ${iterationLimit}`);
            const outputs = [];
            for (let index = 0; index < collection.length; index += 1) {
              const loop = { item: collection[index], index, previousOutputs: outputs.slice() };
              let childInput;
              if (Array.isArray(node.data.inputMappings) && node.data.inputMappings.length) {
                childInput = applyMappings(node.data.inputMappings, runtimeContext(state, loop));
              } else {
                childInput = {
                  ...(state.input || {}),
                  [node.data.itemVariable || 'item']: collection[index],
                  loopIndex: index,
                  previousOutputs: outputs.slice(),
                  __loop: loop
                };
              }
              const childResult = await childGraph.invoke({ input: childInput, values: state.values });
              childTrace.push(...(childResult.trace || []));
              outputs.push(childResult.output !== undefined ? childResult.output : childResult.values);
            }
            result = outputs;
          } else if (handlers[node.type]) {
            result = await handlers[node.type]({ node, state: handlerState, workflow });
          } else {
            result = state.output;
          }

          // Output nodes compose their value (including field projection and
          // template rendering) in composeOutput. Applying the generic node
          // projection a second time would project the already-composed value.
          if (node.type !== 'output') result = projectOutput(node, result, state.output);
          const finishedAt = Date.now();
          const traceEntry = {
            workflowId: id,
            nodeId: node.id,
            type: node.type,
            status: 'completed',
            startedAt: startedAtIso,
            finishedAt: new Date(finishedAt).toISOString(),
            durationMs: finishedAt - startedAt,
            input: traceValue(nodeInput),
            output: traceValue(result)
          };
          if (handlerState.traceMeta) {
            if (node.type === 'plugin') traceEntry.plugin = traceValue(handlerState.traceMeta);
            else traceEntry.prompt = traceValue(handlerState.traceMeta);
          }
          if (handlerState.outputComposition) {
            traceEntry.outputComposition = traceValue(handlerState.outputComposition);
            traceEntry.composition = traceEntry.outputComposition;
          }
          execution.trace.push(traceEntry);
          reportTrace(traceEntry);
          return {
            values: { [node.id]: result },
            output: result,
            trace: childTrace.concat(traceEntry)
          };
        } catch (error) {
          const finishedAt = Date.now();
          const traceEntry = {
            workflowId: id,
            nodeId: node.id,
            type: node.type,
            status: 'failed',
            startedAt: startedAtIso,
            finishedAt: new Date(finishedAt).toISOString(),
            durationMs: finishedAt - startedAt,
            input: traceValue(nodeInput),
            error: traceErrorMessage(error)
          };
          if (handlerState.traceMeta) {
            if (node.type === 'plugin') traceEntry.plugin = traceValue(handlerState.traceMeta);
            else traceEntry.prompt = traceValue(handlerState.traceMeta);
          }
          if (handlerState.outputComposition) {
            traceEntry.outputComposition = traceValue(handlerState.outputComposition);
            traceEntry.composition = traceEntry.outputComposition;
          }
          execution.trace.push(traceEntry);
          reportTrace(traceEntry);
          error.workflowTrace = execution.trace.slice();
          throw error;
        }
      });
    }

    if (!executableNodes.length) {
      graph.addNode('__passthrough', async (state) => ({ output: state.input, values: state.values }));
      graph.addEdge(START, '__passthrough');
      graph.addEdge('__passthrough', END);
    } else {
      const conditionIds = new Set(executableNodes.filter((node) => node.type === 'condition').map((node) => node.id));
      for (const edge of workflow.edges) {
        if (startIds.has(edge.source) && executableIds.has(edge.target)) graph.addEdge(START, edge.target);
      }

      for (const node of executableNodes) {
        const incoming = (activation.incomingEdges.get(node.id) || [])
          .filter((edge) => executableIds.has(edge.source) && !conditionIds.has(edge.source));
        if (incoming.length > 1 && activation.joinModes.get(node.id) === 'parallel') {
          graph.addEdge(incoming.map((edge) => edge.source), node.id);
        } else {
          for (const edge of incoming) graph.addEdge(edge.source, node.id);
        }
      }

      for (const outputId of outputIds) graph.addEdge(outputId, END);

      for (const conditionId of conditionIds) {
        const outgoing = workflow.edges.filter((edge) => edge.source === conditionId);
        const pathMap = Object.fromEntries(outgoing.map((edge) => [
          String(edge.sourceHandle || edge.label || edge.target),
          edge.target
        ]));
        graph.addConditionalEdges(conditionId, (state) => {
          const value = state.values[conditionId];
          return String(value && value.route !== undefined ? value.route : value);
        }, pathMap);
      }

      const hasStartEdge = workflow.edges.some((edge) => startIds.has(edge.source) && executableIds.has(edge.target));
      const hasEndEdge = workflow.edges.some((edge) => outputIds.has(edge.target)
        && (startIds.has(edge.source) || executableIds.has(edge.source)));
      if (!hasStartEdge) throw new Error(`[${workflow.name}] 开始节点未连接到可执行节点`);
      if (!hasEndEdge) throw new Error(`[${workflow.name}] 没有可执行节点连接到输出节点`);
    }

    return graph.compile();
  }

  if (!workflowMap.get(workflowId)) throw new Error(`工作流不存在：${workflowId}`);
  return {
    async invoke(input) {
      const execution = { steps: 0, trace: [] };
      try {
        const result = await compile(workflowId, [], execution).invoke(input);
        return { ...result, trace: execution.trace.length ? execution.trace : (result.trace || []) };
      } catch (error) {
        error.workflowTrace = execution.trace.slice();
        throw error;
      }
    }
  };
}

module.exports = {
  applyMappings,
  compileWorkflow,
  composeOutput,
  getByPath,
  projectOutput,
  renderOutputTemplate,
  resolveOutputSourcePath,
  runtimeContext,
  topologicalOrder,
  traceValue
};
