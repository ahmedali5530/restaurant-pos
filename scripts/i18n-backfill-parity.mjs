#!/usr/bin/env node
/**
 * Backfills missing locale keys from parity patch files (missing keys only).
 * Run: node scripts/i18n-backfill-parity.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'src/locales');
const PATCHES_DIR = path.join(__dirname, 'i18n-parity-patches');

const LANGS = ['es', 'tr', 'pt-br', 'fr', 'de', 'it', 'nl', 'ru', 'ar'];
const NAMESPACES = ['inventory', 'reports'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Deep-merge patch into target; only adds keys that do not already exist. */
function deepMergeMissing(target, patch) {
  if (!isPlainObject(patch)) {
    return target;
  }

  const result = { ...target };

  for (const [key, patchValue] of Object.entries(patch)) {
    if (!(key in result)) {
      result[key] = patchValue;
      continue;
    }

    const targetValue = result[key];
    if (isPlainObject(targetValue) && isPlainObject(patchValue)) {
      result[key] = deepMergeMissing(targetValue, patchValue);
    }
  }

  return result;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

for (const lang of LANGS) {
  const patchFile = path.join(PATCHES_DIR, `${lang}.json`);
  if (!fs.existsSync(patchFile)) {
    console.error(`Missing patch file: ${patchFile}`);
    process.exit(1);
  }

  const patch = loadJson(patchFile);

  for (const ns of NAMESPACES) {
    if (!patch[ns]) {
      console.warn(`Warning: ${lang}.json has no "${ns}" section, skipping`);
      continue;
    }

    const localeFile = path.join(LOCALES_DIR, lang, `${ns}.json`);
    const current = loadJson(localeFile);
    const merged = deepMergeMissing(current, patch[ns]);
    writeJson(localeFile, merged);
    console.log(`Updated ${lang}/${ns}.json`);
  }
}

console.log('i18n parity backfill complete.');
