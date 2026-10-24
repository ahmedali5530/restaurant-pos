import {useEffect, useRef} from "react";

const DEFAULT_IDLE_MS = 80;

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest("[data-no-barcode-scan]"));
};

/**
 * Capture HID keyboard-wedge barcode scans (characters + Enter).
 * Ignores keystrokes while focus is in form fields.
 */
export function useBarcodeScan(
  onScan: (code: string) => void,
  options?: {enabled?: boolean; idleMs?: number},
): void {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const enabled = options?.enabled !== false;
  const idleMs = options?.idleMs ?? DEFAULT_IDLE_MS;
  const bufferRef = useRef("");
  const lastKeyAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      const now = Date.now();
      if (now - lastKeyAtRef.current > idleMs) {
        bufferRef.current = "";
      }
      lastKeyAtRef.current = now;

      if (event.key === "Enter") {
        const code = bufferRef.current;
        bufferRef.current = "";
        if (code.length > 0) {
          event.preventDefault();
          onScanRef.current(code);
        }
        return;
      }

      if (event.key.length === 1) {
        bufferRef.current += event.key;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [enabled, idleMs]);
}
