const { log } = require('../utils/logger');
const { validateQuestion } = require('../utils/validation');
const AppError = require('../utils/AppError');

class ChatbotController {
  constructor(chatbotService) {
    this.chatbotService = chatbotService;
    this.query = this.query.bind(this);
  }

  async query(req, res, next) {
    const { question } = req.query;
    let validated;
    try {
      validated = validateQuestion(question);
    } catch (error) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    let timer;
    try {
      const timeoutMs = req.app?.locals.requestTimeoutMs || 65000;
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new AppError('Support took too long to respond. Please try again.', 504, 'REQUEST_TIMEOUT')), timeoutMs);
        timer.unref?.();
      });
      const answer = await Promise.race([this.chatbotService.answerUserQuery(validated), timeout]);
      if (typeof answer !== 'string' || !answer.trim()) {
        throw new AppError('Support returned an invalid response. Please try again.', 502, 'INVALID_RESPONSE');
      }
      log('Controller', 'Chatbot service returned an answer', { answerLength: answer.length });
      if (!res.destroyed) res.json({ answer });
    } catch (error) {
      next(error);
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = ChatbotController;
