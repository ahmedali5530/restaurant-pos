export interface ScheduledJobDefinition {
  id: string;
  providerId: string;
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export class SchedulerEngine {
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  register(definition: ScheduledJobDefinition) {
    this.unregister(definition.id);
    const timer = setInterval(() => {
      void definition.run();
    }, definition.intervalMs);
    this.timers.set(definition.id, timer);
  }

  unregister(jobId: string) {
    const timer = this.timers.get(jobId);
    if (!timer) return;
    clearInterval(timer);
    this.timers.delete(jobId);
  }

  shutdown() {
    for (const jobId of this.timers.keys()) {
      this.unregister(jobId);
    }
  }
}
