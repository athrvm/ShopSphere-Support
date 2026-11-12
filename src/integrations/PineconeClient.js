const { Pinecone } = require('@pinecone-database/pinecone');
const { log, error: logError } = require('../utils/logger');
const AppError = require('../utils/AppError');

class PineconeClient {
  constructor(config, pinecone) {
    this.config = config;
    this.pinecone = pinecone || new Pinecone({
      apiKey: config.pineconeApiKey,
      fetchApi: (url, options = {}) => fetch(url, {
        ...options,
        signal: options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(config.providerTimeoutMs || 20000)])
          : AbortSignal.timeout(config.providerTimeoutMs || 20000)
      })
    });
    this.dimensionCheck = null;
    this.index = this.pinecone.index(config.pineconeIndex).namespace(config.pineconeNamespace);
    log('Pinecone', 'Pinecone client initialised', {
      index: config.pineconeIndex,
      namespace: config.pineconeNamespace,
      injectedClient: Boolean(pinecone)
    });
  }

  async assertCompatibleDimension(expectedDimension) {
    if (!this.dimensionCheck) {
      this.dimensionCheck = this.checkDimension(expectedDimension).catch((error) => {
        this.dimensionCheck = null;
        throw error;
      });
    }
    return this.dimensionCheck;
  }

  async checkDimension(expectedDimension) {
    log('Pinecone', 'Checking index dimension', {
      index: this.config.pineconeIndex,
      expectedDimension
    });
    let description;
    try {
      description = await this.pinecone.describeIndex(this.config.pineconeIndex);
    } catch (error) {
      error.statusCode = 502;
      logError('Pinecone', 'Index description failed', { message: error.message });
      throw error;
    }
    const actualDimension = Number(description && description.dimension);
    log('Pinecone', 'Index description received', {
      index: this.config.pineconeIndex,
      actualDimension,
      metric: description && description.metric,
      host: description && description.host
    });
    if (!Number.isInteger(actualDimension) || actualDimension <= 0) {
      throw new AppError('Pinecone index dimensions could not be verified. Check the index configuration before retrying.', 503, 'INDEX_UNVERIFIED');
    }
    if (actualDimension !== expectedDimension) {
      logError('Pinecone', 'Index dimension mismatch', { actualDimension, expectedDimension });
      throw new AppError(
        `The configured Pinecone index has dimension ${actualDimension}, ` +
        `but Gemini is configured to produce ${expectedDimension}-dimension vectors. ` +
        'Use a separate compatible Gemini index; vectors must not be padded or truncated. ' +
        'Google and OpenAI embeddings are incompatible even when dimensions match.',
        503, 'INDEX_DIMENSION_MISMATCH'
      );
    }
    log('Pinecone', 'Index dimension is compatible', { dimension: actualDimension });
    return actualDimension || null;
  }

  async upsert(vectors) {
    await this.assertCompatibleDimension(this.config.geminiEmbeddingDimensions);
    const batchSize = 100;
    log('Pinecone', 'Starting vector upsert', { vectorCount: vectors.length, batchSize });
    for (let offset = 0; offset < vectors.length; offset += batchSize) {
      const batch = vectors.slice(offset, offset + batchSize);
      log('Pinecone', 'Upserting vector batch', {
        batchNumber: Math.floor(offset / batchSize) + 1,
        batchSize: batch.length
      });
      try {
        await this.index.upsert(batch);
      } catch (error) {
        error.statusCode = 502;
        logError('Pinecone', 'Vector upsert failed', { message: error.message });
        throw error;
      }
    }
    log('Pinecone', 'Vector upsert completed', { vectorCount: vectors.length });
  }

  async similaritySearch(vector, topK) {
    await this.assertCompatibleDimension(this.config.geminiEmbeddingDimensions);
    log('Pinecone', 'Starting similarity search', {
      queryDimension: vector.length,
      topK,
      namespace: this.config.pineconeNamespace
    });
    let result;
    try {
      result = await this.index.query({
        vector,
        topK,
        includeMetadata: true
      });
    } catch (error) {
      error.statusCode = 502;
      logError('Pinecone', 'Similarity search failed', { message: error.message });
      throw error;
    }

    const matches = (result.matches || []).map((match) => ({
      id: match.id,
      score: match.score,
      text: match.metadata && typeof match.metadata.text === 'string'
        ? match.metadata.text
        : ''
    }));
    log('Pinecone', 'Similarity search completed', {
      matchCount: matches.length,
      matchIds: matches.map((match) => match.id)
    });
    return matches;
  }
}

module.exports = PineconeClient;
