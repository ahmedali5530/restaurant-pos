/**
 * WebKit stalls on the hostname `localhost` when the machine is offline:
 * it tries IPv6 and proxy auto-discovery before the local gateway.
 * `127.0.0.1` skips that lookup. Other hosts are left unchanged.
 */
export function toLoopbackIp(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.hostname !== 'localhost') return trimmed;
    url.hostname = '127.0.0.1';
    let out = url.toString();
    if (!trimmed.endsWith('/') && out.endsWith('/')) {
      out = out.slice(0, -1);
    }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
      out = out.replace(/^http:\/\//, '');
    }
    return out;
  } catch {
    return trimmed.replace(/^(https?:\/\/|wss?:\/\/)?localhost\b/i, (match) =>
      match.replace(/localhost/i, '127.0.0.1'),
    );
  }
}
