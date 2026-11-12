const express = require('express');
const ChatbotController = require('../controllers/ChatbotController');
const { log } = require('../utils/logger');

function createChatbotRouter(chatbotService) {
  log('Routes', 'Registering GET /api/v1/query route');
  const router = express.Router();
  const controller = new ChatbotController(chatbotService);
  router.get('/health', (req, res) => res.json({ status: 'ok', service: 'shopsphere-support' }));
  router.get('/query', controller.query);
  return router;
}

module.exports = createChatbotRouter;
