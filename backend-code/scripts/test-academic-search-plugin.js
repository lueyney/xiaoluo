const assert = require('assert');
const axios = require('axios');
const { searchAcademic } = require('../services/writing-workflow/plugins/academic-search');
const { createWorkflowHandlers } = require('../services/writing-workflow/visual-runtime');
const { compileWorkflow } = require('../services/workflow-studio/compiler');

async function main() {
  const originalGet = axios.get;
  try {
    axios.get = async (url) => {
      if (url.includes('semanticscholar')) {
        return { data: { total: 1, data: [{ paperId: 's1', title: 'Semantic paper', abstract: 'Abstract', authors: [{ name: 'A' }], year: 2024, externalIds: { DOI: '10.1/s1' }, url: 'https://example.test/s1', citationCount: 7 }] } };
      }
      if (url.includes('openalex')) {
        return { data: { meta: { count: 1 }, results: [{ id: 'https://openalex.org/W1', display_name: 'OpenAlex paper', abstract_inverted_index: { Useful: [0], abstract: [1] }, authorships: [{ author: { display_name: 'Open Author' } }], publication_year: 2025, publication_date: '2025-02-03', doi: 'https://doi.org/10.1/o1', primary_location: { source: { display_name: 'Open Journal' }, landing_page_url: 'https://example.test/o1' }, cited_by_count: 9 }] } };
      }
      if (url.includes('arxiv')) {
        return { data: '<?xml version="1.0"?><feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><opensearch:totalResults>1</opensearch:totalResults><entry><id>http://arxiv.org/abs/1</id><title>Arxiv paper</title><summary>Summary</summary><published>2023-01-01T00:00:00Z</published><author><name>B</name></author><link title="pdf" type="application/pdf" href="http://arxiv.org/pdf/1"/></entry></feed>' };
      }
      return { data: { message: { 'total-results': 1, items: [{ DOI: '10.1/c1', title: ['Crossref paper'], abstract: '<jats:p>Crossref abstract</jats:p>', author: [{ given: 'C', family: 'D' }], published: { 'date-parts': [[2022]] }, URL: 'https://doi.org/10.1/c1', 'container-title': ['Journal'], 'is-referenced-by-count': 3 }] } } };
    };

    const semantic = await searchAcademic({ provider: 'semanticScholar', key: 'secret-key', input: 'semantic', count: 1 });
    assert.strictEqual(semantic.items[0].doi, '10.1/s1');
    assert.strictEqual(semantic.items[0].authors[0], 'A');

    const openalex = await searchAcademic({ input: 'openalex', count: 1 });
    assert.strictEqual(openalex.provider, 'openalex');
    assert.strictEqual(openalex.items[0].id, 'W1');
    assert.strictEqual(openalex.items[0].summary, 'Useful abstract');
    assert.strictEqual(openalex.items[0].doi, '10.1/o1');
    assert.strictEqual(openalex.items[0].authors[0], 'Open Author');

    const arxiv = await searchAcademic({ provider: 'arxiv', input: 'arxiv', count: 1 });
    assert.strictEqual(arxiv.items[0].id, 'http://arxiv.org/abs/1');
    assert.strictEqual(arxiv.items[0].link, 'http://arxiv.org/pdf/1');

    const crossref = await searchAcademic({ provider: 'crossref', input: 'crossref', count: 1 });
    assert.strictEqual(crossref.items[0].journal, 'Journal');
    assert.strictEqual(crossref.items[0].summary, 'Crossref abstract');

    const workflow = {
      id: 'academic-plugin-test', name: 'academic plugin test', status: 'published', variableMode: 'explicit-v2', version: 1,
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'start' } },
        { id: 'search', type: 'plugin', position: { x: 180, y: 0 }, data: { label: 'search', plugin: 'academicSearch', provider: 'semanticScholar', key: 'secret-key', input: '{{input.query}}', count: 1 } },
        { id: 'finish', type: 'output', position: { x: 360, y: 0 }, data: { label: 'finish' } }
      ],
      edges: [{ id: 'e1', source: 'start', target: 'search' }, { id: 'e2', source: 'search', target: 'finish' }]
    };
    const result = await compileWorkflow('academic-plugin-test', [workflow], createWorkflowHandlers({ config: { academicSearch: { timeoutMs: 1000, maxResults: 20 } } })).invoke({ input: { query: 'test' } });
    assert.strictEqual(result.output.items[0].id, 's1');
    assert.ok(!JSON.stringify(result.trace).includes('secret-key'));

    process.stdout.write('academic search plugin test: ok\n');
  } finally {
    axios.get = originalGet;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
