const { MAIN_WORKFLOW_ID, createDefaultWorkflows } = require('../services/workflow-studio/defaults');
const store = require('../services/workflow-studio/store');

async function main() {
  const current = await store.getWorkflow(MAIN_WORKFLOW_ID);
  const generic = createDefaultWorkflows()[0];
  const saved = await store.saveWorkflow({
    ...generic,
    version: current?.version || generic.version,
    updatedAt: current?.updatedAt || generic.updatedAt
  });
  const active = await store.publishWorkflow(saved.id);
  process.stdout.write(JSON.stringify({
    activeWorkflowId: active.id,
    name: active.name,
    version: active.version,
    archivedWorkflowIds: ['academic-section-pipeline', 'academic-section-writer']
  }, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
