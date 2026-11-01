import { getCurrentWebview } from '@tauri-apps/api/webview';
import { isTauriDesktop } from '@/lib/desktop.ts';

const STORAGE_KEY = 'posr.desktop.zoom';
export const DESKTOP_ZOOM_EVENT = 'posr-desktop-zoom';
export const DESKTOP_ZOOM_MIN = 0.5;
export const DESKTOP_ZOOM_MAX = 1.5;
export const DESKTOP_ZOOM_STEP = 0.1;

export function clampDesktopZoom(value: number): number {
  const stepped = Math.round(value * 10) / 10;
  if (!Number.isFinite(stepped)) return 1;
  return Math.min(DESKTOP_ZOOM_MAX, Math.max(DESKTOP_ZOOM_MIN, stepped));
}

export function readDesktopZoom(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 1;
    return clampDesktopZoom(Number(raw));
  } catch {
    return 1;
  }
}

export async function applyDesktopZoom(scale: number): Promise<void> {
  if (!isTauriDesktop()) return;
  try {
    await getCurrentWebview().setZoom(clampDesktopZoom(scale));
  } catch {
    // The webview may not be ready on the first tick.
  }
}

export async function applySavedDesktopZoom(): Promise<void> {
  await applyDesktopZoom(readDesktopZoom());
}

export function setDesktopZoom(scale: number): number {
  const value = clampDesktopZoom(scale);
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Ignore storage failures; the window can still zoom for this session.
  }
  window.dispatchEvent(new CustomEvent(DESKTOP_ZOOM_EVENT, { detail: value }));
  void applyDesktopZoom(value);
  return value;
}

export function bumpDesktopZoom(delta: number): number {
  return setDesktopZoom(readDesktopZoom() + delta);
}
