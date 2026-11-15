export type KraCounterDb = {
  query: <R extends unknown[] = any[]>(
    sql: string,
    parameters?: Record<string, unknown>
  ) => Promise<R>;
};

export type KraCounterKind = 'invc' | 'sar' | 'item';

export const KRA_COUNTER_TABLE = 'integration_kra_counter';

/**
 * Atomically allocate the next KRA sequence for a TIN+branch.
 * Counters start at 0; each call increments and returns the new value (1, 2, …).
 */
export const nextKraCounter = async (
  db: KraCounterDb,
  tin: string,
  bhfId: string,
  kind: KraCounterKind
): Promise<number> => {
  const field =
    kind === 'invc' ? 'next_invc_no' : kind === 'sar' ? 'next_sar_no' : 'next_item_seq';

  const [existing] = await db.query<Array<{ id: string }>>(
    `SELECT id FROM ${KRA_COUNTER_TABLE}
     WHERE tin = $tin AND bhf_id = $bhfId
     LIMIT 1`,
    { tin, bhfId }
  );

  if (!existing?.[0]?.id) {
    await db.query(
      `CREATE ${KRA_COUNTER_TABLE} SET
        tin = $tin,
        bhf_id = $bhfId,
        next_invc_no = 0,
        next_sar_no = 0,
        next_item_seq = 0,
        created_at = time::now(),
        updated_at = time::now()`,
      { tin, bhfId }
    );
  }

  const [updated] = await db.query<Array<Record<string, number>>>(
    `UPDATE ${KRA_COUNTER_TABLE}
     SET ${field} += 1, updated_at = time::now()
     WHERE tin = $tin AND bhf_id = $bhfId
     RETURN AFTER`,
    { tin, bhfId }
  );

  const row = updated?.[0];
  const next = Number(row?.[field]);
  if (!Number.isFinite(next) || next < 1) {
    throw new Error(`Failed to allocate KRA ${kind} counter`);
  }
  return next;
};
