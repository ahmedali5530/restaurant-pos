/**
 * KRA Item Code (Spec 4.19):
 * KE + item type (1) + packaging unit (2) + qty unit (1) + 7-digit sequence
 * e.g. KE2NTU0000001
 */
export const formatKraItemCode = (input: {
  itemTyCd: string;
  pkgUnitCd: string;
  qtyUnitCd: string;
  sequence: number;
}): string => {
  const type = String(input.itemTyCd || '2').slice(0, 1);
  const pkg = String(input.pkgUnitCd || 'NT').padEnd(2, 'X').slice(0, 2).toUpperCase();
  const qty = String(input.qtyUnitCd || 'U').slice(0, 1).toUpperCase();
  const seq = Math.max(1, Math.floor(Number(input.sequence) || 1));
  const padded = String(seq).padStart(7, '0').slice(-7);
  return `KE${type}${pkg}${qty}${padded}`;
};

export const parseKraItemCodeSequence = (itemCd: string): number | null => {
  const match = /^KE.\w{2}.(\d{7})$/i.exec(String(itemCd || '').trim());
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
};
