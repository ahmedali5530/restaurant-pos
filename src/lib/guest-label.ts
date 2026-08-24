export type GuestLike = {
  name?: string | null;
  guest_code?: string | null;
  code?: string | null;
} | null | undefined;

/**
 * Prefer customer display name; fall back to #CODE when only a guest/room code exists.
 */
export function formatGuestLabel(guest: GuestLike): string {
  if (!guest) return '';
  const name = (guest.name ?? '').trim();
  if (name) return name;
  const code = (guest.guest_code ?? guest.code ?? '').toString().trim();
  if (code) return code.startsWith('#') ? code : `#${code}`;
  return '';
}
