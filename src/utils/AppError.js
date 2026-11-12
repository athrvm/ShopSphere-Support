class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', options) {
    super(message, options);
    this.statusCode = statusCode;
    this.code = code;
    this.expose = true;
  }
}

module.exports = AppError;
