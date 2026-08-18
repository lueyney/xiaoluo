const assert = require('assert');
require('events').setMaxListeners(100);
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const store = require('../services/workflow-studio/store');
const { compileWorkflow } = require('../services/workflow-studio/compiler');
const { createWorkflowHandlers } = require('../services/writing-workflow/visual-runtime');
const { getWritingConfig } = require('../services/writing-workflow/config');
const DeepSeekProvider = require('../services/writing-workflow/providers/deepseek');
const { ROUTER_ID } = require('./install-creation-router');

function nonEmptyText(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && typeof value.content === 'string') return value.content.trim();
  return '';
}

function buildMockRuntime(workflows, forcedPaperClass = '1') {
  const fieldsByNode = new Map();
  for (const workflow of workflows) {
    for (const node of workflow.nodes || []) {
      if (node.type === 'llm') fieldsByNode.set(node.id, node.data.cozeOutputFields || []);
    }
  }
  const calls = [];
  const provider = {
    async chat(request) {
      calls.push(request.step);
      if (request.step === 'paper-classifier') return { content: forcedPaperClass, data: null };
      const fields = fieldsByNode.get(request.step) || [];
      if (request.json) {
        return {
          content: JSON.stringify(Object.fromEntries(fields.map((field) => [field, `${request.step}-${field}-模拟结果`]))),
          data: Object.fromEntries(fields.map((field) => [field, `${request.step}-${field}-模拟结果`]))
        };
      }
      return { content: `${request.step}-模拟结果`, data: null };
    }
  };
  const handlers = {
    ...createWorkflowHandlers({
      provider,
      config: {
        maxSections: 9,
        minTargetWords: 800,
        maxTargetWords: 12000,
        academicSearch: { maxResults: 20, timeoutMs: 1000 }
      }
    }),
    plugin: async ({ node }) => ({
      provider: node.data.provider || 'mock',
      query: '模拟检索关键词',
      total: 1,
      items: [{ title: '模拟论文', authors: ['测试作者'], year: 2025, abstract: '模拟摘要', doi: '10.0000/mock' }],
      data: [{ title: '模拟企业资料', value: '测试数据' }],
      message: 'mock'
    })
  };
  return { calls, handlers };
}

async function invoke(workflowId, workflows, input, forcedPaperClass = '1') {
  const runtime = buildMockRuntime(workflows, forcedPaperClass);
  const result = await compileWorkflow(workflowId, workflows, runtime.handlers, { maxSteps: 1000, maxLoopIterations: 50 }).invoke({ input });
  return { ...runtime, result };
}

async function main() {
  const workflows = await store.listPublishedWorkflows();
  const directCases = [
    { id: 'coze-paper01-with-literature', input: { title: '幼儿园绘本阅读现状及对策研究' } },
    { id: 'coze-paper02-survey-research', input: { BOT_USER_INPUT: '小班幼儿同伴交往行为调查研究', title: '小班幼儿同伴交往行为调查研究' } },
    { id: 'coze-paper03-empirical-research', input: { BOT_USER_INPUT: '数字普惠金融对中小企业融资约束的影响实证研究' } },
    { id: 'coze-paper04-financial-esg-research', input: { BOT_USER_INPUT: '基于杜邦分析法的贵州茅台盈利能力分析' } },
    { id: 'coze-workwenxian-literature-search', input: { BOT_USER_INPUT: '幼儿园绘本阅读研究' } },
    { id: 'coze-kaitibaogao-opening-report', input: { input: '幼儿园绘本阅读现状及对策研究' } },
    { id: 'coze-renwushu-task-book', input: { input: '幼儿园绘本阅读现状及对策研究' } }
  ];
  const direct = [];
  for (const testCase of directCases) {
    const { result } = await invoke(testCase.id, workflows, testCase.input);
    const text = nonEmptyText(result.output);
    assert.ok(text, `${testCase.id} 未返回非空文本`);
    direct.push({ workflowId: testCase.id, outputType: typeof result.output, outputLength: text.length, steps: result.trace.length });
  }

  const nonPaperCases = [
    { docType: '开题报告', expected: 'coze-kaitibaogao-opening-report' },
    { docType: '任务书', expected: 'coze-renwushu-task-book' },
    { docType: '文献综述', expected: 'coze-workwenxian-literature-search' },
    { docType: '答辩稿', expected: 'academic-writing-main', routeNode: 'run-defense' },
    { docType: '中期检查表', expected: 'academic-writing-main', routeNode: 'run-midterm' }
  ];
  const directRouting = [];
  for (const testCase of nonPaperCases) {
    const { calls, result } = await invoke(ROUTER_ID, workflows, {
      topic: '幼儿园绘本阅读现状及对策研究', field: '学前教育', docType: testCase.docType,
      requirements: '', description: '测试', defaultTargetWords: 1800, traceId: `regression-${testCase.docType}`
    });
    assert.strictEqual(calls.filter((step) => step === 'paper-classifier').length, 0, `${testCase.docType} 不应调用论文分类器`);
    assert.ok(result.trace.some((entry) => entry.workflowId === testCase.expected), `${testCase.docType} 未直达 ${testCase.expected}`);
    if (testCase.routeNode) {
      const routeEntry = result.trace.find((entry) => entry.workflowId === ROUTER_ID && entry.nodeId === testCase.routeNode);
      assert.ok(routeEntry, `${testCase.docType} 未经过明确的直达分支 ${testCase.routeNode}`);
      assert.strictEqual(routeEntry.input.docType, testCase.docType, `${testCase.docType} 传入子工作流的 docType 不一致`);
    }
    const text = nonEmptyText(result.output);
    assert.ok(text, `${testCase.docType} 最终输出为空`);
    directRouting.push({ docType: testCase.docType, workflowId: testCase.expected, classifierCalls: 0, outputLength: text.length });
  }

  const paperCases = [
    { classification: '1', expected: 'coze-paper01-with-literature', topic: '幼儿园绘本阅读现状及对策研究' },
    { classification: '2', expected: 'coze-paper02-survey-research', topic: '小班幼儿同伴交往行为调查研究' },
    { classification: '3', expected: 'coze-paper03-empirical-research', topic: '数字普惠金融对中小企业融资约束的影响实证研究' },
    { classification: '4', expected: 'coze-paper04-financial-esg-research', topic: '基于杜邦分析法的贵州茅台盈利能力分析' }
  ];
  const paperRouting = [];
  for (const testCase of paperCases) {
    const { calls, result } = await invoke(ROUTER_ID, workflows, {
      topic: testCase.topic, field: '测试专业', docType: '学术范文', requirements: '', description: '测试', defaultTargetWords: 5000, traceId: `regression-paper-${testCase.classification}`
    }, testCase.classification);
    assert.strictEqual(calls.filter((step) => step === 'paper-classifier').length, 1, '论文必须且只能调用一次分类器');
    assert.ok(result.trace.some((entry) => entry.workflowId === testCase.expected), `论文分类 ${testCase.classification} 未进入 ${testCase.expected}`);
    const text = nonEmptyText(result.output);
    assert.ok(text, `论文分类 ${testCase.classification} 最终输出为空`);
    paperRouting.push({ classification: testCase.classification, workflowId: testCase.expected, classifierCalls: 1, outputLength: text.length });
  }

  let realClassifier;
  if (process.argv.includes('--real-classifier')) {
    const router = workflows.find((workflow) => workflow.id === ROUTER_ID);
    const classifier = router.nodes.find((node) => node.id === 'paper-classifier');
    const classifierRouter = router.nodes.find((node) => node.id === 'paper-router');
    const config = getWritingConfig();
    const provider = new DeepSeekProvider(config.deepseek);
    const handlers = createWorkflowHandlers({ provider, config });
    const realCases = [
      { expected: 'paper01', topic: '幼儿园绘本阅读现状及对策研究' },
      { expected: 'paper02', topic: '小班幼儿同伴交往行为调查研究' },
      { expected: 'paper03', topic: '数字普惠金融对中小企业融资约束的影响实证研究' },
      { expected: 'paper04', topic: '基于杜邦分析法的贵州茅台盈利能力分析' }
    ];
    realClassifier = [];
    for (const testCase of realCases) {
      const state = {
        input: { topic: testCase.topic, traceId: `real-classifier-${testCase.expected}` },
        nodeInput: { topic: testCase.topic },
        explicitInputs: { topic: testCase.topic },
        variableMode: 'explicit-v2',
        context: { input: { topic: testCase.topic }, inputs: { topic: testCase.topic }, values: {}, output: undefined, variableMode: 'explicit-v2' }
      };
      const classification = await handlers.llm({ node: classifier, state, workflow: router });
      const routed = await handlers.condition({
        node: classifierRouter,
        state: { context: { output: classification, values: { 'paper-classifier': classification } } }
      });
      assert.strictEqual(routed.route, testCase.expected, `${testCase.topic} 实际分类为 ${routed.route}，预期 ${testCase.expected}`);
      realClassifier.push({ topic: testCase.topic, raw: classification, route: routed.route, expected: testCase.expected });
    }
  }

  let realSupport;
  if (process.argv.includes('--real-support')) {
    const config = getWritingConfig();
    const provider = new DeepSeekProvider(config.deepseek);
    const handlers = createWorkflowHandlers({ provider, config });
    const realCases = [
      { id: 'coze-renwushu-task-book', input: { input: '幼儿园绘本阅读现状及对策研究', traceId: 'real-task-book' } },
      { id: 'coze-workwenxian-literature-search', input: { BOT_USER_INPUT: '幼儿园绘本阅读现状及对策研究', traceId: 'real-literature-review' } },
      { id: 'coze-kaitibaogao-opening-report', input: { input: '幼儿园绘本阅读现状及对策研究', traceId: 'real-opening-report' } }
    ];
    realSupport = [];
    for (const testCase of realCases) {
      const startedAt = Date.now();
      const result = await compileWorkflow(testCase.id, workflows, handlers, { maxSteps: 1000, maxLoopIterations: 50 }).invoke({ input: testCase.input });
      const text = nonEmptyText(result.output);
      assert.ok(text, `${testCase.id} 真实运行未返回文本`);
      realSupport.push({ workflowId: testCase.id, outputLength: text.length, steps: result.trace.length, durationMs: Date.now() - startedAt });
    }
  }

  let realPapers;
  if (process.argv.includes('--real-papers')) {
    const config = getWritingConfig();
    const provider = new DeepSeekProvider(config.deepseek);
    const handlers = createWorkflowHandlers({ provider, config });
    const realCases = [
      { expected: 'coze-paper01-with-literature', topic: '幼儿园绘本阅读现状及对策研究' },
      { expected: 'coze-paper02-survey-research', topic: '小班幼儿同伴交往行为调查研究' },
      { expected: 'coze-paper03-empirical-research', topic: '数字普惠金融对中小企业融资约束的影响实证研究' },
      { expected: 'coze-paper04-financial-esg-research', topic: '基于杜邦分析法的贵州茅台盈利能力分析' }
    ];
    realPapers = await Promise.all(realCases.map(async (testCase) => {
      const startedAt = Date.now();
      const result = await compileWorkflow(ROUTER_ID, workflows, handlers, { maxSteps: 1000, maxLoopIterations: 50 }).invoke({
        input: {
          topic: testCase.topic,
          field: '回归测试',
          docType: '学术范文',
          requirements: '',
          description: '真实论文工作流回归',
          defaultTargetWords: 5000,
          traceId: `real-paper-${testCase.expected}`
        }
      });
      const classifierEntries = result.trace.filter((entry) => entry.workflowId === ROUTER_ID && entry.nodeId === 'paper-classifier');
      assert.strictEqual(classifierEntries.length, 1, `${testCase.topic} 未且仅未调用一次论文分类器`);
      assert.ok(result.trace.some((entry) => entry.workflowId === testCase.expected), `${testCase.topic} 未进入 ${testCase.expected}`);
      const text = nonEmptyText(result.output);
      assert.ok(text, `${testCase.expected} 真实创作入口运行未返回文本`);
      const summary = {
        topic: testCase.topic,
        workflowId: testCase.expected,
        classifierOutput: classifierEntries[0].output,
        outputLength: text.length,
        steps: result.trace.length,
        durationMs: Date.now() - startedAt
      };
      process.stderr.write(`[real-papers] ${testCase.expected} ok outputLength=${summary.outputLength} durationMs=${summary.durationMs}\n`);
      return summary;
    }));
  }

  process.stdout.write(`${JSON.stringify({ ok: true, direct, directRouting, paperRouting, ...(realClassifier ? { realClassifier } : {}), ...(realSupport ? { realSupport } : {}), ...(realPapers ? { realPapers } : {}) }, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
module.exports = { buildMockRuntime, invoke, nonEmptyText };
