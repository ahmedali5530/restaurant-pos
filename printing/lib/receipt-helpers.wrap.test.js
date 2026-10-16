'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { wrapReceiptText, normalizeSections } = require('./receipt-helpers');

test('wrapReceiptText wraps long paragraphs to normal width (42)', () => {
  const long = 'The quick brown fox jumps over the lazy dog and keeps running past the fence';
  const lines = wrapReceiptText(long, 'normal');
  assert.ok(lines.length > 1);
  lines.forEach((line) => assert.ok(line.length <= 42, `line too long: ${line}`));
  assert.equal(lines.join(' ').replace(/\s+/g, ' ').trim(), long);
});

test('wrapReceiptText respects newlines as hard breaks', () => {
  const lines = wrapReceiptText('Line one\nLine two\nLine three', 'normal');
  assert.deepEqual(lines, ['Line one', 'Line two', 'Line three']);
});

test('wrapReceiptText uses shorter width for medium/large sizes', () => {
  const text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  const lines = wrapReceiptText(text, 'medium');
  assert.ok(lines.length >= 2);
  lines.forEach((line) => assert.ok(line.length <= 21));
});

test('wrapReceiptText hard-breaks oversized tokens', () => {
  const token = 'A'.repeat(50);
  const lines = wrapReceiptText(token, 'normal');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].length, 42);
  assert.equal(lines[1].length, 8);
});

test('normalizeSections keeps full text and image dimensions', () => {
  const [section] = normalizeSections([
    {
      enabled: true,
      type: 'text',
      align: 'center',
      size: 'normal',
      content: 'x'.repeat(80),
    },
    {
      enabled: true,
      type: 'image',
      align: 'left',
      content: '',
      width: 200,
      height: 80,
    },
  ]);
  assert.equal(section.content.length, 80);
  const [, image] = normalizeSections([
    { type: 'text', content: 'hi' },
    { type: 'image', content: '', width: 200, height: 80 },
  ]);
  assert.equal(image.width, 200);
  assert.equal(image.height, 80);
});
