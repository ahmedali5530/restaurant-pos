export const CUSTOMER_DISPLAY_MEDIA_KEY = "customer_display_media";

export type CustomerDisplayMediaItem = {
  id: string;
  name: string;
  mimeType: string;
  documentId: string;
  sort: number;
};

export type CustomerDisplayMediaSettings = {
  enabled: boolean;
  /** Seconds each image stays on screen. Videos advance when playback ends. */
  rotationIntervalSec: number;
  items: CustomerDisplayMediaItem[];
};

export const DEFAULT_CUSTOMER_DISPLAY_MEDIA: CustomerDisplayMediaSettings = {
  enabled: false,
  rotationIntervalSec: 8,
  items: [],
};

export const isAllowedCustomerDisplayMediaMime = (mime: string): boolean => {
  const normalized = String(mime || "").toLowerCase();
  return normalized.startsWith("image/") || normalized.startsWith("video/");
};

export const isCustomerDisplayVideoMime = (mime: string): boolean =>
  String(mime || "").toLowerCase().startsWith("video/");
