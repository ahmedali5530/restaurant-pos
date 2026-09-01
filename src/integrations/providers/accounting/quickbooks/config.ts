import { ExternalAccountingConfig } from '@/integrations/accounting/external/types.ts';
import { parseExternalAccountingConfig } from '@/integrations/accounting/external/config.ts';

export type QuickBooksConfig = ExternalAccountingConfig & {
  environment: 'sandbox' | 'production';
  isConnected: boolean;
  companyName: string;
  saleItemId?: string;
};

export const parseQuickBooksConfig = (raw: Record<string, unknown>): QuickBooksConfig => {
  const base = parseExternalAccountingConfig(raw);

  return {
    ...base,
    environment: (raw.environment as 'sandbox' | 'production') ?? 'sandbox',
    isConnected: Boolean(raw.isConnected),
    companyName: String(raw.companyName ?? ''),
    saleItemId: typeof raw.saleItemId === 'string' ? raw.saleItemId : undefined,
  };
};
