import { Tables } from '@/api/db/tables.ts';
import { EntityMapping, ExternalEntityType } from '@/integrations/accounting/external/types.ts';
import { nowSurrealDateTime } from '@/lib/datetime.ts';

export type EntityMappingDbClient = {
  query: <R extends unknown[] = any[]>(sql: string, parameters?: Record<string, unknown>) => Promise<R>;
  create: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
  merge: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
};

const normalizeEntityMapping = (row: any): EntityMapping | null => {
  if (!row) return null;
  const posrId = String(row.posrId ?? row.posr_id ?? '');
  const externalId = String(row.externalId ?? row.external_id ?? '');
  if (!posrId || !externalId) return null;
  return {
    id: row.id != null ? String(row.id) : undefined,
    providerId: String(row.providerId ?? row.provider_id ?? ''),
    tenantId: String(row.tenantId ?? row.tenant_id ?? ''),
    entityType: (row.entityType ?? row.entity_type) as ExternalEntityType,
    posrId,
    externalId,
    externalPayload: (row.externalPayload ?? row.external_payload ?? {}) as Record<string, unknown>,
    updatedAt:
      row.updatedAt != null || row.updated_at != null
        ? String(row.updatedAt ?? row.updated_at)
        : undefined,
  };
};

export class EntityMappingRepository {
  constructor(private readonly db: EntityMappingDbClient) {}

  async findByPosrId(
    providerId: string,
    tenantId: string,
    entityType: ExternalEntityType,
    posrId: string
  ): Promise<EntityMapping | null> {
    const [rows] = await this.db.query<any[]>(
      `SELECT * FROM ${Tables.integration_entity_mappings}
       WHERE provider_id = $providerId AND tenant_id = $tenantId
         AND entity_type = $entityType AND posr_id = $posrId
       LIMIT 1`,
      { providerId, tenantId, entityType, posrId }
    );
    return normalizeEntityMapping(rows?.[0]);
  }

  async findByExternalId(
    providerId: string,
    tenantId: string,
    entityType: ExternalEntityType,
    externalId: string
  ): Promise<EntityMapping | null> {
    const [rows] = await this.db.query<any[]>(
      `SELECT * FROM ${Tables.integration_entity_mappings}
       WHERE provider_id = $providerId AND tenant_id = $tenantId
         AND entity_type = $entityType AND external_id = $externalId
       LIMIT 1`,
      { providerId, tenantId, entityType, externalId }
    );
    return normalizeEntityMapping(rows?.[0]);
  }

  async save(mapping: Omit<EntityMapping, 'id' | 'updatedAt'>): Promise<EntityMapping> {
    const existing = await this.findByPosrId(mapping.providerId, mapping.tenantId, mapping.entityType, mapping.posrId);

    const data = {
      provider_id: mapping.providerId,
      tenant_id: mapping.tenantId,
      entity_type: mapping.entityType,
      posr_id: mapping.posrId,
      external_id: mapping.externalId,
      external_payload: mapping.externalPayload ?? {},
      updated_at: nowSurrealDateTime(),
    };

    if (existing?.id) {
      await this.db.merge(existing.id, data);
    } else {
      await this.db.create(Tables.integration_entity_mappings, data);
    }

    return { ...mapping, updatedAt: nowSurrealDateTime() };
  }

  async saveAll(mappings: Omit<EntityMapping, 'id' | 'updatedAt'>[]): Promise<void> {
    for (const mapping of mappings) {
      await this.save(mapping);
    }
  }

  async listByProvider(
    providerId: string,
    tenantId: string,
    entityType?: ExternalEntityType
  ): Promise<EntityMapping[]> {
    let sql = `SELECT * FROM ${Tables.integration_entity_mappings}
               WHERE provider_id = $providerId AND tenant_id = $tenantId`;
    const params: Record<string, unknown> = { providerId, tenantId };

    if (entityType) {
      sql += ' AND entity_type = $entityType';
      params.entityType = entityType;
    }

    sql += ' ORDER BY entity_type, posr_id';

    const [rows] = await this.db.query<any[]>(sql, params);
    return (rows ?? [])
      .map((row) => normalizeEntityMapping(row))
      .filter((row): row is EntityMapping => Boolean(row));
  }

  async delete(providerId: string, tenantId: string, entityType: ExternalEntityType, posrId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM ${Tables.integration_entity_mappings}
       WHERE provider_id = $providerId AND tenant_id = $tenantId
         AND entity_type = $entityType AND posr_id = $posrId`,
      { providerId, tenantId, entityType, posrId }
    );
  }

  async deleteAllForTenant(providerId: string, tenantId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM ${Tables.integration_entity_mappings}
       WHERE provider_id = $providerId AND tenant_id = $tenantId`,
      { providerId, tenantId }
    );
  }
}
