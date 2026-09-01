import type { Locator, Page } from '@playwright/test';

const HIGHLIGHT_STYLE = '3px solid #f59e0b';
const HIGHLIGHT_OFFSET = '2px';
const ATTR = 'data-docs-highlight';

export async function clearHighlights(page: Page): Promise<void> {
  await page.evaluate((attr) => {
    document.querySelectorAll(`[${attr}]`).forEach((el) => {
      const node = el as HTMLElement;
      node.style.outline = node.dataset.docsPrevOutline || '';
      node.style.outlineOffset = node.dataset.docsPrevOffset || '';
      delete node.dataset.docsPrevOutline;
      delete node.dataset.docsPrevOffset;
      node.removeAttribute(attr);
    });
  }, ATTR);
}

export async function highlight(locator: Locator | Locator[]): Promise<void> {
  const list = Array.isArray(locator) ? locator : [locator];
  for (const item of list) {
    await item.scrollIntoViewIfNeeded();
    await item.evaluate(
      (el, { attr, outline, offset }) => {
        const node = el as HTMLElement;
        node.dataset.docsPrevOutline = node.style.outline || '';
        node.dataset.docsPrevOffset = node.style.outlineOffset || '';
        node.setAttribute(attr, '1');
        node.style.outline = outline;
        node.style.outlineOffset = offset;
      },
      { attr: ATTR, outline: HIGHLIGHT_STYLE, offset: HIGHLIGHT_OFFSET }
    );
  }
}

export async function highlightAndReady(page: Page, locator: Locator | Locator[]): Promise<void> {
  await clearHighlights(page);
  await highlight(locator);
  await page.waitForTimeout(150);
}
