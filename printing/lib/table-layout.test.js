'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatTableCustomLines, normalizeTableRows } = require('./table-layout');

test('closing-style columns keep the amount on the right', () => {
  const lines = formatTableCustomLines([
    { text: 'Previous float', align: 'LEFT', width: 0.6 },
    { text: '150.00', align: 'RIGHT', width: 0.4 },
  ], { printerWidth: 42 });
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /^Previous float/);
  assert.match(lines[0].text, /150\.00$/);
  assert.ok(lines[0].text.indexOf('150.00') > lines[0].text.indexOf('Previous float'));
});

test('a cell wider than its column wraps onto the next line', () => {
  const lines = formatTableCustomLines([
    { text: 'Cash left for the following shift name', align: 'LEFT', width: 0.6 },
    { text: '10', align: 'RIGHT', width: 0.4 },
  ], { printerWidth: 42 });
  assert.ok(lines.length > 1);
  assert.match(lines[0].text, /^Cash left/);
  assert.match(lines[1].text, /shift name/);
  assert.match(lines[0].text, /10$/);
});

test('bold cells mark the row bold and a full-width title stays one row', () => {
  const rows = normalizeTableRows({
    rows: [
      [{ text: 'CLOSING SUMMARY', align: 'CENTER', width: 1, style: 'B' }],
    ],
  });
  const lines = formatTableCustomLines(rows[0].cells, { printerWidth: 42 });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].style, 'bold');
  assert.match(lines[0].text, /CLOSING SUMMARY/);
});
