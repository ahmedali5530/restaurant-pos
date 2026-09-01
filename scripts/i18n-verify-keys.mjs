#!/usr/bin/env node
/**
 * Verifies all t('ns:key') / i18n.t('ns:key') references exist in English locale files.
 * Run: node scripts/i18n-verify-keys.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const LOCALES_DIR = path.join(ROOT, 'src/locales');
const BASE_LANG = 'en';

const KEY_RE = /(?:\bt|\bi18n\.t)\(\s*['"`]([^'"`]+)['"`]/g;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', 'dist'].includes(entry.name)) {
      walk(full, files);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function flatten(obj, prefix = '') {
  const keys = new Set();
  for (const [key, value] of Object.entries(obj)) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      keys.add(pathKey);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const nested of flatten(value, pathKey)) {
        keys.add(nested);
      }
    }
  }
  return keys;
}

function hasKey(defined, pathKey) {
  if (defined.has(pathKey)) return true;

  const pluralSuffixes = ['_zero', '_one', '_two', '_few', '_many', '_other'];
  return pluralSuffixes.some((suffix) => defined.has(`${pathKey}${suffix}`));
}

function loadNamespace(ns) {
  const file = path.join(LOCALES_DIR, BASE_LANG, `${ns}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return flatten(JSON.parse(fs.readFileSync(file, 'utf8')));
}

const used = new Map();

for (const file of walk(SRC_DIR)) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  KEY_RE.lastIndex = 0;
  while ((match = KEY_RE.exec(content)) !== null) {
    const key = match[1];
    if (key.includes('${')) continue;
    if (!key.includes(':')) continue;

    const [ns, ...rest] = key.split(':');
    const pathKey = rest.join(':');
    if (!used.has(ns)) used.set(ns, new Map());
    const map = used.get(ns);
    if (!map.has(pathKey)) map.set(pathKey, new Set());
    map.get(pathKey).add(path.relative(ROOT, file));
  }
}

const namespaceCache = new Map();
let failed = false;

for (const [ns, keyMap] of [...used.entries()].sort()) {
  if (!namespaceCache.has(ns)) {
    namespaceCache.set(ns, loadNamespace(ns));
  }
  const defined = namespaceCache.get(ns);

  if (!defined) {
    failed = true;
    console.error(`\nNamespace file missing: ${BASE_LANG}/${ns}.json`);
    console.error(`  referenced keys (${keyMap.size}):`, [...keyMap.keys()].slice(0, 10).join(', '));
    continue;
  }

  const missing = [...keyMap.keys()].filter((k) => !hasKey(defined, k)).sort();
  if (missing.length) {
    failed = true;
    console.error(`\n${BASE_LANG}/${ns}.json:`);
    console.error(`  missing keys (${missing.length}):`, missing.join(', '));
    for (const key of missing.slice(0, 5)) {
      const refs = [...keyMap.get(key)].slice(0, 3);
      console.error(`    ${key} <- ${refs.join(', ')}`);
    }
    if (missing.length > 5) console.error(`    ... and ${missing.length - 5} more`);
  }
}

if (failed) {
  console.error('\nLocale key reference check FAILED.');
  process.exit(1);
}

const totalKeys = [...used.values()].reduce((sum, map) => sum + map.size, 0);
console.log(`Locale key references OK (${used.size} namespaces, ${totalKeys} keys).`);
