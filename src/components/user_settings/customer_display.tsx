import {useEffect, useRef, useState, type ChangeEvent} from "react";
import {useTranslation} from "react-i18next";
import {toast} from "sonner";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faTrash} from "@fortawesome/free-solid-svg-icons";
import {useDB} from "@/api/db/db.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Switch} from "@/components/common/input/switch.tsx";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {
  DEFAULT_CUSTOMER_DISPLAY_MEDIA,
  isAllowedCustomerDisplayMediaMime,
  isCustomerDisplayVideoMime,
  type CustomerDisplayMediaItem,
  type CustomerDisplayMediaSettings,
} from "@/api/model/customer-display-media.ts";
import {
  createCustomerDisplayMediaDocument,
  deleteCustomerDisplayMediaDocument,
  fetchCustomerDisplayMediaContent,
  loadCustomerDisplayMediaSettings,
  saveCustomerDisplayMediaSettings,
} from "@/lib/customer-display-media.service.ts";
import {
  assertFileWithinLimit,
  detectMimeType,
  formatFileSize,
  MAX_UPLOAD_BYTES,
} from "@/utils/files.ts";

type ExistingItem = CustomerDisplayMediaItem & {previewUrl: string};
type PendingItem = {id: string; file: File; previewUrl: string; mimeType: string};

const revokeUrl = (url: string | null | undefined) => {
  if (url) {
    URL.revokeObjectURL(url);
  }
};

export const CustomerDisplaySettingsCard = () => {
  const {t} = useTranslation(["settings", "common"]);
  const db = useDB();
  const dbRef = useRef(db);
  dbRef.current = db;
  const {protectFormSubmit} = useSecurity();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(DEFAULT_CUSTOMER_DISPLAY_MEDIA.enabled);
  const [rotationIntervalSec, setRotationIntervalSec] = useState(
    DEFAULT_CUSTOMER_DISPLAY_MEDIA.rotationIntervalSec,
  );
  const [existing, setExisting] = useState<ExistingItem[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [removedDocumentIds, setRemovedDocumentIds] = useState<string[]>([]);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  const trackPreviewUrl = (url: string) => {
    previewUrlsRef.current.add(url);
    return url;
  };

  const releasePreviewUrl = (url: string) => {
    revokeUrl(url);
    previewUrlsRef.current.delete(url);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const settings = await loadCustomerDisplayMediaSettings(dbRef.current.query);
        if (cancelled) {
          return;
        }
        setEnabled(settings.enabled);
        setRotationIntervalSec(settings.rotationIntervalSec);

        const loaded = await Promise.all(
          settings.items.map(async (item) => {
            try {
              const content = await fetchCustomerDisplayMediaContent(
                dbRef.current.query,
                item.documentId,
              );
              if (!content) {
                return null;
              }
              const mimeType = item.mimeType || detectMimeType(content, "image/jpeg");
              const blob = new Blob([new Uint8Array(content)], {type: mimeType});
              return {
                ...item,
                mimeType,
                previewUrl: trackPreviewUrl(URL.createObjectURL(blob)),
              };
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) {
          loaded.filter(Boolean).forEach((item) => releasePreviewUrl(item!.previewUrl));
          return;
        }
        setExisting(loaded.filter((item): item is ExistingItem => item != null));
      } catch (error) {
        console.error(error);
        toast.error(t("settings:customerDisplay.loadFailed"));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => revokeUrl(url));
      previewUrlsRef.current.clear();
    };
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) {
      return;
    }

    const next: PendingItem[] = [];
    for (const file of Array.from(files)) {
      try {
        assertFileWithinLimit(file);
      } catch {
        toast.error(
          t("settings:customerDisplay.tooLarge", {
            size: formatFileSize(MAX_UPLOAD_BYTES),
          }),
        );
        continue;
      }
      const mime = file.type || "application/octet-stream";
      if (!isAllowedCustomerDisplayMediaMime(mime)) {
        toast.error(t("settings:customerDisplay.invalidType"));
        continue;
      }
      next.push({
        id: `pending-${file.name}-${file.size}-${file.lastModified}`,
        file,
        mimeType: mime,
        previewUrl: trackPreviewUrl(URL.createObjectURL(file)),
      });
    }
    if (next.length > 0) {
      setPending((prev) => [...prev, ...next]);
    }
    event.target.value = "";
  };

  const removeExisting = (item: ExistingItem) => {
    setExisting((prev) => prev.filter((row) => row.id !== item.id));
    setRemovedDocumentIds((prev) => [...prev, item.documentId]);
    releasePreviewUrl(item.previewUrl);
  };

  const removePending = (item: PendingItem) => {
    setPending((prev) => prev.filter((row) => row.id !== item.id));
    releasePreviewUrl(item.previewUrl);
  };

  const save = async () => {
    setSaving(true);
    try {
      const uploaded = await Promise.all(
        pending.map((item) => createCustomerDisplayMediaDocument(db.create, item.file)),
      );
      const kept = existing.map(({id, name, mimeType, documentId}, index) => ({
        id,
        name,
        mimeType,
        documentId,
        sort: index,
      }));
      const uploadedSorted = uploaded.map((item, index) => ({
        ...item,
        sort: kept.length + index,
      }));
      const payload: CustomerDisplayMediaSettings = {
        enabled,
        rotationIntervalSec,
        items: [...kept, ...uploadedSorted],
      };

      await Promise.all(
        removedDocumentIds.map((documentId) =>
          deleteCustomerDisplayMediaDocument(db.delete, documentId),
        ),
      );
      await saveCustomerDisplayMediaSettings(db.query, db.merge, db.create, payload);

      const nextExisting: ExistingItem[] = [
        ...existing,
        ...pending.map((row, index) => ({
          ...uploadedSorted[index],
          previewUrl: row.previewUrl,
        })),
      ];
      setExisting(nextExisting);
      setPending([]);
      setRemovedDocumentIds([]);
      toast.success(t("settings:customerDisplay.updated"));
    } catch (error) {
      console.error(error);
      toast.error(t("settings:customerDisplay.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shadow p-5 rounded-xl bg-surface-elevated" data-testid="settings-card-customer-display">
      <h2 className="text-xl font-semibold mb-1">{t("settings:customerDisplay.title")}</h2>
      <p className="text-sm text-muted mb-5">{t("settings:customerDisplay.description")}</p>

      {loading ? (
        <div className="text-sm text-muted py-4">{t("common:loading")}</div>
      ) : (
        <form
          onSubmit={protectFormSubmit(
            () => {
              void save();
            },
            {
              module: "settings.customer_display",
              description: t("settings:customerDisplay.saveDescription"),
            },
          )}
        >
          <div className="grid grid-cols-1 gap-4 mb-4">
            <div>
              <Switch checked={enabled} onChange={setEnabled}>
                {t("settings:customerDisplay.enabled")}
              </Switch>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("settings:customerDisplay.rotationInterval")}
              </label>
              <div>
                <Input
                  type="number"
                  min={2}
                  max={120}
                  value={String(rotationIntervalSec)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) {
                      setRotationIntervalSec(Math.min(120, Math.max(2, Math.round(n))));
                    }
                  }}
                />
              </div>
              <p className="text-xs text-muted mt-1">
                {t("settings:customerDisplay.rotationHint")}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("settings:customerDisplay.pickMedia")}
              </label>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileChange}
                className="block w-full text-sm text-foreground
                           file:mr-4 file:py-2 file:px-4
                           file:rounded-full file:border-0
                           file:text-sm file:font-semibold
                           file:bg-neutral-600 file:text-white
                           hover:file:bg-neutral-700"
              />
              <p className="text-xs text-muted mt-1">
                {t("settings:customerDisplay.mediaHint", {
                  size: formatFileSize(MAX_UPLOAD_BYTES),
                })}
              </p>
            </div>
          </div>

          {existing.length === 0 && pending.length === 0 ? (
            <div className="text-sm text-muted py-3 mb-4">
              {t("settings:customerDisplay.noMedia")}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {existing.map((item) => (
                <div
                  key={item.id}
                  className="relative rounded-lg overflow-hidden border border-border bg-surface aspect-video"
                >
                  {isCustomerDisplayVideoMime(item.mimeType) ? (
                    <video
                      src={item.previewUrl}
                      className="object-cover w-full h-full"
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      className="object-cover w-full h-full"
                    />
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className="absolute top-2 right-2 opacity-90"
                    onClick={() => removeExisting(item)}
                    aria-label={t("settings:customerDisplay.remove")}
                  >
                    <FontAwesomeIcon icon={faTrash} size="sm" />
                  </Button>
                </div>
              ))}
              {pending.map((item) => (
                <div
                  key={item.id}
                  className="relative rounded-lg overflow-hidden border border-primary-300 bg-primary/10 aspect-video"
                >
                  {isCustomerDisplayVideoMime(item.mimeType) ? (
                    <video
                      src={item.previewUrl}
                      className="object-cover w-full h-full"
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="object-cover w-full h-full"
                    />
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className="absolute top-2 right-2 opacity-90"
                    onClick={() => removePending(item)}
                    aria-label={t("settings:customerDisplay.remove")}
                  >
                    <FontAwesomeIcon icon={faTrash} size="sm" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button type="submit" variant="primary" disabled={saving} isLoading={saving}>
            {t("common:actions.save")}
          </Button>
        </form>
      )}
    </div>
  );
};
