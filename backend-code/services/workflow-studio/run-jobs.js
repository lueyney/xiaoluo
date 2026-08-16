const crypto = require('crypto');
const { runWorkflowPreview } = require('../writing-workflow/visual-runtime');

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const MAX_JOBS = Math.min(5000, Math.max(100, Number.parseInt(process.env.WORKFLOW_RUN_MAX_JOBS || '1000', 10) || 1000));
const CONCURRENCY = Math.min(500, Math.max(1, Number.parseInt(process.env.WORKFLOW_RUN_CONCURRENCY || '4', 10) || 4));
const JOB_TTL_MS = Math.max(10 * 60 * 1000, Number.parseInt(process.env.WORKFLOW_RUN_JOB_TTL_MS || String(60 * 60 * 1000), 10) || 60 * 60 * 1000);

const jobs = new Map();
const queue = [];
let active = 0;

function now() { return new Date().toISOString(); }

function traceCount(trace) {
  return Array.isArray(trace) ? trace.length : 0;
}

function estimateSteps(workflowId, workflows, seen = new Set()) {
  if (seen.has(workflowId)) return 0;
  const workflow = (workflows || []).find((item) => item.id === workflowId);
  if (!workflow) return 0;
  const nextSeen = new Set(seen).add(workflowId);
  return (workflow.nodes || []).filter((node) => node.type !== 'start').reduce((total, node) => {
    if (!['subworkflow', 'loop'].includes(node.type)) return total + 1;
    const child = estimateSteps(node.data && node.data.workflowId, workflows, nextSeen);
    if (node.type === 'loop') {
      const iterations = Math.min(20, Math.max(1, Number.parseInt(node.data && node.data.maxIterations, 10) || 1));
      return total + 1 + child * iterations;
    }
    return total + 1 + child;
  }, 0);
}

function cleanError(error) {
  return String(error && error.message ? error.message : error || 'Workflow run failed')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .slice(0, 1000);
}

function view(job) {
  return {
    runId: job.id,
    workflowId: job.workflowId,
    status: job.status,
    progress: { ...job.progress },
    trace: Array.isArray(job.trace) ? job.trace.slice() : [],
    values: job.values || {},
    output: job.output,
    error: job.error || null,
    createdAt: job.createdAt,
    startedAt: job.startedAt || null,
    completedAt: job.completedAt || null,
    durationMs: job.durationMs || (job.startedAt ? Date.now() - Date.parse(job.startedAt) : 0),
    cancelRequested: Boolean(job.cancelRequested)
  };
}

function expire(job) {
  const timer = setTimeout(() => {
    if (TERMINAL_STATUSES.has(job.status)) jobs.delete(job.id);
    else expire(job);
  }, JOB_TTL_MS);
  if (timer.unref) timer.unref();
}

function pump() {
  while (active < CONCURRENCY && queue.length) {
    const job = queue.shift();
    if (!job || job.status !== 'queued') continue;
    active += 1;
    run(job).finally(() => {
      active = Math.max(0, active - 1);
      pump();
    });
  }
}

async function run(job) {
  if (job.cancelRequested) {
    job.status = 'cancelled';
    job.completedAt = now();
    return;
  }
  job.status = 'running';
  job.startedAt = now();
  job.progress.message = 'Workflow is running';
  try {
    const result = await runWorkflowPreview({
      workflowId: job.workflowId,
      workflows: job.workflows,
      input: { ...job.input, traceId: job.id },
      provider: job.provider,
      config: job.config,
      maxSteps: job.maxSteps,
      maxLoopIterations: job.maxLoopIterations,
      timeoutMs: job.timeoutMs,
      shouldCancel: () => job.cancelRequested,
      onTrace: (entry) => {
        if (job.cancelRequested) return;
        job.trace.push(entry);
        job.progress.completed = traceCount(job.trace);
        job.progress.message = `Completed ${job.progress.completed}${job.progress.total ? `/${job.progress.total}` : ''} nodes`;
      }
    });
    job.trace = Array.isArray(result.trace) ? result.trace : job.trace;
    job.values = result.values || {};
    job.output = result.output;
    job.progress.completed = traceCount(job.trace);
    job.progress.message = job.cancelRequested ? 'Run cancelled after the active request completed' : 'Workflow completed';
    job.status = job.cancelRequested ? 'cancelled' : 'completed';
  } catch (error) {
    job.error = cleanError(error);
    job.trace = Array.isArray(error.workflowTrace) ? error.workflowTrace : job.trace;
    job.progress.completed = traceCount(job.trace);
    job.progress.message = job.cancelRequested ? 'Run cancelled' : 'Workflow failed';
    job.status = job.cancelRequested ? 'cancelled' : 'failed';
  } finally {
    job.completedAt = now();
    job.durationMs = Date.parse(job.completedAt) - Date.parse(job.startedAt || job.completedAt);
  }
}

function enqueue(options) {
  if (jobs.size >= MAX_JOBS) {
    const oldest = jobs.values().next().value;
    if (oldest && TERMINAL_STATUSES.has(oldest.status)) jobs.delete(oldest.id);
  }
  if (jobs.size >= MAX_JOBS) {
    const error = new Error('Workflow run queue is full');
    error.code = 'WORKFLOW_RUN_QUEUE_FULL';
    throw error;
  }
  const id = String(options.runId || crypto.randomUUID());
  const total = Math.max(0, estimateSteps(options.workflowId, options.workflows));
  const job = {
    id,
    workflowId: options.workflowId,
    workflows: options.workflows,
    input: options.input || {},
    provider: options.provider,
    config: options.config,
    maxSteps: options.maxSteps || 500,
    maxLoopIterations: options.maxLoopIterations || 20,
    timeoutMs: options.timeoutMs || 15 * 60 * 1000,
    status: 'queued',
    progress: { completed: 0, total, message: 'Run queued' },
    trace: [],
    values: {},
    output: undefined,
    error: null,
    cancelRequested: false,
    createdAt: now(),
    startedAt: null,
    completedAt: null,
    durationMs: 0
  };
  jobs.set(id, job);
  queue.push(job);
  expire(job);
  pump();
  return view(job);
}

function get(runId) { return jobs.get(String(runId || '')) || null; }

function cancel(runId) {
  const job = get(runId);
  if (!job) return null;
  if (TERMINAL_STATUSES.has(job.status)) return view(job);
  job.cancelRequested = true;
  if (job.status === 'queued') {
    job.status = 'cancelled';
    job.completedAt = now();
    job.progress.message = 'Run cancelled before start';
  }
  return view(job);
}

module.exports = { CONCURRENCY, enqueue, get, cancel, view };
