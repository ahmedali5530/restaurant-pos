import { IntegrationEvent } from '@/integrations/core/types.ts';

type EventHandler = (event: IntegrationEvent<any>) => Promise<void> | void;

export class IntegrationEventBus {
  private readonly listeners = new Map<string, Set<EventHandler>>();

  subscribe(
    eventName: string,
    handler: EventHandler
  ): () => void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set<EventHandler>());
    }
    this.listeners.get(eventName)?.add(handler as EventHandler);

    return () => {
      this.listeners.get(eventName)?.delete(handler as EventHandler);
    };
  }

  async publish(event: IntegrationEvent<any>) {
    const handlers = this.listeners.get(event.name);
    if (!handlers?.size) return;
    await Promise.allSettled(Array.from(handlers).map((handler) => handler(event)));
  }
}
