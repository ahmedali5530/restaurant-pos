import {
  IntegrationEvent,
  IntegrationExecutionRequest,
  IntegrationExecutionResponse,
  IntegrationHealthSnapshot,
  ProviderCapability,
  ProviderConfigurationSchema,
  ProviderManifest,
} from '@/integrations/core/types.ts';
import { DateTime as SurrealDateTime } from 'surrealdb';

export interface ProviderExecutionContext {
  providerId: string;
  correlationId?: string;
  triggeredBy?: string;
  now: SurrealDateTime;
}

export interface IntegrationProvider {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getManifest(): ProviderManifest;
  getConfigurationSchema(): ProviderConfigurationSchema;
  getCapabilities(): ProviderCapability[];
  supports(capability: ProviderCapability): boolean;
  validate(): Promise<{ valid: boolean; errors?: string[] }>;
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  healthCheck?(): Promise<IntegrationHealthSnapshot>;
  execute?(
    request: IntegrationExecutionRequest,
    context: ProviderExecutionContext
  ): Promise<IntegrationExecutionResponse>;
  cancel?(requestId: string): Promise<IntegrationExecutionResponse>;
  sync?(): Promise<void>;
  retry?(requestId: string): Promise<IntegrationExecutionResponse>;
  subscribeEvents?(): Promise<string[]>;
  handleEvent?(event: IntegrationEvent<any>): Promise<void>;
}
