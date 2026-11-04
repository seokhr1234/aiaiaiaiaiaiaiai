import {createConditionHandler, DEFAULT_GEMINI_MODEL} from '../donghaeng-nav/scripts/condition-api.mjs';

const handle = createConditionHandler({
  getConfig: () => ({
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
  })
});

export default function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  // Rewrites carry the route when Vercel supplies the destination URL.
  const route = ['/api/status', '/api/analyze-condition', '/api/select-route'].includes(url.pathname)
    ? url.pathname
    : url.pathname === '/api/index' ? `/api/${url.searchParams.get('route') || ''}` : '';
  return handle(req, res, route);
}
