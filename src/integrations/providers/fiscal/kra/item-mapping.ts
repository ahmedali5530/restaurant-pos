/** KRA per-item fiscal overrides stored on `integration_entity_mapping`. */

export const KRA_PENDING_EXTERNAL_PREFIX = '__pending__:';

export type KraItemExternalPayload = {
  itemClsCd?: string | null;
  taxTyCd?: string | null;
  registered?: boolean;
};

export type KraItemMappingView = {
  posrId: string;
  externalId: string;
  itemClsCd?: string | null;
  taxTyCd?: string | null;
  registered: boolean;
};

export const kraPendingExternalId = (posrId: string): string =>
  `${KRA_PENDING_EXTERNAL_PREFIX}${posrId}`;

export const isKraPendingExternalId = (externalId: unknown): boolean =>
  String(externalId ?? '').startsWith(KRA_PENDING_EXTERNAL_PREFIX);

export const isKraItemRegistered = (mapping: {
  externalId?: string | null;
  externalPayload?: KraItemExternalPayload | Record<string, unknown> | null;
}): boolean => {
  const payload = (mapping.externalPayload ?? {}) as KraItemExternalPayload;
  if (payload.registered === true) return true;
  const externalId = String(mapping.externalId ?? '');
  return Boolean(externalId) && !isKraPendingExternalId(externalId);
};

export const kraItemPayload = (
  mapping?: {
    externalPayload?: KraItemExternalPayload | Record<string, unknown> | null;
  } | null
): KraItemExternalPayload => {
  const raw = (mapping?.externalPayload ?? {}) as KraItemExternalPayload;
  return {
    itemClsCd: raw.itemClsCd != null ? String(raw.itemClsCd) : null,
    taxTyCd: raw.taxTyCd != null ? String(raw.taxTyCd).toUpperCase() : null,
    registered: raw.registered === true,
  };
};

export const toKraItemMappingView = (row: {
  posrId?: string | null;
  externalId?: string | null;
  externalPayload?: KraItemExternalPayload | Record<string, unknown> | null;
}): KraItemMappingView | null => {
  const posrId = String(row.posrId ?? '');
  if (!posrId) return null;
  const payload = kraItemPayload(row);
  const externalId = String(row.externalId ?? '') || kraPendingExternalId(posrId);
  return {
    posrId,
    externalId,
    itemClsCd: payload.itemClsCd,
    taxTyCd: payload.taxTyCd,
    registered: isKraItemRegistered({ externalId, externalPayload: payload }),
  };
};
