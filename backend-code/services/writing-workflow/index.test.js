jest.mock('./visual-runtime', () => ({
  runPublishedWritingWorkflow: jest.fn()
}));

const { runPublishedWritingWorkflow } = require('./visual-runtime');
const { generateDocument } = require('./index');

function createProvider(content) {
  return {
    chat: jest.fn().mockResolvedValue({
      content,
      model: 'deepseek-test',
      durationMs: 25
    })
  };
}

describe('writing workflow product routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ['答辩稿', 'direct-defense'],
    ['中期检查表', 'direct-midterm']
  ])('%s uses exactly one direct DeepSeek call', async (docType, step) => {
    const provider = createProvider('```markdown\n**测试内容**\n```');
    const result = await generateDocument({
      topic: '人工智能伦理困境的哲学反思与对策研究',
      field: '哲学',
      docType,
      requirements: '强调哲学分析',
      traceId: `test-${docType}`,
      provider
    });

    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(provider.chat).toHaveBeenCalledWith(expect.objectContaining({
      traceId: `test-${docType}`,
      step,
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('人工智能伦理困境的哲学反思与对策研究')
        })
      ])
    }));
    expect(runPublishedWritingWorkflow).not.toHaveBeenCalled();
    expect(result.content).toBe('测试内容');
    expect(result.steps).toEqual([expect.objectContaining({
      name: `direct-deepseek:${docType}`,
      status: 'completed',
      type: 'llm'
    })]);
  });

  test('other document types keep using the published workflow', async () => {
    const provider = createProvider('不应直接调用');
    runPublishedWritingWorkflow.mockResolvedValue({
      content: '工作流结果',
      wordCount: 5,
      steps: [{ name: 'workflow:node', status: 'completed' }]
    });

    const result = await generateDocument({
      topic: '人工智能伦理困境的哲学反思与对策研究',
      field: '哲学',
      docType: '学术范文',
      traceId: 'test-workflow',
      provider
    });

    expect(runPublishedWritingWorkflow).toHaveBeenCalledTimes(1);
    expect(provider.chat).not.toHaveBeenCalled();
    expect(result.content).toBe('工作流结果');
  });
});
