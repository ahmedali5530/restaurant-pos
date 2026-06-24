#!/usr/bin/env node
/**
 * Overwrites discount-related locale keys from translated patch files.
 * Run: node scripts/i18n-backfill-discount.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'src/locales');
const PATCHES_DIR = path.join(__dirname, 'i18n-discount-patches');

const LANGS = ['es', 'tr', 'pt-br', 'fr', 'de', 'it', 'nl', 'ru', 'ar'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Deep-merge patch into target; patch values win at every level. */
function deepMergeReplace(target, patch) {
  if (!isPlainObject(patch)) {
    return patch;
  }

  const result = { ...(isPlainObject(target) ? target : {}) };

  for (const [key, patchValue] of Object.entries(patch)) {
    if (isPlainObject(patchValue) && isPlainObject(result[key])) {
      result[key] = deepMergeReplace(result[key], patchValue);
    } else {
      result[key] = patchValue;
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

  for (const [ns, nsPatch] of Object.entries(patch)) {
    const localeFile = path.join(LOCALES_DIR, lang, `${ns}.json`);
    if (!fs.existsSync(localeFile)) {
      console.warn(`Warning: ${localeFile} not found, skipping`);
      continue;
    }

    const current = loadJson(localeFile);
    const merged = deepMergeReplace(current, nsPatch);
    writeJson(localeFile, merged);
    console.log(`Updated ${lang}/${ns}.json`);
  }
}

console.log('Discount i18n backfill complete.');
