import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createConditionHandler} from './condition-api.mjs';

const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
const nativeFetch = globalThis.fetch;
const savedKey = process.env.GEMINI_API_KEY, savedModel = process.env.GEMINI_MODEL;
const credential = 'test-only-credential-never-real';
const profile = {wheelchair: true, avoidSteps: false, avoidSlope: true, rest: true, restKind: 'bench', maxSlope: 5, short: false, recognized: true, restMinutes: 5};
const success = () => new Response(JSON.stringify({candidates: [{content: {parts: [{text: JSON.stringify(profile)}]}}]}));
let mode = 'normal', pending = [], calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({url, options});
  if (mode === 'rate-limit') return new Response('{}', {status: 429});
  if (mode === 'failure') throw Error('internal-provider-detail-do-not-return');
  if (mode === 'invalid-profile') return new Response(JSON.stringify({candidates: [{content: {parts: [{text: '{"wheelchair":"true"}'}]}}]}));
  if (mode === 'wait') return new Promise(resolve => pending.push(() => resolve(success())));
  return success();
};
const {default: handler} = await import('../../api/index.mjs');
globalThis.fetch = nativeFetch;

async function serve(handle) {
  const app = createServer(handle);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  return {app, url: `http://127.0.0.1:${app.address().port}`};
}
async function close(app) { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); }
const checks = [];
const instance = await serve(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const rewrite = config.rewrites.find(rule => rule.source === path);
    if (!rewrite && path !== '/api/index') { res.writeHead(404); res.end(); return; }
    if (req.headers['x-test-body-format']) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      req.body = req.headers['x-test-body-format'] === 'object' ? JSON.parse(raw) : req.headers['x-test-body-format'] === 'buffer' ? raw : raw.toString('utf8');
    }
    if (rewrite && !req.headers['x-test-original-url']) req.url = rewrite.destination;
    await handler(req, res);
  } catch { res.writeHead(500); res.end('test harness failed'); }
});
const post = (value, headers = {}) => nativeFetch(instance.url + '/api/analyze-condition', {method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: typeof value === 'string' ? value : JSON.stringify(value)});

try {
  delete process.env.GEMINI_API_KEY;
  process.env.GEMINI_MODEL = 'gemini-test-model';
  let response = await nativeFetch(instance.url + '/api/status');
  assert.equal(response.status, 200); assert.equal((await response.json()).configured, false);
  assert.equal((await post({condition: '짧은 길'})).status, 503);
  assert.equal(calls.length, 0);
  process.env.GEMINI_API_KEY = credential;
  response = await nativeFetch(instance.url + '/api/status');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const status = await response.json(); assert.equal(status.configured, true); assert(!JSON.stringify(status).includes(credential)); assert.equal(calls.length, 0);
  checks.push('status reports environment configuration without calling Gemini or disclosing the key');

  for (const headers of [{}, {'x-test-original-url': '1'}, {'x-test-body-format': 'object'}, {'x-test-body-format': 'string'}, {'x-test-body-format': 'buffer'}]) {
    response = await post({condition: '휠체어로 가고 5분마다 벤치에서 쉬고 싶어요'}, headers);
    assert.equal(response.status, 200); const result = await response.json();
    assert.equal(result.source, 'Gemini'); assert.equal(result.profile.avoidSteps, true); assert.equal(result.profile.restMinutes, 5);
    assert(!JSON.stringify(result).includes(credential));
  }
  const upstream = calls.at(-1); assert.equal(upstream.options.headers['x-goog-api-key'], credential);
  assert(upstream.url.endsWith('/gemini-test-model:generateContent'));
  const payload = JSON.parse(upstream.options.body);
  assert.equal(payload.contents[0].parts[0].text, '휠체어로 가고 5분마다 벤치에서 쉬고 싶어요');
  assert.deepEqual(Object.keys(payload).sort(), ['contents', 'generationConfig', 'systemInstruction']);
  checks.push('Vercel original and rewritten URLs, parsed and streamed bodies share the local Gemini contract');

  const beforeInvalid = calls.length;
  assert.equal((await post({condition: '짧은 길'}, {Origin: 'https://unrelated.example'})).status, 403);
  assert.equal((await post({condition: '짧은 길', latitude: 37})).status, 400);
  assert.equal((await post({condition: ''})).status, 400);
  assert.equal((await post({condition: 'a'.repeat(501)})).status, 400);
  assert.equal((await post('{')).status, 400);
  assert.equal((await post('a'.repeat(9000))).status, 413);
  assert.equal((await post('a'.repeat(9000), {'x-test-body-format': 'string'})).status, 413);
  assert.equal((await post('{}', {'Content-Type': 'text/plain'})).status, 415);
  response = await nativeFetch(instance.url + '/api/analyze-condition'); assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'POST');
  assert.equal((await nativeFetch(instance.url + '/api/status', {method: 'POST'})).status, 405);
  for (const path of ['/setup', '/api/config', '/.env', '/api/index?route=config', '/api/index?route=../setup']) assert.equal((await nativeFetch(instance.url + path)).status, 404);
  assert.equal(calls.length, beforeInvalid);
  checks.push('invalid, cross-origin and private/configuration requests are rejected before provider calls');

  process.env.GEMINI_MODEL = 'invalid/model';
  response = await nativeFetch(instance.url + '/api/status'); assert.equal((await response.json()).model, null);
  assert.equal((await post({condition: '짧은 길'})).status, 503); assert.equal(calls.length, beforeInvalid);
  process.env.GEMINI_MODEL = 'gemini-test-model';
  for (const [nextMode, expected] of [['rate-limit', 429], ['failure', 502], ['invalid-profile', 502]]) {
    mode = nextMode; response = await post({condition: '짧은 길'}); assert.equal(response.status, expected);
    const result = JSON.stringify(await response.json()); assert(!result.includes('internal-provider-detail')); assert(!result.includes(credential));
  }
  checks.push('bad model, provider rate limits, network errors and invalid responses fail without exposing details');

  mode = 'wait';
  const requests = Array.from({length: 3}, () => post({condition: '짧은 길'}));
  for (let i = 0; i < 100 && pending.length < 3; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(pending.length, 3);
  assert.equal((await post({condition: '짧은 길'})).status, 429);
  pending.splice(0).forEach(resolve => resolve());
  for (const response of await Promise.all(requests)) { assert.equal(response.status, 200); await response.arrayBuffer(); }
  mode = 'normal'; assert.equal((await post({condition: '짧은 길'})).status, 200);
  checks.push('instance concurrency limit rejects excess requests and releases capacity after completion');

  const timeout = await serve(createConditionHandler({getConfig: () => ({apiKey: credential}), timeoutMs: 20, fetchImpl: (_url, {signal}) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}))}));
  try {
    response = await nativeFetch(timeout.url + '/api/analyze-condition', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({condition: '짧은 길'})});
    assert.equal(response.status, 502); assert(!(await response.text()).includes(credential));
  } finally { await close(timeout.app); }
  checks.push('provider timeout aborts the request and returns a controlled fallback response');

  assert.equal(config.outputDirectory, 'donghaeng-nav/dist');
  assert.equal(config.functions['api/index.mjs'].maxDuration, 30);
  const entry = await readFile(new URL('../../api/index.mjs', import.meta.url), 'utf8');
  const shared = await readFile(new URL('./condition-api.mjs', import.meta.url), 'utf8');
  assert(!/readFile|saveConfig|readConfig|createServer|listen\(/.test(entry + shared));
  assert.equal(config.rewrites.length, 2);
  checks.push('deployment serves only runtime assets and the function has no disk key store or listening server');
  const report = {pass: true, checks, realGemini: false, vercelRuntime: false, deployed: false, note: 'Local Node HTTP tests of the exported handler, Vercel URL rewrite and parsed-body shapes; actual Vercel build and provider access remain unverified.'};
  await writeFile(new URL('../docs/vercel-api-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  pending.splice(0).forEach(resolve => resolve());
  await close(instance.app);
  if (savedKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = savedKey;
  if (savedModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = savedModel;
  globalThis.fetch = nativeFetch;
}
