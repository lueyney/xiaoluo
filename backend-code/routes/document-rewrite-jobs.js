/**
 * Upload/track/download DOCX document-rewrite jobs.
 *
 * The OOXML work is implemented in services/docx-rewrite.js. The AI work is
 * the exact splitSentences/rewriteSentences pipeline used by /api/rewrite.
 */

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const {
  loadDocx,
  extractDocumentText,
  applyReplacementsInOrder,
  saveDocx
} = require('../services/docx-rewrite');
const {
  extractPdfColorText,
  matchRedSentences,
  buildRedTextStore,
  redTextStoreSummary
} = require('../services/pdf-aigc-report');
const {
  applyReportMatchToStore,
  applyRewriteResultsToStore
} = require('../services/red-text-store');
const { rewriteDocumentSelection } = require('../services/document-rewrite-pipeline');
const { evaluateMappingPolicy } = require('../services/document-rewrite-mapping-policy');

const router = express.Router();
// Keep document rewrite aligned with the existing text-rewrite local test
// mode. This is deliberately disabled in production so real requests still
// require a user, credits, and database persistence.
const LOCAL_REWRITE_TEST_MODE = process.env.NODE_ENV !== 'production'
  && process.env.LOCAL_REWRITE_TEST_MODE === 'true';
const MAX_FILE_BYTES = Number(process.env.DOCUMENT_REWRITE_MAX_BYTES || 80 * 1024 * 1024);
const JOB_TTL_MS = Number(process.env.DOCUMENT_REWRITE_JOB_TTL_MS || 60 * 60 * 1000);
// Keep generated documents outside the public `/static` tree. Downloads must
// go through the authenticated, user-owned job route below.
// Keep the default beside the backend for normal deployments, while allowing
// the host to provide a writable private directory (for example, a managed
// desktop sandbox). Results are still served only through the authenticated
// download endpoint below.
const OUTPUT_DIR = path.resolve(
  process.env.DOCUMENT_REWRITE_OUTPUT_DIR || path.join(__dirname, '..', 'data', 'document-rewrite')
);
const FALLBACK_OUTPUT_DIR = path.join(os.tmpdir(), 'lunjun-document-rewrite');
const jobs = new Map();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 2, fileSize: MAX_FILE_BYTES },
  fileFilter(req, file, callback) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!['.docx', '.pdf'].includes(ext)) {
      const error = new Error('仅支持 .docx 文档和 .pdf 检测报告');
      error.code = 'INVALID_FILE_TYPE';
      return callback(error);
    }
    callback(null, true);
  }
});

function getToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function normalizeUploadedName(originalName, fallback = 'document') {
  const rawName = String(originalName || fallback);
  // Some multipart clients send UTF-8 filename bytes through a Latin-1
  // header. Recover that form only when it clearly improves the text; do not
  // reinterpret a normal Chinese filename as Latin-1.
  let name = rawName;
  try {
    const decodedName = Buffer.from(rawName, 'latin1').toString('utf8');
    const cjk = (value) => (String(value).match(/[\u3400-\u9fff]/gu) || []).length;
    const replacement = (value) => (String(value).match(/[\ufffd]/gu) || []).length;
    const mojibake = /[ÃÂÐÑåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]|[\u0080-\u00ff][\u0080-\u00ff]/u;
    if (!replacement(decodedName) && cjk(decodedName) > cjk(rawName) && (mojibake.test(rawName) || !cjk(rawName))) {
      name = decodedName;
    }
  } catch (_) {
    // Keep the original name if it cannot be decoded safely.
  }
  return name;
}

function safeName(originalName) {
  const name = normalizeUploadedName(originalName, 'document.docx');
  const stem = path.basename(name, path.extname(name))
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120) || 'document';
  const suffix = /_降重$/u.test(stem) ? '' : '_降重';
  return `${stem}${suffix}.docx`;
}

function rewriteFailureMessage(fatalError) {
  const status = Number(fatalError && fatalError.status);
  const code = String(fatalError && fatalError.code || '');
  if (status === 402) return 'AI 服务余额不足，本次未生成降重结果，请充值后重新提交';
  if (status === 401 || status === 403) return 'AI 服务凭据无效或无权限，本次未生成降重结果';
  if (code === 'AI_NOT_CONFIGURED' || code === 'DOCUMENT_REWRITE_AI_NOT_CONFIGURED') {
    return 'AI 降重服务未配置，本次未生成降重结果';
  }
  return 'AI 降重服务不可用，本次未生成降重结果';
}

function view(job) {
  return {
    id: job.id,
    jobId: job.id,
    status: job.status,
    fileName: job.fileName,
    wordCount: job.wordCount,
    creditsCost: job.creditsCost,
    totalSentences: job.progress.total,
    progress: { ...job.progress },
    results: Array.isArray(job.results) ? job.results.map((item) => ({ ...item })) : [],
    rewrittenText: job.rewrittenText || '',
    reportMatch: job.reportMatch ? { ...job.reportMatch } : null,
    redTextStore: redTextStoreSummary(job.redTextStore),
    downloadReady: job.status === 'completed',
    downloadUrl: job.status === 'completed' ? `/api/document-rewrite-jobs/${job.id}/download` : null,
    error: job.error || null,
    createdAt: job.createdAt,
    completedAt: job.completedAt || null
  };
}

function owned(req, res) {
  const job = jobs.get(req.params.id);
  if (!job || job.userId !== req.user.id) {
    res.status(404).json({ error: '文档降重任务不存在', code: 'JOB_NOT_FOUND' });
    return null;
  }
  return job;
}

async function cleanupOutput(job) {
  if (!job.outputPath) return;
  try { await fs.unlink(job.outputPath); } catch (error) {
    if (error.code !== 'ENOENT') logger.warn(`濞撳懐鎮婇弬鍥ㄣ€傞梽宥夊櫢鏉堟挸鍤径杈Е: ${error.message}`);
  }
}

async function persistOutput(job, buffer) {
  const directories = [OUTPUT_DIR];
  if (path.normalize(FALLBACK_OUTPUT_DIR).toLowerCase() !== path.normalize(OUTPUT_DIR).toLowerCase()) {
    directories.push(FALLBACK_OUTPUT_DIR);
  }
  let lastError;
  for (const directory of directories) {
    const finalPath = path.join(directory, `${job.id}.docx`);
    const temporaryPath = path.join(directory, `.${job.id}.${process.pid}.${Date.now()}.tmp`);
    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(temporaryPath, buffer, { flag: 'wx' });
      await fs.rename(temporaryPath, finalPath);
      return finalPath;
    } catch (error) {
      lastError = error;
      try { await fs.unlink(temporaryPath); } catch (_) { /* best-effort cleanup */ }
      if (!['EPERM', 'EACCES', 'EBUSY', 'ENOTSUP'].includes(error.code)) break;
    }
  }
  throw lastError || new Error('无法保存文档降重结果');
}

function expire(job) {
  const timer = setTimeout(async () => {
    // Do not remove a still-running job from the in-memory registry. The
    // worker may still be charging, calling the provider, or writing output.
    // A terminal job is safe to expire; a running job gets a later cleanup
    // attempt after it reaches a terminal state.
    if (!['completed', 'review_required', 'failed', 'cancelled', 'canceled'].includes(job.status)) {
      expire(job);
      return;
    }
    jobs.delete(job.id);
    await cleanupOutput(job);
  }, JOB_TTL_MS);
  if (timer.unref) timer.unref();
}

async function runJob(job, sourceBuffer, reportBuffer, req) {
  const pipeline = req.app.locals.documentRewritePipeline;
  if (!pipeline || typeof pipeline.splitSentences !== 'function' || typeof pipeline.rewriteSentences !== 'function') {
    const error = new Error('现有 AI 降重处理管线未配置');
    error.code = 'DOCUMENT_REWRITE_AI_NOT_CONFIGURED';
    throw error;
  }
  const document = await loadDocx(sourceBuffer);
  const sourceText = extractDocumentText(document);
  const sourceSentences = pipeline.splitSentences(sourceText);
  let reportMatch = null;
  let selectedIndexes = new Set(sourceSentences.map((_, index) => index));
  if (reportBuffer && reportBuffer.length) {
    try {
      const report = await extractPdfColorText(reportBuffer);
      job.redTextStore = buildRedTextStore(report, {
        fileName: job.reportFileName,
        sha256: job.reportSha256
      });
      reportMatch = matchRedSentences(sourceSentences, report);
      applyReportMatchToStore(job.redTextStore, reportMatch, sourceSentences);
      const mappingSummary = redTextStoreSummary(job.redTextStore);
      const unresolved = job.redTextStore.segments.filter(
        (segment) => segment.eligibleForRewrite && segment.mapping.status !== 'mapped'
      );
      const eligibleSegments = job.redTextStore.segments.filter((segment) => segment.eligibleForRewrite).length;
      const mappingPolicy = evaluateMappingPolicy({
        eligibleSegments,
        matchedSentences: reportMatch.indexes.length,
        unmatchedSegments: unresolved.length
      });
      logger.info('PDF 检测报告映射完成', {
        jobId: job.id,
        reportFileName: job.reportFileName,
        parser: report.parser || null,
        redChars: reportMatch.redChars,
        redSegments: reportMatch.redSegmentCount,
        matchedSentences: reportMatch.indexes.length,
        unmatchedSegments: unresolved.length,
        unmatchedRatio: mappingPolicy.unmatchedRatio,
        mappingDecision: mappingPolicy.shouldContinue ? 'continue' : 'review_required'
      });
      if (!report.redSegments.length || !mappingPolicy.shouldContinue) {
        job.status = 'review_required';
        let reviewReason;
        if (!report.redSegments.length) {
          reviewReason = '检测报告中未识别到可用的标色文字（支持 RGB/CMYK 的红、黄、蓝、绿、紫等高饱和度字体填充）';
        } else if (mappingPolicy.reason === 'excessive-unmatched') {
          reviewReason = '检测报告中有 ' + unresolved.length + ' 条标色正文无法可靠定位（未匹配比例 ' + (mappingPolicy.unmatchedRatio * 100).toFixed(1) + '%），为避免错改已停止';
        } else if (!reportMatch.indexes.length) {
          reviewReason = '已识别到标色文字，但无法与该 Word 文档的正文匹配';
        } else {
          reviewReason = '检测报告中的标色正文未能可靠定位，未启动降重';
        }
        job.reportMatch = {
          fallback: false,
          parser: report.parser || null,
          reviewRequired: true,
          reason: reviewReason,
          redChars: reportMatch.redChars,
          redSegmentCount: reportMatch.redSegmentCount,
          matchedSentences: reportMatch.indexes.length,
          unmatchedFragments: reportMatch.unmatchedFragments.slice(0, 20),
          unmatchedSegments: unresolved.length,
          unmatchedRatio: mappingPolicy.unmatchedRatio,
          redTextStore: mappingSummary
        };
        job.results = sourceSentences.map((sentence) => ({
          original: sentence.text,
          rewritten: sentence.text,
          status: 'unchanged'
        }));
        job.progress.total = reportMatch.indexes.length;
        job.progress.completed = 0;
        job.progress.failed = 0;
        job.progress.message = job.reportMatch.reason;
        job.completedAt = new Date().toISOString();
        return;
      }
      selectedIndexes = new Set(reportMatch.indexes);
      job.reportMatch = {
        fallback: false,
        parser: report.parser || null,
        redChars: reportMatch.redChars,
        redSegmentCount: reportMatch.redSegmentCount,
        matchedSentences: reportMatch.indexes.length,
        unmatchedFragments: reportMatch.unmatchedFragments.slice(0, 20),
        partialMapping: unresolved.length > 0,
        unmatchedSegments: unresolved.length,
        unmatchedRatio: mappingPolicy.unmatchedRatio
      };
      job.reportMatch.redTextStore = mappingSummary;
      const selectedWordCount = reportMatch.indexes.reduce((total, index) => total + String(sourceSentences[index] && sourceSentences[index].text || '').length, 0);
      job.wordCount = selectedWordCount;
      job.creditsCost = LOCAL_REWRITE_TEST_MODE ? 0 : Math.ceil(selectedWordCount / 1000 * 18);
    } catch (reportError) {
      logger.error('PDF 检测报告解析或映射失败', {
        jobId: job.id,
        reportFileName: job.reportFileName,
        reportSha256: job.reportSha256,
        code: reportError && reportError.code || null,
        message: reportError && reportError.message || String(reportError)
      });
      job.status = 'review_required';
      job.reportMatch = { fallback: false, reviewRequired: true, reason: reportError && reportError.message ? reportError.message : 'AIGC 检测报告无法识别，未启动降重' };
      job.results = sourceSentences.map((sentence) => ({ original: sentence.text, rewritten: sentence.text, status: 'unchanged' }));
      job.progress.total = 0;
      job.progress.completed = 0;
      job.progress.failed = 0;
      job.progress.message = job.reportMatch.reason;
      job.completedAt = new Date().toISOString();
      return;
    }
  } else {
    job.reportMatch = null;
  }
  if (!LOCAL_REWRITE_TEST_MODE && typeof req.app.locals.documentRewriteCharge === 'function') {
    await req.app.locals.documentRewriteCharge(job, req);
    job.charged = true;
  }
  job.results = sourceSentences.map((sentence, index) => ({
    original: sentence.text,
    rewritten: selectedIndexes.has(index) ? '' : sentence.text,
    status: selectedIndexes.has(index) ? 'pending' : 'unchanged'
  }));
  job.status = 'processing';
  job.progress.total = selectedIndexes.size;
  job.progress.message = '正在生成降重结果';
  const result = await rewriteDocumentSelection(
    pipeline,
    sourceSentences,
    selectedIndexes,
    (text, index, sentence, failed, metadata) => {
      if (!selectedIndexes.has(index)) return;
      if (job.results[index]) {
        job.results[index].rewritten = text;
        job.results[index].status = failed ? 'failed' : 'completed';
        job.results[index].promptVariant = metadata && metadata.promptVariant || null;
      }
      job.progress.completed += 1;
      if (failed) job.progress.failed += 1;
      job.progress.concurrency = metadata && metadata.concurrency || null;
      job.progress.message = failed ? '处理中，个别句子已回退原文' : '处理中';
    }
  );

  // Titles and short fragments are intentionally returned unchanged by the
  // existing AI pipeline. Mark them after all concurrent requests finish.
  job.results.forEach((item, index) => {
    if (selectedIndexes.has(index) && item.status === 'pending') {
      item.rewritten = result.results[index] == null ? item.original : result.results[index];
      item.status = 'skipped';
    }
  });
  job.progress.completed = selectedIndexes.size;
  job.progress.failed = result.failedCount;
  job.progress.retried = result.retriedCount;
  job.progress.fallback = result.fallbackCount;
  job.progress.fallbackRecovered = result.fallbackRecoveredCount;
  job.progress.concurrency = result.concurrency;
  applyRewriteResultsToStore(job.redTextStore, job.results);
  if (job.reportMatch) job.reportMatch.redTextStore = redTextStoreSummary(job.redTextStore);

  // A document whose every AI-eligible sentence failed is not a rewritten
  // result. Do not package the unchanged source as a successful download.
  if (result.taskCount > 0 && result.failedCount >= result.taskCount) {
    job.status = 'failed';
    job.error = rewriteFailureMessage(result.fatalError);
    job.progress.message = job.error;
    job.rewrittenText = '';
    job.outputPath = null;
    job.completedAt = new Date().toISOString();
    job.failures = result.fatalError ? [{ ...result.fatalError }] : [];
    logger.error('文档降重全部 AI 任务失败，未生成下载文件', {
      jobId: job.id,
      taskCount: result.taskCount,
      failedCount: result.failedCount,
      code: result.fatalError && result.fatalError.code || null,
      status: result.fatalError && result.fatalError.status || null
    });
    return;
  }

  job.rewrittenText = typeof pipeline.assembleParagraphs === 'function'
    ? pipeline.assembleParagraphs(sourceSentences, result.results)
    : sourceSentences.map((sentence, index) => result.results[index] || sentence.text).join('');

  job.progress.message = job.reportMatch && job.reportMatch.partialMapping
    ? ('正在准备下载文件（有 ' + job.reportMatch.unmatchedSegments + ' 条标色片段未定位，已保留原文）')
    : '正在准备下载文件';
  applyReplacementsInOrder(document, result.results, {
    sourceSentences,
    skipTitles: false,
    skipProtected: false
  });
  const output = await saveDocx(document);
  job.outputPath = await persistOutput(job, output);
  if (!LOCAL_REWRITE_TEST_MODE && typeof req.app.locals.documentRewriteSave === 'function') {
    await req.app.locals.documentRewriteSave(job);
    job.savedToLibrary = true;
  }
  job.status = 'completed';
  job.progress.message = result.failedCount
    ? ('处理完成，' + result.failedCount + ' 句降重失败并保留原文')
    : (job.reportMatch && job.reportMatch.partialMapping
      ? ('处理完成，有 ' + job.reportMatch.unmatchedSegments + ' 条标色片段未定位，已保留原文')
      : '处理完成');
  job.completedAt = new Date().toISOString();
  job.failures = [];
}

router.use((req, res, next) => {
  if (LOCAL_REWRITE_TEST_MODE) {
    req.user = { id: 0, phone: 'local-test', nickname: '本地测试' };
    return next();
  }
  return authenticateToken(req, res, next);
});

router.post('/', (req, res, next) => {
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'report', maxCount: 1 }])(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `文件不能超过 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB`, code: 'FILE_TOO_LARGE' });
    }
    return res.status(400).json({ error: error.message || '文件上传失败', code: error.code || 'UPLOAD_ERROR' });
  });
}, async (req, res) => {
  try {
    const docxFile = req.files && req.files.file && req.files.file[0];
    const reportFile = req.files && req.files.report && req.files.report[0];
    if (!docxFile || !docxFile.buffer) return res.status(400).json({ error: '请选择 DOCX 文档', code: 'FILE_REQUIRED' });
    const document = await loadDocx(docxFile.buffer);
    const sourceText = extractDocumentText(document);
    const pipeline = req.app.locals.documentRewritePipeline;
    const sentences = pipeline.splitSentences(sourceText);
    const wordCount = sourceText.length;
    if (!wordCount) return res.status(400).json({ error: '文档中没有可处理文字', code: 'EMPTY_DOCUMENT' });
    const id = crypto.randomUUID();
    const job = {
      id,
      userId: req.user.id,
      status: 'queued',
      fileName: safeName(docxFile.originalname),
      wordCount,
      creditsCost: LOCAL_REWRITE_TEST_MODE ? 0 : Math.ceil(wordCount / 1000 * 18),
      reportFileName: reportFile && normalizeUploadedName(reportFile.originalname, 'report.pdf') || null,
      reportSha256: reportFile && reportFile.buffer ? crypto.createHash('sha256').update(reportFile.buffer).digest('hex') : null,
      redTextStore: null,
      charged: false,
      results: sentences.map((sentence) => ({ original: sentence.text, rewritten: '', status: 'pending' })),
      progress: { completed: 0, total: sentences.length, failed: 0, message: '任务已创建' },
      createdAt: new Date().toISOString(),
      outputPath: null,
      error: null,
      failures: []
    };
    jobs.set(id, job);
    expire(job);
    res.status(202).json({ code: 'SUCCESS', message: '文档降重任务已创建', data: view(job) });
    setImmediate(() => runJob(job, docxFile.buffer, reportFile && reportFile.buffer, req).catch((error) => {
      job.status = 'failed';
      job.error = error.message || '文档降重失败';
      job.progress.message = '处理失败';
      job.completedAt = new Date().toISOString();
      logger.error(`文档降重任务失败 ${id}: ${error.stack || error.message}`);
    }));
  } catch (error) {
    const status = ['INVALID_DOCX', 'DOCX_XML_PARSE_ERROR'].includes(error.code) ? 400 : 500;
    logger.error(`创建文档降重任务失败: ${error.message}`);
    res.status(status).json({ error: error.message || '无法读取 DOCX 文档', code: error.code || 'DOCUMENT_REWRITE_ERROR' });
  }
});

router.get('/:id', (req, res) => {
  const job = owned(req, res);
  if (job) res.json({ code: 'SUCCESS', data: view(job) });
});

router.get('/:id/red-text-store', (req, res) => {
  const job = owned(req, res);
  if (!job) return;
  if (!job.redTextStore) return res.status(404).json({ error: '该任务未上传或尚未解析 AIGC 检测报告', code: 'RED_TEXT_STORE_NOT_FOUND' });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ code: 'SUCCESS', data: job.redTextStore });
});

router.get('/:id/download', async (req, res) => {
  const job = owned(req, res);
  if (!job) return;
  if (job.status !== 'completed' || !job.outputPath) {
    return res.status(409).json({ error: '文档尚未处理完成', code: 'JOB_NOT_COMPLETED', data: view(job) });
  }
  try {
    const buffer = await fs.readFile(job.outputPath);
    const ascii = job.fileName.replace(/[^\x20-\x7e]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(job.fileName)}`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    logger.error(`下载文档降重结果失败: ${error.message}`);
    res.status(404).json({ error: '结果文件不存在或已过期', code: 'RESULT_FILE_NOT_FOUND' });
  }
});

router._jobs = jobs;
router._runJob = runJob;
router._view = view;
module.exports = router;
