const path = require('node:path');
const dotenv = require('dotenv');
const { log } = require('../utils/logger');

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

function asPositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function getConfig(env = process.env) {
  const config = {
    port: asPositiveInteger(env.PORT || '8080', 'PORT'),
    nodeEnv: env.NODE_ENV || 'development',
    clientOrigins: (env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080')
      .split(',').map((origin) => origin.trim()).filter(Boolean),
    rateLimitWindowMs: asPositiveInteger(env.RATE_LIMIT_WINDOW_MS || '60000', 'RATE_LIMIT_WINDOW_MS'),
    rateLimitMax: asPositiveInteger(env.RATE_LIMIT_MAX || '30', 'RATE_LIMIT_MAX'),
    providerTimeoutMs: asPositiveInteger(env.PROVIDER_TIMEOUT_MS || '20000', 'PROVIDER_TIMEOUT_MS'),
    requestTimeoutMs: asPositiveInteger(env.REQUEST_TIMEOUT_MS || '65000', 'REQUEST_TIMEOUT_MS'),
    geminiApiKey: env.GEMINI_API_KEY || '',
    geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
    geminiEmbeddingModel: env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    geminiEmbeddingDimensions: asPositiveInteger(
      env.GEMINI_EMBEDDING_DIMENSIONS || '1024',
      'GEMINI_EMBEDDING_DIMENSIONS'
    ),
    pineconeApiKey: env.PINECONE_API_KEY || '',
    pineconeIndex: env.PINECONE_INDEX || '',
    pineconeNamespace: env.PINECONE_NAMESPACE || 'policies',
    ingestOnStartup: String(env.INGEST_ON_STARTUP || 'false').toLowerCase() === 'true',
    knowledgeDirectory: env.KNOWLEDGE_DIRECTORY
      ? path.resolve(env.KNOWLEDGE_DIRECTORY)
      : path.resolve(__dirname, '../../knowledge')
  };

  if (config.port > 65535) throw new Error('PORT must be at most 65535');
  if (!['true', 'false'].includes(String(env.INGEST_ON_STARTUP || 'false').toLowerCase())) {
    throw new Error('INGEST_ON_STARTUP must be true or false');
  }
  for (const origin of config.clientOrigins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error('CLIENT_ORIGINS must contain exact HTTP(S) origins without paths or wildcards');
    }
  }

  log('Config', 'Configuration loaded', {
    port: config.port,
    geminiModel: config.geminiModel,
    geminiEmbeddingModel: config.geminiEmbeddingModel,
    geminiEmbeddingDimensions: config.geminiEmbeddingDimensions,
    pineconeIndex: config.pineconeIndex || '(missing)',
    pineconeNamespace: config.pineconeNamespace,
    ingestOnStartup: config.ingestOnStartup,
    knowledgeDirectory: config.knowledgeDirectory,
    hasGeminiApiKey: Boolean(config.geminiApiKey),
    hasPineconeApiKey: Boolean(config.pineconeApiKey)
  });
  return config;
}

function validateConfig(config) {
  const missing = [];
  if (!config.geminiApiKey) missing.push('GEMINI_API_KEY');
  if (!config.pineconeApiKey) missing.push('PINECONE_API_KEY');
  if (!config.pineconeIndex) missing.push('PINECONE_INDEX');

  if (missing.length > 0) {
    log('Config', 'Configuration validation failed', { missing });
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
  log('Config', 'Configuration validation passed');
}

module.exports = { getConfig, validateConfig };
