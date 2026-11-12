const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const request = require('supertest');
const GeminiClient = require('../src/integrations/GeminiClient');
const PineconeClient = require('../src/integrations/PineconeClient');
const { ChatbotService, SYSTEM_PROMPT } = require('../src/services/ChatbotService');
const { loadKnowledgeChunks, splitText } = require('../src/services/knowledgeBase');
const { getConfig } = require('../src/config');
const createApp = require('../src/app');

const config = { geminiEmbeddingDimensions: 3, pineconeIndex: 'test-index', pineconeNamespace: 'policies' };
function pineconeStub(dimension = 3) {
  const calls = { upserts: [], queries: [], descriptions: 0 };
  const index = {
    upsert: async (vectors) => calls.upserts.push(vectors),
    query: async (query) => {
      calls.queries.push(query);
      return { matches: [{ id: 'return-policy', metadata: { text: 'Return policy context' } }] };
    }
  };
  const sdk = {
    describeIndex: async () => { calls.descriptions += 1; return { dimension }; },
    index: () => ({ namespace: (name) => { assert.equal(name, 'policies'); return index; } })
  };
  return { client: new PineconeClient(config, sdk), calls };
}

test('full HTTP → RAG → SDK boundaries preserve top-four, metadata, prompt and stateless queries', async () => {
  const pinecone = pineconeStub();
  const requests = [];
  const ai = { models: {
    embedContent: async (args) => { requests.push(args); return { embeddings: [{ values: [.1, .2, .3] }] }; },
    generateContent: async (args) => { requests.push(args); return { text: '**Grounded** answer' }; }
  } };
  const service = new ChatbotService({ config, geminiClient: new GeminiClient(config, ai), pineconeClient: pinecone.client });
  const server = createApp({ chatbotService: service });
  for (const question of ['Return eligibility?', 'Refund timeline?']) {
    const response = await request(server).get('/api/v1/query').query({ question });
    assert.deepEqual(response.body, { answer: '**Grounded** answer' });
  }
  assert.equal(requests[0].config.taskType, 'RETRIEVAL_QUERY');
  assert.equal(requests[0].config.outputDimensionality, 3);
  assert.equal(requests[1].config.systemInstruction, SYSTEM_PROMPT.replace('%s', 'Return policy context'));
  assert.equal(requests[3].contents, 'Refund timeline?');
  assert.deepEqual(pinecone.calls.queries[0], { vector: [.1, .2, .3], topK: 4, includeMetadata: true });
  assert.equal(pinecone.calls.descriptions, 1);
});

test('incompatible or unverifiable indexes fail before query, embedding or upsert', async () => {
  for (const dimension of [1536, undefined, 0]) {
    const pinecone = pineconeStub(dimension === undefined ? null : dimension);
    let embedded = false;
    const service = new ChatbotService({
      config, pineconeClient: pinecone.client,
      geminiClient: { embedQuery: async () => { embedded = true; } },
      knowledgeLoader: async () => { throw new Error('must not read PDFs before compatibility check'); }
    });
    await assert.rejects(service.answerUserQuery('hello'), /dimension|dimensions/);
    await assert.rejects(service.loadKnowledgeBase(), /dimension|dimensions/);
    assert.equal(embedded, false);
    assert.equal(pinecone.calls.queries.length, 0);
    assert.equal(pinecone.calls.upserts.length, 0);
  }
});

test('SDK rejects malformed embeddings and empty answers', async () => {
  for (const embeddings of [[], [{ values: [1, 2] }], [{ values: [1, NaN, 3] }]]) {
    const client = new GeminiClient(config, { models: { embedContent: async () => ({ embeddings }) } });
    await assert.rejects(client.embedQuery('hello'));
  }
  const client = new GeminiClient(config, { models: { generateContent: async () => ({ text: '' }) } });
  await assert.rejects(client.generateAnswer('context', 'question'), /empty answer/);
});

test('system prompt remains byte-for-byte unchanged', async () => {
  assert.equal(SYSTEM_PROMPT, await fs.readFile(path.join(__dirname, 'fixtures/system-prompt.txt'), 'utf8'));
});

test('ingests all original PDFs through Gemini document embeddings into a mocked Pinecone namespace', async () => {
  const pinecone = pineconeStub();
  const embeddingRequests = [];
  const gemini = new GeminiClient(config, { models: {
    embedContent: async (args) => {
      embeddingRequests.push(args);
      return { embeddings: args.contents.map(() => ({ values: [.1, .2, .3] })) };
    }
  } });
  const service = new ChatbotService({
    config: { ...config, knowledgeDirectory: path.resolve(__dirname, '../knowledge') },
    geminiClient: gemini, pineconeClient: pinecone.client
  });
  assert.deepEqual(await service.loadKnowledgeBase(), { documents: 5, vectors: 5, dimension: 3 });
  assert.equal(embeddingRequests[0].config.taskType, 'RETRIEVAL_DOCUMENT');
  assert.equal(pinecone.calls.descriptions, 1);
  const vectors = pinecone.calls.upserts.flat();
  assert.equal(vectors.length, 5);
  assert.ok(vectors.every((vector) => vector.metadata.text && vector.values.length === 3));
});

test('all five original PDFs remain unchanged and extract into bounded page chunks', async () => {
  const hashes = {
    'exchange-policy.pdf': '1c670ac7266d69e72b3bf109c855900326b1b806347c5c09f33290cdbf65b613',
    'orders-account-help.pdf': 'ce55a441eb28d7e61ea8bdfb3998c14067d5100ab945c6ae35205b5cc42efe2a',
    'payment-refund-policy.pdf': 'caa19f452cd62e8f878c49d56bd34e278e61069370b6b29c61ebfae640c251b7',
    'return-policy.pdf': '20168fcd95397529e8119f19a6155d062165b7329317c06dd83853a5eae0a50d',
    'shipping-delivery.pdf': '279f340a1965fe210bcb15873159b83f68125626e8d7236d489b20dbd8d30e5d'
  };
  const directory = path.resolve(__dirname, '../knowledge');
  for (const [file, hash] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(await fs.readFile(path.join(directory, file))).digest('hex'), hash);
  }
  const chunks = await loadKnowledgeChunks(directory);
  assert.equal(new Set(chunks.map((chunk) => chunk.metadata.fileName)).size, 5);
  for (const chunk of chunks) {
    assert.equal(chunk.metadata.text, chunk.text);
    assert.ok(chunk.metadata.page >= 1);
    assert.ok((chunk.text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || []).length <= 300);
  }
});

test('chunking validates size and handles whitespace and punctuation', () => {
  assert.deepEqual(splitText('   '), []);
  assert.deepEqual(splitText('Hello, world!'), ['Hello, world!']);
  assert.throws(() => splitText('text', 0));
});

test('safe configuration defaults and invalid origins/startup flags', () => {
  assert.equal(getConfig({}).ingestOnStartup, false);
  assert.equal(getConfig({}).geminiEmbeddingDimensions, 1024);
  assert.equal(getConfig({}).pineconeNamespace, 'policies');
  assert.throws(() => getConfig({ CLIENT_ORIGINS: '*' }));
  assert.throws(() => getConfig({ INGEST_ON_STARTUP: 'yes' }));
});
