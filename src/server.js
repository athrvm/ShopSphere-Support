const { getConfig, validateConfig } = require('./config');
const { ChatbotService } = require('./services/ChatbotService');
const GeminiClient = require('./integrations/GeminiClient');
const PineconeClient = require('./integrations/PineconeClient');
const createApp = require('./app');
const { log, error: logError } = require('./utils/logger');

async function start() {
  log('Server', 'Starting ShopSphere support application');
  const config = getConfig();
  validateConfig(config);

  log('Server', 'Creating Gemini client');
  const geminiClient = new GeminiClient(config);
  log('Server', 'Creating Pinecone client');
  const pineconeClient = new PineconeClient(config);
  await pineconeClient.assertCompatibleDimension(config.geminiEmbeddingDimensions);
  log('Server', 'Creating chatbot service');
  const chatbotService = new ChatbotService({ config, geminiClient, pineconeClient });

  if (config.ingestOnStartup) {
    log('Server', 'Startup ingestion enabled; loading knowledge base');
    const result = await chatbotService.loadKnowledgeBase();
    log('Server', 'Startup ingestion completed', result);
  } else {
    log('Server', 'Startup ingestion disabled; Pinecone writes are deferred');
  }

  log('Server', 'Creating Express application');
  const app = createApp({ chatbotService, config });
  const server = app.listen(config.port, () => {
    const address = server.address();
    log('Server', `ShopSphere support listening on http://localhost:${config.port}`, {
      listening: server.listening,
      address: address && typeof address === 'object' ? address.address : address,
      port: address && typeof address === 'object' ? address.port : config.port
    });
  });

  server.on('error', (serverError) => {
    logError('Server', 'HTTP server error', { message: serverError.message, code: serverError.code });
    process.exitCode = 1;
  });

  server.on('close', () => {
    log('Server', 'HTTP server closed');
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('Server', `${signal} received; shutting down gracefully`);

    if (!server.listening) {
      return;
    }

    const deadline = setTimeout(() => {
      logError('Server', 'Shutdown deadline reached; closing remaining connections');
      server.closeAllConnections();
    }, config.requestTimeoutMs + 1000);
    deadline.unref();
    server.close((closeError) => {
      clearTimeout(deadline);
      if (closeError) {
        logError('Server', 'Error while closing HTTP server', { message: closeError.message });
        process.exitCode = 1;
      }
    });
    server.closeIdleConnections();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  start().catch((error) => {
    logError('Server', 'Unable to start application', { message: error.message });
    process.exitCode = 1;
  });
}

module.exports = { start };
