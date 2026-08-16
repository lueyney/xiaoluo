const assert = require('assert');
const { getDocTypeConfig, normalizeDocType } = require('../services/writing-workflow/doc-types');
const WritingOrchestrator = require('../services/writing-workflow/orchestrator');
const MockProvider = require('../services/writing-workflow/providers/mock');
const { runDeterministicChecks } = require('../services/writing-workflow/orchestrator');

async function main() {
  assert.strictEqual(normalizeDocType('学术论文'), '学术范文');
  assert.strictEqual(getDocTypeConfig('答辩稿').credits, 10);

  const orchestrator = new WritingOrchestrator({
    provider: new MockProvider(),
    config: {
      minTargetWords: 800,
      maxTargetWords: 12000,
      maxSections: 9,
      enableReview: true,
      reviewThreshold: 0.72,
      qualityGateMode: 'warn'
    }
  });

  const result = await orchestrator.generateDocument({
    topic: '数字化学习环境中的大学生自我调节学习',
    field: '教育学',
    docType: '开题报告',
    requirements: '约3000字',
    traceId: 'mock-test'
  });

  assert.ok(result.content.includes('Mock 工作流输出'));
  assert.strictEqual(result.review.passed, true);

  const checks = runDeterministicChecks({
    content: '# 测试\n\n## 第一部分\n短文本',
    plan: { sections: [{ heading: '第一部分' }, { heading: '第二部分' }] },
    targetWords: 1000
  });
  assert.strictEqual(checks.passed, false);
  assert.ok(checks.issues.some((issue) => issue.includes('缺少计划章节')));

  process.stdout.write('writing workflow mock test: ok\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
