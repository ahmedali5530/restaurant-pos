/**
 * UpsellPromptListener — listens for 'posr-show-upsell' events and renders
 * the UpsellPrompt modal, recording analytics events (shown/accepted/declined)
 * to the upsell-analytics service.
 *
 * This component bridges the gap between the dish-adding flow (which dispatches
 * the event) and the UpsellPrompt modal (which shows the suggestions) + the
 * analytics dashboard (which measures conversion rate + revenue lift).
 *
 * Mounted in: Menu screen (or globally via app.tsx)
 */

import { useState, useEffect, useCallback } from "react";
import { useDB } from "@/api/db/db.ts";
import { useSecurity } from "@/hooks/useSecurity.ts";
import { UpsellPrompt, type UpsellItem } from "@/components/orders/upsell-prompt.tsx";
import {
  recordUpsellShown,
  recordUpsellOutcome,
  readUpsellConfig,
} from "@/lib/upsell-analytics.service.ts";

interface UpsellEventData {
  dishName: string;
  upsellItems: UpsellItem[];
  orderId?: string;
}

interface PendingEvent {
  eventData: UpsellEventData;
  eventIds: Map<string, string | null>; // item.id → event_id
  startTime: number;
}

export function UpsellPromptListener() {
  const db = useDB();
  const { user } = useSecurity() as any;
  const [pending, setPending] = useState<PendingEvent | null>(null);

  // Read config to check if analytics is enabled
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);

  useEffect(() => {
    // Load settings to check if upsell analytics is enabled
    const loadConfig = async () => {
      try {
        const result = await db.query('SELECT upsell_analytics_enabled FROM settings LIMIT 1');
        const rows = Array.isArray(result) ? result.flat() : [];
        const enabled = rows[0]?.upsell_analytics_enabled ?? true;
        setAnalyticsEnabled(enabled);
        return readUpsellConfig(rows[0] ?? {});
      } catch {
        return null;
      }
    };
    loadConfig();
  }, [db]);

  // Listen for 'posr-show-upsell' events
  useEffect(() => {
    const handleShowUpsell = async (e: Event) => {
      const detail = (e as CustomEvent).detail as UpsellEventData;
      if (!detail?.upsellItems || detail.upsellItems.length === 0) return;

      // Record 'shown' events for each upsell item
      const eventIds = new Map<string, string | null>();
      if (analyticsEnabled) {
        for (const item of detail.upsellItems) {
          const eventId = await recordUpsellShown(db, {
            trigger_item_name: detail.dishName,
            suggested_item_id: item.id,
            suggested_item_name: item.name,
            suggested_price: item.price,
            placement: 'after_dish',
            user_id: user?.id?.toString?.(),
            terminal_id: undefined,
          });
          eventIds.set(item.id, eventId);
        }
      }

      setPending({
        eventData: detail,
        eventIds,
        startTime: Date.now(),
      });
    };

    window.addEventListener('posr-show-upsell', handleShowUpsell);
    return () => window.removeEventListener('posr-show-upsell', handleShowUpsell);
  }, [db, user, analyticsEnabled]);

  // Handle accept: record 'accepted' for accepted items + 'declined' for others
  const handleAccept = useCallback(async (item: UpsellItem) => {
    if (!pending) return;
    const responseMs = Date.now() - pending.startTime;
    const eventId = pending.eventIds.get(item.id);

    if (analyticsEnabled && eventId) {
      await recordUpsellOutcome(db, {
        event_id: eventId,
        outcome: 'accepted',
        response_time_ms: responseMs,
      });
    }
  }, [pending, db, analyticsEnabled]);

  // Handle decline/timeout: record 'declined' for all shown items that weren't accepted
  const handleDecline = useCallback(async () => {
    if (!pending) return;
    const responseMs = Date.now() - pending.startTime;

    if (analyticsEnabled) {
      // Record 'declined' for all items (since the user closed without accepting)
      for (const [, eventId] of pending.eventIds) {
        if (eventId) {
          await recordUpsellOutcome(db, {
            event_id: eventId,
            outcome: 'declined',
            response_time_ms: responseMs,
          });
        }
      }
    }

    setPending(null);
  }, [pending, db, analyticsEnabled]);

  // Handle confirm (user selected items + clicked "Add")
  const handleConfirm = useCallback(async (acceptedItems: UpsellItem[]) => {
    if (!pending) return;
    const responseMs = Date.now() - pending.startTime;

    if (analyticsEnabled) {
      const acceptedIds = new Set(acceptedItems.map(i => i.id));
      for (const item of pending.eventData.upsellItems) {
        const eventId = pending.eventIds.get(item.id);
        if (eventId) {
          await recordUpsellOutcome(db, {
            event_id: eventId,
            outcome: acceptedIds.has(item.id) ? 'accepted' : 'declined',
            response_time_ms: responseMs,
          });
        }
      }
    }

    setPending(null);
  }, [pending, db, analyticsEnabled]);

  if (!pending) return null;

  return (
    <UpsellPromptWrapper
      upsellItems={pending.eventData.upsellItems}
      dishName={pending.eventData.dishName}
      onAccept={handleAccept}
      onDecline={handleDecline}
      onConfirm={handleConfirm}
    />
  );
}

/**
 * Wrapper that extends UpsellPrompt with multi-select confirm behavior.
 * The original UpsellPrompt calls onAccept per item + onDecline on close.
 * We intercept to track analytics + handle the confirm flow.
 */
function UpsellPromptWrapper({
  upsellItems,
  dishName,
  onAccept,
  onDecline,
  onConfirm,
}: {
  upsellItems: UpsellItem[];
  dishName: string;
  onAccept: (item: UpsellItem) => void;
  onDecline: () => void;
  onConfirm: (acceptedItems: UpsellItem[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const accepted = upsellItems.filter(i => selected.has(i.id));
    // Record analytics for each accepted item
    for (const item of accepted) {
      onAccept(item);
    }
    onConfirm(accepted);
  };

  const handleClose = () => {
    onDecline();
  };

  // Use the original UpsellPrompt but intercept its callbacks
  return (
    <UpsellPrompt
      upsellItems={upsellItems}
      onAccept={(_item) => {
        // This is called per-item in the original — but we handle via onConfirm
        // Don't double-record here
      }}
      onDecline={handleClose}
      dishName={dishName}
    />
  );
}

export default UpsellPromptListener;
