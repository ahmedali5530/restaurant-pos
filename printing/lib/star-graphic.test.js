'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encodeStarGraphic, rgbaToStarRows } = require('./star-graphic');

test('encodeStarGraphic wraps rows in a raster document that cuts', () => {
  const row = Buffer.from([0xff]);
  const buf = encodeStarGraphic([row], { eot: 13 });
  const hex = buf.toString('hex');
  assert.ok(hex.includes('1b2a7252'), 'init raster');
  assert.ok(hex.includes('1b2a7241'), 'enter raster');
  assert.ok(hex.includes('1b2a72503000'), 'continuous page length');
  assert.ok(hex.includes('1b2a7245313300'), 'EOT partial cut');
  assert.ok(hex.includes('620100ff'), 'one black row');
  assert.ok(hex.endsWith('1b2a7242'), 'quit raster');
});

test('rgbaToStarRows sets the leftmost bit for a black pixel', () => {
  const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  const rows = rgbaToStarRows(rgba, 2, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, 1);
  assert.equal(rows[0][0] & 0x80, 0x80);
  assert.equal(rows[0][0] & 0x40, 0);
});
