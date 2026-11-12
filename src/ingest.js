const { getConfig, validateConfig } = require('./config');
const { ChatbotService } = require('./services/ChatbotService');
const GeminiClient = require('./integrations/GeminiClient');
const PineconeClient = require('./integrations/PineconeClient');
const { log, error: logError } = require('./utils/logger');

async function ingest() {
  log('Ingest', 'Starting explicit knowledge-base ingestion');
  const config = getConfig();
  validateConfig(config);
  log('Ingest', 'Creating ingestion clients');
  const service = new ChatbotService({
    config,
    geminiClient: new GeminiClient(config),
    pineconeClient: new PineconeClient(config)
  });
  log('Ingest', 'Calling knowledge-base ingestion workflow');
  const result = await service.loadKnowledgeBase();
  log('Ingest', 'Knowledge-base ingestion completed', result);
}

if (require.main === module) {
  ingest().catch((error) => {
    logError('Ingest', 'Knowledge-base ingestion failed', { message: error.message });
    process.exitCode = 1;
  });
}

module.exports = ingest;
