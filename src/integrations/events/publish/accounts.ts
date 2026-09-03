import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import { ManagerLike, safePublish } from '@/integrations/events/publish/safe.ts';

export type JournalPostedPayload = {
  entryId: string;
  entryNumber?: number;
  sourceModule?: string;
  originEvent?: string;
  lineCount?: number;
};

export type JournalReversedPayload = {
  entryId: string;
  reverseEntryId?: string;
  entryNumber?: number;
};

export const journalPostedEventId = (entryId: string) => `JournalPosted:${entryId}`;
export const journalReversedEventId = (entryId: string) =>
  `JournalReversed:${entryId}`;

export const publishJournalPosted = async (
  manager: ManagerLike,
  payload: JournalPostedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'JournalPosted',
          payload,
          'accounts-core',
          journalPostedEventId(payload.entryId)
        )
      );
    },
    'JournalPosted'
  );
};

export const publishJournalReversed = async (
  manager: ManagerLike,
  payload: JournalReversedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'JournalReversed',
          payload,
          'accounts-core',
          journalReversedEventId(payload.entryId)
        )
      );
    },
    'JournalReversed'
  );
};
