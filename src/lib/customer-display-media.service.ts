import {nanoid} from "nanoid";
import {Tables} from "@/api/db/tables.ts";
import {
  CUSTOMER_DISPLAY_MEDIA_KEY,
  DEFAULT_CUSTOMER_DISPLAY_MEDIA,
  type CustomerDisplayMediaItem,
  type CustomerDisplayMediaSettings,
  isAllowedCustomerDisplayMediaMime,
} from "@/api/model/customer-display-media.ts";
import {toRecordId} from "@/lib/utils.ts";
import {toUint8Array} from "@/utils/files.ts";

type DbQuery = <R extends unknown[] = unknown[]>(
  sql: string,
  parameters?: Record<string, unknown>,
) => Promise<R>;

type DbMerge = (thing: string, data: Record<string, unknown>) => Promise<unknown>;
type DbCreate = (table: string, data: Record<string, unknown>) => Promise<unknown>;
type DbDelete = (thing: string) => Promise<unknown>;

const normalizeSettings = (raw: unknown): CustomerDisplayMediaSettings => {
  const values = (raw && typeof raw === "object" ? raw : {}) as any;
  const itemsRaw = Array.isArray(values.items) ? values.items : [];
  const items = itemsRaw
    .filter(
      (item: any): item is CustomerDisplayMediaItem =>
        typeof item?.id === "string" &&
        typeof item?.name === "string" &&
        typeof item?.mimeType === "string" &&
        typeof item?.documentId === "string",
    )
    .map((item: CustomerDisplayMediaItem, index: number) => ({
      ...item,
      sort: typeof item.sort === "number" ? item.sort : index,
    }))
    .sort((a, b) => a.sort - b.sort);

  const rotation = Number(values.rotationIntervalSec);
  return {
    enabled: values.enabled === true,
    rotationIntervalSec:
      Number.isFinite(rotation) && rotation > 0
        ? Math.min(120, Math.max(2, Math.round(rotation)))
        : DEFAULT_CUSTOMER_DISPLAY_MEDIA.rotationIntervalSec,
    items,
  };
};

export const createCustomerDisplayMediaDocument = async (
  create: DbCreate,
  file: File,
): Promise<CustomerDisplayMediaItem> => {
  const mimeType = file.type || "application/octet-stream";
  if (!isAllowedCustomerDisplayMediaMime(mimeType)) {
    throw new Error("Unsupported media type");
  }
  const content = await file.arrayBuffer();
  const [document] = (await create(Tables.documents, {
    name: file.name,
    content,
    size: file.size,
    type: mimeType,
  })) as [{id: string}];

  return {
    id: nanoid(),
    name: file.name,
    mimeType,
    documentId: document.id.toString(),
    sort: 0,
  };
};

export const fetchCustomerDisplayMediaContent = async (
  query: DbQuery,
  documentId: string,
): Promise<Uint8Array | null> => {
  const [rows] = await query(`SELECT content FROM ONLY $id`, {
    id: toRecordId(documentId),
  });
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

export const deleteCustomerDisplayMediaDocument = async (
  del: DbDelete,
  documentId: string,
): Promise<void> => {
  await del(documentId);
};

export const loadCustomerDisplayMediaSettings = async (
  query: DbQuery,
): Promise<CustomerDisplayMediaSettings> => {
  const [result] = await query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key LIMIT 1`,
    {key: CUSTOMER_DISPLAY_MEDIA_KEY},
  );
  if (!Array.isArray(result) || result.length === 0) {
    return {...DEFAULT_CUSTOMER_DISPLAY_MEDIA, items: []};
  }
  return normalizeSettings((result[0] as {values?: unknown})?.values);
};

export const saveCustomerDisplayMediaSettings = async (
  query: DbQuery,
  merge: DbMerge,
  create: DbCreate,
  settings: CustomerDisplayMediaSettings,
): Promise<void> => {
  const payload = normalizeSettings(settings);
  const [result] = await query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key LIMIT 1`,
    {key: CUSTOMER_DISPLAY_MEDIA_KEY},
  );

  if (Array.isArray(result) && result.length > 0) {
    await merge((result[0] as {id: string}).id, {
      values: payload,
      is_global: true,
    });
    return;
  }

  await create(Tables.settings, {
    key: CUSTOMER_DISPLAY_MEDIA_KEY,
    values: payload,
    is_global: true,
  });
};
