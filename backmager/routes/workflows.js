const express = require('express');
const requireAdmin = require('../middleware/auth');
const response = require('../utils/response');
const store = require('../../backend-code/services/workflow-studio/store');
const { normalizeWorkflow } = require('../../backend-code/services/workflow-studio/schema');
const { expandWorkflow, validateWorkflowCollection, validateWorkflowDraftCollection } = require('../../backend-code/services/workflow-studio/validator');
const { getWritingConfig } = require('../../backend-code/services/writing-workflow/config');
const DeepSeekProvider = require('../../backend-code/services/writing-workflow/providers/deepseek');
const { runWorkflowPreview } = require('../../backend-code/services/writing-workflow/visual-runtime');
const workflowRunJobs = require('../../backend-code/services/workflow-studio/run-jobs');

const router = express.Router();
router.use(requireAdmin(['super_admin', 'admin']));

router.get('/', async (req, res, next) => {
  try {
    response.success(res, await store.listWorkflows());
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const workflow = await store.getWorkflow(req.params.id);
    if (!workflow) return response.failure(res, 404, '工作流不存在', 'WORKFLOW_NOT_FOUND');
    response.success(res, workflow);
  } catch (error) { next(error); }
});

router.post('/validate', async (req, res, next) => {
  try {
    const stored = await store.listWorkflows();
    const incoming = req.body && req.body.workflow;
    const workflows = incoming
      ? stored.some((item) => item.id === incoming.id)
        ? stored.map((item) => item.id === incoming.id ? incoming : item)
        : stored.concat(incoming)
      : stored;
    const mode = String(req.body && req.body.mode || 'execution').toLowerCase();
    response.success(res, mode === 'draft'
      ? validateWorkflowDraftCollection(workflows)
      : validateWorkflowCollection(workflows));
  } catch (error) { next(error); }
});

router.get('/:id/expanded', async (req, res, next) => {
  try {
    response.success(res, expandWorkflow(req.params.id, await store.listWorkflows()));
  } catch (error) { next(error); }
});

router.post('/:id/run', async (req, res, next) => {
  try {
    const stored = await store.listWorkflows();
    const incoming = req.body && req.body.workflow;
    const workflowId = req.params.id;
    const workflows = incoming
      ? stored.some((item) => item.id === workflowId)
        ? stored.map((item) => item.id === workflowId ? normalizeWorkflow({ ...incoming, id: workflowId }) : item)
        : stored.concat(normalizeWorkflow({ ...incoming, id: workflowId }))
      : stored;
    const workflow = workflows.find((item) => item.id === workflowId);
    if (!workflow) return response.failure(res, 404, '工作流不存在', 'WORKFLOW_NOT_FOUND');

    const validation = validateWorkflowCollection(workflows);
    if (!validation.valid) {
      return response.failure(res, 400, '工作流校验失败', 'WORKFLOW_VALIDATION_FAILED', validation);
    }

    const input = req.body && req.body.input;
    if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) {
      return response.failure(res, 400, '运行输入必须是 JSON 对象', 'WORKFLOW_INPUT_INVALID');
    }

    const config = getWritingConfig();
    const provider = new DeepSeekProvider(config.deepseek);
    const asyncRequested = req.body && (req.body.async === true || String(req.body.async || '').toLowerCase() === 'true')
      || String(req.query.async || '') === '1';
    if (asyncRequested) {
      const job = workflowRunJobs.enqueue({
        workflowId,
        workflows,
        input: input || {},
        provider,
        config,
        maxSteps: Math.min(500, Math.max(1, Number.parseInt(req.body.maxSteps, 10) || 500)),
        maxLoopIterations: Math.min(100, Math.max(1, Number.parseInt(req.body.maxLoopIterations, 10) || 20)),
        timeoutMs: Math.min(60 * 60 * 1000, Math.max(30000, Number.parseInt(req.body.timeoutMs, 10) || 15 * 60 * 1000))
      });
      res.status(202);
      return response.success(res, { ...job, accepted: true });
    }
    const result = await runWorkflowPreview({
      workflowId,
      workflows,
      input: input || {},
      provider,
      config,
      maxSteps: 100,
      maxLoopIterations: 20,
      timeoutMs: Math.min(180000, Math.max(30000, config.deepseek.timeoutMs + 30000))
    });
    response.success(res, { ...result, version: workflow.version });
  } catch (error) {
    if (error.code === 'WORKFLOW_RUN_QUEUE_FULL') {
      return response.failure(res, 429, error.message, error.code);
    }
    if (error.code === 'WORKFLOW_RUN_TIMEOUT') {
      return response.failure(res, 504, error.message, error.code, {
        runId: error.runId,
        workflowId: error.workflowId,
        status: 'failed',
        durationMs: error.durationMs,
        trace: error.workflowTrace || []
      });
    }
    if (error.workflowTrace) {
      return response.failure(res, 422, error.message, 'WORKFLOW_RUN_FAILED', {
        runId: error.runId,
        workflowId: error.workflowId,
        status: 'failed',
        durationMs: error.durationMs,
        trace: error.workflowTrace
      });
    }
    next(error);
  }
});

router.get('/:id/run/:runId', (req, res) => {
  const job = workflowRunJobs.get(req.params.runId);
  if (!job || job.workflowId !== req.params.id) {
    return response.failure(res, 404, 'WORKFLOW_RUN_NOT_FOUND', 'WORKFLOW_RUN_NOT_FOUND');
  }
  return response.success(res, workflowRunJobs.view(job));
});

router.post('/:id/run/:runId/cancel', (req, res) => {
  const job = workflowRunJobs.get(req.params.runId);
  if (!job || job.workflowId !== req.params.id) {
    return response.failure(res, 404, 'WORKFLOW_RUN_NOT_FOUND', 'WORKFLOW_RUN_NOT_FOUND');
  }
  return response.success(res, workflowRunJobs.cancel(req.params.runId));
});

router.put('/:id', async (req, res, next) => {
  try {
    response.success(res, await store.saveWorkflow({ ...req.body, id: req.params.id }));
  } catch (error) {
    if (error.code === 'WORKFLOW_VALIDATION_FAILED') return response.failure(res, 400, error.message, error.code, error.details);
    next(error);
  }
});

router.post('/:id/publish', async (req, res, next) => {
  try {
    const workflow = await store.publishWorkflow(req.params.id);
    if (!workflow) return response.failure(res, 404, '工作流不存在', 'WORKFLOW_NOT_FOUND');
    response.success(res, workflow);
  } catch (error) {
    if (error.code === 'WORKFLOW_VALIDATION_FAILED') return response.failure(res, 400, error.message, error.code, error.details);
    next(error);
  }
});

router.post('/:id/archive', async (req, res, next) => {
  try {
    response.success(res, await store.archiveWorkflow(req.params.id));
  } catch (error) {
    if (error.code === 'ACTIVE_WORKFLOW_REQUIRED') return response.failure(res, 400, error.message, error.code);
    if (error.code === 'WORKFLOW_REFERENCED') return response.failure(res, 409, error.message, error.code, error.details);
    next(error);
  }
});

module.exports = router;
