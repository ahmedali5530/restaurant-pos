'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getBuilder } = require('../print-builders');
const { testSlipContent } = require('./test-print-content');

test('test slip uses client labels and connection fields', () => {
  const slip = testSlipContent({
    printerName: 'Kitchen',
    printerType: 'Network',
    address: '192.168.1.20:9100',
    lines: {
      title: 'TESDRUCK',
      name: 'Name',
      type: 'Typ',
      address: 'Adresse',
      ok: 'Verbunden.',
    },
  });

  assert.deepEqual(slip.titleLines, ['TESDRUCK']);
  assert.deepEqual(slip.rowLines, [
    'Name: Kitchen',
    'Typ: Network',
    'Adresse: 192.168.1.20:9100',
  ]);
  assert.deepEqual(slip.okLines, ['Verbunden.']);
});

test('test print builder is registered', () => {
  const builder = getBuilder('test');
  assert.equal(typeof builder.build, 'function');
});

test('test slip rasterizes to a png', async () => {
  const { renderRasterPngs } = require('./raster-render');
  const pngs = await renderRasterPngs('test', {
    printerName: 'Bar',
    printerType: 'Network',
    address: '10.0.0.8:9100',
  }, { paperWidthMm: 80 });
  assert.equal(pngs.length, 1);
  assert.ok(Buffer.isBuffer(pngs[0]));
  assert.ok(pngs[0].length > 100);
  assert.equal(pngs[0][0], 0x89);
});
