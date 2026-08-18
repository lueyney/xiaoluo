const assert = require('assert');
const { createDefaultWorkflows, MAIN_WORKFLOW_ID } = require('../services/workflow-studio/defaults');
const { compileWorkflow } = require('../services/workflow-studio/compiler');
const { validateWorkflowShape } = require('../services/workflow-studio/schema');
const { expandWorkflow, validateWorkflowCollection } = require('../services/workflow-studio/validator');
const { createWorkflowHandlers, runPublishedWritingWorkflow } = require('../services/writing-workflow/visual-runtime');
const { buildPublishedCollectionFor } = require('../services/workflow-studio/store');
const workflowStore = require('../services/workflow-studio/store');
const workflowRunJobs = require('../services/workflow-studio/run-jobs');

async function main() {
  const originalStoreMethods = {
    listPublishedWorkflows: workflowStore.listPublishedWorkflows,
    getActiveWorkflowId: workflowStore.getActiveWorkflowId
  };
  const workflows = createDefaultWorkflows();
  const validation = validateWorkflowCollection(workflows);
  assert.strictEqual(validation.valid, true, validation.errors.join('\n'));

  const variableWorkflow = JSON.parse(JSON.stringify(workflows[0]));
  variableWorkflow.nodes.find((node) => node.type === 'start').data.variables = [
    { name: 'BOT_USER_INPUT', type: 'string', required: true },
    { name: 'title', type: 'string', required: false, defaultValue: '默认题目' }
  ];
  assert.deepStrictEqual(validateWorkflowShape(variableWorkflow), []);
  variableWorkflow.nodes.find((node) => node.type === 'start').data.variables.push(
    { name: 'Title', type: 'unsupported' },
    { name: 'invalid-name', type: 'string' }
  );
  const variableErrors = validateWorkflowShape(variableWorkflow);
  assert.ok(variableErrors.some((error) => error.includes('变量名 Title 重复')));
  assert.ok(variableErrors.some((error) => error.includes('类型不受支持')));
  assert.ok(variableErrors.some((error) => error.includes('变量名 invalid-name 不合法')));

  const genericHandlers = createWorkflowHandlers({ provider: {}, config: {} });
  const composedText = await genericHandlers.transform({
    node: {
      id: 'compose-document',
      data: {
        label: '通用文本汇总',
        operation: 'composeText',
        sectionOrder: ['heading', 'body', 'closing'],
        fixedInputs: { heading: '标题', closing: '结尾' },
        requiredInputs: ['body'],
        separator: '\n---\n',
        outputKey: 'document',
        cleanupPreset: 'none'
      }
    },
    state: { nodeInput: { body: '正文' } },
    workflow: { name: '普通内容工作流' }
  });
  assert.deepStrictEqual(composedText, { document: '标题\n---\n正文\n---\n结尾' });

  await assert.rejects(() => genericHandlers.transform({
    node: {
      id: 'compose-required-inputs',
      data: {
        label: '汇总节点',
        operation: 'composeText',
        inputMappings: [{ target: 'intro', source: 'values.intro' }, { target: 'body', source: 'values.body' }],
        sectionOrder: ['intro', 'body'],
        requireAllMappedInputs: true,
        sectionLabels: { intro: '简介', body: '正文' }
      }
    },
    state: { nodeInput: { intro: '简介内容' } },
    workflow: { name: '普通内容工作流' }
  }), /节点 汇总节点 缺少必填输入：正文/);

  const invalidComposition = {
    id: 'invalid-composition', name: '无效文本组合', status: 'draft', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: '开始' } },
      { id: 'compose', type: 'transform', position: { x: 200, y: 0 }, data: {
        label: '拼接', operation: 'composeText',
        inputMappings: [{ target: 'body', source: 'input.body' }],
        fixedInputs: { heading: '标题' }, sectionOrder: ['body', 'missing']
      } },
      { id: 'finish', type: 'output', position: { x: 400, y: 0 }, data: { label: '完成' } }
    ], edges: [
      { id: 'ic-1', source: 'start', target: 'compose' },
      { id: 'ic-2', source: 'compose', target: 'finish' }
    ]
  };
  const invalidCompositionErrors = validateWorkflowShape(invalidComposition);
  assert.ok(invalidCompositionErrors.some((error) => error.includes('拼接顺序引用了未配置输入：missing')));
  assert.ok(invalidCompositionErrors.some((error) => error.includes('拼接顺序遗漏了输入：heading')));
  const collisionComposition = JSON.parse(JSON.stringify(invalidComposition));
  collisionComposition.id = 'collision-composition';
  collisionComposition.nodes.find((node) => node.id === 'compose').data.fixedInputs = { body: '固定正文', heading: '标题' };
  collisionComposition.nodes.find((node) => node.id === 'compose').data.sectionOrder = ['body', 'heading'];
  const collisionErrors = validateWorkflowShape(collisionComposition);
  assert.ok(collisionErrors.some((error) => error.includes('固定内容与映射输入不能同名：body')));

  const reusableCompositionFlow = {
    id: 'reusable-composition-flow', name: '通用并行文本组合', status: 'published', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: '开始' } },
      { id: 'background', type: 'transform', position: { x: 180, y: -80 }, data: { label: '背景', operation: 'set', targetKey: 'content', value: '背景' } },
      { id: 'meaning', type: 'transform', position: { x: 180, y: 80 }, data: { label: '意义', operation: 'set', targetKey: 'content', value: '意义' } },
      { id: 'compose', type: 'transform', position: { x: 380, y: 0 }, data: {
        label: '统一汇总', operation: 'composeText', outputKey: 'document', separator: '\n', requireAllMappedInputs: true,
        inputMappings: [
          { target: 'background', source: 'values.background.content' },
          { target: 'meaning', source: 'values.meaning.content' }
        ],
        sectionOrder: ['background', 'meaning']
      } },
      { id: 'finish', type: 'output', position: { x: 580, y: 0 }, data: { label: '完成' } }
    ], edges: [
      { id: 'rc-1', source: 'start', target: 'background' },
      { id: 'rc-2', source: 'start', target: 'meaning' },
      { id: 'rc-3', source: 'background', target: 'compose' },
      { id: 'rc-4', source: 'meaning', target: 'compose' },
      { id: 'rc-5', source: 'compose', target: 'finish' }
    ]
  };
  const reusableCompositionResult = await compileWorkflow('reusable-composition-flow', [reusableCompositionFlow], genericHandlers).invoke({ input: {} });
  assert.deepStrictEqual(reusableCompositionResult.output, { document: '背景\n意义' });

  const importedStudio = require('../data/workflow-studio.json');
  const importedPaper = importedStudio.workflows.find((workflow) => workflow.id === 'coze-paper01-with-literature');
  assert.ok(importedPaper, '缺少已导入的 Coze paper01 工作流');
  assert.strictEqual(importedPaper.nodes.length, 25);
  assert.strictEqual(importedPaper.edges.length, 35);

  const importedAssembly = importedPaper.nodes.find((node) => node.id === '178038');
  const importedOutput = importedPaper.nodes.find((node) => node.id === '900001');
  assert.strictEqual(importedAssembly.data.operation, 'composeText');
  assert.strictEqual(importedAssembly.data.inputMappings.length, 22);
  assert.strictEqual(importedAssembly.data.requiredInputs.length, 22);
  assert.strictEqual(importedAssembly.data.fixedInputs.researchStatusHeading, '1.3 研究现状');
  assert.strictEqual(importedAssembly.data.fixedInputs.acknowledgementsHeading, '致谢');
  assert.deepStrictEqual(importedOutput.data.inputMappings, [{ target: 'output', source: 'values.178038.key0' }]);

  const sentinelInput = Object.fromEntries(importedAssembly.data.requiredInputs.map((key, index) => [
    key,
    `SECTION_${String(index + 1).padStart(2, '0')}_${key}`
  ]));
  const sentinelPaper = await genericHandlers.transform({
    node: importedAssembly,
    state: { nodeInput: sentinelInput },
    workflow: importedPaper
  });
  let previousIndex = -1;
  for (const key of importedAssembly.data.sectionOrder) {
    if (!Object.hasOwn(sentinelInput, key)) continue;
    const marker = sentinelInput[key];
    const markerIndex = sentinelPaper.key0.indexOf(marker);
    assert.ok(markerIndex >= 0, `汇总结果缺少 ${key}`);
    assert.ok(markerIndex > previousIndex, `汇总结果中的 ${key} 顺序不正确`);
    previousIndex = markerIndex;
  }

  const expanded = expandWorkflow(MAIN_WORKFLOW_ID, workflows);
  assert.strictEqual(expanded.id, MAIN_WORKFLOW_ID);
  assert.strictEqual(expanded.nodes.filter((node) => node.type === 'llm').length, 1);

  const graph = compileWorkflow(MAIN_WORKFLOW_ID, workflows, {
    llm: async () => '通用论文工作流结果'
  });

  const result = await graph.invoke({ input: { topic: '独立工作流测试' } });
  assert.ok(result.trace.some((item) => item.workflowId === MAIN_WORKFLOW_ID));
  assert.strictEqual(result.output, '通用论文工作流结果');

  const cyclicChild = { ...JSON.parse(JSON.stringify(workflows[0])), id: 'cyclic-child', name: '循环子流程' };
  cyclicChild.nodes.splice(1, 0, { id: 'recursive', type: 'subworkflow', position: { x: 300, y: 320 }, data: { label: '错误递归', workflowId: MAIN_WORKFLOW_ID } });
  cyclicChild.edges = [
    { id: 'cc-1', source: 'start', target: 'recursive' },
    { id: 'cc-2', source: 'recursive', target: 'finish' }
  ];
  const cyclicRoot = JSON.parse(JSON.stringify(workflows[0]));
  cyclicRoot.nodes.splice(1, 0, { id: 'child', type: 'subworkflow', position: { x: 300, y: 80 }, data: { label: '子流程', workflowId: 'cyclic-child' } });
  cyclicRoot.edges = [
    { id: 'cr-1', source: 'start', target: 'child' },
    { id: 'cr-2', source: 'child', target: 'finish' }
  ];
  const cyclic = [cyclicRoot, cyclicChild];
  const bad = validateWorkflowCollection(cyclic);
  assert.strictEqual(bad.valid, false);
  assert.ok(bad.errors.some((error) => error.includes('循环引用')));

  const ambiguous = createDefaultWorkflows();
  ambiguous[0].edges.push({ id: 'e-start-finish-direct', source: 'start', target: 'finish' });
  const ambiguousValidation = validateWorkflowCollection(ambiguous);
  assert.strictEqual(ambiguousValidation.valid, false);
  assert.ok(ambiguousValidation.errors.some((error) => error.includes('开始直连')));

  workflowStore.listPublishedWorkflows = async () => workflows;
  workflowStore.getActiveWorkflowId = async () => MAIN_WORKFLOW_ID;
  const runtime = await runPublishedWritingWorkflow({
    topic: '通用运行测试', field: '教育学', docType: '开题报告', description: '开题报告',
    requirements: '约1800字', defaultTargetWords: 1800, traceId: 'nested-runtime'
  }, {
    config: { maxSections: 9, minTargetWords: 800, maxTargetWords: 12000 },
    provider: {
      async chat() { return { content: '# 通用运行测试\n\n模拟正文' }; }
    }
  });
  assert.ok(runtime.content.includes('模拟正文'));
  assert.strictEqual(runtime.steps.filter((step) => step.name === `${MAIN_WORKFLOW_ID}:write`).length, 1);
  workflowStore.listPublishedWorkflows = originalStoreMethods.listPublishedWorkflows;
  workflowStore.getActiveWorkflowId = originalStoreMethods.getActiveWorkflowId;

  const missingPublishedChild = createDefaultWorkflows();
  missingPublishedChild[0].nodes.splice(1, 0, { id: 'missing-child', type: 'subworkflow', position: { x: 300, y: 300 }, data: { label: '缺失子流程', workflowId: 'not-published-child' } });
  missingPublishedChild[0].edges = [
    { id: 'mpc-1', source: 'start', target: 'missing-child' },
    { id: 'mpc-2', source: 'missing-child', target: 'finish' }
  ];
  const publishCandidate = buildPublishedCollectionFor(missingPublishedChild, 0);
  const publishValidation = validateWorkflowCollection(publishCandidate);
  assert.strictEqual(publishValidation.valid, false);
  assert.ok(publishValidation.errors.some((error) => error.includes('不存在的子工作流')));

  const primitiveChild = {
    id: 'primitive-child', name: '原始值子流程', status: 'published', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: '开始' } },
      { id: 'echo', type: 'transform', position: { x: 200, y: 0 }, data: { label: '读取映射' } },
      { id: 'finish', type: 'output', position: { x: 400, y: 0 }, data: { label: '完成' } }
    ], edges: [
      { id: 'pc-1', source: 'start', target: 'echo' },
      { id: 'pc-2', source: 'echo', target: 'finish' }
    ]
  };
  const mappingParent = {
    id: 'mapping-parent', name: '显式映射父流程', status: 'published', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: '开始' } },
      { id: 'source', type: 'transform', position: { x: 180, y: 0 }, data: { label: '原始值' } },
      { id: 'child', type: 'subworkflow', position: { x: 360, y: 0 }, data: { label: '子流程', workflowId: 'primitive-child', inputMappings: [{ target: 'number', source: 'output' }], outputPath: 'received' } },
      { id: 'finish', type: 'output', position: { x: 540, y: 0 }, data: { label: '完成' } }
    ], edges: [
      { id: 'mp-1', source: 'start', target: 'source' },
      { id: 'mp-2', source: 'source', target: 'child' },
      { id: 'mp-3', source: 'child', target: 'finish' }
    ]
  };
  const mappingGraph = compileWorkflow('mapping-parent', [mappingParent, primitiveChild], {
    transform: async ({ node, state }) => node.id === 'source' ? 7 : { received: state.nodeInput.number }
  });
  const mappingResult = await mappingGraph.invoke({ input: { untouched: true } });
  assert.strictEqual(mappingResult.output, 7);

  const defaultPreviousFlow = {
    id: 'default-previous-flow', name: 'default previous output', status: 'published', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'start' } },
      { id: 'source', type: 'transform', position: { x: 180, y: 0 }, data: { label: 'array source' } },
      { id: 'consume', type: 'transform', position: { x: 360, y: 0 }, data: { label: 'consume previous' } },
      { id: 'finish', type: 'output', position: { x: 540, y: 0 }, data: { label: 'finish' } }
    ], edges: [
      { id: 'dp-1', source: 'start', target: 'source' },
      { id: 'dp-2', source: 'source', target: 'consume' },
      { id: 'dp-3', source: 'consume', target: 'finish' }
    ]
  };
  const defaultPreviousGraph = compileWorkflow('default-previous-flow', [defaultPreviousFlow], {
    transform: async ({ node, state }) => node.id === 'source' ? [3, 5, 8] : state.nodeInput.value
  });
  assert.deepStrictEqual((await defaultPreviousGraph.invoke({ input: { topic: 'keep me' } })).output, [3, 5, 8]);

  const primitiveChildDefaultParent = {
    id: 'primitive-child-default-parent', name: 'child default input', status: 'published', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'start' } },
      { id: 'source', type: 'transform', position: { x: 180, y: 0 }, data: { label: 'primitive source' } },
      { id: 'child', type: 'subworkflow', position: { x: 360, y: 0 }, data: { label: 'child', workflowId: 'primitive-child' } },
      { id: 'finish', type: 'output', position: { x: 540, y: 0 }, data: { label: 'finish' } }
    ], edges: [
      { id: 'pd-1', source: 'start', target: 'source' },
      { id: 'pd-2', source: 'source', target: 'child' },
      { id: 'pd-3', source: 'child', target: 'finish' }
    ]
  };
  const primitiveChildDefaultGraph = compileWorkflow('primitive-child-default-parent', [primitiveChildDefaultParent, primitiveChild], {
    transform: async ({ node, state }) => node.id === 'source' ? 'forwarded' : state.nodeInput.value
  });
  assert.strictEqual((await primitiveChildDefaultGraph.invoke({ input: { untouched: true } })).output, 'forwarded');

  const loopParent = {
    id: 'loop-parent', name: '统一集合路径', status: 'published', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: '开始' } },
      { id: 'source', type: 'transform', position: { x: 180, y: 0 }, data: { label: '集合' } },
      { id: 'loop', type: 'loop', position: { x: 360, y: 0 }, data: { label: '循环', workflowId: 'primitive-child', collectionPath: 'output', itemVariable: 'current', maxIterations: 5, inputMappings: [{ target: 'number', source: 'loop.item' }] } },
      { id: 'finish', type: 'output', position: { x: 540, y: 0 }, data: { label: '完成' } }
    ], edges: [
      { id: 'lp-1', source: 'start', target: 'source' },
      { id: 'lp-2', source: 'source', target: 'loop' },
      { id: 'lp-3', source: 'loop', target: 'finish' }
    ]
  };
  const loopMappingGraph = compileWorkflow('loop-parent', [loopParent, primitiveChild], {
    transform: async ({ node, state }) => node.id === 'source' ? [2, 4, 6] : state.nodeInput.number
  });
  assert.deepStrictEqual((await loopMappingGraph.invoke({ input: {} })).output, [2, 4, 6]);

  const conditionFlow = {
    id: 'condition-flow', name: '条件端口', status: 'published', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: '开始' } },
      { id: 'score', type: 'transform', position: { x: 160, y: 0 }, data: { label: '分数' } },
      { id: 'gate', type: 'condition', position: { x: 320, y: 0 }, data: { label: '判断', conditionSource: 'output', operator: 'gte', compareValue: '60', routes: [{ key: 'pass', label: '通过' }, { key: 'fail', label: '未通过' }] } },
      { id: 'yes', type: 'transform', position: { x: 480, y: -80 }, data: { label: '通过' } },
      { id: 'finish', type: 'output', position: { x: 660, y: 0 }, data: { label: '完成' } }
    ], edges: [
      { id: 'cf-1', source: 'start', target: 'score' },
      { id: 'cf-2', source: 'score', target: 'gate' },
      { id: 'cf-pass', source: 'gate', sourceHandle: 'pass', target: 'yes', label: '通过' },
      { id: 'cf-fail', source: 'gate', sourceHandle: 'fail', target: 'finish', label: '未通过' },
      { id: 'cf-yes-end', source: 'yes', target: 'finish' }
    ]
  };
  const conditionHandlers = createWorkflowHandlers({ provider: {}, config: {} });
  const conditionGraph = compileWorkflow('condition-flow', [conditionFlow], {
    ...conditionHandlers,
    transform: async ({ node }) => node.id === 'score' ? 82 : 'passed'
  });
  assert.strictEqual((await conditionGraph.invoke({ input: {} })).output, 'passed');
  const invalidRoute = JSON.parse(JSON.stringify(conditionFlow));
  invalidRoute.edges.find((edge) => edge.id === 'cf-pass').sourceHandle = 'unknown';
  assert.strictEqual(validateWorkflowCollection([invalidRoute]).valid, false);
  const multiRouteCondition = JSON.parse(JSON.stringify(conditionFlow));
  multiRouteCondition.id = 'multi-route-condition';
  multiRouteCondition.nodes.find((node) => node.id === 'gate').data.routes.push({ key: 'maybe', label: '待定' });
  multiRouteCondition.nodes.splice(4, 0, { id: 'maybe', type: 'transform', position: { x: 480, y: 80 }, data: { label: '待定' } });
  multiRouteCondition.edges.push(
    { id: 'cf-maybe', source: 'gate', sourceHandle: 'maybe', target: 'maybe', label: '待定' },
    { id: 'cf-maybe-end', source: 'maybe', target: 'finish' }
  );
  assert.strictEqual(validateWorkflowCollection([multiRouteCondition]).valid, true);

  const routeValueHandlers = createWorkflowHandlers({ provider: {}, config: {} });
  const routeValue = await routeValueHandlers.condition({
    node: { id: 'router', data: { mode: 'routeValue', conditionSource: 'output', routes: [
      { key: 'paper', matchValues: ['1', '论文'] }, { key: 'report', matchValues: ['6', '开题报告'] }, { key: 'default', matchValues: [] }
    ] } },
    state: { context: { output: '6' } }
  });
  assert.strictEqual(routeValue.route, 'report');

  const transformHandlers = createWorkflowHandlers({ provider: {}, config: {} });
  const transformWorkflow = { name: '数据处理测试' };
  const transformState = {
    input: { topic: '治理', enabled: true },
    output: { title: '标题', nested: { value: 7 } },
    values: { source: { title: '来源标题' } },
    nodeInput: { source: { title: '来源标题' } },
    context: { input: { topic: '治理', enabled: true }, output: { title: '标题', nested: { value: 7 } }, values: { source: { title: '来源标题' } } }
  };
  const executeTransform = (data, state = transformState) => transformHandlers.transform({ node: { id: 'transform-test', type: 'transform', data }, state, workflow: transformWorkflow });
  assert.strictEqual(await executeTransform({ operation: 'pick', sourcePath: 'output.nested.value' }), 7);
  assert.deepStrictEqual(await executeTransform({ operation: 'set', targetKey: 'kind', value: 'paper' }), { source: { title: '来源标题' }, kind: 'paper' });
  assert.deepStrictEqual(await executeTransform({ operation: 'merge', sourcePaths: 'input,output' }), { topic: '治理', enabled: true, title: '标题', nested: { value: 7 } });
  assert.strictEqual(await executeTransform({ operation: 'template', template: '{{input.topic}} / {{output.title}}' }), '治理 / 标题');
  assert.deepStrictEqual(await executeTransform({ operation: 'jsonParse', sourcePath: 'output.json' }, { ...transformState, context: { ...transformState.context, output: { json: '{"ok":true}' } } }), { ok: true });
  assert.deepStrictEqual(await executeTransform({ operation: 'toArray', sourcePath: 'output.nested.value' }), [7]);

  let chatRequest;
  const chatFlow = {
    id: 'chat-flow', name: '通用 DeepSeek', status: 'published', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: '开始' } },
      { id: 'prompt', type: 'prompt', position: { x: 180, y: 0 }, data: { label: '提示词', systemPrompt: '你是{{input.role}}', userPrompt: '处理：{{input.text}}' } },
      { id: 'chat', type: 'llm', position: { x: 360, y: 0 }, data: { label: '模型', action: 'chat', messagesPath: 'output', responseMode: 'text', model: 'deepseek-chat', temperature: 0.72, maxTokens: 1234 } },
      { id: 'finish', type: 'output', position: { x: 540, y: 0 }, data: { label: '完成' } }
    ], edges: [
      { id: 'ch-1', source: 'start', target: 'prompt' },
      { id: 'ch-2', source: 'prompt', target: 'chat' },
      { id: 'ch-3', source: 'chat', target: 'finish' }
    ]
  };
  const chatHandlers = createWorkflowHandlers({
    config: {},
    provider: { async chat(request) { chatRequest = request; return { content: '模型结果' }; } }
  });
  const chatResult = await compileWorkflow('chat-flow', [chatFlow], chatHandlers).invoke({ input: { role: '编辑', text: '测试文本' } });
  assert.strictEqual(chatResult.output, '模型结果');
  assert.strictEqual(chatRequest.messages[0].content, '你是编辑');
  assert.strictEqual(chatRequest.messages[1].content, '处理：测试文本');
  assert.strictEqual(chatRequest.temperature, 0.72);
  assert.strictEqual(chatRequest.maxTokens, 1234);

  const inlineChatFlow = {
    id: 'inline-chat-flow', name: '节点内置提示词', status: 'published', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: '开始' } },
      { id: 'topic', type: 'transform', position: { x: 160, y: 0 }, data: { label: '题目' } },
      { id: 'outline', type: 'transform', position: { x: 320, y: 0 }, data: { label: '提纲' } },
      { id: 'chat', type: 'llm', position: { x: 480, y: 0 }, data: {
        label: '模型', action: 'chat', promptMode: 'inline',
        inputMappings: [
          { target: '题目', source: 'values.topic' },
          { target: '提纲', source: 'values.outline' }
        ],
        systemPrompt: '你是{{inputs.题目}}的学术编辑',
        userPrompt: '按照提纲生成：{{inputs.提纲}}',
        responseMode: 'text', model: 'deepseek-chat', temperature: 0.4, maxTokens: 2048
      } },
      { id: 'finish', type: 'output', position: { x: 640, y: 0 }, data: { label: '完成' } }
    ], edges: [
      { id: 'ic-1', source: 'start', target: 'topic' },
      { id: 'ic-2', source: 'topic', target: 'outline' },
      { id: 'ic-3', source: 'outline', target: 'chat' },
      { id: 'ic-4', source: 'chat', target: 'finish' }
    ]
  };
  let inlineRequest;
  const inlineHandlers = createWorkflowHandlers({
    config: {},
    provider: { async chat(request) { inlineRequest = request; return { content: '内置提示词结果' }; } }
  });
  inlineHandlers.transform = async ({ node }) => node.id === 'topic' ? '平台经济治理' : ['现状', '问题', '建议'];
  const inlineResult = await compileWorkflow('inline-chat-flow', [inlineChatFlow], inlineHandlers).invoke({ input: {} });
  assert.strictEqual(inlineResult.output, '内置提示词结果');
  assert.strictEqual(inlineRequest.messages[0].content, '你是平台经济治理的学术编辑');
  assert.ok(inlineRequest.messages[1].content.includes('现状'));
  assert.ok(inlineRequest.messages[1].content.includes('建议'));

  // `inputs.*` is a strict explicit-mapping namespace.  An implicit
  // workflow/previous input must remain available through `input`/`output`
  // but must not silently satisfy an undeclared mapping token.
  let strictRequest;
  const strictHandlers = createWorkflowHandlers({
    config: {},
    provider: { async chat(request) { strictRequest = request; return { content: 'strict-result' }; } }
  });
  const strictFlow = {
    id: 'strict-input-flow', name: 'strict input namespace', status: 'published', version: 1,
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'start' } },
      { id: 'llm', type: 'llm', position: { x: 180, y: 0 }, data: { label: 'llm', action: 'chat', promptMode: 'inline', userPrompt: 'mapped={{inputs.topic}} root={{input.topic}}' } },
      { id: 'finish', type: 'output', position: { x: 360, y: 0 }, data: { label: 'finish' } }
    ],
    edges: [{ id: 'si-1', source: 'start', target: 'llm' }, { id: 'si-2', source: 'llm', target: 'finish' }]
  };
  const strictResult = await compileWorkflow('strict-input-flow', [strictFlow], strictHandlers).invoke({ input: { topic: 'ROOT' } });
  assert.strictEqual(strictRequest.messages[0].content, 'mapped= root=ROOT');
  assert.deepStrictEqual(strictResult.trace.find((item) => item.nodeId === 'llm').prompt.unresolved, ['inputs.topic']);

  strictFlow.nodes[1].data.inputMappings = [{ target: 'topic', source: 'input.topic' }];
  const mappedResult = await compileWorkflow('strict-input-flow', [strictFlow], strictHandlers).invoke({ input: { topic: 'ROOT' } });
  assert.strictEqual(strictRequest.messages[0].content, 'mapped=ROOT root=ROOT');
  assert.deepStrictEqual(mappedResult.trace.find((item) => item.nodeId === 'llm').prompt.unresolved, []);

  const aliasMeta = { unresolved: [] };
  const aliasRendered = require('../services/writing-workflow/visual-runtime').renderTemplate(
    '{{input1}}|{{input1.content}}|{{inputs.input1}}|{{inputs.input1.content}}|{{input.topic}}|{{output}}|{{unknown}}',
    { input: { topic: 'root' }, inputs: { input1: { content: 'mapped' } }, output: 'previous' },
    aliasMeta
  );
  assert.strictEqual(aliasRendered, '{\n  "content": "mapped"\n}|mapped|{\n  "content": "mapped"\n}|mapped|root|previous|');
  assert.deepStrictEqual(aliasMeta.unresolved, ['unknown']);

  const rootInputMeta = { unresolved: [] };
  const rootInputRendered = require('../services/writing-workflow/visual-runtime').renderTemplate(
    '{{input}}|{{input.topic}}',
    { input: { topic: 'root input' } },
    rootInputMeta
  );
  assert.strictEqual(rootInputRendered, '{\n  "topic": "root input"\n}|root input');
  assert.deepStrictEqual(rootInputMeta.unresolved, []);

  const emptyTokenMeta = { unresolved: [] };
  const emptyTokenRendered = require('../services/writing-workflow/visual-runtime').renderTemplate(
    'before {{}} after',
    {},
    emptyTokenMeta
  );
  assert.strictEqual(emptyTokenRendered, 'before  after');
  assert.deepStrictEqual(emptyTokenMeta.unresolved, ['{{}}']);

  const outputFlow = {
    id: 'output-flow', name: 'output composition', status: 'published', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'start' } },
      { id: 'source', type: 'transform', position: { x: 180, y: 0 }, data: { label: 'source' } },
      { id: 'finish', type: 'output', position: { x: 360, y: 0 }, data: {
        label: 'output', sourcePath: 'values.source.content',
        template: 'Topic: {{input.topic}}\nBody: {{values.source.content}}\nMissing: {{values.source.missing}}'
      } }
    ], edges: [
      { id: 'of-1', source: 'start', target: 'source' },
      { id: 'of-2', source: 'source', target: 'finish' }
    ]
  };
  const outputResult = await compileWorkflow('output-flow', [outputFlow], {
    transform: async () => ({ content: 'usable body', meta: { score: 1 } })
  }).invoke({ input: { topic: 'output node proof' } });
  assert.strictEqual(outputResult.output, 'Topic: output node proof\nBody: usable body\nMissing: ');
  const outputTrace = outputResult.trace.find((step) => step.nodeId === 'finish');
  assert.ok(outputTrace);
  assert.strictEqual(outputTrace.outputComposition.sourcePath, 'values.source.content');
  assert.deepStrictEqual(outputTrace.outputComposition.unresolved, ['values.source.missing']);

  const directOutputFlow = {
    id: 'direct-output', name: 'direct output', status: 'published', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'start' } },
      { id: 'finish', type: 'output', position: { x: 180, y: 0 }, data: { label: 'output' } }
    ], edges: [{ id: 'do-1', source: 'start', target: 'finish' }]
  };
  assert.deepStrictEqual((await compileWorkflow('direct-output', [directOutputFlow]).invoke({ input: { ready: true } })).output, { ready: true });

  const ambiguousOutputFlow = JSON.parse(JSON.stringify(outputFlow));
  ambiguousOutputFlow.id = 'ambiguous-output-flow';
  ambiguousOutputFlow.nodes.splice(2, 0, { id: 'other', type: 'transform', position: { x: 180, y: 120 }, data: { label: 'other' } });
  ambiguousOutputFlow.edges.push({ id: 'of-3', source: 'start', target: 'other' }, { id: 'of-4', source: 'other', target: 'finish' });
  const ambiguousOutputValidation = validateWorkflowCollection([ambiguousOutputFlow]);
  assert.strictEqual(ambiguousOutputValidation.valid, true, ambiguousOutputValidation.errors.join('\n'));
  const parallelOutputResult = await compileWorkflow('ambiguous-output-flow', [ambiguousOutputFlow], {
    transform: async ({ node }) => node.id === 'source'
      ? new Promise((resolve) => setTimeout(() => resolve({ content: 'parallel body' }), 25))
      : new Promise((resolve) => setTimeout(() => resolve({ note: 'background meaning' }), 5))
  }).invoke({ input: { topic: 'parallel proof' } });
  assert.strictEqual(parallelOutputResult.output, 'Topic: parallel proof\nBody: parallel body\nMissing: ');
  assert.strictEqual(parallelOutputResult.trace.filter((step) => step.nodeId === 'finish').length, 1);
  assert.ok(parallelOutputResult.trace.some((step) => step.nodeId === 'source'));
  assert.ok(parallelOutputResult.trace.some((step) => step.nodeId === 'other'));

  const parallelJoinFlow = {
    id: 'parallel-join-flow', name: 'parallel join', status: 'published', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'start' } },
      { id: 'background', type: 'transform', position: { x: 180, y: -80 }, data: { label: 'background' } },
      { id: 'meaning', type: 'transform', position: { x: 180, y: 80 }, data: { label: 'meaning' } },
      { id: 'merge', type: 'transform', position: { x: 360, y: 0 }, data: {
        label: 'merge', inputMappings: [
          { target: 'background', source: 'values.background' },
          { target: 'meaning', source: 'values.meaning' }
        ]
      } },
      { id: 'finish', type: 'output', position: { x: 540, y: 0 }, data: { label: 'finish', sourcePath: 'values.merge' } }
    ], edges: [
      { id: 'pj-1', source: 'start', target: 'background' },
      { id: 'pj-2', source: 'start', target: 'meaning' },
      { id: 'pj-3', source: 'background', target: 'merge' },
      { id: 'pj-4', source: 'meaning', target: 'merge' },
      { id: 'pj-5', source: 'merge', target: 'finish' }
    ]
  };
  const parallelOrder = [];
  const parallelJoinResult = await compileWorkflow('parallel-join-flow', [parallelJoinFlow], {
    transform: async ({ node, state }) => {
      if (node.id === 'background') {
        await new Promise((resolve) => setTimeout(resolve, 25));
        parallelOrder.push('background');
        return '背景';
      }
      if (node.id === 'meaning') {
        await new Promise((resolve) => setTimeout(resolve, 5));
        parallelOrder.push('meaning');
        return '意义';
      }
      parallelOrder.push('merge');
      return `${state.nodeInput.background}+${state.nodeInput.meaning}`;
    }
  }).invoke({ input: {} });
  assert.strictEqual(parallelJoinResult.output, '背景+意义');
  assert.strictEqual(parallelOrder[parallelOrder.length - 1], 'merge');

  const parallelChainsFlow = {
    id: 'parallel-chains-flow', name: 'parallel branch chains', status: 'published', version: 1, nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'start' } },
      { id: 'background', type: 'transform', position: { x: 160, y: -100 }, data: { label: 'background' } },
      { id: 'meaning', type: 'transform', position: { x: 160, y: 100 }, data: { label: 'meaning' } },
      { id: 'background-detail', type: 'transform', position: { x: 320, y: -100 }, data: { label: 'background detail' } },
      { id: 'meaning-detail', type: 'transform', position: { x: 320, y: 100 }, data: { label: 'meaning detail' } },
      { id: 'finish', type: 'output', position: { x: 500, y: 0 }, data: {
        label: 'finish', sourcePath: 'values.background-detail',
        template: '{{values.background-detail}}|{{values.meaning-detail}}'
      } }
    ], edges: [
      { id: 'pcf-1', source: 'start', target: 'background' },
      { id: 'pcf-2', source: 'start', target: 'meaning' },
      { id: 'pcf-3', source: 'background', target: 'background-detail' },
      { id: 'pcf-4', source: 'meaning', target: 'meaning-detail' },
      { id: 'pcf-5', source: 'background-detail', target: 'finish' },
      { id: 'pcf-6', source: 'meaning-detail', target: 'finish' }
    ]
  };
  const branchInputs = {};
  const parallelChainsResult = await compileWorkflow('parallel-chains-flow', [parallelChainsFlow], {
    transform: async ({ node, state }) => {
      if (node.id === 'background') {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return '背景';
      }
      if (node.id === 'meaning') {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return '意义';
      }
      branchInputs[node.id] = state.nodeInput.value;
      return `${state.nodeInput.value}-展开`;
    }
  }).invoke({ input: {} });
  assert.deepStrictEqual(branchInputs, { 'background-detail': '背景', 'meaning-detail': '意义' });
  assert.strictEqual(parallelChainsResult.output, '背景-展开|意义-展开');

  const unsafeParallelJoin = JSON.parse(JSON.stringify(parallelJoinFlow));
  unsafeParallelJoin.id = 'unsafe-parallel-join';
  delete unsafeParallelJoin.nodes.find((node) => node.id === 'merge').data.inputMappings;
  const unsafeParallelValidation = validateWorkflowCollection([unsafeParallelJoin]);
  assert.strictEqual(unsafeParallelValidation.valid, false);
  assert.ok(unsafeParallelValidation.errors.some((error) => error.includes('必须配置输入映射')));

  const cyclicParallel = JSON.parse(JSON.stringify(parallelJoinFlow));
  cyclicParallel.id = 'cyclic-parallel';
  cyclicParallel.edges.push({ id: 'pj-cycle', source: 'merge', target: 'background' });
  const cyclicParallelValidation = validateWorkflowCollection([cyclicParallel]);
  assert.strictEqual(cyclicParallelValidation.valid, false);
  assert.ok(cyclicParallelValidation.errors.some((error) => error.includes('存在循环')));

  const concurrentGraph = compileWorkflow('chat-flow', [chatFlow], chatHandlers, { maxSteps: 3 });
  await Promise.all([
    concurrentGraph.invoke({ input: { role: 'A', text: '1' } }),
    concurrentGraph.invoke({ input: { role: 'B', text: '2' } })
  ]);

  const reportedTrace = [];
  await compileWorkflow('direct-output', [directOutputFlow], {}, {
    onTrace: (entry) => reportedTrace.push(entry)
  }).invoke({ input: { ready: true } });
  assert.deepStrictEqual(reportedTrace.map((entry) => entry.nodeId), ['finish']);

  const asyncRun = workflowRunJobs.enqueue({
    workflowId: 'direct-output', workflows: [directOutputFlow], input: { ready: true },
    provider: {}, config: {}, maxSteps: 10, timeoutMs: 5000
  });
  let asyncJob = workflowRunJobs.get(asyncRun.runId);
  while (asyncJob && !['completed', 'failed', 'cancelled'].includes(asyncJob.status)) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    asyncJob = workflowRunJobs.get(asyncRun.runId);
  }
  assert.strictEqual(asyncJob.status, 'completed');
  assert.strictEqual(asyncJob.output.ready, true);
  assert.strictEqual(asyncJob.output.traceId, asyncRun.runId);
  assert.strictEqual(asyncJob.progress.completed, 1);

  process.stdout.write('workflow studio test: ok\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
