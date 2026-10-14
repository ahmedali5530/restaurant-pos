export const BRANDING_KEY = 'branding';

export interface BrandingSettings {
  /** Raw image bytes stored in Surreal (ArrayBuffer / Uint8Array / number[]). */
  logo?: ArrayBuffer | Uint8Array | number[] | string | null;
  /** MIME type of the uploaded logo (e.g. image/png). */
  mime?: string | null;
}

export const DEFAULT_BRANDING: BrandingSettings = {
  logo: null,
  mime: null,
};

const ALLOWED_LOGO_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export const isAllowedBrandingLogoMime = (mime: string): boolean =>
  ALLOWED_LOGO_MIME.has(mime);

/**
 * Convert stored logo bytes (or a data URI string) into a data URI for <img src>.
 */
export function brandingLogoToDataUri(
  logo: unknown,
  mime?: string | null,
): string | null {
  if (logo == null) return null;
  if (typeof logo === 'string') {
    if (logo.startsWith('data:image/')) return logo;
    // Treat bare base64 as PNG unless mime is known.
    const type = mime && ALLOWED_LOGO_MIME.has(mime) ? mime : 'image/png';
    return `data:${type};base64,${logo}`;
  }

  let u8: Uint8Array;
  if (logo instanceof ArrayBuffer) {
    u8 = new Uint8Array(logo);
  } else if (logo instanceof Uint8Array) {
    u8 = logo;
  } else if (Array.isArray(logo)) {
    u8 = new Uint8Array(logo);
  } else {
    return null;
  }

  if (u8.byteLength === 0) return null;

  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(u8.subarray(i, i + chunk)),
    );
  }

  const type = mime && ALLOWED_LOGO_MIME.has(mime) ? mime : 'image/png';
  return `data:${type};base64,${btoa(binary)}`;
}
