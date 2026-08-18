import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for the fail-open DB-credential defect: in legacy mode
 * (VITE_GATEWAY_AUTH off), this module used to fall back to a hardcoded
 * 'root'/'root' SurrealDB credential shipped straight into the browser
 * bundle. It must now require VITE_DB_USER/VITE_DB_PASS explicitly and
 * fail loudly, not silently, when they're missing.
 */

async function loadSettings() {
  vi.resetModules();
  return import('./settings.ts');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('resolveDbAuthentication (legacy mode)', () => {
  it('throws when VITE_DB_USER/VITE_DB_PASS are unset — no silent root/root fallback', async () => {
    vi.stubEnv('VITE_GATEWAY_AUTH', 'false');
    vi.stubEnv('VITE_DB_USER', '');
    vi.stubEnv('VITE_DB_PASS', '');
    const { resolveDbAuthentication } = await loadSettings();

    expect(() => resolveDbAuthentication()).toThrow(/VITE_DB_USER and VITE_DB_PASS/);
  });

  it('throws when only one of VITE_DB_USER/VITE_DB_PASS is set', async () => {
    vi.stubEnv('VITE_GATEWAY_AUTH', 'false');
    vi.stubEnv('VITE_DB_USER', 'someuser');
    vi.stubEnv('VITE_DB_PASS', '');
    const { resolveDbAuthentication } = await loadSettings();

    expect(() => resolveDbAuthentication()).toThrow(/VITE_DB_USER and VITE_DB_PASS/);
  });

  it('never resolves to the literal string "root" for either field once configured', async () => {
    vi.stubEnv('VITE_GATEWAY_AUTH', 'false');
    vi.stubEnv('VITE_DB_USER', 'realOperatorUser');
    vi.stubEnv('VITE_DB_PASS', 'realOperatorPass');
    const { resolveDbAuthentication } = await loadSettings();

    const auth = resolveDbAuthentication() as { username: string; password: string };
    expect(auth.username).toBe('realOperatorUser');
    expect(auth.password).toBe('realOperatorPass');
    expect(auth.username).not.toBe('root');
    expect(auth.password).not.toBe('root');
  });
});

describe('resolveDbAuthentication (gateway mode)', () => {
  it('returns the Surreal session token, not username/password, when gateway auth is on', async () => {
    vi.stubEnv('VITE_GATEWAY_AUTH', 'true');
    const { resolveDbAuthentication } = await loadSettings();

    // No token stored yet in this test's localStorage -> undefined, not a
    // credential object and not 'root'/'root'.
    const auth = resolveDbAuthentication();
    expect(auth).toBeUndefined();
  });

  it('does not read/require VITE_DB_USER or VITE_DB_PASS at all in gateway mode', async () => {
    vi.stubEnv('VITE_GATEWAY_AUTH', 'true');
    vi.stubEnv('VITE_DB_USER', '');
    vi.stubEnv('VITE_DB_PASS', '');
    const { resolveDbAuthentication } = await loadSettings();

    expect(() => resolveDbAuthentication()).not.toThrow();
  });
});
