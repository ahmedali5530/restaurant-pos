/**
 * useBumpBar — keyboard-only navigation hook for KDS.
 *
 * Waiters/cooks often have wet or gloved hands — they can't reliably use a
 * touchscreen. Toast KDS ships with a hardware bump-bar (8-12 physical keys
 * for ~$100+); POSR offers the same UX with a standard USB/Bluetooth keyboard
 * — making it possible to deploy KDS on a cheap tablet + a $15 keypad.
 *
 * Default keymap (matches Toast convention):
 *   ← / →   navigate between order tickets
 *   ↑ / ↓   navigate between stations (in expeditor view)
 *   Enter   bump (mark ready) current ticket
 *   Space   bump (alternative)
 *   Backspace  recall last bumped ticket (5-second undo)
 *   R       recall last
 *   E       toggle expeditor view
 *   M       mute/unmute sound
 *   F5      refresh
 *
 * The hook ignores key presses when the user is typing in an input/textarea
 * (so search/filter fields still work normally).
 */

import { useEffect, useCallback, useRef } from 'react';
import {
  resolveBumpKey,
  DEFAULT_KEYMAP,
  type BumpAction,
  type BumpKeyMap,
} from '@/lib/kitchen/kds.service.ts';

interface UseBumpBarOptions {
  enabled: boolean;
  onAction: (action: BumpAction) => void;
  keymap?: Partial<BumpKeyMap>;
}

export const useBumpBar = ({
  enabled,
  onAction,
  keymap,
}: UseBumpBarOptions) => {
  // Keep the callback fresh without re-binding the listener
  const callbackRef = useRef(onAction);
  useEffect(() => {
    callbackRef.current = onAction;
  }, [onAction]);

  const mergedKeymap: BumpKeyMap = { ...DEFAULT_KEYMAP, ...keymap };

  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      const action = resolveBumpKey(e, mergedKeymap);
      if (action) {
        // preventDefault for Enter/Space so they don't trigger button clicks
        if (action === 'bump') e.preventDefault();
        callbackRef.current(action);
      }
    },
    [enabled, mergedKeymap]
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [handler, enabled]);
};

export { DEFAULT_KEYMAP };
export type { BumpAction, BumpKeyMap };
