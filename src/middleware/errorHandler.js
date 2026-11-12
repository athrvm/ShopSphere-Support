const { error: logError } = require('../utils/logger');

function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  const status = Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
    ? error.statusCode : 500;
  let message = 'Something went wrong. Please try again.';
  if (error.type === 'entity.too.large') message = 'The request is too large.';
  else if (error instanceof SyntaxError && status === 400) message = 'The request contains invalid JSON.';
  else if (error.expose) message = error.message;
  else if (status === 502 || status === 503) message = 'The support service is temporarily unavailable. Please try again.';
  logError('ErrorHandler', 'Returning error response', {
    method: req.method,
    path: req.path,
    status,
    code: error.code,
    message: error.message
  });
  if (res.headersSent) return next(error);
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
