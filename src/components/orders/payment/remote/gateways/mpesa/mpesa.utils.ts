export function normalizeMpesaPhone(phone: string): string | null {
  const raw = phone.replace(/\s+/g, "").replace(/^\+/, "");
  if (/^254\d{9}$/.test(raw)) return raw;
  if (/^0\d{9}$/.test(raw)) return `254${raw.slice(1)}`;
  if (/^7\d{8}$/.test(raw)) return `254${raw}`;
  return null;
}

export function isValidMpesaPhone(phone?: string): boolean {
  if (!phone) return false;
  return normalizeMpesaPhone(phone) !== null;
}

export const MPESA_POLL_INTERVAL_MS = 3000;
export const MPESA_POLL_MAX_ATTEMPTS = 30;
