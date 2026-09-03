'use strict';

const TTL_MS = 15 * 60 * 1000;

/** @type {Map<string, { expiresAt: number, data: object }>} */
const sessions = new Map();

/** @type {Map<string, { expiresAt: number, data: object }>} */
const returns = new Map();

function purgeExpired(store) {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}

function saveCheckoutSession(txnRefNo, data) {
  purgeExpired(sessions);
  sessions.set(String(txnRefNo), {
    expiresAt: Date.now() + TTL_MS,
    data,
  });
}

function getCheckoutSession(txnRefNo) {
  purgeExpired(sessions);
  const entry = sessions.get(String(txnRefNo));
  if (!entry || entry.expiresAt <= Date.now()) {
    sessions.delete(String(txnRefNo));
    return null;
  }
  return entry.data;
}

function saveReturnResult(txnRefNo, data) {
  purgeExpired(returns);
  returns.set(String(txnRefNo), {
    expiresAt: Date.now() + TTL_MS,
    data,
  });
}

function getReturnResult(txnRefNo) {
  purgeExpired(returns);
  const entry = returns.get(String(txnRefNo));
  if (!entry || entry.expiresAt <= Date.now()) {
    returns.delete(String(txnRefNo));
    return null;
  }
  return entry.data;
}

module.exports = {
  saveCheckoutSession,
  getCheckoutSession,
  saveReturnResult,
  getReturnResult,
};
