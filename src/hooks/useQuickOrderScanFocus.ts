import {type RefObject, useCallback, useEffect, useRef} from "react";

const MODAL_SELECTOR =
  '[role="dialog"], [aria-modal="true"], [data-react-aria-top-layer]';

const isVisible = (el: Element): boolean => {
  const html = el as HTMLElement;
  if (html.hidden) {
    return false;
  }
  const style = window.getComputedStyle(html);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  return html.getClientRects().length > 0;
};

const hasOpenModal = (): boolean => {
  const nodes = document.querySelectorAll(MODAL_SELECTOR);
  for (const node of nodes) {
    if (isVisible(node)) {
      return true;
    }
  }
  return false;
};

const isScanInput = (
  el: Element | null,
  inputRef: RefObject<HTMLInputElement | null>,
): boolean => {
  if (!el) {
    return false;
  }
  if (el === inputRef.current) {
    return true;
  }
  return Boolean(
    el.closest?.(
      '[data-testid="quick-order-scan-input"], [data-quick-order-scan="true"]',
    ),
  );
};

/**
 * Targets that may keep focus while Quick Order is open.
 * Everything else is bounced back to the barcode field.
 */
const isAllowedFocusTarget = (
  el: Element | null,
  inputRef: RefObject<HTMLInputElement | null>,
): boolean => {
  if (!el || el === document.body || el === document.documentElement) {
    return false;
  }
  if (isScanInput(el, inputRef)) {
    return true;
  }
  // Modifier / payment / security modals — leave focus inside while open
  if (el.closest?.(MODAL_SELECTOR)) {
    return true;
  }
  // Cart qty field
  if (el.closest?.('[data-testid="quick-order-cart-items"] input')) {
    return true;
  }
  // Payment keypad / tender fields
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    if (el.closest?.('[data-testid="quick-order-payment"]')) {
      return true;
    }
  }
  return false;
};

const scheduleReclaim = (fn: () => void) => {
  fn();
  requestAnimationFrame(fn);
  window.setTimeout(fn, 0);
  window.setTimeout(fn, 50);
  window.setTimeout(fn, 120);
  window.setTimeout(fn, 250);
};

/**
 * Keep the Quick Order barcode field armed:
 * - block focus steal from native tiles/buttons via pointerdown preventDefault
 * - avoid preventDefault on React Aria buttons (breaks onPress)
 * - reclaim after pointerup / focusin unless a modal or intentional input is active
 * - reclaim when modals unmount
 */
export function useQuickOrderScanFocus(
  inputRef: RefObject<HTMLInputElement | null>,
  enabled: boolean,
): () => void {
  const pointerDownRef = useRef(false);
  const modalOpenRef = useRef(false);

  const focusScanInput = useCallback(() => {
    const run = () => {
      if (!enabled) {
        return;
      }
      if (hasOpenModal()) {
        return;
      }
      const el = inputRef.current;
      if (!el || el.disabled) {
        return;
      }
      if (document.activeElement === el) {
        return;
      }
      el.focus({preventScroll: true});
      // Select so the next wedge scan replaces residual digits
      try {
        el.select();
      } catch {
        // ignore
      }
    };
    scheduleReclaim(run);
  }, [enabled, inputRef]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const reclaimIfNeeded = () => {
      if (pointerDownRef.current) {
        return;
      }
      const open = hasOpenModal();
      if (modalOpenRef.current && !open) {
        // Modal just closed — force reclaim even if focus landed on a tile
        modalOpenRef.current = false;
        focusScanInput();
        return;
      }
      modalOpenRef.current = open;
      if (open) {
        return;
      }
      const active = document.activeElement;
      if (isAllowedFocusTarget(active, inputRef)) {
        return;
      }
      focusScanInput();
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      pointerDownRef.current = true;
      const target = event.target as Element | null;
      if (!target) {
        return;
      }
      if (isAllowedFocusTarget(target, inputRef)) {
        return;
      }
      if (target.closest?.(MODAL_SELECTOR)) {
        return;
      }
      // React Aria usePress cancels if pointerdown default is prevented
      if (target.closest?.(".react-aria-Button, [data-rac]")) {
        return;
      }
      // Stop native buttons/tiles from taking focus; click still fires.
      event.preventDefault();
    };

    const onPointerUpCapture = () => {
      pointerDownRef.current = false;
      window.setTimeout(reclaimIfNeeded, 0);
      window.setTimeout(reclaimIfNeeded, 50);
      window.setTimeout(reclaimIfNeeded, 150);
    };

    const onFocusIn = () => {
      requestAnimationFrame(reclaimIfNeeded);
    };

    const onFocusOut = () => {
      window.setTimeout(reclaimIfNeeded, 0);
      window.setTimeout(reclaimIfNeeded, 50);
    };

    modalOpenRef.current = hasOpenModal();

    const observer = new MutationObserver(() => {
      window.setTimeout(reclaimIfNeeded, 0);
      window.setTimeout(reclaimIfNeeded, 80);
      window.setTimeout(reclaimIfNeeded, 200);
    });
    observer.observe(document.body, {childList: true, subtree: true});

    document.addEventListener("pointerdown", onPointerDownCapture, true);
    document.addEventListener("pointerup", onPointerUpCapture, true);
    document.addEventListener("pointercancel", onPointerUpCapture, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    focusScanInput();

    return () => {
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
      document.removeEventListener("pointerup", onPointerUpCapture, true);
      document.removeEventListener("pointercancel", onPointerUpCapture, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      observer.disconnect();
    };
  }, [enabled, focusScanInput, inputRef]);

  return focusScanInput;
}
