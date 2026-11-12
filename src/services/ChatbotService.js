const { loadKnowledgeChunks } = require('./knowledgeBase');
const { log } = require('../utils/logger');
const { validateQuestion } = require('../utils/validation');

const SYSTEM_PROMPT = `
You are an AI customer support assistant for our e-commerce company.

Answer the customer directly and concisely using only the company information below.

Do not mention company documents, provided context, source material, retrieval, or whether
information is or is not available in the provided information.

Do not invent or assume facts. If you cannot answer the question from the information below,
reply only:
"I don't have that information."

COMPANMY INFORMATION
%s

`;

class ChatbotService {
  constructor({ pineconeClient, geminiClient, config, knowledgeLoader = loadKnowledgeChunks }) {
    this.pineconeClient = pineconeClient;
    this.geminiClient = geminiClient;
    this.config = config;
    this.knowledgeLoader = knowledgeLoader;
  }

  async loadKnowledgeBase() {
    const dimension = this.config.geminiEmbeddingDimensions;
    log('ChatbotService', 'Checking Pinecone vector dimension', { expectedDimension: dimension });
    await this.pineconeClient.assertCompatibleDimension(dimension);
    log('ChatbotService', 'Starting knowledge-base loading', {
      directory: this.config.knowledgeDirectory,
      chunkSize: 300
    });
    const chunks = await this.knowledgeLoader(this.config.knowledgeDirectory, 300);
    log('ChatbotService', 'Knowledge chunks loaded', { chunkCount: chunks.length });
    log('ChatbotService', 'Converting document chunks to embeddings', { chunkCount: chunks.length });
    const embeddings = await this.geminiClient.embedDocumentTexts(chunks.map((chunk) => chunk.text));
    log('ChatbotService', 'Document embeddings received', {
      embeddingCount: embeddings.length,
      embeddingDimension: embeddings[0] ? embeddings[0].length : 0
    });
    if (!Array.isArray(embeddings) || embeddings.length !== chunks.length) {
      throw new Error('Gemini returned an unexpected number of document embeddings');
    }
    const vectors = chunks.map((chunk, index) => {
      if (!Array.isArray(embeddings[index]) || embeddings[index].length !== dimension || !embeddings[index].every(Number.isFinite)) {
        throw new Error(
          `Gemini returned an invalid document vector; expected ${dimension} finite values`
        );
      }
      return { id: chunk.id, values: embeddings[index], metadata: chunk.metadata };
    });

    log('ChatbotService', 'Upserting document vectors into Pinecone', { vectorCount: vectors.length });
    await this.pineconeClient.upsert(vectors);
    log('ChatbotService', 'Knowledge-base ingestion finished', {
      documents: chunks.length,
      vectors: vectors.length,
      dimension
    });
    return { documents: chunks.length, vectors: vectors.length, dimension };
  }

  async answerUserQuery(question) {
    question = validateQuestion(question);
    const started = performance.now();
    log('ChatbotService', 'Starting user-query RAG workflow', {
      questionLength: question.length
    });
    await this.pineconeClient.assertCompatibleDimension(this.config.geminiEmbeddingDimensions);
    log('ChatbotService', 'Converting user query to embedding');
    const queryEmbedding = await this.geminiClient.embedQuery(question);
    log('ChatbotService', 'User query embedding received', { dimension: queryEmbedding.length });
    if (queryEmbedding.length !== this.config.geminiEmbeddingDimensions) {
      throw new Error(
        `Gemini returned a ${queryEmbedding.length}-dimension query vector; expected ` +
        `${this.config.geminiEmbeddingDimensions}`
      );
    }

    log('ChatbotService', 'Searching Pinecone for similar chunks', { topK: 4 });
    const relevantChunks = await this.pineconeClient.similaritySearch(queryEmbedding, 4);
    log('ChatbotService', 'Pinecone similarity search completed', {
      matchCount: relevantChunks.length,
      matchIds: relevantChunks.map((chunk) => chunk.id)
    });
    const finalContext = relevantChunks
      .map((chunk) => chunk.text)
      .filter(Boolean)
      .join('\n\n');

    log('ChatbotService', 'Retrieved context assembled', { contextLength: finalContext.length });
    log('ChatbotService', 'Sending system prompt and user question to Gemini');
    const answer = await this.geminiClient.generateAnswer(
      SYSTEM_PROMPT.replace('%s', finalContext),
      question
    );
    log('ChatbotService', 'Gemini answer received', { answerLength: answer.length, durationMs: Math.round(performance.now() - started) });
    return answer;
  }
}

module.exports = { ChatbotService, SYSTEM_PROMPT };
