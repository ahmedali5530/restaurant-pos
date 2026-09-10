/**
 * Connectivity flag for PosStore commands (no React). Set from Database /
 * TerminalSync providers so ownership gates apply only while offline.
 */
let effectivelyConnected = true;

export function setPosStoreEffectivelyConnected(connected: boolean): void {
  effectivelyConnected = !!connected;
}

export function isPosStoreEffectivelyConnected(): boolean {
  return effectivelyConnected;
}

/** Test helper. */
export function resetPosStoreConnectivityForTests(connected = true): void {
  effectivelyConnected = connected;
}
