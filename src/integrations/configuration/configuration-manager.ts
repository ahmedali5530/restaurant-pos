import { useDB } from '@/api/db/db.ts';
import {
  getIntegrationProviderConfig,
  saveIntegrationProviderConfig,
} from '@/integrations/configuration/configuration-store.ts';
import { useRef } from 'react';

export const useIntegrationConfigurationManager = () => {
  const db = useDB();
  const dbRef = useRef(db);
  dbRef.current = db;

  const getConfiguration = async (providerId: string): Promise<Record<string, unknown>> => {
    return getIntegrationProviderConfig(dbRef.current, providerId);
  };

  const saveConfiguration = async (providerId: string, values: Record<string, unknown>) => {
    await saveIntegrationProviderConfig(dbRef.current, providerId, values);
  };

  return {
    getConfiguration,
    saveConfiguration,
  };
};
