import {recordIdToString} from "@/api/reports/shared/records.ts";
import type {AppPageInterface, AppStateInterface} from "@/store/jotai.ts";
import type {AppTextDirection} from "@/lib/languages.ts";
import type {AppBrandId, AppThemePreference, BrandPalette} from "@/lib/theme.ts";

export const SETTINGS_BACKUP_KIND = "posr-settings" as const;
export const SETTINGS_BACKUP_VERSION = 1 as const;

/** Device preference fields included in a settings backup (this browser only). */
export type SettingsBackupDevicePrefs = {
  language?: string;
  direction?: AppTextDirection;
  theme?: AppThemePreference;
  brand?: AppBrandId;
  customPrimary?: string;
  customPaletteBase?: {canvas: string; surface: string; foreground: string; primary: string};
  /** @deprecated Prefer customPrimary */
  customPalette?: BrandPalette;
  touch?: boolean;
  posMode?: "restaurant" | "retail";
};

export type SettingsBackupRow = {
  id: string;
  key: string;
  values: any;
  is_global?: boolean;
  user?: string | null;
};

export type SettingsBackupFile = {
  kind: typeof SETTINGS_BACKUP_KIND;
  version: typeof SETTINGS_BACKUP_VERSION;
  exportedAt: string;
  settings: SettingsBackupRow[];
  devicePrefs: SettingsBackupDevicePrefs;
};

export type SettingsBackupDb = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<any>;
  merge: (thing: unknown, data: Record<string, unknown>) => Promise<unknown>;
  create: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
  delete: (thing: unknown) => Promise<unknown>;
};

const DEVICE_PREF_KEYS = [
  "language",
  "direction",
  "theme",
  "brand",
  "customPrimary",
  "customPaletteBase",
  "customPalette",
  "touch",
  "posMode",
] as const;

export function extractDevicePrefs(
  page: Partial<AppPageInterface> | null | undefined,
  state: Partial<AppStateInterface> | null | undefined,
): SettingsBackupDevicePrefs {
  const prefs: SettingsBackupDevicePrefs = {};
  if (page) {
    if (page.language != null) prefs.language = page.language;
    if (page.direction != null) prefs.direction = page.direction;
    if (page.theme != null) prefs.theme = page.theme;
    if (page.brand != null) prefs.brand = page.brand;
    if (page.customPrimary != null) prefs.customPrimary = page.customPrimary;
    if (page.customPaletteBase != null) prefs.customPaletteBase = page.customPaletteBase;
    if (page.customPalette != null) prefs.customPalette = page.customPalette;
    if (page.touch != null) prefs.touch = page.touch;
  }
  if (state?.posMode === "retail" || state?.posMode === "restaurant") {
    prefs.posMode = state.posMode;
  }
  return prefs;
}

/**
 * Build an appPage patch that only touches backed-up preference fields.
 * Never writes page, user, locked, cart-related keys, or menuConfig.
 */
export function buildAppPagePrefsPatch(
  prefs: SettingsBackupDevicePrefs | null | undefined,
): Partial<AppPageInterface> {
  if (!prefs || typeof prefs !== "object") return {};
  const patch: Partial<AppPageInterface> = {};
  if (prefs.language != null) patch.language = prefs.language;
  if (prefs.direction != null) patch.direction = prefs.direction;
  if (prefs.theme != null) patch.theme = prefs.theme;
  if (prefs.brand != null) patch.brand = prefs.brand;
  if (prefs.customPrimary != null) patch.customPrimary = prefs.customPrimary;
  if (prefs.customPaletteBase != null) patch.customPaletteBase = prefs.customPaletteBase;
  if (prefs.customPalette != null) patch.customPalette = prefs.customPalette;
  if (prefs.touch != null) patch.touch = prefs.touch;
  return patch;
}

/** Build an appState patch that only sets posMode when present. */
export function buildAppStatePrefsPatch(
  prefs: SettingsBackupDevicePrefs | null | undefined,
): Partial<AppStateInterface> {
  if (!prefs || typeof prefs !== "object") return {};
  if (prefs.posMode === "retail" || prefs.posMode === "restaurant") {
    return {posMode: prefs.posMode};
  }
  return {};
}

export function serializeSettingRow(row: any): SettingsBackupRow | null {
  if (!row || typeof row !== "object") return null;
  const id = recordIdToString(row.id);
  const key = String(row.key ?? "").trim();
  if (!id || !key) return null;

  let user: string | null | undefined;
  if (row.user == null) {
    user = null;
  } else {
    const userId = recordIdToString(
      typeof row.user === "object" && row.user !== null && "id" in row.user
        ? (row.user as {id: unknown}).id
        : row.user,
    );
    user = userId || null;
  }

  return {
    id,
    key,
    values: row.values ?? null,
    ...(row.is_global != null ? {is_global: Boolean(row.is_global)} : {}),
    user,
  };
}

export function buildSettingsBackupFile(input: {
  settings: any[];
  page?: Partial<AppPageInterface> | null;
  state?: Partial<AppStateInterface> | null;
  exportedAt?: string;
}): SettingsBackupFile {
  const settings = (input.settings ?? [])
    .map(serializeSettingRow)
    .filter((row): row is SettingsBackupRow => row != null);

  return {
    kind: SETTINGS_BACKUP_KIND,
    version: SETTINGS_BACKUP_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    settings,
    devicePrefs: extractDevicePrefs(input.page, input.state),
  };
}

export function parseSettingsBackupFile(raw: unknown): SettingsBackupFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("INVALID_BACKUP");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== SETTINGS_BACKUP_KIND) {
    throw new Error("INVALID_KIND");
  }
  if (obj.version !== SETTINGS_BACKUP_VERSION) {
    throw new Error("UNSUPPORTED_VERSION");
  }
  if (!Array.isArray(obj.settings)) {
    throw new Error("INVALID_SETTINGS");
  }

  const settings: SettingsBackupRow[] = [];
  for (const item of obj.settings) {
    const row = serializeSettingRow(item);
    if (row) settings.push(row);
  }

  const devicePrefs =
    obj.devicePrefs && typeof obj.devicePrefs === "object" && !Array.isArray(obj.devicePrefs)
      ? extractDevicePrefs(
          obj.devicePrefs as Partial<AppPageInterface>,
          obj.devicePrefs as Partial<AppStateInterface>,
        )
      : {};

  return {
    kind: SETTINGS_BACKUP_KIND,
    version: SETTINGS_BACKUP_VERSION,
    exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : new Date().toISOString(),
    settings,
    devicePrefs,
  };
}

export function downloadSettingsBackupJson(file: SettingsBackupFile, filename?: string): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const stamp = (file.exportedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  anchor.download = filename ?? `posr-settings-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function fetchAllSettingRows(db: SettingsBackupDb): Promise<any[]> {
  const result = await db.query(`SELECT * FROM setting`);
  const rows = Array.isArray(result) ? result[0] : result;
  return Array.isArray(rows) ? rows : [];
}

/**
 * Replace setting table contents with the backup:
 * upsert each file row, then delete live rows whose ids are absent from the file.
 */
export async function restoreSettingRows(
  db: SettingsBackupDb,
  rows: SettingsBackupRow[],
): Promise<void> {
  const keepIds = new Set<string>();

  for (const row of rows) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    keepIds.add(id);

    const userRaw = row.user ? String(row.user).trim() : "";
    const userId = userRaw
      ? (userRaw.includes(":") ? userRaw : `user:${userRaw}`)
      : null;

    const params: Record<string, unknown> = {
      id,
      key: row.key,
      values: row.values ?? null,
      is_global: row.is_global != null ? Boolean(row.is_global) : null,
    };

    if (userId) {
      params.userId = userId;
      await db.query(
        `UPSERT type::record($id) CONTENT {
          key: $key,
          values: $values,
          is_global: $is_global,
          user: type::record($userId)
        }`,
        params,
      );
    } else {
      await db.query(
        `UPSERT type::record($id) CONTENT {
          key: $key,
          values: $values,
          is_global: $is_global,
          user: NONE
        }`,
        params,
      );
    }
  }

  const live = await fetchAllSettingRows(db);
  for (const liveRow of live) {
    const id = recordIdToString(liveRow?.id);
    if (!id || keepIds.has(id)) continue;
    await db.query(`DELETE type::record($id)`, {id});
  }
}

const PAGE_PREF_KEYS = new Set(
  DEVICE_PREF_KEYS.filter((k) => k !== "posMode"),
);

/** True when a prefs patch would touch cart, user, page, or other non-preference state. */
export function prefsPatchHasForbiddenKeys(
  pagePatch: Partial<AppPageInterface>,
  statePatch: Partial<AppStateInterface>,
): boolean {
  for (const key of Object.keys(pagePatch)) {
    if (!PAGE_PREF_KEYS.has(key as (typeof DEVICE_PREF_KEYS)[number])) return true;
  }
  for (const key of Object.keys(statePatch)) {
    if (key !== "posMode") return true;
  }
  return false;
}
