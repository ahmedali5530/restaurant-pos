import { Tables } from '@/api/db/tables.ts';

export type IntegrationConfigDbClient = {
  query: <R extends unknown[] = any[]>(sql: string, parameters?: Record<string, unknown>) => Promise<R>;
  create: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
  merge: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
};

export const integrationProviderConfigKey = (providerId: string) =>
  `integration_provider_config:${providerId}`;

export const getIntegrationProviderConfig = async (
  db: IntegrationConfigDbClient,
  providerId: string
): Promise<Record<string, unknown>> => {
  const [rows] = await db.query<Array<{ values?: Record<string, unknown> }>>(
    `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
    { key: integrationProviderConfigKey(providerId) }
  );
  return rows?.[0]?.values ?? {};
};

export const saveIntegrationProviderConfig = async (
  db: IntegrationConfigDbClient,
  providerId: string,
  values: Record<string, unknown>
) => {
  const key = integrationProviderConfigKey(providerId);
  const [rows] = await db.query<Array<{ id: string }>>(
    `SELECT id FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
    { key }
  );
  if (rows?.[0]?.id) {
    await db.query(
      `UPDATE $id MERGE { values: $values }`,
      { id: rows[0].id, values }
    );
    return;
  }
  await db.query(
    `CREATE ${Tables.settings} CONTENT { key: $key, values: $values, is_global: true }`,
    { key, values }
  );
};
