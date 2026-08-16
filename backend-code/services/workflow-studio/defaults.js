const MAIN_WORKFLOW_ID = 'academic-writing-main';

function writingNodes(workflowName = '通用论文写作') {
  return [
    {
      id: 'start', type: 'start', position: { x: 100, y: 220 },
      data: { label: '开始', description: '接收题目、专业、类型与写作要求' }
    },
    {
      id: 'write', type: 'llm', position: { x: 410, y: 220 },
      data: {
        label: 'DeepSeek 写作', description: '按照当前工作流提示词生成论文内容',
        action: 'chat', promptMode: 'inline', model: 'deepseek-chat', temperature: 0.55, maxTokens: 8192,
        responseMode: 'text',
        systemPrompt: `你正在执行“${workflowName}”工作流。请以专业、严谨、结构清晰的学术语言完成写作任务，直接输出可用正文。`,
        userPrompt: '题目：{{input.topic}}\n专业：{{input.field}}\n文档类型：{{input.docType}}\n目标说明：{{input.description}}\n写作要求：{{input.requirements}}\n建议篇幅：{{input.defaultTargetWords}}字\n\n请根据以上信息完成写作。'
      }
    },
    {
      id: 'finish', type: 'output', position: { x: 740, y: 220 },
      data: { label: '输出结果', description: '返回本次工作流生成的内容' }
    }
  ];
}

function writingEdges() {
  return [
    { id: 'e-start-write', source: 'start', target: 'write' },
    { id: 'e-write-finish', source: 'write', target: 'finish' }
  ];
}

function createDefaultWorkflows() {
  return [{
    id: MAIN_WORKFLOW_ID,
    name: '通用论文写作',
    description: '可自由修改节点、提示词与模型参数的通用论文写作工作流。',
    status: 'published',
    version: 1,
    updatedAt: new Date().toISOString(),
    nodes: writingNodes(),
    edges: writingEdges()
  }];
}

module.exports = { MAIN_WORKFLOW_ID, createDefaultWorkflows, writingEdges, writingNodes };
