import { searchWithGoogle } from '../../clients/gemini.ts';

// search_web: a separate Gemini call with only the built-in Google Search tool.
// Keeping search out of the main request avoids mixing built-in tools with
// function calling (rejected by Gemini 2.5, preview-only on Gemini 3) and gives
// us explicit source links from groundingMetadata.
const searchWeb = async ({ query }: { query?: string } = {}) => {
  const text = String(query || '').trim().slice(0, 300);
  if (!text) {
    throw Object.assign(new Error('search_web needs a query.'), { code: 'invalid_args' });
  }
  return searchWithGoogle(text);
};

export { searchWeb };
