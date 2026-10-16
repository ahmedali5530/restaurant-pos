import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { Setting } from "@/api/model/setting.ts";
import {
  BRANDING_KEY,
  BrandingSettings,
  brandingLogoToDataUri,
  isAllowedBrandingLogoMime,
} from "@/api/model/branding.ts";
import { toast } from "sonner";
import { useSecurity } from "@/hooks/useSecurity.ts";
import { useTranslation } from "react-i18next";
import {
  assertFileWithinLimit,
  detectMimeType,
  formatFileSize,
  MAX_UPLOAD_BYTES,
} from "@/utils/files.ts";
import { Button } from "@/components/common/input/button.tsx";

export const BrandingSettingsCard = () => {
  const db = useDB();
  const [settings, setSettings] = useState<Setting>();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBuffer, setLogoBuffer] = useState<ArrayBuffer | null>(null);
  const [logoMime, setLogoMime] = useState<string | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const { protectFormSubmit } = useSecurity();
  const { t } = useTranslation(["settings", "common"]);

  const loadSettings = async () => {
    const [rows] = await db.query<Setting[]>(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
      { key: BRANDING_KEY },
    );
    setSettings(rows?.[0]);
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    if (!settings) {
      setLogoPreview(null);
      setLogoBuffer(null);
      setLogoMime(null);
      setLogoRemoved(false);
      return;
    }

    const values = (settings.values || {}) as BrandingSettings;
    const uri = brandingLogoToDataUri(values.logo, values.mime);
    setLogoPreview(uri);
    setLogoBuffer(null);
    setLogoMime(values.mime ?? null);
    setLogoRemoved(false);
  }, [settings]);

  const handleLogoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    try {
      assertFileWithinLimit(file);
    } catch {
      toast.error(
        t("settings:branding.tooLarge", {
          size: formatFileSize(MAX_UPLOAD_BYTES),
          defaultValue: `File exceeds the maximum size of ${formatFileSize(MAX_UPLOAD_BYTES)}.`,
        }),
      );
      return;
    }

    const mime = file.type || "application/octet-stream";
    if (!isAllowedBrandingLogoMime(mime)) {
      toast.error(t("settings:branding.invalidType"));
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const detected = detectMimeType(buffer, mime);
      if (!isAllowedBrandingLogoMime(detected)) {
        toast.error(t("settings:branding.invalidType"));
        return;
      }
      setLogoBuffer(buffer);
      setLogoMime(detected);
      setLogoRemoved(false);
      setLogoPreview(brandingLogoToDataUri(buffer, detected));
    } catch (err) {
      console.error(err);
      toast.error(t("settings:branding.readFailed"));
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setLogoBuffer(null);
    setLogoMime(null);
    setLogoRemoved(true);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const existing = (settings?.values || {}) as BrandingSettings;
      let payload: BrandingSettings;

      if (logoRemoved) {
        payload = { logo: null, mime: null };
      } else if (logoBuffer) {
        payload = { logo: logoBuffer, mime: logoMime };
      } else {
        payload = {
          logo: existing.logo ?? null,
          mime: existing.mime ?? null,
        };
      }

      if (settings?.id) {
        await db.merge(settings.id, { values: payload });
      } else {
        await db.create(Tables.settings, {
          key: BRANDING_KEY,
          is_global: true,
          values: payload,
        });
      }

      toast.success(t("settings:branding.updated"));
      await loadSettings();
    } catch (err) {
      console.error(err);
      toast.error(t("settings:branding.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shadow p-5 rounded-xl bg-surface-elevated" data-testid="settings-card-branding">
      <h2 className="text-xl font-semibold mb-1">{t("settings:branding.title")}</h2>
      <p className="text-sm text-muted mb-5">
        {t("settings:branding.description")}
      </p>
      <form
        onSubmit={protectFormSubmit(
          () => {
            void saveSettings();
          },
          {
            module: "settings.branding",
            description: t("settings:branding.saveDescription"),
          },
        )}
      >
        <div className="mb-5">
          <p className="text-sm font-medium mb-2">{t("settings:branding.logo")}</p>
          <p className="text-xs text-muted mb-3">{t("settings:branding.logoHint")}</p>
          {logoPreview && !logoRemoved ? (
            <div className="relative inline-block">
              <img
                src={logoPreview}
                alt={t("settings:branding.preview")}
                className="max-h-24 max-w-full object-contain border border-border rounded p-2 bg-canvas"
              />
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="absolute -top-2 -right-2 bg-danger-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-danger-600 transition-colors"
                aria-label={t("settings:branding.remove")}
              >
                <FontAwesomeIcon icon={faTimes} size="xs" />
              </button>
            </div>
          ) : (
            <div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="input"
                data-testid="settings-branding-upload"
                onChange={(e) => {
                  void handleLogoChange(e);
                }}
              />
            </div>
          )}
        </div>
        <Button type="submit" variant="primary" disabled={saving} data-testid="settings-branding-save">
          {t("common:actions.save")}
        </Button>
      </form>
    </div>
  );
};
