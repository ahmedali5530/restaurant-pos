import {nanoid} from "nanoid";
import {Tables} from "@/api/db/tables.ts";
import {toRecordId} from "@/lib/utils.ts";
import {toUint8Array} from "@/utils/files.ts";

export const DELIVERY_BANNERS_SETTING_KEY = "delivery_banners";

export type DeliveryBanner = {
  id: string;
  name: string;
  mimeType: string;
  documentId: string;
};

type DbQuery = <R extends unknown[] = unknown[]>(
  sql: string,
  parameters?: Record<string, unknown>
) => Promise<R>;

type DbMerge = (thing: string, data: Record<string, unknown>) => Promise<unknown>;
type DbCreate = (table: string, data: Record<string, unknown>) => Promise<unknown>;
type DbDelete = (thing: string) => Promise<unknown>;

export const createBannerDocument = async (
  create: DbCreate,
  file: File
): Promise<DeliveryBanner> => {
  const mimeType = file.type || "image/jpeg";
  const content = await file.arrayBuffer();

  const [document] = await create(Tables.documents, {
    name: file.name,
    content,
    size: file.size,
    type: mimeType,
  }) as [{id: string}];

  return {
    id: nanoid(),
    name: file.name,
    mimeType,
    documentId: document.id.toString(),
  };
};

export const fetchBannerContent = async (
  query: DbQuery,
  documentId: string
): Promise<Uint8Array | null> => {
  const [rows] = await query(
    `SELECT content FROM ONLY $id`,
    {id: toRecordId(documentId)}
  );

  const record = (Array.isArray(rows) ? rows[0] : rows) as {content?: unknown} | undefined;

  if (!record?.content) {
    return null;
  }

  try {
    return toUint8Array(record.content);
  } catch {
    return null;
  }
};

export const deleteBannerDocument = async (
  del: DbDelete,
  documentId: string
): Promise<void> => {
  await del(documentId);
};

export const loadDeliveryBanners = async (query: DbQuery): Promise<DeliveryBanner[]> => {
  const [result] = await query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key LIMIT 1`,
    {key: DELIVERY_BANNERS_SETTING_KEY}
  );

  if (!Array.isArray(result) || result.length === 0) {
    return [];
  }

  const values = (result[0] as { values?: DeliveryBanner[] })?.values;
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter(
    (banner): banner is DeliveryBanner =>
      typeof banner?.id === "string" &&
      typeof banner?.name === "string" &&
      typeof banner?.mimeType === "string" &&
      typeof banner?.documentId === "string"
  );
};

export const saveDeliveryBanners = async (
  query: DbQuery,
  merge: DbMerge,
  create: DbCreate,
  banners: DeliveryBanner[]
): Promise<void> => {
  const [result] = await query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key LIMIT 1`,
    {key: DELIVERY_BANNERS_SETTING_KEY}
  );

  if (Array.isArray(result) && result.length > 0) {
    await merge((result[0] as { id: string }).id, {values: banners});
    return;
  }

  await create(Tables.settings, {
    key: DELIVERY_BANNERS_SETTING_KEY,
    values: banners,
    is_global: true,
  });
};
