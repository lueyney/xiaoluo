const store = require('../services/workflow-studio/store');
const { ROUTER_ID, ROUTES } = require('./install-creation-router');

async function main() {
  const published = [];
  const orderedIds = [
    'coze-paper-literature-search',
    'coze-workwenxian-literature-search',
    ...Array.from(new Set(ROUTES.map((route) => route.workflowId))),
    ROUTER_ID
  ];
  for (const id of Array.from(new Set(orderedIds))) {
    const workflow = await store.getWorkflow(id);
    if (!workflow) throw new Error(`待发布工作流不存在：${id}`);
    const saved = await store.publishWorkflow(id);
    published.push({ id: saved.id, name: saved.name, version: saved.version });
  }
  process.stdout.write(`${JSON.stringify({ published, activeWorkflowId: await store.getActiveWorkflowId() }, null, 2)}\n`);
}
if (require.main === module) main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
