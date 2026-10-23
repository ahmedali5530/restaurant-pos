'use strict';

const textEngine = require('./text-engine');
const rasterEngine = require('./raster-engine');
const starEngine = require('./star-engine');
const { resolvePrintMode, DEFAULT_PRINT_MODE } = require('../print-mode');

const engines = {
  text: textEngine,
  raster: rasterEngine,
  'star-graphic': starEngine,
};

/**
 * Resolve print engine by mode string. Unknown modes fall back to text.
 * @param {unknown} mode
 * @returns {{ print: Function, name: string }}
 */
function getEngine(mode) {
  const raw = String(mode || '').trim().toLowerCase();
  if (raw === 'star' || raw === 'star-graphic' || raw === 'star_graphic') {
    return { ...engines['star-graphic'], name: 'star-graphic' };
  }
  const resolved = resolvePrintMode(mode);
  const engine = engines[resolved];
  if (!engine) {
    console.warn(
      `[print] unknown printMode "${mode}" (resolved "${resolved}"); falling back to ${DEFAULT_PRINT_MODE}`
    );
    return { ...engines.text, name: DEFAULT_PRINT_MODE };
  }
  return { ...engine, name: resolved };
}

/**
 * Register a future engine (pdf, spooler, qz, …) without changing the dispatch path.
 * @param {string} name
 * @param {{ print: Function }} engine
 */
function registerEngine(name, engine) {
  if (!name || !engine || typeof engine.print !== 'function') {
    throw new Error('registerEngine requires a name and engine.print function');
  }
  engines[String(name).toLowerCase()] = engine;
}

module.exports = {
  getEngine,
  registerEngine,
  engines,
};
