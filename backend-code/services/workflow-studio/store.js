const fs = require('fs/promises');
const path = require('path');
const { createDefaultWorkflows, MAIN_WORKFLOW_ID } = require('./defaults');
const { normalizeWorkflow } = require('./schema');
const { validateWorkflowCollection, validateWorkflowDraftCollection } = require('./validator');

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'workflow-studio.json');

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch (_) {
    await fs.writeFile(DATA_FILE, JSON.stringify({ activeWorkflowId: MAIN_WORKFLOW_ID, workflows: createDefaultWorkflows() }, null, 2), 'utf8');
  }
}

async function readStore() {
  await ensureStore();
  const source = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(source);
  const workflows = Array.isArray(parsed.workflows) ? parsed.workflows.map((item) => ({
    ...normalizeWorkflow(item),
    publishedSnapshot: item.publishedSnapshot
      ? normalizeWorkflow({ ...item.publishedSnapshot, status: 'published' })
      : undefined
  })) : [];
  return {
    activeWorkflowId: String(parsed.activeWorkflowId || '').trim() || (workflows.some((workflow) => workflow.id === MAIN_WORKFLOW_ID) ? MAIN_WORKFLOW_ID : workflows[0]?.id || ''),
    workflows
  };
}

async function writeStore(store) {
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function listWorkflows() {
  const store = await readStore();
  return store.workflows.filter((workflow) => !workflow.archived).map((workflow) => ({ ...workflow, isActive: workflow.id === store.activeWorkflowId }));
}

async function listAllWorkflows() {
  const store = await readStore();
  return store.workflows.map((workflow) => ({ ...workflow, isActive: workflow.id === store.activeWorkflowId }));
}

async function listPublishedWorkflows() {
  return (await listWorkflows()).map((workflow) => workflow.publishedSnapshot || (workflow.status === 'published' ? workflow : null)).filter(Boolean);
}

function publishedVersion(workflow) {
  return workflow.publishedSnapshot || (workflow.status === 'published' ? workflow : null);
}

function buildPublishedCollectionFor(workflows, targetIndex) {
  const target = normalizeWorkflow({ ...workflows[targetIndex], status: 'published', publishedSnapshot: undefined });
  return workflows
    .map((workflow, index) => index === targetIndex ? target : publishedVersion(workflow))
    .filter(Boolean);
}

async function getWorkflow(id) {
  return (await listAllWorkflows()).find((workflow) => workflow.id === id) || null;
}

async function getActiveWorkflowId() {
  return (await readStore()).activeWorkflowId;
}

async function saveWorkflow(input) {
  const store = await readStore();
  const workflow = normalizeWorkflow(input);
  const index = store.workflows.findIndex((item) => item.id === workflow.id);
  const previous = index >= 0 ? store.workflows[index] : null;
  workflow.version = previous ? previous.version + 1 : 1;
  workflow.updatedAt = new Date().toISOString();
  workflow.status = 'draft';
  workflow.publishedSnapshot = previous && previous.publishedSnapshot
    ? previous.publishedSnapshot
    : previous && previous.status === 'published'
      ? normalizeWorkflow(previous)
      : undefined;
  const candidate = previous
    ? store.workflows.map((item) => item.id === workflow.id ? workflow : item)
    : store.workflows.concat(workflow);
  // Saving is versioned draft persistence. Keep it safe at the data and
  // dependency level, but allow a graph to be incomplete while the user is
  // still composing nodes and edges. Publish/run perform strict validation.
  const validation = validateWorkflowDraftCollection(candidate);
  if (!validation.valid) {
    const error = new Error('工作流校验失败');
    error.code = 'WORKFLOW_VALIDATION_FAILED';
    error.details = validation;
    throw error;
  }
  store.workflows = candidate;
  if (!store.activeWorkflowId) store.activeWorkflowId = workflow.id;
  await writeStore(store);
  return { ...workflow, isActive: workflow.id === store.activeWorkflowId };
}

async function archiveWorkflow(id) {
  const store = await readStore();
  const target = store.workflows.find((workflow) => workflow.id === id);
  if (!target) return null;

  // A workflow that is still referenced by an active (non-archived) parent
  // cannot be archived safely. `listWorkflows()` intentionally omits archived
  // entries, so archiving a referenced child would make the parent fail at
  // compile/run time with a misleading "workflow not found" error. Surface the
  // dependency and let the caller archive/update the parent first.
  const references = store.workflows
    .filter((workflow) => workflow.id !== id && !workflow.archived)
    .flatMap((workflow) => workflow.nodes
      .filter((node) => ['subworkflow', 'loop'].includes(node.type)
        && String(node.data && node.data.workflowId || '').trim() === id)
      .map((node) => ({
        workflowId: workflow.id,
        workflowName: workflow.name,
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: node.data && node.data.label
      })));
  if (references.length) {
    const error = new Error('工作流仍被其他工作流引用，无法归档');
    error.code = 'WORKFLOW_REFERENCED';
    error.details = { workflowId: id, references };
    throw error;
  }

  if (target.id === store.activeWorkflowId) {
    const fallback = store.workflows.find((workflow) => workflow.id !== id && !workflow.archived && workflow.status === 'published');
    if (!fallback) {
      const error = new Error('当前使用中的工作流不能归档，请先启用另一套工作流');
      error.code = 'ACTIVE_WORKFLOW_REQUIRED';
      throw error;
    }
    store.activeWorkflowId = fallback.id;
  }
  target.archived = true;
  target.updatedAt = new Date().toISOString();
  await writeStore(store);
  return { ...target, isActive: false };
}

async function publishWorkflow(id) {
  const store = await readStore();
  const index = store.workflows.findIndex((workflow) => workflow.id === id);
  if (index < 0) return null;
  const publishedCollection = buildPublishedCollectionFor(store.workflows, index);
  const validation = validateWorkflowCollection(publishedCollection);
  if (!validation.valid) {
    const error = new Error('发布前校验失败');
    error.code = 'WORKFLOW_VALIDATION_FAILED';
    error.details = validation;
    throw error;
  }
  store.workflows[index] = {
    ...store.workflows[index],
    status: 'published',
    version: store.workflows[index].version + 1,
    updatedAt: new Date().toISOString()
  };
  store.workflows[index].publishedSnapshot = normalizeWorkflow({ ...store.workflows[index], status: 'published', publishedSnapshot: undefined });
  store.activeWorkflowId = id;
  await writeStore(store);
  return { ...store.workflows[index], isActive: true };
}

module.exports = { DATA_FILE, archiveWorkflow, buildPublishedCollectionFor, ensureStore, getActiveWorkflowId, getWorkflow, listAllWorkflows, listPublishedWorkflows, listWorkflows, publishWorkflow, readStore, saveWorkflow };
