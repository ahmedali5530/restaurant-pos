#!/usr/bin/env node
/**
 * Cross-platform launcher: bash tauri.sh on Unix, PowerShell tauri.ps1 on Windows.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const root = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';

const child = isWin
  ? spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tauri.ps1'), ...args],
      { stdio: 'inherit', cwd: root },
    )
  : spawn('bash', [path.join(root, 'tauri.sh'), ...args], {
      stdio: 'inherit',
      cwd: root,
    });

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
