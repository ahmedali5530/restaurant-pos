import { describe, expect, it } from 'vitest';
import { interpretPrintResponse } from './print.service.ts';

describe('interpretPrintResponse', () => {
  it('treats HTTP 207 with a refused connection as a failure', () => {
    const body = JSON.stringify({
      success: false,
      results: [{ index: 0, ok: false, error: 'connect ECONNREFUSED 192.168.1.11:9100' }],
    });
    const result = interpretPrintResponse(207, body);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('connect ECONNREFUSED 192.168.1.11:9100');
    expect(result.error).toContain('HTTP 207');
  });

  it('keeps every failed printer error', () => {
    const body = JSON.stringify({
      success: false,
      results: [
        { index: 0, ok: false, error: 'connect ECONNREFUSED 192.168.1.11:9100' },
        { index: 1, ok: false, error: 'connect ETIMEDOUT 192.168.1.12:9100' },
      ],
    });
    const result = interpretPrintResponse(207, body);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('192.168.1.11:9100');
    expect(result.error).toContain('192.168.1.12:9100');
  });

  it('accepts HTTP 200 when the server reports success', () => {
    const result = interpretPrintResponse(200, JSON.stringify({
      success: true,
      results: [{ index: 0, ok: true, mode: 'text' }],
    }));
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
