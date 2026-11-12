const AppError = require('./AppError');

const MAX_QUESTION_LENGTH = 2000;

function validateQuestion(question) {
  if (typeof question !== 'string' || !question.trim()) {
    throw new AppError('The question query parameter is required', 400, 'INVALID_QUESTION');
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new AppError(`Please keep your question under ${MAX_QUESTION_LENGTH} characters.`, 400, 'INVALID_QUESTION');
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(question)) {
    throw new AppError('The question contains unsupported control characters.', 400, 'INVALID_QUESTION');
  }
  return question.trim();
}

module.exports = { validateQuestion, MAX_QUESTION_LENGTH };
