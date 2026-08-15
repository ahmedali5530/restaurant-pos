#!/usr/bin/env node
/**
 * Assembles localized Markdown + HTML for POSR Documentation:
 *   dist/{lang}/index.html              — hub (role guides tree)
 *   dist/{lang}/{guide}/user-guide.html — per-role guide
 *   dist/{lang}/{guide}/user-guide.md
 *
 * Structure is always driven by docs-automation/guide-catalog.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDES, LANGS, allChapterKeys } from './guide-catalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUIDE_ROOT = path.resolve(__dirname, '../docs/user-guide');
const LOCALES_DIR = path.join(GUIDE_ROOT, 'locales');
const IMAGES_ROOT = path.join(GUIDE_ROOT, 'images');
const DIST_DIR = path.join(GUIDE_ROOT, 'dist');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return readJson(filePath);
  } catch {
    return fallback;
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function resolveImage(langFolder, name) {
  const candidates = [
    path.join(IMAGES_ROOT, langFolder, name),
    path.join(IMAGES_ROOT, 'en', name),
    path.join(IMAGES_ROOT, name),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const { size } = fs.statSync(filePath);
      if (size < 2500) continue;
      const relFromRoot = path.relative(IMAGES_ROOT, filePath).split(path.sep).join('/');
      return {
        filePath,
        relFromRoot,
        fromLang: relFromRoot.startsWith(`${langFolder}/`),
      };
    } catch {
      /* next */
    }
  }
  return null;
}

/** Prefix from dist/{lang}/{guide}/ → images root (three levels). */
function imageHrefFromGuide(relFromRoot) {
  return `../../../images/${relFromRoot}`;
}

/** Prefix from dist/{lang}/ index → images. */
function imageHrefFromHub(relFromRoot) {
  return `../../images/${relFromRoot}`;
}

function renderFieldsMarkdown(section) {
  if (!Array.isArray(section.fields) || !section.fields.length) return '';
  const lines = ['**Fields**', ''];
  for (const f of section.fields) {
    lines.push(`- **${f.name}** — ${f.effect}`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderFieldsHtml(section) {
  if (!Array.isArray(section.fields) || !section.fields.length) return '';
  const items = section.fields
    .map(
      (f) =>
        `<li><strong>${escapeHtml(f.name)}</strong> — ${escapeHtml(f.effect)}</li>`
    )
    .join('\n');
  return `<p><strong>Fields</strong></p><ul class="field-list">${items}</ul>`;
}

function sectionToMarkdown(section, langFolder, imageHrefFn) {
  const lines = [];
  lines.push(`### ${section.title}`, '');
  if (section.intro) lines.push(section.intro, '');
  if (Array.isArray(section.steps) && section.steps.length) {
    section.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    lines.push('');
  }
  const fieldsMd = renderFieldsMarkdown(section);
  if (fieldsMd) lines.push(fieldsMd);
  if (section.image) {
    const resolved = resolveImage(langFolder, section.image);
    if (resolved) {
      const caption = section.caption || section.title;
      lines.push(`![${caption}](${imageHrefFn(resolved.relFromRoot)})`, '');
      if (section.caption) lines.push(`*${section.caption}*`, '');
      if (!resolved.fromLang && langFolder !== 'en') {
        lines.push(
          `> _UI screenshot is English until you re-run capture for \`${langFolder}\`._`,
          ''
        );
      }
    } else {
      lines.push(
        `> _Screenshot pending: \`${section.image}\` (run \`DOCS_GUIDE_LANG=${langFolder} npm run docs:guide:capture\`)_`,
        ''
      );
    }
  }
  if (section.note) lines.push(`> ${section.note}`, '');
  return lines.join('\n');
}

function sectionToHtml(section, langFolder, imageHrefFn) {
  const parts = [];
  parts.push(`<section class="section"><h3>${escapeHtml(section.title)}</h3>`);
  if (section.intro) parts.push(`<p>${escapeHtml(section.intro)}</p>`);
  if (Array.isArray(section.steps) && section.steps.length) {
    parts.push('<ol>');
    for (const step of section.steps) parts.push(`<li>${escapeHtml(step)}</li>`);
    parts.push('</ol>');
  }
  const fieldsHtml = renderFieldsHtml(section);
  if (fieldsHtml) parts.push(fieldsHtml);
  if (section.image) {
    const resolved = resolveImage(langFolder, section.image);
    if (resolved) {
      const caption = section.caption || section.title;
      parts.push(
        `<figure><img src="${imageHrefFn(resolved.relFromRoot)}" alt="${escapeHtml(caption)}" /><figcaption>${escapeHtml(caption)}</figcaption></figure>`
      );
      if (!resolved.fromLang && langFolder !== 'en') {
        parts.push(
          `<p class="pending"><em>UI screenshot is English until capture is re-run for ${escapeHtml(langFolder)}.</em></p>`
        );
      }
    } else {
      parts.push(
        `<p class="pending"><em>Screenshot pending: ${escapeHtml(section.image)} — run DOCS_GUIDE_LANG=${escapeHtml(langFolder)} npm run docs:guide:capture</em></p>`
      );
    }
  }
  if (section.note) parts.push(`<blockquote>${escapeHtml(section.note)}</blockquote>`);
  parts.push('</section>');
  return parts.join('\n');
}

function loadGuideMeta(localeDir, guideDef) {
  const guidesJson = readJsonSafe(path.join(localeDir, 'guides.json'), {});
  const common = readJsonSafe(path.join(localeDir, 'common.json'), {});
  const g = guidesJson.guides?.[guideDef.id] || {};
  return {
    title: g.title || guideDef.defaultTitle,
    intro: g.intro || guideDef.defaultIntro,
    emoji: guideDef.emoji,
    toc: common.toc || guidesJson.chapterToc || 'Contents',
    comingSoon: guidesJson.comingSoon || 'Coming soon — chapter not yet documented.',
    plannedLabel: guidesJson.plannedLabel || 'Planned',
  };
}

function loadChapterOrPlaceholder(localeDir, chapterRef, commonChapters, meta) {
  const file = path.join(localeDir, `${chapterRef.key}.json`);
  if (fs.existsSync(file)) {
    const data = readJson(file);
    return {
      key: chapterRef.key,
      ready: true,
      title: data.title || commonChapters?.[chapterRef.key] || chapterRef.key,
      intro: data.intro || '',
      sections: data.sections || [],
    };
  }
  const title =
    commonChapters?.[chapterRef.key] ||
    chapterRef.plannedTitle ||
    chapterRef.key.replace(/-/g, ' ');
  return {
    key: chapterRef.key,
    ready: false,
    title,
    intro: meta.comingSoon,
    sections: [
      {
        id: 'planned',
        title: meta.plannedLabel,
        steps: [meta.comingSoon],
      },
    ],
  };
}

function loadGuideChapters(localeDir, guideDef, common, meta) {
  return guideDef.chapters.map((ref) =>
    loadChapterOrPlaceholder(localeDir, ref, common.chapters, meta)
  );
}

function sharedCss() {
  return `
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", sans-serif;
      color: #18181b;
      line-height: 1.5;
      font-size: 11pt;
      margin: 0;
      padding: 1.5rem;
      max-width: 52rem;
    }
    h1 { font-size: 22pt; margin: 0 0 0.25em; }
    h2 { font-size: 16pt; margin: 1.2em 0 0.4em; border-bottom: 1px solid #d4d4d8; padding-bottom: 0.2em; }
    h3 { font-size: 13pt; margin: 1em 0 0.35em; }
    .subtitle { color: #52525b; font-size: 12pt; margin-top: 0; }
    figure { margin: 0.75em 0 1.25em; page-break-inside: avoid; }
    img {
      max-width: 100%;
      height: auto;
      border: 1px solid #e4e4e7;
      border-radius: 6px;
      display: block;
    }
    figcaption { font-size: 9.5pt; color: #52525b; margin-top: 0.35em; }
    ol { padding-inline-start: 1.25em; }
    li { margin: 0.25em 0; }
    .field-list { margin: 0.5em 0 1em; padding-inline-start: 1.25em; }
    .field-list li { margin: 0.35em 0; }
    blockquote {
      margin: 0.5em 0;
      padding: 0.5em 0.75em;
      border-inline-start: 3px solid #f59e0b;
      background: #fffbeb;
      color: #713f12;
    }
    .page-break { page-break-before: always; }
    .section { page-break-inside: avoid; }
    .pending { color: #a16207; }
    .planned { color: #71717a; font-style: italic; }
    footer { margin-top: 2em; font-size: 9pt; color: #71717a; border-top: 1px solid #e4e4e7; padding-top: 0.75em; }
    nav ul { padding-inline-start: 1.25em; }
    a { color: #1d4ed8; }
    .guide-card {
      border: 1px solid #e4e4e7;
      border-radius: 8px;
      padding: 0.85rem 1rem;
      margin: 0.6rem 0;
      page-break-inside: avoid;
    }
    .guide-card h2 { border: 0; margin: 0 0 0.35em; font-size: 14pt; }
    .tree { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10pt; white-space: pre; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 1rem; overflow: auto; }
    .status-ready { color: #15803d; }
    .status-planned { color: #a16207; }
  `;
}

function wrapHtml(langCode, dir, title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(langCode)}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${sharedCss()}</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

function buildGuideMarkdown(guideMeta, guideDef, chapters, langFolder) {
  const lines = [];
  lines.push(`# ${guideMeta.emoji} ${guideMeta.title}`, '');
  lines.push(guideMeta.intro, '');
  lines.push(`## ${guideMeta.toc}`, '');
  for (const ch of chapters) {
    const mark = ch.ready ? '' : ` _(${guideMeta.plannedLabel})_`;
    lines.push(`- [${ch.title}${mark}](#${ch.key})`);
  }
  lines.push('');
  for (const ch of chapters) {
    lines.push(`## ${ch.title}`, '');
    if (!ch.ready) lines.push(`*${guideMeta.plannedLabel}*`, '');
    if (ch.intro) lines.push(ch.intro, '');
    for (const section of ch.sections || []) {
      lines.push(sectionToMarkdown(section, langFolder, imageHrefFromGuide));
    }
  }
  return lines.join('\n');
}

function buildGuideHtml(guideMeta, guideDef, chapters, lang, langFolder) {
  const body = [];
  body.push(`<header><h1>${escapeHtml(guideMeta.emoji)} ${escapeHtml(guideMeta.title)}</h1>`);
  body.push(`<p>${escapeHtml(guideMeta.intro)}</p></header>`);

  body.push(`<nav><h2>${escapeHtml(guideMeta.toc)}</h2><ul>`);
  for (const ch of chapters) {
    const suffix = ch.ready ? '' : ` (${guideMeta.plannedLabel})`;
    body.push(
      `<li><a href="#${escapeHtml(ch.key)}">${escapeHtml(ch.title)}${escapeHtml(suffix)}</a></li>`
    );
  }
  body.push('</ul></nav>');

  chapters.forEach((ch, index) => {
    const pageBreak = index > 0 ? ' page-break' : '';
    body.push(`<article class="chapter${pageBreak}" id="${escapeHtml(ch.key)}"><h2>${escapeHtml(ch.title)}</h2>`);
    if (!ch.ready) body.push(`<p class="planned">${escapeHtml(guideMeta.plannedLabel)}</p>`);
    if (ch.intro) body.push(`<p>${escapeHtml(ch.intro)}</p>`);
    for (const section of ch.sections || []) {
      body.push(sectionToHtml(section, langFolder, imageHrefFromGuide));
    }
    body.push('</article>');
  });

  return wrapHtml(lang.code, lang.dir, `${guideMeta.emoji} ${guideMeta.title}`, body.join('\n'));
}

function buildHubTreeText(guidesMeta, chaptersByGuide) {
  const lines = ['POSR Documentation', '│'];
  guidesMeta.forEach((g, gi) => {
    const lastGuide = gi === guidesMeta.length - 1;
    const gBranch = lastGuide ? '└──' : '├──';
    const childPipe = lastGuide ? '    ' : '│   ';
    lines.push(`${gBranch} ${g.emoji} ${g.title}`);
    const chs = chaptersByGuide[g.id] || [];
    chs.forEach((ch, ci) => {
      const lastCh = ci === chs.length - 1;
      const cBranch = lastCh ? '└──' : '├──';
      const mark = ch.ready ? '' : ' [planned]';
      lines.push(`${childPipe}${cBranch} ${ch.title}${mark}`);
    });
    if (!lastGuide) lines.push('│');
  });
  return lines.join('\n');
}

function buildHubMarkdown(hub, guidesMeta, chaptersByGuide) {
  const lines = [];
  lines.push(`# ${hub.title}`, '');
  if (hub.intro) lines.push(hub.intro, '');
  lines.push('## Structure', '');
  lines.push('```', buildHubTreeText(guidesMeta, chaptersByGuide), '```', '');
  lines.push(`## ${hub.toc || 'Guides'}`, '');
  for (const g of guidesMeta) {
    lines.push(`### ${g.emoji} ${g.title}`, '');
    lines.push(g.intro, '');
    lines.push(`- [Open guide (HTML)](./${g.folder}/user-guide.html)`);
    lines.push(`- [Markdown](./${g.folder}/user-guide.md)`);
    lines.push(`- PDF: \`${g.pdfName}\``);
    lines.push('');
    for (const ch of chaptersByGuide[g.id] || []) {
      const status = ch.ready ? 'ready' : 'planned';
      lines.push(`  - ${ch.title} _(${status})_`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function buildHubHtml(hub, guidesMeta, chaptersByGuide, lang) {
  const body = [];
  body.push(`<header><h1>${escapeHtml(hub.title)}</h1>`);
  if (hub.intro) body.push(`<p>${escapeHtml(hub.intro)}</p>`);
  body.push('</header>');

  body.push('<h2>Structure</h2>');
  body.push(`<pre class="tree">${escapeHtml(buildHubTreeText(guidesMeta, chaptersByGuide))}</pre>`);

  body.push(`<h2>${escapeHtml(hub.toc || 'Guides')}</h2>`);
  for (const g of guidesMeta) {
    body.push(`<div class="guide-card">`);
    body.push(`<h2>${escapeHtml(g.emoji)} ${escapeHtml(g.title)}</h2>`);
    body.push(`<p>${escapeHtml(g.intro)}</p>`);
    body.push(
      `<p><a href="./${g.folder}/user-guide.html">${escapeHtml(hub.openGuide || 'Open guide')}</a>` +
        ` · <a href="./${g.folder}/user-guide.md">Markdown</a>` +
        ` · ${escapeHtml(g.pdfName)}</p>`
    );
    body.push('<ul>');
    for (const ch of chaptersByGuide[g.id] || []) {
      const cls = ch.ready ? 'status-ready' : 'status-planned';
      const label = ch.ready ? hub.statusReady || 'Ready' : hub.statusPlanned || 'Planned';
      body.push(
        `<li><a href="./${g.folder}/user-guide.html#${escapeHtml(ch.key)}">${escapeHtml(ch.title)}</a> <span class="${cls}">(${escapeHtml(label)})</span></li>`
      );
    }
    body.push('</ul></div>');
  }

  return wrapHtml(lang.code, lang.dir, hub.title, body.join('\n'));
}

function assembleLang(lang) {
  const localeDir = path.join(LOCALES_DIR, lang.folder);
  if (!fs.existsSync(localeDir)) {
    console.warn(`Skip missing locale folder: ${lang.folder}`);
    return;
  }

  const common = readJsonSafe(path.join(localeDir, 'common.json'), { chapters: {} });
  const guidesJson = readJsonSafe(path.join(localeDir, 'guides.json'), {});
  const hub = {
    title: guidesJson.title || 'POSR Documentation',
    intro:
      guidesJson.intro ||
      'Role-based guides for POSR. Start with the Employee Guide for floor operations.',
    toc: guidesJson.toc || 'Guides',
    openGuide: guidesJson.openGuide || 'Open guide',
    statusReady: guidesJson.statusReady || 'Ready',
    statusPlanned: guidesJson.statusPlanned || 'Planned',
  };

  const outLang = path.join(DIST_DIR, lang.folder);
  fs.mkdirSync(outLang, { recursive: true });

  const guidesMeta = [];
  const chaptersByGuide = {};

  for (const guideDef of GUIDES) {
    const meta = loadGuideMeta(localeDir, guideDef);
    const chapters = loadGuideChapters(localeDir, guideDef, common, meta);
    chaptersByGuide[guideDef.id] = chapters;
    guidesMeta.push({
      id: guideDef.id,
      folder: guideDef.folder,
      pdfName: guideDef.pdfName,
      emoji: meta.emoji,
      title: meta.title,
      intro: meta.intro,
    });

    const guideOut = path.join(outLang, guideDef.folder);
    fs.mkdirSync(guideOut, { recursive: true });

    fs.writeFileSync(
      path.join(guideOut, 'user-guide.md'),
      buildGuideMarkdown(meta, guideDef, chapters, lang.folder),
      'utf8'
    );
    fs.writeFileSync(
      path.join(guideOut, 'user-guide.html'),
      buildGuideHtml(meta, guideDef, chapters, lang, lang.folder),
      'utf8'
    );
  }

  fs.writeFileSync(
    path.join(outLang, 'index.md'),
    buildHubMarkdown(hub, guidesMeta, chaptersByGuide),
    'utf8'
  );
  fs.writeFileSync(
    path.join(outLang, 'index.html'),
    buildHubHtml(hub, guidesMeta, chaptersByGuide, lang),
    'utf8'
  );

  // Legacy combined employee-only snapshot for old paths (employee chapters only)
  const employee = GUIDES.find((g) => g.id === 'employee');
  if (employee) {
    const meta = loadGuideMeta(localeDir, employee);
    const chapters = loadGuideChapters(localeDir, employee, common, meta).filter((c) => c.ready);
    if (chapters.length) {
      // Image paths from dist/{lang}/ are ../../images/… — rebuild with hub-level depth
      const legacyMd = buildGuideMarkdown(meta, employee, chapters, lang.folder).replaceAll(
        '../../../images/',
        '../../images/'
      );
      // HTML with hub image depth
      const body = [];
      body.push(`<header><h1>${escapeHtml(meta.emoji)} ${escapeHtml(meta.title)}</h1>`);
      body.push(`<p>${escapeHtml(meta.intro)}</p>`);
      body.push(
        `<p><em>Legacy combined file — prefer <a href="./index.html">POSR Documentation hub</a>.</em></p></header>`
      );
      body.push(`<nav><h2>${escapeHtml(meta.toc)}</h2><ul>`);
      for (const ch of chapters) {
        body.push(`<li><a href="#${escapeHtml(ch.key)}">${escapeHtml(ch.title)}</a></li>`);
      }
      body.push('</ul></nav>');
      chapters.forEach((ch, index) => {
        const pageBreak = index > 0 ? ' page-break' : '';
        body.push(
          `<article class="chapter${pageBreak}" id="${escapeHtml(ch.key)}"><h2>${escapeHtml(ch.title)}</h2>`
        );
        if (ch.intro) body.push(`<p>${escapeHtml(ch.intro)}</p>`);
        for (const section of ch.sections || []) {
          body.push(sectionToHtml(section, lang.folder, imageHrefFromHub));
        }
        body.push('</article>');
      });
      fs.writeFileSync(path.join(outLang, 'user-guide.md'), legacyMd, 'utf8');
      fs.writeFileSync(
        path.join(outLang, 'user-guide.html'),
        wrapHtml(lang.code, lang.dir, meta.title, body.join('\n')),
        'utf8'
      );
    }
  }

  console.log(`Assembled ${lang.code} → ${path.relative(process.cwd(), outLang)} (${GUIDES.length} guides + hub)`);
}

function writeBrowseCopies() {
  const enDir = path.join(LOCALES_DIR, 'en');
  if (!fs.existsSync(enDir)) return;

  const keys = allChapterKeys().filter((k) => fs.existsSync(path.join(enDir, `${k}.json`)));
  for (const key of keys) {
    const ch = readJson(path.join(enDir, `${key}.json`));
    const browse = [
      `# ${ch.title}`,
      '',
      ch.intro || '',
      '',
      ...(ch.sections || []).map((s) =>
        sectionToMarkdown(s, 'en', (rel) => `images/${rel}`).replaceAll(
          'images/en/',
          'images/en/'
        )
      ),
    ].join('\n');
    fs.writeFileSync(path.join(GUIDE_ROOT, `${key.toUpperCase()}.md`), browse, 'utf8');
  }

  // STRUCTURE.md snapshot from catalog (always)
  const enCommon = readJsonSafe(path.join(enDir, 'common.json'), { chapters: {} });
  const structureLines = [
    '# POSR Documentation structure',
    '',
    'Generated from `docs-automation/guide-catalog.mjs` (edit the catalog, not this file by hand).',
    '',
    '```',
    'POSR Documentation',
    '│',
  ];
  GUIDES.forEach((g, gi) => {
    const last = gi === GUIDES.length - 1;
    structureLines.push(`${last ? '└──' : '├──'} ${g.emoji} ${g.defaultTitle}`);
    g.chapters.forEach((ch, ci) => {
      const lastCh = ci === g.chapters.length - 1;
      const hasFile = fs.existsSync(path.join(enDir, `${ch.key}.json`));
      let title =
        ch.plannedTitle ||
        enCommon.chapters?.[ch.key] ||
        ch.key;
      if (hasFile) {
        try {
          title = readJson(path.join(enDir, `${ch.key}.json`)).title || title;
        } catch {
          /* keep */
        }
      }
      const mark = hasFile ? '' : ' [planned]';
      structureLines.push(
        `${last ? '    ' : '│   '}${lastCh ? '└──' : '├──'} ${title}${mark}`
      );
    });
    if (!last) structureLines.push('│');
  });
  structureLines.push('```', '');
  structureLines.push('## Build output', '');
  structureLines.push('| Path | Description |');
  structureLines.push('|------|-------------|');
  structureLines.push('| `dist/{lang}/index.html` | Documentation hub |');
  structureLines.push('| `dist/{lang}/{guide}/user-guide.html` | Role guide HTML |');
  structureLines.push('| `dist/{lang}/{guide}/posr-*-guide.pdf` | Role guide PDF |');
  structureLines.push('');
  fs.writeFileSync(path.join(GUIDE_ROOT, 'STRUCTURE.md'), structureLines.join('\n'), 'utf8');

  console.log(`Updated browse Markdown for: ${keys.join(', ')}`);
  console.log('Updated STRUCTURE.md from catalog');
}

fs.mkdirSync(DIST_DIR, { recursive: true });
for (const lang of LANGS) {
  assembleLang(lang);
}
writeBrowseCopies();
console.log('Done.');
