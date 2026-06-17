#!/usr/bin/env node
/**
 * Applies i18n to inventory, reports, delivery target files.
 * Run: node scripts/i18n-migrate-targets.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const TARGET_DIRS = [
  'src/components/inventory',
  'src/screens/inventory',
  'src/screens/reports',
  'src/screens/partials/reports.layout.tsx',
  'src/components/reports',
  'src/screens/delivery',
  'src/components/delivery',
];

const NAMESPACE_BY_PATH = (filePath) => {
  if (filePath.includes('/inventory/') || filePath.includes('screens/inventory')) return 'inventory';
  if (filePath.includes('/delivery/') || filePath.includes('components/delivery')) return 'delivery';
  if (filePath.includes('/reports/') || filePath.includes('reports.layout')) return 'reports';
  return 'common';
};

function walk(p, files = []) {
  const full = path.isAbsolute(p) ? p : path.join(ROOT, p);
  if (!fs.existsSync(full)) return files;
  const st = fs.statSync(full);
  if (st.isFile() && /\.tsx?$/.test(full)) {
    files.push(full);
    return files;
  }
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(full)) walk(path.join(full, e), files);
  }
  return files;
}

function getAllTargetFiles() {
  const files = [];
  for (const d of TARGET_DIRS) {
    const full = path.join(ROOT, d);
    if (!fs.existsSync(full)) continue;
    if (fs.statSync(full).isFile()) files.push(full);
    else files.push(...walk(full));
  }
  return [...new Set(files)].sort();
}

function flattenTranslations(obj, prefix = '') {
  const map = new Map();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      if (!map.has(v)) map.set(v, key);
    } else if (v && typeof v === 'object') {
      for (const [sv, sk] of flattenTranslations(v, key)) {
        if (!map.has(sv)) map.set(sv, sk);
      }
    }
  }
  return map;
}

function loadNamespaceMaps() {
  const namespaces = ['inventory', 'reports', 'delivery', 'common', 'toast', 'validation'];
  const byNs = {};
  for (const ns of namespaces) {
    const file = path.join(ROOT, `src/locales/en/${ns}.json`);
    if (fs.existsSync(file)) {
      byNs[ns] = flattenTranslations(JSON.parse(fs.readFileSync(file, 'utf8')));
    }
  }
  return byNs;
}

function resolveKey(text, namespace, maps) {
  const nsMap = maps[namespace];
  if (nsMap?.has(text)) return { ns: namespace, key: nsMap.get(text) };

  const commonMap = maps.common;
  if (commonMap?.has(text)) return { ns: 'common', key: commonMap.get(text) };

  const toastMap = maps.toast;
  if (toastMap?.has(text)) return { ns: 'toast', key: toastMap.get(text) };

  return null;
}

function tCall(resolved) {
  if (!resolved) return null;
  if (resolved.ns === 'common' || resolved.ns === 'toast' || resolved.ns === 'validation') {
    return `t('${resolved.ns}:${resolved.key}')`;
  }
  return `t('${resolved.key}')`;
}

function addUseTranslation(content, namespace) {
  if (content.includes('useTranslation')) return content;

  const importLine = "import { useTranslation } from 'react-i18next';\n";
  if (!content.includes("react-i18next")) {
    const reactImport = content.match(/^import .+ from ['"]react['"];?\n/m);
    if (reactImport) {
      content = content.replace(reactImport[0], reactImport[0] + importLine);
    } else {
      content = importLine + content;
    }
  }

  const patterns = [
    /export const (\w+)(?::[^=]+)? = \([^)]*\)(?::[^=]+)? => \{/,
    /export const (\w+) = \(\{[^}]*\}\)(?::[^=]+)? => \{/,
    /export function (\w+)\([^)]*\)(?::[^{]+)? \{/,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      const insertPos = match.index + match[0].length;
      const hook = `\n  const { t } = useTranslation('${namespace}');`;
      if (!content.slice(insertPos, insertPos + 80).includes('useTranslation')) {
        content = content.slice(0, insertPos) + hook + content.slice(insertPos);
      }
      break;
    }
  }

  return content;
}

function shouldSkipLine(line) {
  if (/^\s*import /.test(line)) return true;
  if (/console\.(log|error|warn)/.test(line)) return true;
  if (/SELECT |FROM |WHERE |INSERT |UPDATE /i.test(line)) return true;
  if (/Tables\./.test(line) && !/label|header|title|toast/.test(line)) return true;
  if (/fa[A-Z]/.test(line) && !/label|header|title/.test(line)) return true;
  return false;
}

function replaceStrings(content, namespace, maps) {
  const lines = content.split('\n');
  const result = [];

  for (const line of lines) {
    if (shouldSkipLine(line)) {
      result.push(line);
      continue;
    }

    let newLine = line;

    // toast.success/error/info/warning("text") or ('text')
    newLine = newLine.replace(
      /toast\.(success|error|info|warning)\((['"])([^'"]+)\2\)/g,
      (match, _method, _q, text) => {
        const resolved = resolveKey(text, namespace, maps) ?? resolveKey(text, 'toast', maps);
        const tc = tCall(resolved);
        return tc ? `toast.${_method}(${tc})` : match;
      }
    );

    // header: 'text' or "text"
    newLine = newLine.replace(
      /header:\s*(['"])([^'"]+)\1/g,
      (match, _q, text) => {
        const resolved = resolveKey(text, namespace, maps);
        const tc = tCall(resolved);
        return tc ? `header: ${tc}` : match;
      }
    );

    // label: 'text' or "text" (object property)
    newLine = newLine.replace(
      /label:\s*(['"])([^'"]+)\1/g,
      (match, _q, text) => {
        const resolved = resolveKey(text, namespace, maps);
        const tc = tCall(resolved);
        return tc ? `label: ${tc}` : match;
      }
    );

    // label="text" or label='text'
    newLine = newLine.replace(
      /\blabel=(['"])([^'"]+)\1/g,
      (match, _q, text) => {
        const resolved = resolveKey(text, namespace, maps);
        const tc = tCall(resolved);
        return tc ? `label={${tc}}` : match;
      }
    );

    // title="text" (not title={)
    newLine = newLine.replace(
      /\btitle=(['"])([^'"]+)\1/g,
      (match, _q, text) => {
        const resolved = resolveKey(text, namespace, maps);
        const tc = tCall(resolved);
        return tc ? `title={${tc}}` : match;
      }
    );

    // placeholder="text"
    newLine = newLine.replace(
      /\bplaceholder=(['"])([^'"]+)\1/g,
      (match, _q, text) => {
        const resolved = resolveKey(text, namespace, maps);
        const tc = tCall(resolved);
        return tc ? `placeholder={${tc}}` : match;
      }
    );

    // aria-label="text"
    newLine = newLine.replace(
      /\baria-label=(['"])([^'"]+)\1/g,
      (match, _q, text) => {
        const resolved = resolveKey(text, namespace, maps);
        const tc = tCall(resolved);
        return tc ? `aria-label={${tc}}` : match;
      }
    );

    // >Text</ patterns (button/span text, careful)
    newLine = newLine.replace(
      />([A-Z][^<>{}\n]{1,60})</g,
      (match, text) => {
        const trimmed = text.trim();
        if (!trimmed || trimmed.includes('{') || trimmed.includes('t(')) return match;
        const resolved = resolveKey(trimmed, namespace, maps);
        const tc = tCall(resolved);
        return tc ? `>{${tc}}<` : match;
      }
    );

    // setError("text")
    newLine = newLine.replace(
      /setError\((['"])([^'"]+)\1\)/g,
      (match, _q, text) => {
        const resolved = resolveKey(text, namespace, maps);
        const tc = tCall(resolved);
        return tc ? `setError(${tc})` : match;
      }
    );

    result.push(newLine);
  }

  return result.join('\n');
}

function migrateFile(filePath, maps) {
  let content = fs.readFileSync(filePath, 'utf8');
  const namespace = NAMESPACE_BY_PATH(filePath);

  if (!content.match(/export (const|function)/)) return { changed: false, filePath };

  const before = content;
  content = addUseTranslation(content, namespace);
  content = replaceStrings(content, namespace, maps);

  if (content !== before) {
    fs.writeFileSync(filePath, content);
    return { changed: true, filePath };
  }
  return { changed: false, filePath };
}

const maps = loadNamespaceMaps();
const files = getAllTargetFiles();
const changed = [];

for (const f of files) {
  const result = migrateFile(f, maps);
  if (result.changed) changed.push(path.relative(ROOT, result.filePath));
}

console.log(`Migrated ${changed.length} files:`);
changed.forEach((f) => console.log(`  ${f}`));
