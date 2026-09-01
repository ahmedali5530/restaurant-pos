'use strict';

const { WebSocketServer, WebSocket } = require('ws');
const { verifySession } = require('./jwt');

const SURREAL_WS_URL = process.env.SURREAL_URL || 'ws://127.0.0.1:8000/rpc';
const SURREAL_PROTOCOLS = ['cbor', 'json', 'flatbuffers', 'msgpack'];

function getTokenFromUpgrade(req) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const q = url.searchParams.get('token') || url.searchParams.get('access_token');
    if (q) return q;

    const header = req.headers?.authorization || '';
    const match = String(header).match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();

    const proto = req.headers['sec-websocket-protocol'];
    if (proto) {
      const parts = String(proto).split(',').map((p) => p.trim());
      const bearer = parts.find((p) => p.toLowerCase().startsWith('bearer.'));
      if (bearer) return bearer.slice('bearer.'.length);
    }
  } catch {
    // ignore
  }
  return null;
}

function parseRequestedProtocols(req) {
  return String(req.headers['sec-websocket-protocol'] || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !p.toLowerCase().startsWith('bearer.'));
}

function selectSurrealProtocol(requested) {
  for (const p of SURREAL_PROTOCOLS) {
    if (requested.includes(p)) return p;
  }
  return undefined;
}

function safeClose(ws, code, reason) {
  try {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(code, reason);
    }
  } catch {
    // ignore
  }
}

/**
 * Attach WS upgrade handler for /rpc Surreal relay.
 *
 * The Surreal JS SDK opens sockets with subprotocol "cbor". We must:
 * 1) select that protocol in the browser handshake
 * 2) open upstream to Surreal with the same protocol
 * 3) buffer client frames until upstream is OPEN (SDK sends USE/AUTH immediately)
 */
function attachRpcRelay(server) {
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols(protocols) {
      for (const p of SURREAL_PROTOCOLS) {
        if (protocols.has(p)) return p;
      }
      return false;
    },
  });

  server.on('upgrade', async (req, socket, head) => {
    const pathname = (() => {
      try {
        return new URL(req.url || '/', 'http://localhost').pathname;
      } catch {
        return '';
      }
    })();

    if (pathname !== '/rpc' && pathname !== '/rpc/') {
      socket.destroy();
      return;
    }

    const token = getTokenFromUpgrade(req);
    try {
      await verifySession(token);
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const selected = selectSurrealProtocol(parseRequestedProtocols(req));

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      const upstreamOpts = { perMessageDeflate: false };
      const upstream = selected
        ? new WebSocket(SURREAL_WS_URL, selected, upstreamOpts)
        : new WebSocket(SURREAL_WS_URL, upstreamOpts);

      const pendingToUpstream = [];
      let bridging = false;

      const sendUp = (data, isBinary) => {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(data, { binary: isBinary });
        } else {
          pendingToUpstream.push({ data, isBinary });
        }
      };

      const fail = (reason) => {
        safeClose(clientWs, 1011, reason || 'upstream unavailable');
        try {
          upstream.terminate();
        } catch {
          // ignore
        }
      };

      clientWs.on('message', (data, isBinary) => {
        sendUp(data, isBinary);
      });

      clientWs.on('close', () => safeClose(upstream));
      clientWs.on('error', () => {
        try {
          upstream.terminate();
        } catch {
          // ignore
        }
      });

      upstream.on('open', () => {
        bridging = true;
        for (const frame of pendingToUpstream.splice(0)) {
          if (upstream.readyState === WebSocket.OPEN) {
            upstream.send(frame.data, { binary: frame.isBinary });
          }
        }
      });

      upstream.on('message', (data, isBinary) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });

      upstream.on('close', () => safeClose(clientWs));
      upstream.on('error', () => {
        if (!bridging) fail('upstream error');
      });
    });
  });

  return wss;
}

module.exports = {
  attachRpcRelay,
};
