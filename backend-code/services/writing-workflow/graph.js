const { Annotation, END, START, StateGraph } = require('@langchain/langgraph');
const { buildPlanningMessages, buildSectionMessages } = require('./prompts');
const { clamp, countWords, parseTargetWords } = require('./utils');

const WritingState = Annotation.Root({
  topic: Annotation(),
  field: Annotation(),
  docType: Annotation(),
  requirements: Annotation(),
  description: Annotation(),
  defaultTargetWords: Annotation(),
  targetWords: Annotation(),
  traceId: Annotation(),
  plan: Annotation(),
  currentSectionIndex: Annotation(),
  sections: Annotation({
    reducer: (left, right) => (right === undefined ? left : right),
    default: () => []
  }),
  content: Annotation(),
  wordCount: Annotation(),
  steps: Annotation({
    reducer: (left, right) => left.concat(right || []),
    default: () => []
  })
});

function normalizePlan(rawPlan, input) {
  const sourceSections = Array.isArray(rawPlan && rawPlan.sections) ? rawPlan.sections : [];
  const sections = sourceSections
    .slice(0, input.maxSections)
    .map((section, index) => ({
      heading: String(section.heading || `第${index + 1}部分`).trim(),
      purpose: String(section.purpose || '完成本节写作任务').trim(),
      keyPoints: Array.isArray(section.keyPoints)
        ? section.keyPoints.map((point) => String(point).trim()).filter(Boolean).slice(0, 8)
        : [],
      targetWords: clamp(Number.parseInt(section.targetWords, 10) || 0, 250, 2400)
    }))
    .filter((section) => section.heading);

  if (sections.length < 2) {
    throw new Error('DeepSeek 返回的文档计划章节不足');
  }

  const currentTotal = sections.reduce((sum, section) => sum + section.targetWords, 0) || 1;
  const scale = input.targetWords / currentTotal;
  sections.forEach((section) => {
    section.targetWords = clamp(Math.round(section.targetWords * scale), 250, 2400);
  });

  return {
    title: String(rawPlan.title || input.topic).trim(),
    thesis: String(rawPlan.thesis || `围绕“${input.topic}”展开`).trim(),
    audience: String(rawPlan.audience || '高校师生').trim(),
    sections
  };
}

function createWritingGraph({ provider, config }) {
  const graph = new StateGraph(WritingState)
    .addNode('prepareInput', async (state) => ({
      targetWords: parseTargetWords(
        state.requirements,
        state.defaultTargetWords,
        config.minTargetWords,
        config.maxTargetWords
      ),
      currentSectionIndex: 0,
      sections: [],
      steps: [{ name: 'prepare', status: 'completed', durationMs: 0 }]
    }))
    .addNode('planDocument', async (state) => {
      const startedAt = Date.now();
      const response = await provider.plan({
        messages: buildPlanningMessages({
          ...state,
          maxSections: config.maxSections
        }),
        traceId: state.traceId
      });
      return {
        plan: normalizePlan(response.data, {
          ...state,
          maxSections: config.maxSections
        }),
        steps: [{
          name: 'plan',
          status: 'completed',
          durationMs: Date.now() - startedAt,
          model: response.model,
          usage: response.usage
        }]
      };
    })
    .addNode('draftSection', async (state) => {
      const startedAt = Date.now();
      const sectionIndex = state.currentSectionIndex;
      const currentSection = state.plan.sections[sectionIndex];
      const response = await provider.draftSection({
        messages: buildSectionMessages({
          ...state,
          currentSection
        }),
        traceId: state.traceId,
        sectionIndex
      });
      return {
        sections: state.sections.concat({
          heading: currentSection.heading,
          content: response.content.trim()
        }),
        currentSectionIndex: sectionIndex + 1,
        steps: [{
          name: `draft:${sectionIndex + 1}`,
          status: 'completed',
          durationMs: Date.now() - startedAt,
          model: response.model,
          usage: response.usage
        }]
      };
    })
    .addNode('assemble', async (state) => {
      const content = [
        `# ${state.plan.title}`,
        '',
        ...state.sections.flatMap((section) => [section.content, ''])
      ].join('\n').trim();
      return {
        content,
        wordCount: countWords(content),
        steps: [{ name: 'assemble', status: 'completed', durationMs: 0 }]
      };
    })
    .addEdge(START, 'prepareInput')
    .addEdge('prepareInput', 'planDocument')
    .addEdge('planDocument', 'draftSection')
    .addConditionalEdges(
      'draftSection',
      (state) => state.currentSectionIndex < state.plan.sections.length ? 'continue' : 'complete',
      { continue: 'draftSection', complete: 'assemble' }
    )
    .addEdge('assemble', END);

  return graph.compile();
}

module.exports = { createWritingGraph, normalizePlan };
