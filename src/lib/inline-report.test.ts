import {describe, expect, it} from 'vitest';
import {isInlineReport, toInlineReportPath} from './inline-report.ts';

const origin = 'http://tauri.localhost';

describe('toInlineReportPath', () => {
  it('keeps a report form in the same window and marks it inline', () => {
    const params = new URLSearchParams();
    params.set('start', '2026-10-01 00:00');
    params.set('end', '2026-10-21 23:59');
    expect(toInlineReportPath('/reports/sales-summary', params, origin)).toBe(
      '/reports/sales-summary?start=2026-10-01+00%3A00&end=2026-10-21+23%3A59&inline=1',
    );
  });

  it('leaves external and non-report addresses alone', () => {
    expect(toInlineReportPath('https://example.com/reports/sales-summary', new URLSearchParams(), origin)).toBeNull();
    expect(toInlineReportPath('/inventory/print/purchase/1', new URLSearchParams(), origin)).toBeNull();
    expect(toInlineReportPath('', new URLSearchParams(), origin)).toBeNull();
  });
});

describe('isInlineReport', () => {
  it('is true only when the report was opened inline', () => {
    expect(isInlineReport('?start=1&inline=1')).toBe(true);
    expect(isInlineReport('?start=1')).toBe(false);
    expect(isInlineReport('')).toBe(false);
  });
});
