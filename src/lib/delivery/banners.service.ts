import {nanoid} from "nanoid";
import {Tables} from "@/api/db/tables.ts";

export const DELIVERY_BANNERS_BUCKET = "my_bucket";
export const DELIVERY_BANNERS_SETTING_KEY = "delivery_banners";

export type DeliveryBanner = {
  path: string;
  name: string;
  mimeType: string;
};

type DbQuery = <R extends unknown[] = unknown[]>(
  sql: string,
  parameters?: Record<string, unknown>
) => Promise<R>;

type DbMerge = (thing: string, data: Record<string, unknown>) => Promise<unknown>;
type DbCreate = (table: string, data: Record<string, unknown>) => Promise<unknown>;

const getFileExtension = (fileName: string, mimeType: string): string => {
  const fromName = fileName.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) {
    return fromName;
  }

  const mimeMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };

  return mimeMap[mimeType] ?? "jpg";
};

export const buildBannerPath = (fileName: string, mimeType: string): string => {
  const ext = getFileExtension(fileName, mimeType);
  return `delivery/banners/${nanoid()}.${ext}`;
};

export const uploadBanner = async (
  query: DbQuery,
  file: File,
  path?: string
): Promise<DeliveryBanner> => {
  const mimeType = file.type || "image/jpeg";
  const bannerPath = path ?? buildBannerPath(file.name, mimeType);
  const content = await file.arrayBuffer();

  await query(
    `type::file($bucket, $path).put($content)`,
    {bucket: DELIVERY_BANNERS_BUCKET, path: bannerPath, content}
  );

  return {
    path: bannerPath,
    name: file.name,
    mimeType,
  };
};

const extractQueryReturn = (queryResult: unknown): unknown => {
  if (
    queryResult instanceof Uint8Array ||
    queryResult instanceof ArrayBuffer ||
    (ArrayBuffer.isView(queryResult) && !(queryResult instanceof DataView))
  ) {
    return queryResult;
  }

  if (!Array.isArray(queryResult) || queryResult.length === 0) {
    return null;
  }

  const first = queryResult[0];

  if (
    first instanceof Uint8Array ||
    first instanceof ArrayBuffer ||
    (ArrayBuffer.isView(first) && !(first instanceof DataView))
  ) {
    return first;
  }

  if (Array.isArray(first)) {
    return first.length > 0 ? first[0] : null;
  }

  return first ?? null;
};

export const fetchBannerBytes = async (
  query: DbQuery,
  path: string
): Promise<unknown | null> => {
  const result = await query(
    `RETURN type::file($bucket, $path).get()`,
    {bucket: DELIVERY_BANNERS_BUCKET, path}
  );

  return extractQueryReturn(result);
};

export const deleteBanner = async (query: DbQuery, path: string): Promise<void> => {
  await query(
    `type::file($bucket, $path).delete()`,
    {bucket: DELIVERY_BANNERS_BUCKET, path}
  );
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
      typeof banner?.path === "string" &&
      typeof banner?.name === "string" &&
      typeof banner?.mimeType === "string"
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
