import { useDB } from '@/api/db/db.ts';
import { Tables } from '@/api/db/tables.ts';
import { nowSurrealDateTime, toSurrealDateTime } from '@/lib/datetime.ts';
import { IntegrationHealthSnapshot, ProviderManifest } from '@/integrations/core/types.ts';
import { IntegrationQueueJob } from '@/integrations/queue/types.ts';
import { useMemo, useRef } from 'react';

type IntegrationDbClient = {
  query: <R extends unknown[] = any[]>(sql: string, parameters?: Record<string, unknown>) => Promise<R>;
  create: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
  merge: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
  upsert: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
};

export interface InstalledProviderState {
  id?: string;
  provider_id: string;
  enabled: boolean;
  updated_at?: string;
}

export class IntegrationStateRepository {
  constructor(private readonly db: IntegrationDbClient) {}

  async syncCatalogToDatabase(manifests: ProviderManifest[]) {
    const existingStates = await this.getProviderStates();
    const knownProviderIds = new Set(existingStates.map((state) => state.provider_id));

    for (const manifest of manifests) {
      if (knownProviderIds.has(manifest.id)) {
        continue;
      }
      await this.db.create(Tables.integration_installed_providers, {
        provider_id: manifest.id,
        enabled: false,
        updated_at: nowSurrealDateTime(),
      });
    }
  }

  async getProviderStates(): Promise<InstalledProviderState[]> {
    const [rows] = await this.db.query<InstalledProviderState[]>(
      `SELECT id, provider_id, enabled, updated_at FROM ${Tables.integration_installed_providers}`
    );
    return rows ?? [];
  }

  async setProviderEnabled(providerId: string, enabled: boolean) {
    const [rows] = await this.db.query<Array<{ id: string }>>(
      `SELECT id FROM ${Tables.integration_installed_providers} WHERE provider_id = $providerId LIMIT 1`,
      { providerId }
    );
    const now = nowSurrealDateTime();

    if (rows?.[0]?.id) {
      await this.db.merge(rows[0].id, { enabled, updated_at: now });
      return;
    }

    await this.db.create(Tables.integration_installed_providers, {
      provider_id: providerId,
      enabled,
      updated_at: now,
    });
  }

  async saveQueueAttempt(job: IntegrationQueueJob) {
    await this.db.create(Tables.integration_queue_attempts, {
      job_id: job.id,
      provider_id: job.providerId,
      status: job.status,
      attempts: job.attempts,
      error: job.lastError ?? null,
      created_at: nowSurrealDateTime(),
    });
  }

  async saveHealthSnapshot(snapshot: IntegrationHealthSnapshot) {
    await this.db.upsert(`${Tables.integration_provider_health}:${snapshot.providerId}`, {
      provider_id: snapshot.providerId,
      status: snapshot.status,
      authentication_status: snapshot.authenticationStatus,
      average_response_time_ms: snapshot.averageResponseTimeMs ?? null,
      pending_jobs: snapshot.pendingJobs,
      failed_jobs: snapshot.failedJobs,
      last_synchronization: snapshot.lastSynchronization
        ? toSurrealDateTime(snapshot.lastSynchronization)
        : null,
      certificate_expiry: snapshot.certificateExpiry
        ? toSurrealDateTime(snapshot.certificateExpiry)
        : null,
      version: snapshot.version,
      errors: snapshot.errors ?? [],
      updated_at: toSurrealDateTime(snapshot.updatedAt),
    });
  }
}

export const useIntegrationRepositories = () => {
  const db = useDB();
  const dbRef = useRef(db);
  dbRef.current = db;

  return useMemo(
    () =>
      new IntegrationStateRepository({
        query: (...args) => dbRef.current.query(...args),
        create: (...args) => dbRef.current.create(...args),
        merge: (...args) => dbRef.current.merge(...args),
        upsert: (...args) => dbRef.current.upsert(...args),
      }),
    []
  );
};
