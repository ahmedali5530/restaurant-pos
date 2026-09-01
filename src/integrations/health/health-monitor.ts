import { nowSurrealDateTime, toJsDate } from '@/lib/datetime.ts';
import { IntegrationProvider } from '@/integrations/core/provider.ts';
import { IntegrationHealthSnapshot } from '@/integrations/core/types.ts';

export class HealthMonitor {
  private snapshots = new Map<string, IntegrationHealthSnapshot>();

  async collect(provider: IntegrationProvider) {
    const manifest = provider.getManifest();
    if (!provider.healthCheck) {
      const fallback: IntegrationHealthSnapshot = {
        providerId: manifest.id,
        status: 'disconnected',
        authenticationStatus: 'unknown',
        pendingJobs: 0,
        failedJobs: 0,
        version: manifest.providerVersion,
        updatedAt: toJsDate(nowSurrealDateTime()).toISOString(),
      };
      this.snapshots.set(manifest.id, fallback);
      return fallback;
    }

    const snapshot = await provider.healthCheck();
    this.snapshots.set(manifest.id, snapshot);
    return snapshot;
  }

  get(providerId: string) {
    return this.snapshots.get(providerId);
  }

  list() {
    return Array.from(this.snapshots.values());
  }
}
