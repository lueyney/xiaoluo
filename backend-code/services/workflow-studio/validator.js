const { validateWorkflowShape } = require('./schema');

function clauseKey(clause) {
  return Object.entries(clause || {}).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`).join('&');
}

function dedupeClauses(clauses) {
  const result = new Map();
  for (const clause of clauses || []) result.set(clauseKey(clause), clause);
  return Array.from(result.values());
}

function clausesConflict(left, right) {
  return Object.keys(left || {}).some((key) => Object.prototype.hasOwnProperty.call(right || {}, key)
    && String(left[key]) !== String(right[key]));
}

function clauseSetsEquivalent(left, right) {
  const leftKeys = dedupeClauses(left).map(clauseKey).sort();
  const rightKeys = dedupeClauses(right).map(clauseKey).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]);
}

function clauseSetsMutuallyExclusive(left, right) {
  return left.length > 0 && right.length > 0
    && left.every((leftClause) => right.every((rightClause) => clausesConflict(leftClause, rightClause)));
}

// Determine whether a multi-input node is an unconditional parallel join,
// an exclusive conditional convergence, or an unsafe mixture of both.  The
// compiler uses the same analysis to select LangGraph's waiting-edge barrier.
function analyzeGraphActivation(workflow) {
  const nodeMap = new Map(workflow.nodes.map((node) => [node.id, node]));
  const outgoingEdges = new Map(workflow.nodes.map((node) => [node.id, []]));
  const incomingEdges = new Map(workflow.nodes.map((node) => [node.id, []]));
  const indegree = new Map(workflow.nodes.map((node) => [node.id, 0]));
  for (const edge of workflow.edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    outgoingEdges.get(edge.source).push(edge);
    incomingEdges.get(edge.target).push(edge);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  }

  const activationClauses = new Map(workflow.nodes.map((node) => [node.id, node.type === 'start' ? [{}] : []]));
  const edgeClauses = new Map();
  const queue = workflow.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    visited += 1;
    const node = nodeMap.get(id);
    const sourceClauses = activationClauses.get(id) || [];
    for (const edge of outgoingEdges.get(id) || []) {
      let transmitted = sourceClauses;
      if (node.type === 'condition') {
        const route = String(edge.sourceHandle || edge.label || edge.target).trim();
        transmitted = sourceClauses.map((clause) => ({ ...clause, [id]: route }));
      }
      transmitted = dedupeClauses(transmitted);
      edgeClauses.set(edge.id || edge, transmitted);
      activationClauses.set(edge.target, dedupeClauses((activationClauses.get(edge.target) || []).concat(transmitted)));
      indegree.set(edge.target, indegree.get(edge.target) - 1);
      if (indegree.get(edge.target) === 0) queue.push(edge.target);
    }
  }

  const joinModes = new Map();
  for (const node of workflow.nodes) {
    const incoming = incomingEdges.get(node.id) || [];
    if (incoming.length < 2) {
      joinModes.set(node.id, incoming.length ? 'single' : 'root');
      continue;
    }
    const sets = incoming.map((edge) => edgeClauses.get(edge.id || edge) || []);
    const parallel = sets.every((set) => clauseSetsEquivalent(set, sets[0]));
    const exclusive = sets.every((set, index) => sets.slice(index + 1)
      .every((other) => clauseSetsMutuallyExclusive(set, other)));
    joinModes.set(node.id, parallel ? 'parallel' : exclusive ? 'exclusive' : 'mixed');
  }

  return {
    acyclic: visited === nodeMap.size,
    activationClauses,
    edgeClauses,
    incomingEdges,
    joinModes,
    nodeMap,
    outgoingEdges
  };
}

function validateInternalGraph(workflow) {
  const errors = [];
  const nodeMap = new Map(workflow.nodes.map((node) => [node.id, node]));
  const outgoing = new Map(workflow.nodes.map((node) => [node.id, []]));
  const incoming = new Map(workflow.nodes.map((node) => [node.id, []]));
  for (const edge of workflow.edges) {
    if (outgoing.has(edge.source) && incoming.has(edge.target)) {
      outgoing.get(edge.source).push(edge.target);
      incoming.get(edge.target).push(edge.source);
    }
  }

  const start = workflow.nodes.find((node) => node.type === 'start');
  const outputs = workflow.nodes.filter((node) => node.type === 'output');
  if (!start || !outputs.length) return errors;

  const activation = analyzeGraphActivation(workflow);

  if ((incoming.get(start.id) || []).length) errors.push('开始节点不能有输入连线');
  if (!(outgoing.get(start.id) || []).length) errors.push('开始节点至少需要连接一个后续节点');
  for (const output of outputs) {
    if ((outgoing.get(output.id) || []).length) errors.push(`输出节点 ${output.data.label || output.id} 不能再连接后续节点`);
    const producers = incoming.get(output.id) || [];
    if (!producers.length) errors.push(`输出节点 ${output.data.label || output.id} 缺少输入连线`);
  }
  for (const node of workflow.nodes) {
    const incomingSources = incoming.get(node.id) || [];
    if (node.type !== 'start' && !incomingSources.length) errors.push(`节点 ${node.data.label || node.id} 缺少输入连线`);
    if (node.type !== 'output' && !(outgoing.get(node.id) || []).length) errors.push(`节点 ${node.data.label || node.id} 缺少输出连线`);
    if (incomingSources.length > 1 && incomingSources.includes(start.id)) {
      errors.push(`节点 ${node.data.label || node.id} 不能同时接收开始直连和其他节点输入`);
    }
    if (incomingSources.length > 1 && activation.acyclic) {
      const joinMode = activation.joinModes.get(node.id);
      if (joinMode === 'mixed') {
        errors.push(`节点 ${node.data.label || node.id} 混合了并行与条件路径，无法确定需要等待哪些分支；请先分别合流`);
      } else if (joinMode === 'parallel') {
        if (node.type === 'output') {
          const configuredPath = String(node.data.sourcePath === '__custom__' ? node.data.customSourcePath : node.data.sourcePath || '').trim();
          const hasDeterministicComposition = Boolean(String(node.data.template || '').trim())
            || /^(?:values|node)\./.test(configuredPath);
          if (!hasDeterministicComposition) {
            errors.push(`输出节点 ${node.data.label || node.id} 汇合并行分支时，必须用模板或 values.节点 路径明确结果`);
          }
        } else {
          const mappings = Array.isArray(node.data.inputMappings) ? node.data.inputMappings : [];
          if (!mappings.length) {
            errors.push(`节点 ${node.data.label || node.id} 汇合并行分支时必须配置输入映射`);
          } else {
            for (const sourceId of incomingSources) {
              const mapped = mappings.some((mapping) => {
                const source = String(mapping && mapping.source || '').trim();
                return source === `values.${sourceId}` || source.startsWith(`values.${sourceId}.`)
                  || source === `node.${sourceId}` || source.startsWith(`node.${sourceId}.`);
              });
              if (!mapped) errors.push(`节点 ${node.data.label || node.id} 的输入映射缺少并行分支 ${nodeMap.get(sourceId)?.data?.label || sourceId}`);
            }
          }
        }
      }
    }
    if (node.type === 'condition') {
      const routes = outgoing.get(node.id) || [];
      const routeEdges = workflow.edges.filter((edge) => edge.source === node.id);
      const declaredRoutes = Array.isArray(node.data.routes) && node.data.routes.length
        ? node.data.routes.map((route) => String(route.key || '').trim())
        : [String(node.data.truthyRoute || 'true'), String(node.data.falsyRoute || 'false')];
      // A condition has two logical routes, but either route may fan out to
      // several downstream nodes.  This is how a selector can start a
      // parallel literature lookup and a drafting branch at the same time.
      if (routes.length < 2) errors.push(`条件节点 ${node.data.label || node.id} 至少需要连接两个分支`);
      if (routeEdges.some((edge) => !String(edge.sourceHandle || edge.label || '').trim())) errors.push(`条件节点 ${node.data.label || node.id} 的每条分支连线都需要分支键`);
      const routeKeys = routeEdges.map((edge) => String(edge.sourceHandle || edge.label || '').trim()).filter(Boolean);
      if (routeKeys.some((key) => !declaredRoutes.includes(key))) errors.push(`条件节点 ${node.data.label || node.id} 使用了未声明的分支键`);
      if (declaredRoutes.length < 2 || declaredRoutes.some((key) => !key) || new Set(declaredRoutes).size !== declaredRoutes.length) {
        errors.push(`条件节点 ${node.data.label || node.id} 必须声明两个不重复的分支键`);
      }
      for (const key of declaredRoutes) {
        if (routeKeys.filter((routeKey) => routeKey === key).length < 1) errors.push(`条件节点 ${node.data.label || node.id} 的分支 ${key} 至少需要连接一次`);
      }
    }
  }

  const reachable = new Set();
  const stack = [start.id];
  while (stack.length) {
    const id = stack.pop();
    if (reachable.has(id)) continue;
    reachable.add(id);
    stack.push(...(outgoing.get(id) || []));
  }
  for (const node of workflow.nodes) {
    if (!reachable.has(node.id)) errors.push(`节点 ${node.data.label || node.id} 无法从开始节点到达`);
  }

  const canReachOutput = new Set(outputs.map((node) => node.id));
  const reverseStack = outputs.map((node) => node.id);
  while (reverseStack.length) {
    const id = reverseStack.pop();
    for (const source of incoming.get(id) || []) {
      if (!canReachOutput.has(source)) { canReachOutput.add(source); reverseStack.push(source); }
    }
  }
  for (const node of workflow.nodes) {
    if (!canReachOutput.has(node.id)) errors.push(`节点 ${node.data.label || node.id} 无法到达输出节点`);
  }

  const indegree = new Map(workflow.nodes.map((node) => [node.id, incoming.get(node.id).length]));
  const queue = workflow.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift(); visited += 1;
    for (const target of outgoing.get(id) || []) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  if (visited !== nodeMap.size) errors.push('节点连线存在循环；请使用循环节点调用子工作流，不要用回连表达循环');
  return errors;
}

function buildDependencyGraph(workflows) {
  const workflowMap = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const dependencies = new Map();
  for (const workflow of workflows) {
    const children = workflow.nodes
      .filter((node) => node.type === 'subworkflow' || node.type === 'loop')
      .map((node) => String(node.data.workflowId || '').trim())
      .filter(Boolean);
    dependencies.set(workflow.id, children);
  }
  return { workflowMap, dependencies };
}

function findWorkflowCycles(workflows) {
  const { dependencies } = buildDependencyGraph(workflows);
  const visited = new Set();
  const active = new Set();
  const stack = [];
  const cycles = [];

  function visit(workflowId) {
    if (active.has(workflowId)) {
      const index = stack.indexOf(workflowId);
      cycles.push(stack.slice(index).concat(workflowId));
      return;
    }
    if (visited.has(workflowId)) return;
    visited.add(workflowId);
    active.add(workflowId);
    stack.push(workflowId);
    for (const childId of dependencies.get(workflowId) || []) visit(childId);
    stack.pop();
    active.delete(workflowId);
  }

  for (const workflowId of dependencies.keys()) visit(workflowId);
  return cycles;
}

function validateWorkflowCollection(workflows, { maxDepth = 8, allowIncomplete = false } = {}) {
  const errors = [];
  const warnings = [];
  const { workflowMap, dependencies } = buildDependencyGraph(workflows);

  for (const workflow of workflows) {
    for (const error of validateWorkflowShape(workflow, { allowIncomplete })) errors.push(`[${workflow.name || workflow.id}] ${error}`);
    // A draft may intentionally contain disconnected or half-configured
    // nodes while it is being composed. Execution and publishing still use
    // the strict graph validator (the default allowIncomplete=false).
    if (!allowIncomplete) {
      for (const error of validateInternalGraph(workflow)) errors.push(`[${workflow.name || workflow.id}] ${error}`);
    }
    for (const childId of dependencies.get(workflow.id) || []) {
      if (!workflowMap.has(childId)) errors.push(`[${workflow.name}] 引用了不存在的子工作流：${childId}`);
      if (childId === workflow.id) errors.push(`[${workflow.name}] 不允许引用自身`);
    }
  }

  const cycles = findWorkflowCycles(workflows);
  for (const cycle of cycles) errors.push(`子工作流存在循环引用：${cycle.join(' → ')}`);

  function measureDepth(workflowId, path = []) {
    if (path.includes(workflowId)) return Number.POSITIVE_INFINITY;
    const children = dependencies.get(workflowId) || [];
    if (!children.length) return 1;
    return 1 + Math.max(...children.map((childId) => workflowMap.has(childId) ? measureDepth(childId, path.concat(workflowId)) : 0));
  }

  for (const workflow of workflows) {
    const depth = measureDepth(workflow.id);
    if (Number.isFinite(depth) && depth > maxDepth) errors.push(`[${workflow.name}] 子工作流嵌套深度 ${depth} 超过上限 ${maxDepth}`);
    else if (depth >= 5) warnings.push(`[${workflow.name}] 嵌套深度为 ${depth}，建议拆分以便调试`);
  }

  return { valid: errors.length === 0, errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)), cycles };
}

function expandWorkflow(workflowId, workflows, { maxDepth = 8 } = {}) {
  const validation = validateWorkflowCollection(workflows, { maxDepth });
  if (!validation.valid) {
    const error = new Error(validation.errors.join('；'));
    error.code = 'WORKFLOW_VALIDATION_FAILED';
    error.details = validation;
    throw error;
  }

  const workflowMap = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const root = workflowMap.get(workflowId);
  if (!root) throw new Error(`工作流不存在：${workflowId}`);

  function expand(workflow, depth, path) {
    if (depth > maxDepth) throw new Error(`子工作流嵌套超过 ${maxDepth} 层`);
    if (path.includes(workflow.id)) throw new Error(`子工作流循环引用：${path.concat(workflow.id).join(' → ')}`);
    const nextPath = path.concat(workflow.id);
    return {
      id: workflow.id,
      name: workflow.name,
      version: workflow.version,
      nodes: workflow.nodes.map((node) => node.type === 'subworkflow' || node.type === 'loop'
        ? {
            ...node,
            expandedWorkflow: expand(workflowMap.get(node.data.workflowId), depth + 1, nextPath)
          }
        : { ...node }),
      edges: workflow.edges.map((edge) => ({ ...edge }))
    };
  }

  return expand(root, 1, []);
}

function validateWorkflowDraftCollection(workflows, options = {}) {
  return validateWorkflowCollection(workflows, { ...options, allowIncomplete: true });
}

module.exports = { analyzeGraphActivation, buildDependencyGraph, expandWorkflow, findWorkflowCycles, validateInternalGraph, validateWorkflowCollection, validateWorkflowDraftCollection };
