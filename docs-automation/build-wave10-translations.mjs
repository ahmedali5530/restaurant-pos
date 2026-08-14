#!/usr/bin/env node
/** Builds complete wave10-translations.mjs from es/tr + language modules */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fr } from './wave10-lang-fr.mjs';
import { nl } from './wave10-lang-nl.mjs';
import { de } from './wave10-lang-de.mjs';
import { it } from './wave10-lang-it.mjs';
import { ar } from './wave10-lang-ar.mjs';
import { ru } from './wave10-lang-ru.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { WAVE10_T: partial } = await import('./wave10-translations.mjs');

// Parse pt-br chunk
const ptbrRaw = fs.readFileSync(path.join(__dirname, '_wave10-chunks/pt-br.mjs'), 'utf8');
const ptbr = Function(`return (${ptbrRaw.replace(/^[\s\S]*?"pt-br":\s*/, '').replace(/,\s*$/, '')})`)();

function serialize(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (Array.isArray(obj)) {
    if (obj.every((x) => typeof x === 'string')) {
      return '[\n' + obj.map((s) => padIn + JSON.stringify(s)).join(',\n') + '\n' + pad + ']';
    }
    return '[\n' + obj.map((v) => padIn + serialize(v, indent + 1)).join(',\n') + '\n' + pad + ']';
  }
  if (obj && typeof obj === 'object') {
    return '{\n' + Object.entries(obj).map(([k, v]) => {
      const key = /^[a-zA-Z_$][\w$-]*$/.test(k) && !k.includes('-') ? k : JSON.stringify(k);
      return padIn + key + ': ' + serialize(v, indent + 1);
    }).join(',\n') + '\n' + pad + '}';
  }
  return JSON.stringify(obj);
}

const WAVE10_T = {
  es: partial.es,
  tr: partial.tr,
  'pt-br': ptbr,
  fr,
  nl,
  de,
  it,
  ar,
  ru,
};

const header = `/**
 * Wave 10 documentation translations — orders modals, inventory & HR chapters, admin form fields.
 * Consumed by generate-wave10-locales.mjs
 * @type {Record<string, Record<string, { title?: string, intro?: string, sections: Record<string, { title: string, intro?: string, steps: string[], caption: string, fields?: { name: string, effect: string }[] }> }>>}
 */
export const WAVE10_T = `;

fs.writeFileSync(path.join(__dirname, 'wave10-translations.mjs'), header + serialize(WAVE10_T, 0) + ';\n');
console.log('Built wave10-translations.mjs with', Object.keys(WAVE10_T).join(', '));
