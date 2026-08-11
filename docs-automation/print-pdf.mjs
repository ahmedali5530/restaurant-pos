#!/usr/bin/env node
/**
 * Prints each role guide HTML → PDF, plus legacy combined employee PDF.
 * Structure from guide-catalog.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { GUIDES, LANGS } from './guide-catalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../docs/user-guide/dist');

async function printHtml(browser, htmlPath, pdfPath) {
  if (!fs.existsSync(htmlPath)) {
    console.warn(`Skip missing HTML: ${htmlPath}`);
    return;
  }
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', right: '12mm', bottom: '14mm', left: '12mm' },
  });
  await page.close();
  console.log(`PDF → ${path.relative(process.cwd(), pdfPath)}`);
}

const browser = await chromium.launch();
try {
  for (const lang of LANGS) {
    const langDir = path.join(DIST_DIR, lang.folder);

    // Hub (optional thin PDF)
    await printHtml(
      browser,
      path.join(langDir, 'index.html'),
      path.join(langDir, 'posr-documentation-hub.pdf')
    );

    for (const guide of GUIDES) {
      await printHtml(
        browser,
        path.join(langDir, guide.folder, 'user-guide.html'),
        path.join(langDir, guide.folder, guide.pdfName)
      );
    }

    // Legacy combined employee PDF path
    await printHtml(
      browser,
      path.join(langDir, 'user-guide.html'),
      path.join(langDir, 'posr-user-guide.pdf')
    );
  }
} finally {
  await browser.close();
}
console.log('Done.');
