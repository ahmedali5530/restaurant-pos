'use strict';

const LEVEL_PRIORITY = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function createLogger(level = 'info') {
  const activeLevel = LEVEL_PRIORITY[level] ? level : 'info';

  function shouldLog(targetLevel) {
    return LEVEL_PRIORITY[targetLevel] >= LEVEL_PRIORITY[activeLevel];
  }

  function output(targetLevel, message, meta) {
    if (!shouldLog(targetLevel)) return;
    const prefix = `[sync-service] [${targetLevel.toUpperCase()}]`;
    const ts = new Date().toISOString();
    if (meta === undefined) {
      // eslint-disable-next-line no-console
      console.log(ts, prefix, message);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(ts, prefix, message, meta);
  }

  return {
    debug: (message, meta) => output('debug', message, meta),
    info: (message, meta) => output('info', message, meta),
    warn: (message, meta) => output('warn', message, meta),
    error: (message, meta) => output('error', message, meta),
  };
}

module.exports = {
  createLogger,
};
