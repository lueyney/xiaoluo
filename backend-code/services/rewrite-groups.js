function groupRewriteTasks(tasks, size = 4) {
  const groupSize = Math.max(1, Number.parseInt(size, 10) || 4);
  const groups = [];
  for (let offset = 0; offset < tasks.length; offset += groupSize) {
    groups.push(tasks.slice(offset, offset + groupSize));
  }
  return groups;
}

function buildChainedRewriteContext(sentences, results, task, previousSuccessfulTask = null) {
  const idx = task.idx;
  const currentSentence = sentences[idx];
  const previousSource = idx > 0 ? sentences[idx - 1] : null;
  const sameParagraph = previousSource && currentSentence && previousSource.pIdx === currentSentence.pIdx;
  const previousRewrittenSentence = sameParagraph && previousSuccessfulTask && previousSuccessfulTask.idx === idx - 1
    ? results[previousSuccessfulTask.idx]
    : '';
  return {
    previousRewrittenSentence,
    promptVariant: task.promptVariant
  };
}

module.exports = { groupRewriteTasks, buildChainedRewriteContext };
