#!/usr/bin/env node
/**
 * Generate Wave 10 locale JSON (10 languages).
 * Run: node docs-automation/generate-wave10-locales.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WAVE10_EN,
  WAVE10_NEW_KEYS,
  WAVE10_EXPAND_KEYS,
} from './wave10-en-chapters.mjs';
import { WAVE10_T } from './wave10-translations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = path.resolve(__dirname, '../docs/user-guide/locales');
const LANGS = ['en', 'es', 'tr', 'pt-br', 'fr', 'nl', 'de', 'it', 'ar', 'ru'];
const OTHER_LANGS = LANGS.filter((l) => l !== 'en');

/**
 * @param {import('./wave10-en-chapters.mjs').Chapter} waveChapter
 * @param {{ title?: string, intro?: string, sections?: import('./wave10-en-chapters.mjs').Section[] } | undefined} existing
 */
function buildEnglishChapter(key, waveChapter, existing) {
  if (WAVE10_NEW_KEYS.includes(key)) {
    return {
      title: waveChapter.title,
      intro: waveChapter.intro,
      sections: waveChapter.sections,
    };
  }

  const base = existing
    ? structuredClone(existing)
    : { title: waveChapter.title || '', intro: waveChapter.intro || '', sections: [] };

  if (waveChapter.title) base.title = waveChapter.title;
  if (waveChapter.intro) base.intro = waveChapter.intro;

  const byId = new Map((base.sections || []).map((s) => [s.id, s]));
  for (const sec of waveChapter.sections || []) {
    if (!byId.has(sec.id)) {
      base.sections.push(sec);
      byId.set(sec.id, sec);
    }
  }
  return base;
}

/** @param {Record<string, unknown>} chapter @param {Record<string, unknown> | undefined} pack */
function applyLangPack(chapter, pack) {
  if (!pack) return chapter;
  const out = structuredClone(chapter);
  if (pack.title) out.title = pack.title;
  if (pack.intro) out.intro = pack.intro;

  const tSections = pack.sections || {};
  out.sections = (out.sections || []).map((sec) => {
    const t = tSections[sec.id];
    if (!t) return sec;
    const merged = { ...sec };
    if (t.title) merged.title = t.title;
    if (t.intro !== undefined) merged.intro = t.intro;
    if (t.steps) merged.steps = t.steps;
    if (t.caption) merged.caption = t.caption;
    if (t.fields?.length) merged.fields = t.fields;
    return merged;
  });
  return out;
}

// --- English ---
for (const key of [...WAVE10_NEW_KEYS, ...WAVE10_EXPAND_KEYS]) {
  const wave = WAVE10_EN[key];
  if (!wave) continue;

  const enPath = path.join(LOCALES, 'en', `${key}.json`);
  let existing = null;
  if (WAVE10_EXPAND_KEYS.includes(key) && fs.existsSync(enPath)) {
    existing = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  }

  const enOut = buildEnglishChapter(key, wave, existing);
  fs.mkdirSync(path.dirname(enPath), { recursive: true });
  fs.writeFileSync(enPath, JSON.stringify(enOut, null, 2) + '\n');
}
console.log('generated en');

// --- Other languages ---
for (const lang of OTHER_LANGS) {
  const langPack = WAVE10_T[lang] || {};
  for (const key of [...WAVE10_NEW_KEYS, ...WAVE10_EXPAND_KEYS]) {
    const enPath = path.join(LOCALES, 'en', `${key}.json`);
    if (!fs.existsSync(enPath)) continue;
    const enChapter = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const out = applyLangPack(enChapter, langPack[key]);
    const dest = path.join(LOCALES, lang, `${key}.json`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  }
  console.log('generated', lang);
}

console.log('Wave 10 locales complete.');
