import { IntegrationProvider } from '@/integrations/core/provider.ts';
import { FbrProvider } from '@/integrations/providers/fiscal/fbr/provider.ts';
import { PraProvider } from '@/integrations/providers/fiscal/pra/provider.ts';
import { InternalAccountingProvider } from '@/integrations/providers/accounting/internal/provider.ts';
import { InternalInventoryProvider } from '@/integrations/providers/inventory/internal/provider.ts';
import { QuickBooksProvider } from '@/integrations/providers/accounting/quickbooks/provider.ts';
import { EventLoggerProvider } from '@/integrations/providers/logging/provider.ts';

export type ProviderFactory = () => IntegrationProvider;

export const PROVIDER_CATALOG: Record<string, ProviderFactory> = {
  'provider:fbr': () => new FbrProvider(),
  'provider:pra': () => new PraProvider(),
  'provider:internal-accounting': () => new InternalAccountingProvider(),
  'provider:internal-inventory': () => new InternalInventoryProvider(),
  'provider:quickbooks': () => new QuickBooksProvider(),
  'provider:event-logger': () => new EventLoggerProvider(),
};
