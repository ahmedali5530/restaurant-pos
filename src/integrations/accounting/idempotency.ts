export const buildAccountingIdempotencyKey = (eventId: string): string =>
  `accounting:${eventId}`;
