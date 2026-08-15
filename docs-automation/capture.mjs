#!/usr/bin/env node
/**
 * Capture guide screenshots for one or all UI languages.
 *
 * Usage:
 *   node docs-automation/capture.mjs              # all languages
 *   DOCS_GUIDE_LANG=es node docs-automation/capture.mjs
 *   DOCS_GUIDE_LANGS=en,es,de node docs-automation/capture.mjs
 *   node docs-automation/capture.mjs -- stories/login.guide.ts
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const ALL = [
  'en',
  'es',
  'tr',
  'pt-BR',
  'fr',
  'nl',
  'de',
  'it',
  'ar',
  'ru',
];

function resolveLangList() {
  if (process.env.DOCS_GUIDE_LANG) {
    return [process.env.DOCS_GUIDE_LANG.trim()];
  }
  if (process.env.DOCS_GUIDE_LANGS) {
    return process.env.DOCS_GUIDE_LANGS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return ALL;
}

const extraArgs = process.argv.slice(2);
const langs = resolveLangList();
const config = path.join(__dirname, 'playwright.config.ts');

console.log(`Docs capture languages: ${langs.join(', ')}`);
if (extraArgs.length) {
  console.log(`Extra Playwright args: ${extraArgs.join(' ')}`);
}

let failed = 0;
for (const lang of langs) {
  console.log(`\n========== DOCS_GUIDE_LANG=${lang} ==========\n`);
  const result = spawnSync(
    'npx',
    ['playwright', 'test', '--config', config, ...extraArgs],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        DOCS_GUIDE_LANG: lang,
      },
      shell: process.platform === 'win32',
    }
  );
  if (result.status !== 0) {
    console.error(`Capture failed for language ${lang} (exit ${result.status})`);
    failed += 1;
    // Continue other langs so one failure does not drop the rest
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${langs.length} language capture run(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${langs.length} language capture run(s) completed.`);
