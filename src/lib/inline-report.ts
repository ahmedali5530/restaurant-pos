import {REPORTS} from '@/routes/posr.ts';

export const INLINE_REPORT_PARAM = 'inline';

/** Back to the report list. A previous in-app page wins over a hard jump. */
export function inlineReportBackTarget(): -1 | string {
  const state = typeof window === 'undefined' ? null : window.history.state;
  const idx = state && typeof state === 'object' && 'idx' in state
    ? Number((state as {idx?: unknown}).idx)
    : 0;
  return Number.isFinite(idx) && idx > 0 ? -1 : REPORTS;
}

export function isInlineReport(search = typeof window === 'undefined' ? '' : window.location.search): boolean {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(raw).get(INLINE_REPORT_PARAM) === '1';
}

/** Same-window report path, or null when the address is not a POS report. */
export function toInlineReportPath(
  action: string,
  params: URLSearchParams,
  origin: string,
): string | null {
  let url: URL;
  try {
    url = new URL(action, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  if (url.pathname !== '/reports' && !url.pathname.startsWith('/reports/')) return null;

  const next = new URLSearchParams(url.search);
  params.forEach((value, key) => {
    next.append(key, value);
  });
  next.set(INLINE_REPORT_PARAM, '1');
  const qs = next.toString();
  return `${url.pathname}${qs ? `?${qs}` : ''}${url.hash}`;
}
