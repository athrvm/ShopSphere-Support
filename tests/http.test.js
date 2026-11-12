const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../src/app');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

function app(service = { answerUserQuery: async () => 'A policy answer' }, config = {}) {
  return createApp({ chatbotService: service, config });
}

test('HTTP query contract, no-store responses and security headers', async () => {
  const response = await request(app()).get('/api/v1/query').query({ question: 'Refund policy?' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { answer: 'A policy answer' });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.ok(response.headers['x-request-id']);
});

test('rejects missing, blank, repeated, oversized and control-character questions before providers', async () => {
  let calls = 0;
  const server = app({ answerUserQuery: async () => { calls += 1; return 'unused'; } });
  for (const query of ['', '?question=%20', '?question=a&question=b', `?question=${'x'.repeat(2001)}`, '?question=%00bad']) {
    assert.equal((await request(server).get(`/api/v1/query${query}`)).status, 400);
  }
  assert.equal(calls, 0);
});

test('provider failures propagate as safe errors, without secret messages', async () => {
  const error = Object.assign(new Error('Sensitive provider detail: api-key-secret'), { statusCode: 502 });
  const response = await request(app({ answerUserQuery: async () => { throw error; } }))
    .get('/api/v1/query?question=hello');
  assert.equal(response.status, 502);
  assert.match(response.body.error, /temporarily unavailable/);
  assert.ok(!JSON.stringify(response.body).includes('api-key-secret'));
  assert.ok(!response.body.stack);
});

test('timeouts and invalid provider answers cannot look successful', async () => {
  const timeout = await request(app({ answerUserQuery: () => new Promise(() => {}) }, { requestTimeoutMs: 15 }))
    .get('/api/v1/query?question=hello');
  assert.equal(timeout.status, 504);
  const empty = await request(app({ answerUserQuery: async () => '' })).get('/api/v1/query?question=hello');
  assert.equal(empty.status, 502);
});

test('CORS allows configured origins and rejects other origins', async () => {
  const server = app(undefined, { clientOrigins: ['https://support.example.com'] });
  const allowed = await request(server).get('/api/v1/health').set('Origin', 'https://support.example.com');
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://support.example.com');
  const denied = await request(server).get('/api/v1/query?question=hi').set('Origin', 'https://untrusted.example');
  assert.equal(denied.status, 403);
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});

test('rate limits questions while keeping health available', async () => {
  const server = app(undefined, { rateLimitMax: 1 });
  assert.equal((await request(server).get('/api/v1/query?question=first')).status, 200);
  assert.equal((await request(server).get('/api/v1/query?question=second')).status, 429);
  assert.equal((await request(server).get('/api/v1/health')).status, 200);
});

test('malformed JSON, oversized bodies and unknown API routes return JSON errors', async () => {
  const server = app();
  const malformed = await request(server).post('/api/v1/query').set('Content-Type', 'application/json').send('{');
  assert.equal(malformed.status, 400);
  const oversized = await request(server).post('/api/v1/query').send({ data: 'x'.repeat(10000) });
  assert.equal(oversized.status, 413);
  const unknown = await request(server).get('/api/v1/unknown');
  assert.equal(unknown.status, 404);
  assert.equal(typeof unknown.body.error, 'string');
});

test('serves a built React entry point without swallowing unknown APIs or assets', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shopsphere-static-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'index.html'), '<!doctype html><div id="root">React app</div>');
  const server = createApp({ chatbotService: {}, clientDirectory: directory, config: { nodeEnv: 'production' } });
  const response = await request(server).get('/');
  assert.equal(response.status, 200);
  assert.match(response.text, /React app/);
  assert.match(response.headers['content-security-policy'], /script-src 'self'/);
  assert.equal((await request(server).get('/support')).status, 200);
  assert.equal((await request(server).get('/api/v1/missing')).status, 404);
  assert.equal((await request(server).get('/assets/missing.js')).status, 404);
});
