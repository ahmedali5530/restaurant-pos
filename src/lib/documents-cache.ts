import {del, set} from 'idb-keyval';
import {Tables} from '@/api/db/tables.ts';
import {toArrayBuffer} from '@/utils/files.ts';

type DbLike = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

/**
 * Reload Surreal `document` rows into the idb-keyval cache that MenuDish reads.
 * Catalog Sync / Refresh catalog update Surreal + Dexie but leave this cache stale
 * unless we refresh it explicitly (full Reload cache already did).
 */
export async function refreshDocumentsIdbCache(db: DbLike): Promise<number> {
  const [rows] = await db.query(
    `SELECT id, content, name, size, type, path FROM ${Tables.documents}`,
  );
  const list = Array.isArray(rows) ? rows : [];
  const normalized = list.map((item: any) => {
    let content = item?.content;
    try {
      if (content != null) {
        content = toArrayBuffer(content);
      }
    } catch {
      content = null;
    }
    return {
      ...item,
      id: item?.id?.toString?.() ?? String(item?.id ?? ''),
      content,
    };
  });
  await del(Tables.documents);
  await set(Tables.documents, normalized);
  return normalized.length;
}
