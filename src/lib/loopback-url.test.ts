import { describe, expect, it } from 'vitest';
import { rewriteLoopbackHost, toLoopbackIp } from './loopback-url.ts';

describe('toLoopbackIp', () => {
  it('rewrites localhost to the IPv4 loopback address', () => {
    expect(toLoopbackIp('http://localhost:3142')).toBe('http://127.0.0.1:3142');
    expect(toLoopbackIp('ws://localhost:3142/rpc')).toBe('ws://127.0.0.1:3142/rpc');
    expect(toLoopbackIp('http://localhost:3142/auth/login')).toBe('http://127.0.0.1:3142/auth/login');
  });

  it('points loopback service URLs at the PC that served the page', () => {
    expect(rewriteLoopbackHost('http://127.0.0.1:3142', '192.168.1.13')).toBe('http://192.168.1.13:3142');
    expect(rewriteLoopbackHost('ws://localhost:3142/rpc', '192.168.1.13')).toBe('ws://192.168.1.13:3142/rpc');
    expect(rewriteLoopbackHost('http://10.0.0.5:3142', '192.168.1.13')).toBe('http://10.0.0.5:3142');
  });

  it('leaves other hosts unchanged', () => {
    expect(toLoopbackIp('http://192.168.1.13:3142')).toBe('http://192.168.1.13:3142');
    expect(toLoopbackIp('http://tauri.localhost')).toBe('http://tauri.localhost');
    expect(toLoopbackIp('http://127.0.0.1:3142')).toBe('http://127.0.0.1:3142');
  });
});
