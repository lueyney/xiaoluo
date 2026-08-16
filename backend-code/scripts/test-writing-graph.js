const assert = require('assert');
const { createWritingGraph } = require('../services/writing-workflow/graph');
const { cleanGeneratedTitle } = require('../services/writing-workflow/utils');

class FakeDeepSeekProvider {
  async plan() {
    return {
      data: {
        title: '数字化学习环境中的大学生自我调节学习',
        thesis: '从学习环境、学习策略和反馈机制三个方面展开',
        audience: '教育学研究者',
        sections: [
          { heading: '研究背景', purpose: '说明问题', keyPoints: ['数字化学习', '自我调节'], targetWords: 500 },
          { heading: '分析框架', purpose: '建立框架', keyPoints: ['环境', '策略'], targetWords: 700 },
          { heading: '研究设计', purpose: '提出设计', keyPoints: ['方法', '步骤'], targetWords: 600 }
        ]
      },
      model: 'fake-planner',
      usage: { total_tokens: 10 }
    };
  }

  async draftSection({ sectionIndex }) {
    const headings = ['研究背景', '分析框架', '研究设计'];
    return {
      content: `## ${headings[sectionIndex]}\n\n这是第 ${sectionIndex + 1} 节的模拟正文。`,
      model: 'fake-writer',
      usage: { total_tokens: 20 }
    };
  }
}

async function main() {
  const graph = createWritingGraph({
    provider: new FakeDeepSeekProvider(),
    config: { maxSections: 9, minTargetWords: 800, maxTargetWords: 12000 }
  });
  const result = await graph.invoke({
    topic: '数字化学习环境中的大学生自我调节学习',
    field: '教育学',
    docType: '开题报告',
    description: '开题报告',
    defaultTargetWords: 1800,
    requirements: '约1800字',
    traceId: 'graph-test'
  });

  assert.ok(result.content.startsWith('# 数字化学习环境中的大学生自我调节学习'));
  assert.ok(result.content.includes('## 研究设计'));
  assert.strictEqual(result.sections.length, 3);
  assert.strictEqual(result.steps.filter((step) => step.name.startsWith('draft:')).length, 3);
  assert.ok(result.wordCount > 0);
  assert.strictEqual(cleanGeneratedTitle('1. “人工智能支持下的高校教学创新。”'), '人工智能支持下的高校教学创新');
  process.stdout.write('langgraph writing test: ok\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
