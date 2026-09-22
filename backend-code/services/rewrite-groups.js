function groupRewriteTasks(tasks, size = 5) {
  const groupSize = Math.max(1, Number.parseInt(size, 10) || 5);
  const groups = [];
  for (let offset = 0; offset < tasks.length; offset += groupSize) {
    groups.push(tasks.slice(offset, offset + groupSize));
  }
  return groups;
}

function buildChainedRewriteContext(sentences, results, task, previousSuccessfulTasks = []) {
  const idx = task.idx;
  const currentSentence = sentences[idx];
  const currentSourceIndex = Number.isInteger(task.sourceIndex) ? task.sourceIndex : idx;
  const history = Array.isArray(previousSuccessfulTasks)
    ? previousSuccessfulTasks
    : (previousSuccessfulTasks ? [previousSuccessfulTasks] : []);
  const previousRewrittenSentences = [];
  let expectedIdx = currentSourceIndex - 1;
  for (let offset = history.length - 1; offset >= 0 && previousRewrittenSentences.length < 2; offset -= 1) {
    const previousTask = history[offset];
    const previousSource = sentences[previousTask.idx];
    const previousSourceIndex = Number.isInteger(previousTask.sourceIndex) ? previousTask.sourceIndex : previousTask.idx;
    if (!previousSource || !currentSentence || previousSource.pIdx !== currentSentence.pIdx || previousSourceIndex !== expectedIdx) break;
    const rewritten = results[previousTask.idx];
    if (!rewritten || rewritten === previousSource.text) break;
    previousRewrittenSentences.unshift(rewritten);
    expectedIdx -= 1;
  }
  return {
    previousRewrittenSentences,
    promptVariant: task.promptVariant
  };
}

function groupRewriteTasksByParagraph(tasks) {
  const groups = [];
  let current = [];
  let currentParagraph = null;
  for (const task of tasks) {
    const paragraph = task && task.sentObj ? task.sentObj.pIdx : null;
    if (current.length && paragraph !== currentParagraph) {
      groups.push(current);
      current = [];
    }
    currentParagraph = paragraph;
    current.push(task);
  }
  if (current.length) groups.push(current);
  return groups;
}

module.exports = {
  groupRewriteTasks,
  groupRewriteTasksByParagraph,
  buildChainedRewriteContext
};
