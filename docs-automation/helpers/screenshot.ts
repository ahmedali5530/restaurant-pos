import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { imagesDirForLang } from './paths.ts';

export async function ensureImagesDir(): Promise<string> {
  const dir = imagesDirForLang();
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

export function imagePath(name: string): string {
  const file = name.endsWith('.png') ? name : `${name}.png`;
  return path.join(imagesDirForLang(), file);
}

export async function capturePage(
  page: Page,
  name: string,
  options?: { fullPage?: boolean }
): Promise<string> {
  await ensureImagesDir();
  const dest = imagePath(name);
  await page.screenshot({
    path: dest,
    fullPage: options?.fullPage ?? true,
    animations: 'disabled',
  });
  return dest;
}

export async function captureLocator(locator: Locator, name: string): Promise<string> {
  await ensureImagesDir();
  const dest = imagePath(name);
  await locator.screenshot({
    path: dest,
    animations: 'disabled',
  });
  return dest;
}
