/**
 * Format a tax display label without duplicating a trailing percent.
 * e.g. name "Taxe ASI 2%", rate 2 → "Taxe ASI 2%" (not "Taxe ASI 2% 2%").
 */
export function formatTaxLabel(
  name?: string | null,
  rate?: number | string | null,
): string {
  const rawName = (name ?? '').trim();
  const n = Number(rate ?? 0);
  const rateText = Number.isFinite(n) && n > 0 ? `${n}%` : '';

  if (!rawName && !rateText) return '';
  if (!rawName) return rateText;

  // Name already ends with a percent (optionally spaced): "Taxe ASI 2%" / "GST 5 %"
  if (/\d+\s*%\s*$/.test(rawName)) {
    return rawName;
  }
  // Name already contains the exact rate percent somewhere
  if (rateText && rawName.includes(rateText.replace(/\s/g, ''))) {
    return rawName;
  }
  if (rateText) {
    return `${rawName} ${rateText}`;
  }
  return rawName;
}
