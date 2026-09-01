'use strict';

const logger = require('./logger');

function sendSuccess(res, data, status = 200) {
  res.status(status).json({
    success: true,
    data,
  });
}

function sendError(res, status, message, details) {
  res.status(status).json({
    success: false,
    error: message,
    details: details || undefined,
  });
}

function handleError(res, err) {
  const message = err && err.message ? err.message : 'Unexpected server error';
  const details = err && err.details ? err.details : undefined;
  const statusCode = err && err.statusCode ? err.statusCode : null;

  logger.error('api', message, {
    statusCode: statusCode || undefined,
    details,
    stack: err && err.stack ? err.stack.split('\n').slice(0, 5) : undefined,
  });

  if (message.toLowerCase().includes('unsupported')) {
    return sendError(res, 400, message, details);
  }
  if (
    message.toLowerCase().includes('required') ||
    message.toLowerCase().includes('incomplete') ||
    message.toLowerCase().includes('invalid') ||
    message.toLowerCase().includes('not found') ||
    message.toLowerCase().includes('must be')
  ) {
    return sendError(res, 422, message, details);
  }
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return sendError(res, statusCode, message, details);
  }
  return sendError(res, 500, message, details);
}

module.exports = {
  sendSuccess,
  sendError,
  handleError,
};
