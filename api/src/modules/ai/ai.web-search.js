'use strict';

/**
 * Best-effort public web search for the assistant deep-research tool.
 * Prefers Brave Search when BRAVE_SEARCH_API_KEY is set; otherwise DuckDuckGo Instant Answer.
 */

async function searchBrave(query) {
  const key = (process.env.BRAVE_SEARCH_API_KEY || '').trim();
  if (!key) return null;

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': key,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    const err = new Error(text || `Brave search failed (${response.status})`);
    err.statusCode = response.status;
    throw err;
  }
  const data = JSON.parse(text);
  const results = (data.web?.results || []).slice(0, 5).map((row) => ({
    title: String(row.title || ''),
    url: String(row.url || ''),
    snippet: String(row.description || ''),
  }));
  return { ok: true, query, provider: 'brave', results };
}

async function searchDuckDuckGo(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  if (!response.ok) {
    const err = new Error(text || `DuckDuckGo search failed (${response.status})`);
    err.statusCode = response.status;
    throw err;
  }
  const data = JSON.parse(text);
  const results = [];
  if (data.AbstractText) {
    results.push({
      title: String(data.Heading || 'Summary'),
      url: String(data.AbstractURL || ''),
      snippet: String(data.AbstractText),
    });
  }
  for (const topic of data.RelatedTopics || []) {
    if (topic.Text) {
      results.push({
        title: String(topic.Text).slice(0, 80),
        url: String(topic.FirstURL || ''),
        snippet: String(topic.Text),
      });
    } else if (Array.isArray(topic.Topics)) {
      for (const nested of topic.Topics.slice(0, 2)) {
        if (nested.Text) {
          results.push({
            title: String(nested.Text).slice(0, 80),
            url: String(nested.FirstURL || ''),
            snippet: String(nested.Text),
          });
        }
      }
    }
    if (results.length >= 5) break;
  }
  return {
    ok: true,
    query,
    provider: 'duckduckgo',
    abstract: data.AbstractText ? String(data.AbstractText) : undefined,
    results: results.slice(0, 5),
  };
}

async function webSearch(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    const err = new Error('query is required');
    err.statusCode = 422;
    throw err;
  }

  const brave = await searchBrave(trimmed);
  if (brave) return brave;
  return searchDuckDuckGo(trimmed);
}

module.exports = { webSearch };
