export interface SupportedLanguage {
  code: string;
  label: string;
}

export type AppTextDirection = 'ltr' | 'rtl';

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'fr', label: 'Français' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'ar', label: 'العربية' },
  { code: 'ru', label: 'Русский' },
];

const configuredLanguage = import.meta.env.VITE_DEFAULT_LANGUAGE;
export const DEFAULT_LANGUAGE =
  configuredLanguage && SUPPORTED_LANGUAGES.some((lang) => lang.code === configuredLanguage)
    ? configuredLanguage
    : 'en';
export const DEFAULT_TEXT_DIRECTION: AppTextDirection =
  DEFAULT_LANGUAGE === 'ar' ? 'rtl' : 'ltr';

export const TEXT_DIRECTIONS: { code: AppTextDirection; labelKey: string }[] = [
  { code: 'ltr', labelKey: 'direction.ltr' },
  { code: 'rtl', labelKey: 'direction.rtl' },
];

export const isSupportedLanguage = (code?: string): code is string =>
  !!code && SUPPORTED_LANGUAGES.some((lang) => lang.code === code);

export const isTextDirection = (direction?: string): direction is AppTextDirection =>
  direction === 'ltr' || direction === 'rtl';
