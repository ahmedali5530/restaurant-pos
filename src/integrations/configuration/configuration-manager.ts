import { useDB } from '@/api/db/db.ts';
import { Tables } from '@/api/db/tables.ts';

const keyFor = (providerId: string) => `integration_provider_config:${providerId}`;

export const useIntegrationConfigurationManager = () => {
  const db = useDB();

  const getConfiguration = async (providerId: string): Promise<Record<string, unknown>> => {
    const [rows] = await db.query<Array<{ values?: Record<string, unknown> }>>(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
      { key: keyFor(providerId) }
    );
    return rows?.[0]?.values ?? {};
  };

  const saveConfiguration = async (providerId: string, values: Record<string, unknown>) => {
    const [rows] = await db.query<Array<{ id: string }>>(
      `SELECT id FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
      { key: keyFor(providerId) }
    );
    if (rows?.[0]?.id) {
      await db.merge(rows[0].id, { values });
      return;
    }
    await db.create(Tables.settings, {
      key: keyFor(providerId),
      values,
      is_global: true,
    });
  };

  return {
    getConfiguration,
    saveConfiguration,
  };
};
