jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next()
}));

jest.mock('../services/docx-rewrite', () => ({
  loadDocx: jest.fn(),
  extractDocumentText: jest.fn(),
  applyReplacementsInOrder: jest.fn(),
  saveDocx: jest.fn()
}));

jest.mock('../services/document-rewrite-pipeline', () => ({
  rewriteDocumentSelection: jest.fn()
}));

const {
  loadDocx,
  extractDocumentText,
  applyReplacementsInOrder,
  saveDocx
} = require('../services/docx-rewrite');
const { rewriteDocumentSelection } = require('../services/document-rewrite-pipeline');
const router = require('./document-rewrite-jobs');
const originalLocalRewriteTestMode = process.env.LOCAL_REWRITE_TEST_MODE;

describe('document rewrite job terminal state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadDocx.mockResolvedValue({ body: {} });
    extractDocumentText.mockReturnValue('第一句正文长度足够进入降重。第二句正文长度足够进入降重。');
  });

  afterAll(() => {
    if (originalLocalRewriteTestMode == null) delete process.env.LOCAL_REWRITE_TEST_MODE;
    else process.env.LOCAL_REWRITE_TEST_MODE = originalLocalRewriteTestMode;
  });

  test('does not create a downloadable document when every AI task fails', async () => {
    const sourceSentences = [
      { text: '第一句正文长度足够进入降重。', pIdx: 0, isTitle: false },
      { text: '第二句正文长度足够进入降重。', pIdx: 0, isTitle: false }
    ];
    const pipeline = {
      splitSentences: jest.fn(() => sourceSentences),
      rewriteSentences: jest.fn(),
      assembleParagraphs: jest.fn()
    };
    rewriteDocumentSelection.mockImplementation(async (sharedPipeline, sentences, selectedIndexes, onResult) => {
      onResult(sentences[0].text, 0, sentences[0], true, { concurrency: 1 });
      onResult(sentences[1].text, 1, sentences[1], true, { concurrency: 1 });
      return {
        results: sentences.map((sentence) => sentence.text),
        taskCount: 2,
        successfulCount: 0,
        failedCount: 2,
        retriedCount: 0,
        fallbackCount: 2,
        fallbackRecoveredCount: 0,
        concurrency: { final: 1 },
        fatalError: { code: 'DEEPSEEK_HTTP_ERROR', status: 402, message: 'DeepSeek降重请求失败' }
      };
    });
    const job = {
      id: 'job-all-failed',
      userId: 0,
      status: 'queued',
      fileName: '测试文档_降重.docx',
      wordCount: 32,
      creditsCost: 0,
      reportFileName: null,
      reportSha256: null,
      redTextStore: null,
      charged: false,
      results: [],
      progress: { completed: 0, total: 2, failed: 0, message: '任务已创建' },
      createdAt: new Date().toISOString(),
      outputPath: null,
      error: null,
      failures: []
    };
    const req = { app: { locals: { documentRewritePipeline: pipeline } } };

    await router._runJob(job, Buffer.from('docx'), null, req);

    expect(job.status).toBe('failed');
    expect(job.error).toContain('余额不足');
    expect(job.outputPath).toBeNull();
    expect(job.rewrittenText).toBe('');
    expect(router._view(job).downloadReady).toBe(false);
    expect(router._view(job).downloadUrl).toBeNull();
    expect(applyReplacementsInOrder).not.toHaveBeenCalled();
    expect(saveDocx).not.toHaveBeenCalled();
  });
});
