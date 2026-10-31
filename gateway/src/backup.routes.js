'use strict';

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { verifySession, extractBearer } = require('./jwt');
const { getUserRoleModules } = require('./auth.service');
const {
  hasDatabaseBackupAccess,
  surrealHttpEndpoint,
  maxUploadBytes,
} = require('./backup.helpers');

const router = express.Router();

function surrealCliConfig() {
  const user = process.env.SURREAL_USER;
  const pass = process.env.SURREAL_PASS;
  if (!user || !pass) {
    const err = new Error('SURREAL_USER and SURREAL_PASS must be set');
    err.status = 500;
    throw err;
  }
  return {
    bin: process.env.SURREAL_BIN || '/surreal',
    endpoint: surrealHttpEndpoint(),
    user,
    pass,
    namespace: process.env.SURREAL_NS || 'posr',
    database: process.env.SURREAL_DB || 'posr',
  };
}

async function requireDatabaseBackupAccess(req, res, next) {
  try {
    const payload = await verifySession(extractBearer(req));
    const jwtRoles = payload.roles || [];
    let allowed = hasDatabaseBackupAccess(jwtRoles);
    if (!allowed) {
      const modules = await getUserRoleModules(payload.sub);
      allowed = hasDatabaseBackupAccess(modules);
    }
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'settings.database permission required',
      });
    }
    req.backupSession = payload;
    return next();
  } catch (err) {
    return res.status(err.status || 401).json({ ok: false, error: err.message });
  }
}

/** @param {'export'|'import'} command @param {string} fileOrDash */
function spawnSurreal(command, fileOrDash) {
  const cfg = surrealCliConfig();
  const child = spawn(
    cfg.bin,
    [
      '--log',
      'none',
      command,
      '--endpoint',
      cfg.endpoint,
      '--username',
      cfg.user,
      '--password',
      cfg.pass,
      '--namespace',
      cfg.namespace,
      '--database',
      cfg.database,
      fileOrDash,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return child;
}

/**
 * GET /backup/database — stream a full Surreal export (.surql).
 */
router.get('/database', requireDatabaseBackupAccess, async (req, res) => {
  let child;
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `posr-database-${stamp}.surql`;
    child = spawnSurreal('export', '-');

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    res.status(200);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    child.stdout.pipe(res);

    child.on('error', (err) => {
      console.error('surreal export spawn error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: 'Failed to start surreal export' });
      } else {
        res.destroy(err);
      }
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error('surreal export failed:', code, stderr);
        if (!res.headersSent) {
          res.status(500).json({
            ok: false,
            error: stderr.trim() || `surreal export exited with code ${code}`,
          });
        } else if (!res.writableEnded) {
          res.destroy(new Error(stderr.trim() || `export exit ${code}`));
        }
      }
    });
  } catch (err) {
    console.error(err);
    if (child) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    if (!res.headersSent) {
      res.status(err.status || 500).json({ ok: false, error: err.message });
    }
  }
});

/**
 * POST /backup/database — stream upload to temp file, then surreal import.
 * Body: raw .surql bytes (Content-Type: application/octet-stream).
 */
router.post('/database', requireDatabaseBackupAccess, async (req, res) => {
  const maxBytes = maxUploadBytes();
  const tmp = path.join(
    os.tmpdir(),
    `posr-restore-${Date.now()}-${Math.random().toString(36).slice(2)}.surql`,
  );
  let size = 0;
  let rejected = false;

  try {
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(tmp);
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes && !rejected) {
          rejected = true;
          req.unpipe(out);
          out.destroy();
          req.resume();
          const err = new Error(`Upload exceeds BACKUP_MAX_UPLOAD_BYTES (${maxBytes})`);
          err.status = 413;
          reject(err);
        }
      });
      req.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
      req.pipe(out);
    });

    if (size === 0) {
      const err = new Error('Empty backup file');
      err.status = 400;
      throw err;
    }

    const child = spawnSurreal('import', tmp);
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });

    if (code !== 0) {
      const err = new Error(stderr.trim() || `surreal import exited with code ${code}`);
      err.status = 500;
      throw err;
    }

    return res.json({ ok: true, bytes: size });
  } catch (err) {
    console.error('database restore failed:', err.message);
    return res.status(err.status || 500).json({ ok: false, error: err.message });
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
  }
});

module.exports = {
  router,
  hasDatabaseBackupAccess,
  surrealHttpEndpoint,
  maxUploadBytes,
};
