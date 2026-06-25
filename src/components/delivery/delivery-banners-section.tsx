import {useEffect, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {toast} from "sonner";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faTrash} from "@fortawesome/free-solid-svg-icons";
import {useDB} from "@/api/db/db.ts";
import {Button} from "@/components/common/input/button.tsx";
import {
  deleteBanner,
  DeliveryBanner,
  fetchBannerBytes,
  loadDeliveryBanners,
  saveDeliveryBanners,
  uploadBanner,
} from "@/lib/delivery/banners.service.ts";
import {detectMimeType, toUint8Array} from "@/utils/files.ts";

type ExistingBannerItem = DeliveryBanner & {
  id: string;
  previewUrl: string;
};

type PendingBannerItem = {
  id: string;
  file: File;
  previewUrl: string;
};

const revokeUrl = (url: string | null | undefined) => {
  if (url) {
    URL.revokeObjectURL(url);
  }
};

export const DeliveryBannersSection = () => {
  const {t} = useTranslation("delivery");
  const db = useDB();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingBanners, setExistingBanners] = useState<ExistingBannerItem[]>([]);
  const [initialBannerCount, setInitialBannerCount] = useState(0);
  const [pendingBanners, setPendingBanners] = useState<PendingBannerItem[]>([]);
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
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

    const loadBanners = async () => {
      try {
        setLoading(true);
        const banners = await loadDeliveryBanners(db.query);

        const loaded = await Promise.all(
          banners.map(async (banner) => {
            try {
              const bytes = await fetchBannerBytes(db.query, banner.path);
              if (!bytes) {
                return null;
              }

              const data = toUint8Array(bytes);
              const mimeType = banner.mimeType || detectMimeType(data, "image/jpeg");
              const blob = new Blob([data], {type: mimeType});
              const previewUrl = trackPreviewUrl(URL.createObjectURL(blob));

              return {
                ...banner,
                mimeType,
                id: banner.path,
                previewUrl,
              };
            } catch (error) {
              console.error(`Failed to load banner ${banner.path}:`, error);
              return null;
            }
          })
        );

        if (cancelled) {
          loaded.filter(Boolean).forEach((item) => releasePreviewUrl(item!.previewUrl));
          return;
        }

        const validBanners = loaded.filter((item): item is ExistingBannerItem => item !== null);
        setExistingBanners(validBanners);
        setInitialBannerCount(validBanners.length);
      } catch (error) {
        console.error("Error loading delivery banners:", error);
        toast.error(t("settings.banners.loadFailed"));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadBanners();

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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) {
      return;
    }

    const newPending = Array.from(files).map((file) => ({
      id: `pending-${crypto.randomUUID()}`,
      file,
      previewUrl: trackPreviewUrl(URL.createObjectURL(file)),
    }));

    setPendingBanners((prev) => [...prev, ...newPending]);
    event.target.value = "";
  };

  const removeExistingBanner = (banner: ExistingBannerItem) => {
    setExistingBanners((prev) => prev.filter((item) => item.id !== banner.id));
    setRemovedPaths((prev) => [...prev, banner.path]);
    releasePreviewUrl(banner.previewUrl);
  };

  const removePendingBanner = (banner: PendingBannerItem) => {
    setPendingBanners((prev) => prev.filter((item) => item.id !== banner.id));
    releasePreviewUrl(banner.previewUrl);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const uploadedBanners = await Promise.all(
        pendingBanners.map((banner) => uploadBanner(db.query, banner.file))
      );

      const keptExisting = existingBanners.map(({path, name, mimeType}) => ({
        path,
        name,
        mimeType,
      }));

      const finalBanners: DeliveryBanner[] = [...keptExisting, ...uploadedBanners];

      await Promise.all(removedPaths.map((path) => deleteBanner(db.query, path)));
      await saveDeliveryBanners(db.query, db.merge, db.create, finalBanners);

      const nextExisting: ExistingBannerItem[] = [
        ...existingBanners,
        ...pendingBanners.map((pending, index) => ({
          ...uploadedBanners[index],
          id: uploadedBanners[index].path,
          previewUrl: pending.previewUrl,
        })),
      ];

      setExistingBanners(nextExisting);
      setInitialBannerCount(nextExisting.length);
      setPendingBanners([]);
      setRemovedPaths([]);
      toast.success(t("settings.banners.saved"));
    } catch (error) {
      console.error("Error saving delivery banners:", error);
      toast.error(t("settings.banners.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const hasBanners = existingBanners.length > 0 || pendingBanners.length > 0;
  const hasChanges =
    pendingBanners.length > 0 ||
    removedPaths.length > 0 ||
    existingBanners.length !== initialBannerCount;

  return (
    <div className="border-t pt-4 mt-6">
      <h3 className="text-lg font-semibold mb-1">{t("settings.banners.title")}</h3>
      <p className="text-sm text-neutral-600 mb-4">{t("settings.banners.description")}</p>

      {loading ? (
        <div className="text-center py-6 text-neutral-500">{t("settings.loading")}</div>
      ) : (
        <>
          <div className="mb-4">
            <label className="block mb-1 text-sm font-medium">{t("settings.banners.pickImages")}</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="block w-full text-sm text-neutral-700
                         file:mr-4 file:py-2 file:px-4
                         file:rounded-full file:border-0
                         file:text-sm file:font-semibold
                         file:bg-neutral-600 file:text-white
                         hover:file:bg-neutral-700"
            />
          </div>

          {!hasBanners ? (
            <div className="text-sm text-neutral-500 py-4">{t("settings.banners.noBanners")}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-4">
              {existingBanners.map((banner) => (
                <div
                  key={banner.id}
                  className="relative group rounded-lg overflow-hidden border border-neutral-300 bg-neutral-100 aspect-video"
                >
                  <img
                    src={banner.previewUrl}
                    alt={banner.name}
                    className="object-cover w-full h-full"
                  />
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className="absolute top-2 right-2 opacity-90"
                    onClick={() => removeExistingBanner(banner)}
                    aria-label={t("settings.banners.remove")}
                  >
                    <FontAwesomeIcon icon={faTrash} size="sm" />
                  </Button>
                </div>
              ))}

              {pendingBanners.map((banner) => (
                <div
                  key={banner.id}
                  className="relative group rounded-lg overflow-hidden border border-primary-300 bg-primary-50 aspect-video"
                >
                  <img
                    src={banner.previewUrl}
                    alt={banner.file.name}
                    className="object-cover w-full h-full"
                  />
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className="absolute top-2 right-2 opacity-90"
                    onClick={() => removePendingBanner(banner)}
                    aria-label={t("settings.banners.remove")}
                  >
                    <FontAwesomeIcon icon={faTrash} size="sm" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="primary"
            disabled={saving || !hasChanges}
            isLoading={saving}
            onClick={handleSave}
          >
            {saving ? t("settings.banners.saving") : t("settings.banners.saveBanners")}
          </Button>
        </>
      )}
    </div>
  );
};
