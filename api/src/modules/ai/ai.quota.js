'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../../lib/logger');

const USAGE_DIR = path.resolve(__dirname, '../../../data');
const USAGE_FILE = path.join(USAGE_DIR, 'ai-usage.json');

/** Serialize read-modify-write so concurrent requests do not clobber counters. */
let writeChain = Promise.resolve();

function parseOptionalLimit(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.floor(n);
}

function isAiEnabled() {
  const raw = process.env.AI_ENABLED;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return true;
  }
  const normalized = String(raw).trim().toLowerCase();
  return !(normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off');
}

function getLimits() {
  return {
    enabled: isAiEnabled(),
    daily: parseOptionalLimit(process.env.AI_DAILY_LIMIT),
    monthly: parseOptionalLimit(process.env.AI_MONTHLY_LIMIT),
  };
}

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function utcMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function emptyUsage() {
  return {
    day: { key: utcDayKey(), count: 0 },
    month: { key: utcMonthKey(), count: 0 },
  };
}

function normalizeUsage(raw) {
  const base = emptyUsage();
  if (!raw || typeof raw !== 'object') {
    return base;
  }

  const dayKey = raw.day && typeof raw.day.key === 'string' ? raw.day.key : base.day.key;
  const monthKey = raw.month && typeof raw.month.key === 'string' ? raw.month.key : base.month.key;
  const dayCount = raw.day && Number.isFinite(Number(raw.day.count)) ? Math.max(0, Math.floor(Number(raw.day.count))) : 0;
  const monthCount = raw.month && Number.isFinite(Number(raw.month.count))
    ? Math.max(0, Math.floor(Number(raw.month.count)))
    : 0;

  const nowDay = utcDayKey();
  const nowMonth = utcMonthKey();

  return {
    day: {
      key: dayKey === nowDay ? dayKey : nowDay,
      count: dayKey === nowDay ? dayCount : 0,
    },
    month: {
      key: monthKey === nowMonth ? monthKey : nowMonth,
      count: monthKey === nowMonth ? monthCount : 0,
    },
  };
}

function readUsageSync() {
  try {
    if (!fs.existsSync(USAGE_FILE)) {
      return emptyUsage();
    }
    const text = fs.readFileSync(USAGE_FILE, 'utf8');
    return normalizeUsage(JSON.parse(text));
  } catch (err) {
    logger.warn('ai', 'failed to read usage file; starting fresh', { message: err.message });
    return emptyUsage();
  }
}

function writeUsageSync(usage) {
  if (!fs.existsSync(USAGE_DIR)) {
    fs.mkdirSync(USAGE_DIR, { recursive: true });
  }
  const tmp = `${USAGE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(usage, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, USAGE_FILE);
}

function buildSnapshot(usage = readUsageSync()) {
  const limits = getLimits();
  return {
    enabled: limits.enabled,
    daily: {
      used: usage.day.count,
      limit: limits.daily,
    },
    monthly: {
      used: usage.month.count,
      limit: limits.monthly,
    },
  };
}

function quotaError(statusCode, code, message, snapshot) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.details = {
    code,
    daily: snapshot.daily,
    monthly: snapshot.monthly,
  };
  return err;
}

/**
 * Throws 403/429 if AI is disabled or a configured limit is reached.
 * Unset limits are treated as unlimited.
 */
function assertAllowed() {
  const snapshot = buildSnapshot();

  if (!snapshot.enabled) {
    throw quotaError(403, 'AI_DISABLED', 'AI is disabled on this server.', snapshot);
  }

  if (snapshot.daily.limit !== null && snapshot.daily.used >= snapshot.daily.limit) {
    throw quotaError(
      429,
      'AI_DAILY_LIMIT',
      'Daily AI limit reached. Try again tomorrow or ask an administrator to raise the limit.',
      snapshot
    );
  }

  if (snapshot.monthly.limit !== null && snapshot.monthly.used >= snapshot.monthly.limit) {
    throw quotaError(
      429,
      'AI_MONTHLY_LIMIT',
      'Monthly AI limit reached. Ask an administrator to raise the limit or wait until next month.',
      snapshot
    );
  }

  return snapshot;
}

/**
 * Increment daily/monthly counters after a successful upstream completion.
 * Serialized so concurrent requests do not lose counts.
 */
function recordUse() {
  writeChain = writeChain.then(() => {
    const usage = readUsageSync();
    usage.day.count += 1;
    usage.month.count += 1;
    writeUsageSync(usage);
    return buildSnapshot(usage);
  }).catch((err) => {
    logger.error('ai', 'failed to record AI usage', { message: err.message });
    return buildSnapshot();
  });
  return writeChain;
}

function getUsage() {
  return buildSnapshot();
}

module.exports = {
  assertAllowed,
  recordUse,
  getUsage,
  // Exported for tests / diagnostics
  getLimits,
  USAGE_FILE,
};
