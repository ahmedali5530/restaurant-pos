import { describe, expect, it } from 'vitest';
import { isLoopbackServerHost } from './desktop-connectivity.ts';

describe('isLoopbackServerHost', () => {
  it('treats a blank or loopback address as this PC', () => {
    expect(isLoopbackServerHost('')).toBe(true);
    expect(isLoopbackServerHost(null)).toBe(true);
    expect(isLoopbackServerHost('localhost')).toBe(true);
    expect(isLoopbackServerHost('127.0.0.1')).toBe(true);
    expect(isLoopbackServerHost('http://127.0.0.1:3142')).toBe(true);
  });

  it('treats another terminal as a remote server', () => {
    expect(isLoopbackServerHost('192.168.1.13')).toBe(false);
    expect(isLoopbackServerHost('http://192.168.1.13:3142')).toBe(false);
  });
});
