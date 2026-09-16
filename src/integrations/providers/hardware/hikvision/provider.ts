import { IntegrationProvider, ProviderExecutionContext } from '@/integrations/core/provider.ts';
import {
  IntegrationEvent,
  IntegrationExecutionRequest,
  IntegrationExecutionResponse,
  IntegrationHealthSnapshot,
  ProviderCapability,
  ProviderConfigurationSchema,
  ProviderManifest,
} from '@/integrations/core/types.ts';
import { ScheduledJobDefinition } from '@/integrations/scheduler/scheduler-engine.ts';
import { nowSurrealDateTime, toJsDate } from '@/lib/datetime.ts';
import {
  enabledDevices,
  HikvisionConfigLoader,
  parseHikvisionConfig,
  validateHikvisionConfig,
} from '@/integrations/providers/hardware/hikvision/config.ts';
import { hikvisionManifest } from '@/integrations/providers/hardware/hikvision/manifest.ts';
import { HIKVISION_PROVIDER_ID } from '@/integrations/providers/hardware/hikvision/isapi-types.ts';
import { testConnection } from '@/integrations/providers/hardware/hikvision/client-bridge.ts';
import {
  HikvisionDb,
  pollAllDevices,
} from '@/integrations/providers/hardware/hikvision/event-poller.ts';
import {
  handleEmployeeEntityChanged,
  pushAllActiveEmployees,
  upsertEmployeeOnDevices,
} from '@/integrations/providers/hardware/hikvision/employee-sync.ts';
import type { EntityChangedPayload } from '@/integrations/events/payloads/entity-changed.ts';
import type { Employee } from '@/api/model/employee.ts';
import { Tables } from '@/api/db/tables.ts';

type JobEnqueuer = (request: IntegrationExecutionRequest) => Promise<unknown>;
type SchedulerRegisterer = (definition: ScheduledJobDefinition) => void;
type SchedulerUnregisterer = (jobId: string) => void;

const POLL_JOB_ID = 'hikvision-attendance-poll';

export class HikvisionAttendanceProvider implements IntegrationProvider {
  private getConfig: HikvisionConfigLoader = async () => ({});
  private getDb: (() => HikvisionDb) | null = null;
  private enqueueJob: JobEnqueuer | null = null;
  private registerScheduledJob: SchedulerRegisterer | null = null;
  private unregisterScheduledJob: SchedulerUnregisterer | null = null;
  private lastError: string | undefined;
  private lastSuccessAt: string | undefined;
  private failedJobs = 0;
  private polling = false;

  setConfigLoader(loader: HikvisionConfigLoader) {
    this.getConfig = loader;
  }

  setDbLoader(loader: () => HikvisionDb) {
    this.getDb = loader;
  }

  setJobEnqueuer(enqueuer: JobEnqueuer) {
    this.enqueueJob = enqueuer;
  }

  setSchedulerRegisterer(register: SchedulerRegisterer, unregister?: SchedulerUnregisterer) {
    this.registerScheduledJob = register;
    this.unregisterScheduledJob = unregister ?? null;
  }

  async initialize(): Promise<void> {
    await this.refreshScheduler();
  }

  async shutdown(): Promise<void> {
    this.unregisterScheduledJob?.(POLL_JOB_ID);
  }

  getManifest(): ProviderManifest {
    return hikvisionManifest;
  }

  getConfigurationSchema(): ProviderConfigurationSchema {
    return hikvisionManifest.configurationSchema;
  }

  getCapabilities(): ProviderCapability[] {
    return [
      'configuration',
      'execute',
      'sync',
      'scheduler',
      'health',
      'events',
      'queue',
      'backgroundJobs',
    ];
  }

  supports(capability: ProviderCapability): boolean {
    return this.getCapabilities().includes(capability);
  }

  async validate(): Promise<{ valid: boolean; errors?: string[] }> {
    const raw = await this.getConfig();
    const config = parseHikvisionConfig(raw);
    return validateHikvisionConfig(config);
  }

  async healthCheck(): Promise<IntegrationHealthSnapshot> {
    const validation = await this.validate();
    const raw = await this.getConfig();
    const config = parseHikvisionConfig(raw);
    const devices = enabledDevices(config);

    let status: IntegrationHealthSnapshot['status'] = 'connected';
    if (!validation.valid) status = 'disconnected';
    else if (this.lastError) status = 'degraded';

    return {
      providerId: HIKVISION_PROVIDER_ID,
      status,
      authenticationStatus: validation.valid ? 'valid' : 'invalid',
      averageResponseTimeMs: 200,
      pendingJobs: 0,
      failedJobs: this.failedJobs,
      lastSynchronization: this.lastSuccessAt,
      version: hikvisionManifest.providerVersion,
      updatedAt: toJsDate(nowSurrealDateTime()).toISOString(),
      errors: [
        ...(validation.errors ?? []),
        ...(this.lastError ? [this.lastError] : []),
        `devices=${devices.length}; poll=${config.pollIntervalSeconds}s`,
      ].filter(Boolean),
    };
  }

  async subscribeEvents(): Promise<string[]> {
    return hikvisionManifest.supportedEvents;
  }

  async handleEvent(event: IntegrationEvent<any>): Promise<void> {
    if (event.name !== 'EntityChanged') return;
    const payload = event.payload as EntityChangedPayload;
    if (payload.domain !== 'hr') return;
    if (payload.table !== 'employee' && payload.table !== Tables.employees) return;

    if (this.enqueueJob) {
      await this.enqueueJob({
        action: 'syncEmployee',
        payload: { entityChanged: payload },
        idempotencyKey: `hikvision-employee:${payload.entityId}:${payload.action}:${event.id}`,
      });
      return;
    }

    await this.runEmployeeSync(payload);
  }

  async sync(): Promise<void> {
    await this.runImportEvents();
  }

  async execute(
    request: IntegrationExecutionRequest,
    _context: ProviderExecutionContext
  ): Promise<IntegrationExecutionResponse> {
    try {
      switch (request.action) {
        case 'importEvents':
        case 'syncEvents': {
          const summary = await this.runImportEvents();
          return {
            success: summary.errors.length === 0,
            status: summary.errors.length ? 'failed' : 'completed',
            providerId: HIKVISION_PROVIDER_ID,
            data: summary,
            error: summary.errors[0],
            retriable: summary.errors.length > 0,
          };
        }
        case 'testConnection': {
          const result = await this.runTestConnection(request.payload?.deviceId as string | undefined);
          return {
            success: true,
            status: 'completed',
            providerId: HIKVISION_PROVIDER_ID,
            data: result,
          };
        }
        case 'pushEmployees': {
          const result = await this.runPushAllEmployees();
          return {
            success: result.errors.length === 0,
            status: result.errors.length ? 'failed' : 'completed',
            providerId: HIKVISION_PROVIDER_ID,
            data: result,
            error: result.errors[0],
            retriable: result.errors.length > 0,
          };
        }
        case 'syncEmployee': {
          await this.runEmployeeSync(request.payload?.entityChanged as EntityChangedPayload);
          return {
            success: true,
            status: 'completed',
            providerId: HIKVISION_PROVIDER_ID,
          };
        }
        case 'pushEmployee': {
          const employee = request.payload?.employee as Employee;
          if (!employee?.id) {
            return {
              success: false,
              status: 'failed',
              providerId: HIKVISION_PROVIDER_ID,
              error: 'employee payload required',
            };
          }
          const raw = await this.getConfig();
          const config = parseHikvisionConfig(raw);
          const db = this.requireDb();
          const result = await upsertEmployeeOnDevices({
            db,
            config,
            devices: enabledDevices(config),
            employee,
          });
          return {
            success: result.errors.length === 0,
            status: result.errors.length ? 'failed' : 'completed',
            providerId: HIKVISION_PROVIDER_ID,
            data: result,
            error: result.errors[0],
            retriable: result.errors.length > 0,
          };
        }
        default:
          return {
            success: false,
            status: 'failed',
            providerId: HIKVISION_PROVIDER_ID,
            error: `Unknown action: ${request.action}`,
          };
      }
    } catch (error) {
      this.failedJobs += 1;
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      return {
        success: false,
        status: 'failed',
        providerId: HIKVISION_PROVIDER_ID,
        error: message,
        retriable: true,
      };
    }
  }

  private requireDb(): HikvisionDb {
    if (!this.getDb) {
      throw new Error('Database loader is not configured for Hikvision provider');
    }
    return this.getDb();
  }

  private async refreshScheduler(): Promise<void> {
    this.unregisterScheduledJob?.(POLL_JOB_ID);
    if (!this.registerScheduledJob) return;

    const raw = await this.getConfig();
    const config = parseHikvisionConfig(raw);
    const validation = validateHikvisionConfig(config);
    if (!validation.valid) return;

    this.registerScheduledJob({
      id: POLL_JOB_ID,
      providerId: HIKVISION_PROVIDER_ID,
      name: 'Poll Hikvision AcsEvent',
      intervalMs: config.pollIntervalSeconds * 1000,
      run: async () => {
        if (this.polling) return;
        this.polling = true;
        try {
          await this.runImportEvents();
        } catch (error) {
          this.lastError = error instanceof Error ? error.message : String(error);
          this.failedJobs += 1;
        } finally {
          this.polling = false;
        }
      },
    });
  }

  private async runImportEvents() {
    const raw = await this.getConfig();
    const config = parseHikvisionConfig(raw);
    const devices = enabledDevices(config);
    const db = this.requireDb();
    const summary = await pollAllDevices(db, config, devices);
    if (summary.errors.length) {
      this.lastError = summary.errors[0];
      this.failedJobs += 1;
    } else {
      this.lastError = undefined;
      this.lastSuccessAt = new Date().toISOString();
    }
    return summary;
  }

  private async runTestConnection(deviceId?: string) {
    const raw = await this.getConfig();
    const config = parseHikvisionConfig(raw);
    const devices = enabledDevices(config);
    const targets = deviceId ? devices.filter((d) => d.id === deviceId) : devices;
    if (!targets.length) {
      throw new Error(deviceId ? `Device ${deviceId} not found or disabled` : 'No enabled devices');
    }

    const results = [];
    for (const device of targets) {
      const result = await testConnection(device);
      results.push({ deviceId: device.id, name: device.name, ...result });
    }
    this.lastSuccessAt = new Date().toISOString();
    this.lastError = undefined;
    return results;
  }

  private async runPushAllEmployees() {
    const raw = await this.getConfig();
    const config = parseHikvisionConfig(raw);
    const db = this.requireDb();
    const result = await pushAllActiveEmployees({
      db,
      config,
      devices: enabledDevices(config),
    });
    if (result.errors.length) {
      this.lastError = result.errors[0];
      this.failedJobs += 1;
    } else {
      this.lastError = undefined;
      this.lastSuccessAt = new Date().toISOString();
    }
    return result;
  }

  private async runEmployeeSync(payload?: EntityChangedPayload) {
    if (!payload) return;
    const raw = await this.getConfig();
    const config = parseHikvisionConfig(raw);
    const db = this.requireDb();
    await handleEmployeeEntityChanged({
      db,
      config,
      devices: enabledDevices(config),
      payload,
    });
  }
}
