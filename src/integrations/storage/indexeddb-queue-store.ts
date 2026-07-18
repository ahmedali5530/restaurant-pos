import { get, set, values } from 'idb-keyval';
import { IntegrationQueueJob, IntegrationQueueStatus, QueueStore } from '@/integrations/queue/types.ts';
import { integrationQueueStore } from '@/integrations/storage/indexeddb.ts';

export class IndexedDbQueueStore implements QueueStore {
  async save(job: IntegrationQueueJob) {
    await set(job.id, job, integrationQueueStore);
  }

  async update(job: IntegrationQueueJob) {
    await set(job.id, job, integrationQueueStore);
  }

  async get(jobId: string) {
    return get<IntegrationQueueJob>(jobId, integrationQueueStore);
  }

  async listByStatus(statuses: IntegrationQueueStatus[]) {
    const jobs = await values<IntegrationQueueJob>(integrationQueueStore);
    return jobs.filter((job) => statuses.includes(job.status));
  }

  async findByDedupeKey(dedupeKey: string) {
    const jobs = await values<IntegrationQueueJob>(integrationQueueStore);
    const matches = jobs.filter((job) => job.dedupeKey === dedupeKey);
    const inFlight = matches.find((job) =>
      job.status === 'Pending' || job.status === 'Running' || job.status === 'Waiting'
    );
    return inFlight ?? matches[0];
  }
}
