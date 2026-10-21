'use strict';

const Network = require('escpos-network');
const net = require('net');

/**
 * escpos-network closes with socket.destroy(). That aborts the TCP session
 * with RST after the write is queued. Many thermal printers only release the
 * ticket on a clean FIN, so the HTTP handler reports success and nothing prints.
 * end() flushes the buffer and half-closes the socket.
 */
const NETWORK_FLUSH_TIMEOUT_MS = 20000;

Network.prototype.close = function (callback) {
  const sock = this.device;
  this.device = null;
  if (!sock || sock.destroyed) {
    this.emit('disconnect', sock);
    if (callback) callback(null, sock);
    return this;
  }

  let settled = false;
  const finish = (err) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    this.emit('disconnect', sock);
    if (callback) callback(err || null, sock);
  };

  const timer = setTimeout(() => {
    try {
      sock.destroy();
    } catch (_) {
      // already gone
    }
    finish(new Error('Printer connection flush timed out'));
  }, NETWORK_FLUSH_TIMEOUT_MS);

  sock.once('error', (err) => finish(err));
  sock.end(() => finish(null));
  return this;
};

/**
 * Allow only private / link-local LAN targets for network printers (SSRF guard).
 * Override with PRINT_ALLOWED_IPS=comma,separated,ips.
 */
function isAllowedPrinterIp(ip) {
  const raw = String(ip || '').trim();
  if (!raw) return false;

  if (raw === '169.254.169.254' || raw === 'metadata' || raw === 'localhost') {
    return false;
  }

  const allowlist = String(process.env.PRINT_ALLOWED_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length > 0) {
    return allowlist.includes(raw);
  }

  if (net.isIPv4(raw)) {
    const parts = raw.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 127) return true;
    return false;
  }

  if (net.isIPv6(raw)) {
    const lower = raw.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80')) return true;
    return false;
  }

  return false;
}

/**
 * Network printer driver using escpos-network adapter.
 * @param {Object} config - { ip: string, port?: number }
 * @returns {Object} escpos Network adapter (device) with open, write, close
 */
function createDevice(config = {}) {
  const { ip, port = 9100 } = config;
  if (!ip) {
    throw new Error('Network printer requires "ip" in config');
  }
  if (!isAllowedPrinterIp(ip)) {
    throw new Error(`Printer IP not allowed: ${ip}`);
  }
  const p = Number(port);
  if (!Number.isFinite(p) || p < 1 || p > 65535) {
    throw new Error(`Invalid printer port: ${port}`);
  }
  return new Network(ip, p);
}

module.exports = { createDevice, isAllowedPrinterIp };
