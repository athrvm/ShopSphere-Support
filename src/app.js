const path = require('node:path');
const express = require('express');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const AppError = require('./utils/AppError');
const createChatbotRouter = require('./routes/chatbotRoutes');
const errorHandler = require('./middleware/errorHandler');
const { log } = require('./utils/logger');

function createApp({ chatbotService, config = {}, clientDirectory = path.resolve(__dirname, '../client/dist') }) {
  log('Express', 'Configuring middleware, static files, and API routes');
  const app = express();
  app.disable('x-powered-by');
  app.locals.requestTimeoutMs = config.requestTimeoutMs || 65000;
  app.use(helmet({
    contentSecurityPolicy: {
      directives: { 'connect-src': ["'self'", ...(config.clientOrigins || [])] }
    },
    strictTransportSecurity: config.nodeEnv === 'production' ? undefined : false
  }));
  const origins = config.clientOrigins || ['http://localhost:5173', 'http://127.0.0.1:5173'];
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origins.includes(origin)) return callback(null, true);
      return callback(new AppError('This origin is not allowed.', 403, 'ORIGIN_DENIED'));
    },
    methods: ['GET', 'OPTIONS']
  }));
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', (req, res, next) => {
    const started = performance.now();
    const requestId = randomUUID();
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.on('finish', () => log('Server', 'API request completed', {
      requestId, method: req.method, path: req.path, status: res.statusCode,
      durationMs: Math.round(performance.now() - started)
    }));
    next();
  });
  app.use('/api/v1/query', rateLimit({
    windowMs: config.rateLimitWindowMs || 60000,
    limit: config.rateLimitMax || 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many questions. Please wait a minute and try again.' }
  }));
  app.use('/api/v1', createChatbotRouter(chatbotService));
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  if (fs.existsSync(path.join(clientDirectory, 'index.html'))) {
    app.use(express.static(clientDirectory, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get(['/', '/support'], (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDirectory, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => res.status(503).type('text').send('React client not built. Run npm run dev for development, or npm run build before npm start.'));
  }
  app.use((req, res) => res.status(404).json({ error: 'Page not found.' }));
  app.use(errorHandler);
  log('Express', 'Express application configured');
  return app;
}

module.exports = createApp;
