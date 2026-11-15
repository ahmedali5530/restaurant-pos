'use strict';

/** @typedef {'text'|'raster'|string} PrintMode */

const PAPER_WIDTH_DOTS = {
  58: 384,
  72: 512,
  80: 576,
};

const DEFAULT_PRINT_MODE = 'text';
const DEFAULT_PAPER_WIDTH_MM = 80;
const DEFAULT_RASTER_THRESHOLD = 180;

/**
 * Map paper width in mm to ESC/POS bit-image dots.
 * @param {unknown} mm
 * @returns {number|null}
 */
function isSupportedPaperWidthMm(mm) {
  const n = parseInt(String(mm), 10);
  return n === 58 || n === 72 || n === 80;
}

function paperWidthMmToPx(mm) {
  const n = parseInt(String(mm), 10);
  if (isSupportedPaperWidthMm(n)) return PAPER_WIDTH_DOTS[n];
  return null;
}

/**
 * @param {unknown} mode
 * @returns {PrintMode}
 */
function resolvePrintMode(mode) {
  if (mode == null || mode === '') return DEFAULT_PRINT_MODE;
  const m = String(mode).trim().toLowerCase();
  return m || DEFAULT_PRINT_MODE;
}

/**
 * Merge print-type config with optional per-printer overrides.
 * Precedence: printer → type config → defaults.
 * @param {Object} typeConfig - already normalizeConfig()'d or raw type values
 * @param {Object} [printer] - driver config with optional print_mode / paper_width_mm
 * @returns {Object}
 */
function mergeEffectiveConfig(typeConfig, printer) {
  const base = typeConfig && typeof typeConfig === 'object' ? { ...typeConfig } : {};
  const p = printer && typeof printer === 'object' ? printer : {};

  if (p.print_mode != null && String(p.print_mode).trim() !== '') {
    base.printMode = resolvePrintMode(p.print_mode);
  }
  if (p.paper_width_mm != null && String(p.paper_width_mm).trim() !== '') {
    const mm = parseInt(String(p.paper_width_mm), 10);
    if (isSupportedPaperWidthMm(mm)) {
      base.paperWidthMm = mm;
      base.paperWidthPx = PAPER_WIDTH_DOTS[mm];
    }
  }

  if (base.printMode == null || base.printMode === '') {
    base.printMode = DEFAULT_PRINT_MODE;
  } else {
    base.printMode = resolvePrintMode(base.printMode);
  }

  if (base.paperWidthMm == null || base.paperWidthMm === '') {
    base.paperWidthMm = DEFAULT_PAPER_WIDTH_MM;
  } else {
    const mm = parseInt(String(base.paperWidthMm), 10);
    base.paperWidthMm = isSupportedPaperWidthMm(mm) ? mm : DEFAULT_PAPER_WIDTH_MM;
  }

  const fromMm = paperWidthMmToPx(base.paperWidthMm);
  if (fromMm != null) {
    base.paperWidthPx = fromMm;
  }

  return base;
}

module.exports = {
  PAPER_WIDTH_DOTS,
  DEFAULT_PRINT_MODE,
  DEFAULT_PAPER_WIDTH_MM,
  DEFAULT_RASTER_THRESHOLD,
  isSupportedPaperWidthMm,
  paperWidthMmToPx,
  resolvePrintMode,
  mergeEffectiveConfig,
};
