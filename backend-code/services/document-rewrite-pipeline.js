/**
 * Thin document adapter around the canonical AI rewrite pipeline.
 *
 * PDF parsing only decides which Word sentence indexes are eligible. Model,
 * prompt, grouping, context, retry and fallback behavior remain owned by
 * rewriteSentences(), exactly as they are for the normal AI rewrite route.
 */

function buildDocumentRewriteInput(sourceSentences, selectedIndexes) {
  const selected = selectedIndexes instanceof Set
    ? selectedIndexes
    : new Set(Array.isArray(selectedIndexes) ? selectedIndexes : []);
  const sourceIndexes = Array.from(selected)
    .filter((index) => Number.isInteger(index) && index >= 0 && index < sourceSentences.length)
    .sort((left, right) => left - right);
  return {
    sourceIndexes,
    // Keep the source index on each projected sentence. The document request
    // only sends selected text to AI, while the shared pipeline can still
    // preserve paragraph adjacency for rewritten-context construction.
    sentences: sourceIndexes.map((index) => ({ ...sourceSentences[index], sourceIndex: index }))
  };
}

async function rewriteDocumentSelection(pipeline, sourceSentences, selectedIndexes, onResult) {
  if (!pipeline || typeof pipeline.rewriteSentences !== 'function') {
    const error = new Error('现有 AI 降重处理管线未配置');
    error.code = 'DOCUMENT_REWRITE_AI_NOT_CONFIGURED';
    throw error;
  }

  const rewriteInput = buildDocumentRewriteInput(sourceSentences, selectedIndexes);
  // Intentionally pass no document-owned model, prompt, version, scheme,
  // batching, concurrency, retry or fallback settings. The shared AI rewrite
  // entry point is the single source of truth for all of them.
  const outcome = await pipeline.rewriteSentences(rewriteInput.sentences, {
    onResult: (text, selectedIndex, sentence, failed, metadata) => {
      if (onResult) onResult(text, rewriteInput.sourceIndexes[selectedIndex], sentence, failed, metadata);
    }
  });
  const results = sourceSentences.map((sentence) => sentence.text);
  rewriteInput.sourceIndexes.forEach((sourceIndex, selectedIndex) => {
    if (outcome.results[selectedIndex] != null) results[sourceIndex] = outcome.results[selectedIndex];
  });
  return { ...outcome, results };
}

module.exports = {
  buildDocumentRewriteInput,
  rewriteDocumentSelection
};
