const test = require('node:test');
const assert = require('node:assert/strict');
const { splitText } = require('../src/services/knowledgeBase');
const ChatbotController = require('../src/controllers/ChatbotController');
const { ChatbotService, SYSTEM_PROMPT } = require('../src/services/ChatbotService');

async function invokeQuery(chatbotService, question) {
  const result = {};
  const response = {
    status(code) {
      result.status = code;
      return this;
    },
    json(body) {
      if (result.status === undefined) result.status = 200;
      result.body = body;
      return this;
    }
  };
  let nextError;
  const controller = new ChatbotController(chatbotService);
  await controller.query({ query: question === undefined ? {} : { question } }, response, (error) => {
    nextError = error;
  });
  if (nextError) throw nextError;
  return result;
}

test('splits knowledge text into bounded 300-token chunks', () => {
  const chunks = splitText(Array.from({ length: 650 }, (_, i) => `word${i}`).join(' '));
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.length > 0));
});

test('preserves the query response contract', async () => {
  const response = await invokeQuery({ answerUserQuery: async (question) => `answer: ${question}` }, 'hello');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { answer: 'answer: hello' });
});

test('rejects a missing question', async () => {
  const response = await invokeQuery({ answerUserQuery: async () => 'unused' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /question query parameter is required/);
});

test('does not fabricate a successful response when a provider fails', async () => {
  await assert.rejects(
    invokeQuery({ answerUserQuery: async () => { throw new Error('Gemini unavailable'); } }, 'hello'),
    /Gemini unavailable/
  );
});

test('passes top-four retrieved text to Gemini with the preserved prompt', async () => {
  let queryArguments;
  let generationArguments;
  const service = new ChatbotService({
    config: { geminiEmbeddingDimensions: 3 },
    geminiClient: {
      embedQuery: async () => [0.1, 0.2, 0.3],
      generateAnswer: async (systemInstruction, question) => {
        generationArguments = { systemInstruction, question };
        return 'grounded answer';
      }
    },
    pineconeClient: {
      assertCompatibleDimension: async (dimension) => assert.equal(dimension, 3),
      similaritySearch: async (vector, topK) => {
        queryArguments = { vector, topK };
        return [{ text: 'Return policy context' }, { text: 'Refund policy context' }];
      }
    }
  });

  assert.equal(await service.answerUserQuery('Can I return this?'), 'grounded answer');
  assert.deepEqual(queryArguments, { vector: [0.1, 0.2, 0.3], topK: 4 });
  assert.equal(generationArguments.question, 'Can I return this?');
  assert.match(generationArguments.systemInstruction, /Return policy context/);
  assert.match(generationArguments.systemInstruction, /Refund policy context/);
  assert.match(generationArguments.systemInstruction, /I don't have that information/);
  assert.ok(generationArguments.systemInstruction.startsWith(SYSTEM_PROMPT.slice(0, 20)));
});

test('embeds and upserts loaded PDF chunks without changing their metadata', async () => {
  let upserted;
  const service = new ChatbotService({
    config: { geminiEmbeddingDimensions: 3, knowledgeDirectory: '/unused' },
    knowledgeLoader: async () => [{
      id: 'policy.pdf:page-1:chunk-1',
      text: 'Policy text',
      metadata: { text: 'Policy text', source: '/knowledge/policy.pdf', page: 1 }
    }],
    geminiClient: { embedDocumentTexts: async () => [[1, 2, 3]] },
    pineconeClient: {
      assertCompatibleDimension: async (dimension) => assert.equal(dimension, 3),
      upsert: async (vectors) => { upserted = vectors; }
    }
  });

  assert.deepEqual(await service.loadKnowledgeBase(), { documents: 1, vectors: 1, dimension: 3 });
  assert.deepEqual(upserted, [{
    id: 'policy.pdf:page-1:chunk-1',
    values: [1, 2, 3],
    metadata: { text: 'Policy text', source: '/knowledge/policy.pdf', page: 1 }
  }]);
});
