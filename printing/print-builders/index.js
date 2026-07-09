'use strict';

const tempPrint = require('./temp-print');
const summaryPrint = require('./summary-print');
const kitchenPrint = require('./kitchen-print');
const deliveryPrint = require('./delivery-print');
const finalPrint = require('./final-print');
const refundPrint = require('./refund-print');
const deletionPrint = require('./deletion-print');
const tablePrint = require('./table-print');
const pulsePrint = require('./pulse-print');

const BUILDERS = {
  temp: tempPrint,
  summary: summaryPrint,
  kitchen: kitchenPrint,
  delivery: deliveryPrint,
  final: finalPrint,
  refund: refundPrint,
  deletion: deletionPrint,
  table: tablePrint,
  pulse: pulsePrint,
};

/**
 * Get print builder by type.
 * @param {string} type - 'temp' | 'summary' | 'kitchen' | 'delivery' | 'final' | 'refund' | 'deletion' | 'table' | 'pulse'
 * @returns {{ build: (printer, data) => Promise<Printer> }}
 */
function getBuilder(type) {
  const b = BUILDERS[type];
  if (!b) {
    throw new Error(`Unknown print type: ${type}. Use: temp, summary, kitchen, delivery, final, refund, deletion, table, pulse`);
  }
  return b;
}

module.exports = {
  getBuilder,
  temp: tempPrint,
  summary: summaryPrint,
  kitchen: kitchenPrint,
  delivery: deliveryPrint,
  final: finalPrint,
  refund: refundPrint,
  deletion: deletionPrint,
  table: tablePrint,
  pulse: pulsePrint,
};
