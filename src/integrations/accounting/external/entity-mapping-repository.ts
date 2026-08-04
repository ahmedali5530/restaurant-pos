import { Tables } from '@/api/db/tables.ts';
import { EntityMapping, ExternalEntityType } from '@/integrations/accounting/external/types.ts';
import { nowSurrealDateTime } from '@/lib/datetime.ts';

export type EntityMappingDbClient = {
  query: <R extends unknown[] = any[]>(sql: string, parameters?: Record<string, unknown>) => Promise<R>;
  create: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
  merge: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
};

export class EntityMappingRepository {
  constructor(private readonly db: EntityMappingDbClient) {}

  async findByPosrId(
    providerId: string,
    tenantId: string,
    entityType: ExternalEntityType,
    posrId: string
  ): Promise<EntityMapping | null> {
    const [rows] = await this.db.query<EntityMapping[]>(
      `SELECT * FROM ${Tables.integration_entity_mappings}
       WHERE provider_id = $providerId AND tenant_id = $tenantId
         AND entity_type = $entityType AND posr_id = $posrId
       LIMIT 1`,
      { providerId, tenantId, entityType, posrId }
    );
    return rows?.[0] ?? null;
  }

  async findByExternalId(
    providerId: string,
    tenantId: string,
    entityType: ExternalEntityType,
    externalId: string
  ): Promise<EntityMapping | null> {
    const [rows] = await this.db.query<EntityMapping[]>(
      `SELECT * FROM ${Tables.integration_entity_mappings}
       WHERE provider_id = $providerId AND tenant_id = $tenantId
         AND entity_type = $entityType AND external_id = $externalId
       LIMIT 1`,
      { providerId, tenantId, entityType, externalId }
    );
    return rows?.[0] ?? null;
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

    const [rows] = await this.db.query<EntityMapping[]>(sql, params);
    return rows ?? [];
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
