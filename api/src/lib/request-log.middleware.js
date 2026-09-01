'use strict';

const logger = require('./logger');

function requestLogMiddleware(req, res, next) {
  const started = Date.now();
  const path = req.originalUrl || req.url;

  if (req.method === 'POST') {
    logger.info('http', `${req.method} ${path}`, logger.sanitizeBody(req.body));
  }

  res.on('finish', () => {
    if (req.method === 'POST') {
      logger.info('http', `${req.method} ${path} → ${res.statusCode}`, {
        durationMs: Date.now() - started,
      });
    }
  });

  next();
}

module.exports = { requestLogMiddleware };
