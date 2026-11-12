const { GoogleGenAI } = require('@google/genai');
const { log, error: logError } = require('../utils/logger');

class GeminiClient {
  constructor(config, aiClient) {
    this.config = config;
    this.ai = aiClient || new GoogleGenAI({
      apiKey: config.geminiApiKey,
      httpOptions: { timeout: config.providerTimeoutMs || 20000 }
    });
    log('Gemini', 'Gemini client initialised', {
      model: config.geminiModel,
      embeddingModel: config.geminiEmbeddingModel,
      embeddingDimensions: config.geminiEmbeddingDimensions,
      injectedClient: Boolean(aiClient)
    });
  }

  async embedTexts(texts, taskType) {
    if (!Array.isArray(texts) || texts.length === 0) {
      log('Gemini', 'Embedding request skipped because no texts were provided');
      return [];
    }

    log('Gemini', 'Sending embedding request', {
      model: this.config.geminiEmbeddingModel,
      taskType,
      textCount: texts.length,
      outputDimensionality: this.config.geminiEmbeddingDimensions
    });
    let response;
    try {
      response = await this.ai.models.embedContent({
        model: this.config.geminiEmbeddingModel,
        contents: texts,
        config: {
          taskType,
          outputDimensionality: this.config.geminiEmbeddingDimensions
        }
      });
    } catch (error) {
      error.statusCode = 502;
      logError('Gemini', 'Embedding request failed', { message: error.message });
      throw error;
    }

    const embeddings = response && response.embeddings;
    log('Gemini', 'Embedding response received', {
      embeddingCount: Array.isArray(embeddings) ? embeddings.length : 0
    });
    if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
      throw new Error('Gemini returned an unexpected number of embeddings');
    }

    return embeddings.map((embedding) => {
      const values = embedding && embedding.values;
      if (!Array.isArray(values) || values.length !== this.config.geminiEmbeddingDimensions || !values.every(Number.isFinite)) {
        const error = new Error('Gemini returned an invalid embedding');
        error.statusCode = 502;
        throw error;
      }
      return values;
    });
  }

  async embedDocumentTexts(texts) {
    const embeddings = [];
    for (let offset = 0; offset < texts.length; offset += 50) {
      embeddings.push(...await this.embedTexts(texts.slice(offset, offset + 50), 'RETRIEVAL_DOCUMENT'));
    }
    return embeddings;
  }

  async embedQuery(text) {
    const [embedding] = await this.embedTexts([text], 'RETRIEVAL_QUERY');
    return embedding;
  }

  async generateAnswer(systemInstruction, question) {
    log('Gemini', 'Sending answer-generation request', {
      model: this.config.geminiModel,
      systemInstructionLength: systemInstruction.length,
      questionLength: question.length
    });
    let response;
    try {
      response = await this.ai.models.generateContent({
        model: this.config.geminiModel,
        contents: question,
        config: { systemInstruction }
      });
    } catch (error) {
      error.statusCode = 502;
      logError('Gemini', 'Answer-generation request failed', { message: error.message });
      throw error;
    }

    const answer = response && response.text;
    if (typeof answer !== 'string' || answer.trim() === '') {
      throw new Error('Gemini returned an empty answer');
    }
    log('Gemini', 'Answer-generation response received', { answerLength: answer.length });
    return answer;
  }
}

module.exports = GeminiClient;
