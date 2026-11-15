import {describe, expect, it} from "bun:test";
import {
  SETTINGS_BACKUP_KIND,
  SETTINGS_BACKUP_VERSION,
  buildAppPagePrefsPatch,
  buildAppStatePrefsPatch,
  buildSettingsBackupFile,
  extractDevicePrefs,
  parseSettingsBackupFile,
  prefsPatchHasForbiddenKeys,
  serializeSettingRow,
} from "./settings-backup.ts";

describe("settings-backup", () => {
  it("builds a file with kind, version, settings rows, and device prefs", () => {
    const file = buildSettingsBackupFile({
      settings: [
        {id: "setting:abc", key: "branding", values: {logo: null}, is_global: true, user: null},
        {id: {tb: "setting", id: "xyz"}, key: "menus", values: ["menu:1"], is_global: true},
      ],
      page: {
        language: "ar",
        direction: "rtl",
        theme: "dark",
        brand: "ocean",
        touch: false,
        page: "Menu",
        user: {id: "user:1"} as any,
      },
      state: {
        posMode: "retail",
        cart: [{id: "line-1"}] as any,
        loggedIn: true,
      },
      exportedAt: "2026-11-01T00:00:00.000Z",
    });

    expect(file.kind).toBe(SETTINGS_BACKUP_KIND);
    expect(file.version).toBe(SETTINGS_BACKUP_VERSION);
    expect(file.exportedAt).toBe("2026-11-01T00:00:00.000Z");
    expect(file.settings).toEqual([
      {id: "setting:abc", key: "branding", values: {logo: null}, is_global: true, user: null},
      {id: "setting:xyz", key: "menus", values: ["menu:1"], is_global: true, user: null},
    ]);
    expect(file.devicePrefs).toEqual({
      language: "ar",
      direction: "rtl",
      theme: "dark",
      brand: "ocean",
      touch: false,
      posMode: "retail",
    });
  });

  it("extractDevicePrefs omits cart, user, and page", () => {
    const prefs = extractDevicePrefs(
      {
        language: "en",
        touch: true,
        page: "Orders",
        user: {id: "user:9"} as any,
        locked: true,
      },
      {
        posMode: "restaurant",
        cart: [{id: "x"}] as any,
        orders: [],
        loggedIn: true,
      },
    );
    expect(prefs).toEqual({
      language: "en",
      touch: true,
      posMode: "restaurant",
    });
    expect(Object.keys(prefs)).not.toContain("page");
    expect(Object.keys(prefs)).not.toContain("user");
    expect(Object.keys(prefs)).not.toContain("cart");
  });

  it("restore prefs patches never include cart, user, or page", () => {
    const pagePatch = buildAppPagePrefsPatch({
      language: "fr",
      direction: "ltr",
      theme: "light",
      brand: "classic",
      touch: true,
      posMode: "retail",
    });
    const statePatch = buildAppStatePrefsPatch({
      language: "fr",
      posMode: "retail",
    });

    expect(pagePatch).toEqual({
      language: "fr",
      direction: "ltr",
      theme: "light",
      brand: "classic",
      touch: true,
    });
    expect(statePatch).toEqual({posMode: "retail"});
    expect(prefsPatchHasForbiddenKeys(pagePatch, statePatch)).toBe(false);

    expect(
      prefsPatchHasForbiddenKeys({page: "Menu"} as any, {}),
    ).toBe(true);
    expect(
      prefsPatchHasForbiddenKeys({}, {cart: [] as any}),
    ).toBe(true);
    expect(
      prefsPatchHasForbiddenKeys({user: {id: "u"} as any}, {}),
    ).toBe(true);
  });

  it("parses a valid backup and rejects wrong kind/version", () => {
    const parsed = parseSettingsBackupFile({
      kind: SETTINGS_BACKUP_KIND,
      version: SETTINGS_BACKUP_VERSION,
      exportedAt: "2026-11-01T12:00:00.000Z",
      settings: [{id: "setting:1", key: "currency_symbol", values: {symbol: "$"}, is_global: true}],
      devicePrefs: {language: "de", posMode: "restaurant"},
    });
    expect(parsed.settings).toHaveLength(1);
    expect(parsed.devicePrefs.language).toBe("de");
    expect(parsed.devicePrefs.posMode).toBe("restaurant");

    expect(() => parseSettingsBackupFile({kind: "other", version: 1})).toThrow("INVALID_KIND");
    expect(() =>
      parseSettingsBackupFile({kind: SETTINGS_BACKUP_KIND, version: 99, settings: []}),
    ).toThrow("UNSUPPORTED_VERSION");
  });

  it("serializeSettingRow normalizes user record refs", () => {
    expect(
      serializeSettingRow({
        id: "setting:p1",
        key: "session_security",
        values: {idle: 5},
        user: {id: "user:42"},
      }),
    ).toEqual({
      id: "setting:p1",
      key: "session_security",
      values: {idle: 5},
      user: "user:42",
    });
  });
});
