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
  resolveSurrealBin,
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
  // Remote WS export against SurrealKV returns "Backups are not supported".
  // Always use HTTP for CLI export/import.
  const bin = resolveSurrealBin({
    bin: process.env.SURREAL_BIN || '',
    execDir: path.dirname(process.execPath),
    entries: (dir) => fs.readdirSync(dir),
    exists: (file) => fs.existsSync(file),
  });
  return {
    bin,
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

function runSurrealToFile(command, filePath) {
  return new Promise((resolve, reject) => {
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
        filePath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    const capture = (chunk) => {
      output += chunk.toString();
      if (output.length > 8000) output = output.slice(-8000);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', (err) => {
      if (err && err.code === 'ENOENT') {
        const missing = new Error(`Surreal CLI not found at ${cfg.bin}`);
        missing.status = 500;
        reject(missing);
        return;
      }
      reject(err);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stderr: output });
        return;
      }
      const err = new Error(
        output.trim() || `surreal ${command} exited with code ${code}`,
      );
      err.status = 500;
      reject(err);
    });
  });
}

/**
 * GET /backup/database — export to a temp file, then stream download.
 * Exporting to a file first avoids empty 200 responses when the CLI fails
 * after headers would already have been sent on a stdout pipe.
 */
router.get('/database', requireDatabaseBackupAccess, async (req, res) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `posr-database-${stamp}.surql`;
  const tmp = path.join(
    os.tmpdir(),
    `posr-export-${Date.now()}-${Math.random().toString(36).slice(2)}.surql`,
  );

  try {
    await runSurrealToFile('export', tmp);

    const stat = await fs.promises.stat(tmp);
    if (!stat.size) {
      const err = new Error(
        'Database export produced an empty file. Ensure the gateway image includes CA certificates and SURREAL_HTTP_ENDPOINT points at the Surreal HTTP port.',
      );
      err.status = 500;
      throw err;
    }

    res.status(200);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'no-store');

    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(tmp);
      stream.on('error', reject);
      res.on('error', reject);
      res.on('finish', resolve);
      stream.pipe(res);
    });
  } catch (err) {
    console.error('database export failed:', err.message);
    if (!res.headersSent) {
      res.status(err.status || 500).json({ ok: false, error: err.message });
    } else if (!res.writableEnded) {
      res.destroy(err);
    }
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
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

    await runSurrealToFile('import', tmp);
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
