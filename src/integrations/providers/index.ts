import { IntegrationProvider } from '@/integrations/core/provider.ts';
import { FbrProvider } from '@/integrations/providers/fiscal/fbr/provider.ts';
import { PraProvider } from '@/integrations/providers/fiscal/pra/provider.ts';
import { InternalAccountingProvider } from '@/integrations/providers/accounting/internal/provider.ts';

export type ProviderFactory = () => IntegrationProvider;

export const PROVIDER_CATALOG: Record<string, ProviderFactory> = {
  'provider:fbr': () => new FbrProvider(),
  'provider:pra': () => new PraProvider(),
  'provider:internal-accounting': () => new InternalAccountingProvider(),
};
