/** AbortSignal.throwIfAborted polyfill-friendly helper. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal) return;
  if (typeof signal.throwIfAborted === "function") {
    signal.throwIfAborted();
    return;
  }
  if (signal.aborted) {
    const err = new Error("Aborted");
    err.name = "AbortError";
    throw err;
  }
}
