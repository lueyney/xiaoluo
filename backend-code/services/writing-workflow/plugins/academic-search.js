const axios = require('axios');
const { xml2js } = require('xml-js');

const PROVIDERS = new Set(['openalex', 'semanticScholar', 'arxiv', 'crossref']);
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_COUNT = 10;
const MAX_COUNT = 50;

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return String(value._text ?? value._cdata ?? '').trim();
}

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCount(value) {
  const count = Number.parseInt(value, 10);
  return Math.min(MAX_COUNT, Math.max(1, Number.isFinite(count) ? count : DEFAULT_COUNT));
}

function normalizeQuery(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const query = input.query ?? input.search_query ?? input.searchQuery ?? input.topic
      ?? input.title ?? input.keyword ?? input.keywords;
    return {
      query: String(query || '').trim(),
      count: normalizeCount(input.count),
      filter: input.filter || undefined
    };
  }
  return { query: String(input == null ? '' : input).trim(), count: DEFAULT_COUNT };
}

function authorName(author) {
  if (!author) return '';
  if (typeof author === 'string') return author;
  return [author.given, author.family, author.name].filter(Boolean).join(' ').trim();
}

function normalizeSemanticScholar(data, query, count) {
  const items = asArray(data && data.data).slice(0, count).map((paper) => ({
    id: paper.paperId || paper.externalIds?.ArXiv || paper.externalIds?.DOI || '',
    title: paper.title || '',
    summary: paper.abstract || '',
    abstract: paper.abstract || '',
    authors: asArray(paper.authors).map(authorName).filter(Boolean),
    published: paper.year ? String(paper.year) : '',
    year: paper.year || '',
    doi: paper.externalIds?.DOI || '',
    link: paper.openAccessPdf?.url || paper.url || '',
    journal: paper.journal?.name || '',
    citations: paper.citationCount ?? null,
    source: 'semanticScholar'
  }));
  return { provider: 'semanticScholar', query, total: Number(data?.total || items.length), items };
}

function openAlexAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return '';
  return Object.entries(invertedIndex)
    .flatMap(([word, positions]) => asArray(positions).map((position) => ({ word, position: Number(position) })))
    .filter((entry) => Number.isFinite(entry.position))
    .sort((left, right) => left.position - right.position)
    .map((entry) => entry.word)
    .join(' ')
    .trim();
}

function normalizeOpenAlex(data, query, count) {
  const items = asArray(data?.results).slice(0, count).map((paper) => {
    const abstract = openAlexAbstract(paper.abstract_inverted_index);
    const doi = String(paper.doi || '').replace(/^https?:\/\/doi\.org\//i, '');
    const openAlexId = String(paper.id || '').replace(/^https?:\/\/openalex\.org\//i, '');
    const primaryLocation = paper.primary_location || {};
    const openLocation = paper.best_oa_location || {};
    return {
      id: openAlexId || doi,
      title: paper.display_name || paper.title || '',
      summary: abstract,
      abstract,
      authors: asArray(paper.authorships).map((entry) => entry?.author?.display_name).filter(Boolean),
      published: paper.publication_date || (paper.publication_year ? String(paper.publication_year) : ''),
      year: paper.publication_year || '',
      doi,
      link: openLocation.pdf_url || openLocation.landing_page_url || primaryLocation.pdf_url
        || primaryLocation.landing_page_url || paper.doi || paper.id || '',
      journal: primaryLocation.source?.display_name || openLocation.source?.display_name || '',
      citations: paper.cited_by_count ?? null,
      source: 'openalex'
    };
  });
  return { provider: 'openalex', query, total: Number(data?.meta?.count || items.length), items };
}

function normalizeCrossref(data, query, count) {
  const message = data && data.message || {};
  const items = asArray(message.items).slice(0, count).map((paper) => ({
    id: paper.DOI || paper.URL || '',
    title: asArray(paper.title)[0] || '',
    summary: cleanText(asArray(paper.abstract)[0] || ''),
    abstract: cleanText(asArray(paper.abstract)[0] || ''),
    authors: asArray(paper.author).map(authorName).filter(Boolean),
    published: asArray(paper.published?.['date-parts']?.[0]).join('-'),
    year: paper.published?.['date-parts']?.[0]?.[0] || '',
    doi: paper.DOI || '',
    link: paper.URL || '',
    journal: asArray(paper['container-title'])[0] || '',
    citations: paper['is-referenced-by-count'] ?? null,
    source: 'crossref'
  }));
  return { provider: 'crossref', query, total: Number(message['total-results'] || items.length), items };
}

function normalizeArxiv(xml, query, count) {
  let document;
  try { document = xml2js(String(xml || ''), { compact: true, nativeType: false }); }
  catch (error) { throw new Error(`arXiv 返回了无法解析的 XML：${error.message}`); }
  const feed = document && document.feed || {};
  const entries = asArray(feed.entry).slice(0, count);
  const items = entries.map((entry) => {
    const links = asArray(entry.link);
    const pdf = links.find((link) => link?._attributes?.type === 'application/pdf');
    const alternate = links.find((link) => link?._attributes?.rel === 'alternate');
    return {
      id: textValue(entry.id),
      title: cleanText(textValue(entry.title)),
      summary: cleanText(textValue(entry.summary)),
      abstract: cleanText(textValue(entry.summary)),
      authors: asArray(entry.author).map((author) => cleanText(textValue(author?.name))).filter(Boolean),
      published: textValue(entry.published),
      year: textValue(entry.published).slice(0, 4),
      doi: textValue(entry.doi),
      link: pdf?._attributes?.href || alternate?._attributes?.href || textValue(entry.id),
      journal: textValue(entry.journal_ref),
      citations: null,
      source: 'arxiv'
    };
  });
  const total = Number(textValue(feed['opensearch:totalResults']) || items.length);
  return { provider: 'arxiv', query, total, items };
}

function providerError(provider, error) {
  const status = error?.response?.status;
  const detail = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'request failed';
  const suffix = status ? ` (HTTP ${status})` : '';
  return new Error(`学术检索 ${provider} 失败${suffix}: ${String(detail).slice(0, 300)}`);
}

async function searchAcademic({ provider = 'openalex', key = '', input, count, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const selectedProvider = String(provider || 'openalex').trim();
  if (!PROVIDERS.has(selectedProvider)) throw new Error(`不支持的学术 API：${selectedProvider}`);
  const normalized = normalizeQuery(input);
  const query = normalized.query;
  if (!query) throw new Error('学术检索需要关键词输入');
  const limit = normalizeCount(count ?? normalized.count);
  const apiKey = String(key || '').trim();
  const timeout = Math.min(120000, Math.max(1000, Number.parseInt(timeoutMs, 10) || DEFAULT_TIMEOUT_MS));

  try {
    if (selectedProvider === 'openalex') {
      const response = await axios.get('https://api.openalex.org/works', {
        params: {
          search: query,
          'per-page': limit,
          ...(normalized.filter ? { filter: normalized.filter } : {}),
          ...(apiKey ? { api_key: apiKey } : {})
        },
        headers: { 'User-Agent': 'LunjunWorkflow/1.0 (mailto:admin@localhost)' },
        timeout
      });
      return normalizeOpenAlex(response.data, query, limit);
    }

    if (selectedProvider === 'semanticScholar') {
      const response = await axios.get('https://api.semanticscholar.org/graph/v1/paper/search', {
        params: {
          query,
          limit,
          fields: 'paperId,title,abstract,authors,year,externalIds,url,openAccessPdf,journal,citationCount'
        },
        headers: apiKey ? { 'x-api-key': apiKey } : undefined,
        timeout
      });
      return normalizeSemanticScholar(response.data, query, limit);
    }

    if (selectedProvider === 'crossref') {
      const response = await axios.get('https://api.crossref.org/works', {
        params: { query: normalized.filter || query, rows: limit, select: 'DOI,title,abstract,author,published,URL,container-title,is-referenced-by-count' },
        headers: { 'User-Agent': 'LunjunWorkflow/1.0 (mailto:admin@localhost)' },
        timeout
      });
      return normalizeCrossref(response.data, query, limit);
    }

    const response = await axios.get('https://export.arxiv.org/api/query', {
      params: { search_query: `all:${query}`, start: 0, max_results: limit, sortBy: 'relevance', sortOrder: 'descending' },
      timeout,
      headers: { Accept: 'application/atom+xml' }
    });
    return normalizeArxiv(response.data, query, limit);
  } catch (error) {
    throw providerError(selectedProvider, error);
  }
}

module.exports = { MAX_COUNT, PROVIDERS, searchAcademic };
