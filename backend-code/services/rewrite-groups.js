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
  const history = Array.isArray(previousSuccessfulTasks)
    ? previousSuccessfulTasks
    : (previousSuccessfulTasks ? [previousSuccessfulTasks] : []);
  const previousRewrittenSentences = [];
  let expectedIdx = idx - 1;
  for (let offset = history.length - 1; offset >= 0 && previousRewrittenSentences.length < 2; offset -= 1) {
    const previousTask = history[offset];
    const previousSource = sentences[previousTask.idx];
    if (!previousSource || !currentSentence || previousSource.pIdx !== currentSentence.pIdx || previousTask.idx !== expectedIdx) break;
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

module.exports = { groupRewriteTasks, buildChainedRewriteContext };
