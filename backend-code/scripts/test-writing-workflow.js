const assert = require('assert');
const store = require('../services/workflow-studio/store');
const { normalizeDocType, getDocTypeConfig } = require('../services/writing-workflow/doc-types');
const { ROUTER_ID } = require('./install-creation-router');
const { invoke, nonEmptyText } = require('./regression-creation-workflows');

async function main() {
  assert.strictEqual(normalizeDocType('学术论文'), '学术范文');
  assert.strictEqual(getDocTypeConfig('答辩稿').credits, 10);

  const workflows = await store.listPublishedWorkflows();
  const cases = [
    { docType: '学术范文', routeNode: 'run-paper01', childId: 'coze-paper01-with-literature', paperClass: '1' },
    { docType: '开题报告', routeNode: 'run-opening', childId: 'coze-kaitibaogao-opening-report' },
    { docType: '任务书', routeNode: 'run-task', childId: 'coze-renwushu-task-book' },
    { docType: '文献综述', routeNode: 'run-literature', childId: 'coze-workwenxian-literature-search' },
    { docType: '答辩稿', routeNode: 'run-defense', childId: 'academic-writing-main' },
    { docType: '中期检查表', routeNode: 'run-midterm', childId: 'academic-writing-main' }
  ];

  for (const testCase of cases) {
    const { calls, result } = await invoke(ROUTER_ID, workflows, {
      topic: '数字经济背景下平台企业治理研究',
      field: '理论经济学',
      docType: testCase.docType,
      requirements: '',
      description: '产品路由契约测试',
      defaultTargetWords: 1800,
      traceId: `product-contract-${testCase.docType}`
    }, testCase.paperClass || '1');

    assert.ok(result.trace.some((entry) => entry.workflowId === ROUTER_ID && entry.nodeId === testCase.routeNode), `${testCase.docType} 未进入 ${testCase.routeNode}`);
    assert.ok(result.trace.some((entry) => entry.workflowId === testCase.childId), `${testCase.docType} 未运行 ${testCase.childId}`);
    assert.ok(nonEmptyText(result.output), `${testCase.docType} 最终输出为空`);
    assert.strictEqual(calls.filter((step) => step === 'paper-classifier').length, testCase.paperClass ? 1 : 0, `${testCase.docType} 分类器调用次数错误`);
  }

  process.stdout.write('writing product routing test: ok\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
